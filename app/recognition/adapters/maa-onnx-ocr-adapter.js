import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import nodeFs from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolvePaddlePythonExecutable } from "./paddle-ocr-adapter.js";
import { resolveTemplateOcrRegions } from "./template-ocr-regions.js";

const BRIDGE_SCRIPT = fileURLToPath(new URL("./maa-onnx-ocr-bridge.py", import.meta.url));

export function resolveMaaOnnxOcrPaths({ rootDir = process.cwd(), locale = process.env.RHODES_MAA_ONNX_LOCALE || "jp" } = {}) {
  const normalizedLocale = String(locale || "jp").toLowerCase();
  const jpRoot = path.join(rootDir, "third_party", "maa", "resource", "global", "YoStarJP", "resource");
  const commonRoot = path.join(rootDir, "third_party", "maa", "resource");
  const recRoot = normalizedLocale === "common" ? path.join(commonRoot, "PaddleOCR", "rec") : path.join(jpRoot, "PaddleOCR", "rec");
  return {
    recModel: process.env.RHODES_MAA_ONNX_REC_MODEL || path.join(recRoot, "inference.onnx"),
    recKeys: process.env.RHODES_MAA_ONNX_REC_KEYS || path.join(recRoot, "keys.txt"),
    ocrConfig: process.env.RHODES_MAA_OCR_CONFIG || path.join(jpRoot, "ocr_config.json"),
  };
}

async function bridgeSource() {
  return fs.readFile(BRIDGE_SCRIPT, "utf8");
}

function pythonExecutable() {
  return resolvePaddlePythonExecutable();
}

export function runPythonMaaOnnxOcr({
  imagePath,
  regions = [],
  templateOcrRegions = [],
  timeoutMs = 90000,
  pythonPath = pythonExecutable(),
  paths = resolveMaaOnnxOcrPaths(),
} = {}) {
  return new Promise(async (resolve, reject) => {
    let script;
    try {
      script = await bridgeSource();
    } catch (error) {
      reject(error);
      return;
    }
    execFile(pythonPath, ["-c", script], {
      encoding: "utf8",
      windowsHide: true,
      timeout: timeoutMs,
      maxBuffer: 16 * 1024 * 1024,
      env: {
        ...process.env,
        ARK_OCR_IMAGE: imagePath,
        ARK_OCR_REGIONS_JSON: JSON.stringify(regions),
        ARK_OCR_TEMPLATE_REGIONS_JSON: JSON.stringify(templateOcrRegions),
        RHODES_MAA_ONNX_REC_MODEL: paths.recModel,
        RHODES_MAA_ONNX_REC_KEYS: paths.recKeys,
        RHODES_MAA_OCR_CONFIG: paths.ocrConfig,
      },
    }, (error, stdout, stderr) => {
      if (error) {
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve(stdout);
    });
  });
}

export function parseMaaOnnxOcrStdout(stdout) {
  const lines = String(stdout || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const encoded = lines.at(-1) || "";
  const json = Buffer.from(encoded, "base64").toString("utf8");
  return JSON.parse(json);
}

export function normalizeMaaOnnxOcrPayload(payload = {}) {
  const ocrResults = Array.isArray(payload.ocrResults) ? payload.ocrResults : [];
  const normalizedResults = ocrResults
    .filter((item) => item && typeof item.text === "string" && item.text.trim())
    .map((item) => ({
      text: item.text,
      rawText: item.rawText || item.text,
      regionId: item.regionId || null,
      roi: item.roi || null,
      confidence: item.confidence ?? 0.75,
    }));
  return {
    engine: payload.engine || "maa-onnx-recognition",
    text: String(payload.text || normalizedResults.map((item) => item.text).join(" ")),
    ocrResults: normalizedResults,
  };
}

function isMaaOnnxUnavailable(error) {
  return /No module named ['"]?onnxruntime|ModuleNotFoundError|MAA ONNX OCR model not found|MAA ONNX OCR keys not found/i.test(`${error?.message || ""}\n${error?.stderr || ""}`);
}

export function createMaaOnnxOcrTextExtractor({
  enabled = true,
  required = false,
  timeoutMs = 90000,
  pythonPath = pythonExecutable(),
  runOcr = runPythonMaaOnnxOcr,
  paths = resolveMaaOnnxOcrPaths(),
} = {}) {
  let unavailableError = null;
  return {
    async extract(frame, context = {}) {
      const regions = Array.isArray(context.regions) ? context.regions : [];
      if (!enabled || !Buffer.isBuffer(frame?.bytes)) return frame;
      if (unavailableError && !required) throw unavailableError;
      if (!nodeFs.existsSync(paths.recModel)) {
        const error = new Error(`MAA ONNX OCR model not found: ${paths.recModel}`);
        if (!required) unavailableError = error;
        throw error;
      }
      if (!nodeFs.existsSync(paths.recKeys)) {
        const error = new Error(`MAA ONNX OCR keys not found: ${paths.recKeys}`);
        if (!required) unavailableError = error;
        throw error;
      }
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), "rhodes-maa-onnx-ocr-"));
      const imagePath = path.join(dir, `${randomUUID()}.png`);
      try {
        await fs.writeFile(imagePath, frame.bytes);
        const templateOcrRegions = resolveTemplateOcrRegions(context);
        const stdout = await runOcr({ imagePath, regions, templateOcrRegions, timeoutMs, pythonPath, paths });
        const payload = normalizeMaaOnnxOcrPayload(parseMaaOnnxOcrStdout(stdout));
        return {
          ...frame,
          text: payload.text,
          ocrResults: payload.ocrResults,
          ocrEngine: payload.engine,
        };
      } catch (error) {
        if (isMaaOnnxUnavailable(error) && !required) unavailableError = error;
        throw error;
      } finally {
        await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
      }
    },
  };
}
