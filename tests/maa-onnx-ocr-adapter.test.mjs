import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  createMaaOnnxOcrTextExtractor,
  normalizeMaaOnnxOcrPayload,
  parseMaaOnnxOcrStdout,
  resolveMaaOnnxOcrPaths,
} from "../app/recognition/adapters/maa-onnx-ocr-adapter.js";
import { createDefaultOcrTextExtractor } from "../app/recognition/adapters/ocr-text-extractor.js";

test("MAA ONNX OCR stdout parser decodes UTF-8 Japanese JSON from the final base64 line", () => {
  const payload = {
    engine: "maa-onnx-recognition",
    text: "位置測定分隊 4/4",
    ocrResults: [{ text: "位置測定分隊", rawText: "位置測定分隊", regionId: "run.squad_name" }],
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");

  assert.deepEqual(parseMaaOnnxOcrStdout(`onnx log\n${encoded}\n`), payload);
});

test("MAA ONNX OCR payload normalization preserves raw text and region metadata", () => {
  const payload = normalizeMaaOnnxOcrPayload({
    engine: "maa-onnx-recognition",
    ocrResults: [
      { text: "夕", rawText: "タ", regionId: "x", roi: { x: 1, y: 2, width: 3, height: 4 }, confidence: 0.92 },
      { text: "" },
    ],
  });

  assert.deepEqual(payload, {
    engine: "maa-onnx-recognition",
    text: "夕",
    ocrResults: [{ text: "夕", rawText: "タ", regionId: "x", roi: { x: 1, y: 2, width: 3, height: 4 }, confidence: 0.92 }],
  });
});

test("MAA ONNX OCR path resolver points at YoStarJP recognizer assets by default", () => {
  const paths = resolveMaaOnnxOcrPaths({ rootDir: "O:\\Arknights_Rogue_OBSTool" });

  assert.equal(paths.recModel.endsWith("third_party\\maa\\resource\\global\\YoStarJP\\resource\\PaddleOCR\\rec\\inference.onnx"), true);
  assert.equal(paths.recKeys.endsWith("third_party\\maa\\resource\\global\\YoStarJP\\resource\\PaddleOCR\\rec\\keys.txt"), true);
  assert.equal(paths.ocrConfig.endsWith("third_party\\maa\\resource\\global\\YoStarJP\\resource\\ocr_config.json"), true);
});

test("MAA ONNX OCR extractor can use an injected runner and returns OCR text", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "rhodes-maa-onnx-test-"));
  const model = path.join(dir, "inference.onnx");
  const keys = path.join(dir, "keys.txt");
  await fs.writeFile(model, "fake");
  await fs.writeFile(keys, "fake");
  const encoded = Buffer.from(JSON.stringify({
    engine: "maa-onnx-recognition",
    text: "4/4",
    ocrResults: [{ text: "4/4", rawText: "4/4", regionId: "run.life_points", confidence: 0.9 }],
  }), "utf8").toString("base64");
  const extractor = createMaaOnnxOcrTextExtractor({
    paths: { recModel: model, recKeys: keys, ocrConfig: path.join(dir, "ocr_config.json") },
    runOcr: async ({ regions, templateOcrRegions }) => {
      assert.equal(regions[0].id, "run.life_points");
      assert.equal(templateOcrRegions[0].idPrefix, "operator.card.name");
      assert.deepEqual(templateOcrRegions[0].searchRoi, { x: 20, y: 40, width: 60, height: 80 });
      return encoded;
    },
  });

  try {
    const frame = await extractor.extract({ bytes: Buffer.from("image") }, {
      regions: [{ id: "run.life_points" }],
      scale: { scaleX: 2, scaleY: 2 },
      profile: {
        templateOcrRegions: [{
          idPrefix: "operator.card.name",
          templatePath: "assets/recognition/templates/run/OperatorCardCodeNameFlag.png",
          searchRoi: { x: 10, y: 20, width: 30, height: 40 },
          ocrOffset: { x: 1, y: 2, width: 3, height: 4 },
        }],
      },
    });
    assert.equal(frame.ocrEngine, "maa-onnx-recognition");
    assert.equal(frame.text, "4/4");
    assert.equal(frame.ocrResults[0].rawText, "4/4");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("default OCR selector exposes maa-onnx as an explicit engine", () => {
  const extractor = createDefaultOcrTextExtractor({ engine: "maa-onnx" });

  assert.equal(typeof extractor.extract, "function");
});
