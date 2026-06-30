import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import nodeFs from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveTemplateOcrRegions } from "./template-ocr-regions.js";

const BRIDGE_SCRIPT = fileURLToPath(new URL("./paddle-ocr-bridge.py", import.meta.url));

export function resolvePaddlePythonExecutable(env = process.env, homeDir = os.homedir(), cwd = process.cwd()) {
  const explicit = env.RHODES_PYTHON || env.PYTHON;
  if (explicit) return explicit;
  const candidates = [
    path.join(cwd, ".venv-ocr", "Scripts", "python.exe"),
    path.join(homeDir, ".paddleocr-mcp-venv", "Scripts", "python.exe"),
    path.join(homeDir, ".venv-ocr", "Scripts", "python.exe"),
    path.join(homeDir, "AppData", "Local", "Programs", "Python", "Python312", "python.exe"),
  ];
  return candidates.find((candidate) => nodeFs.existsSync(candidate)) || "python";
}

function pythonExecutable() {
  return resolvePaddlePythonExecutable();
}

async function bridgeSource() {
  return fs.readFile(BRIDGE_SCRIPT, "utf8");
}

function runPythonPaddleOcr({ imagePath, regions = [], templateOcrRegions = [], timeoutMs = 90000, pythonPath = pythonExecutable() }) {
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
        PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK: process.env.PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK || "True",
        RHODES_PADDLE_RECOGNITION_ONLY: process.env.RHODES_PADDLE_RECOGNITION_ONLY || "1",
        ARK_OCR_IMAGE: imagePath,
        ARK_OCR_REGIONS_JSON: JSON.stringify(regions),
        ARK_OCR_TEMPLATE_REGIONS_JSON: JSON.stringify(templateOcrRegions),
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

export function parsePaddleOcrStdout(stdout) {
  const lines = String(stdout || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const encoded = lines.at(-1) || "";
  const json = Buffer.from(encoded, "base64").toString("utf8");
  return JSON.parse(json);
}

export function normalizePaddleOcrPayload(payload = {}) {
  const ocrResults = Array.isArray(payload.ocrResults) ? payload.ocrResults : [];
  return {
    engine: payload.engine || "paddleocr",
    text: String(payload.text || ocrResults.map((item) => item.text).join(" ")),
    ocrResults: ocrResults
      .filter((item) => item && typeof item.text === "string" && item.text.trim())
      .map((item) => ({
        text: item.text,
        regionId: item.regionId || null,
        roi: item.roi || null,
        confidence: item.confidence ?? 0.75,
      })),
  };
}

function isPaddleUnavailable(error) {
  return /PaddleOCR is not available|No module named ['"]?paddleocr|ModuleNotFoundError/i.test(`${error?.message || ""}\n${error?.stderr || ""}`);
}

export function createPaddleOcrTextExtractor({ enabled = true, required = false, timeoutMs = 90000, pythonPath = pythonExecutable() } = {}) {
  let unavailableError = null;
  return {
    async extract(frame, context = {}) {
      const regions = Array.isArray(context.regions) ? context.regions : [];
      if (!enabled || !Buffer.isBuffer(frame?.bytes)) return frame;
      if (unavailableError && !required) throw unavailableError;
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), "rhodes-paddle-ocr-"));
      const imagePath = path.join(dir, `${randomUUID()}.png`);
      try {
        await fs.writeFile(imagePath, frame.bytes);
        const stdout = await runPythonPaddleOcr({ imagePath, regions, templateOcrRegions: resolveTemplateOcrRegions(context), timeoutMs, pythonPath });
        const payload = normalizePaddleOcrPayload(parsePaddleOcrStdout(stdout));
        return {
          ...frame,
          text: payload.text,
          ocrResults: payload.ocrResults,
          ocrEngine: payload.engine,
        };
      } catch (error) {
        if (isPaddleUnavailable(error) && !required) unavailableError = error;
        throw error;
      } finally {
        await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
      }
    },
  };
}
