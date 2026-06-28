import test from "node:test";
import assert from "node:assert/strict";

import { createDefaultOcrTextExtractor, createMergedTextExtractor, createProfileAwareTextExtractor, mergeOcrFrames } from "../app/recognition/adapters/ocr-text-extractor.js";

test("mergeOcrFrames keeps OCR results from multiple engines and dedupes exact duplicates", () => {
  const frame = mergeOcrFrames({ bytes: Buffer.from("x") }, [
    { ocrResults: [
      { text: "位置測定分隊", regionId: "run.squad_name", confidence: 0.94 },
      { text: "4/4", regionId: "run.life_points", confidence: 0.8 },
    ] },
    { ocrResults: [
      { text: "4/4", regionId: "run.life_points", confidence: 0.99 },
      { text: "1", regionId: "run.command_level", confidence: 0.91 },
    ] },
  ], { engine: "hybrid-test" });

  assert.equal(frame.ocrEngine, "hybrid-test");
  assert.equal(frame.ocrResults.length, 3);
  assert.equal(frame.ocrResults.find((item) => item.regionId === "run.life_points").confidence, 0.99);
  assert.match(frame.text, /位置測定分隊/);
  assert.match(frame.text, /1/);
});

test("createMergedTextExtractor returns all successful OCR outputs when one engine fails", async () => {
  const extractor = createMergedTextExtractor([
    { extract: async () => { throw new Error("onnx missing"); } },
    { extract: async (frame) => ({ ...frame, ocrResults: [{ text: "4/4", regionId: "run.life_points" }] }) },
  ], { engine: "hybrid-test" });

  const frame = await extractor.extract({ bytes: Buffer.from("x") });

  assert.equal(frame.ocrEngine, "hybrid-test");
  assert.equal(frame.text, "4/4");
});

test("default OCR selector exposes windows-paddle hybrid for run status scans", () => {
  const extractor = createDefaultOcrTextExtractor({ engine: "windows-paddle" });

  assert.equal(typeof extractor.extract, "function");
});

test("default OCR selector exposes hybrid as an explicit engine", () => {
  const extractor = createDefaultOcrTextExtractor({ engine: "hybrid" });

  assert.equal(typeof extractor.extract, "function");
});


test("mergeOcrFrames drops explicitly low-confidence OCR results", () => {
  const frame = mergeOcrFrames({ bytes: Buffer.from("x") }, [
    { ocrResults: [
      { text: "2", regionId: "run.difficulty_grade", confidence: 0.12 },
      { text: "18", regionId: "run.difficulty_grade", confidence: 0.95 },
      { text: "手動候補", regionId: "manual" },
    ] },
  ], { engine: "hybrid-test", minConfidence: 0.2 });

  assert.equal(frame.ocrResults.some((item) => item.text === "2"), false);
  assert.equal(frame.ocrResults.some((item) => item.text === "18"), true);
  assert.equal(frame.ocrResults.some((item) => item.text === "手動候補"), true);
});


test("profile-aware OCR routing can force relic scans to a different extractor", async () => {
  const calls = [];
  const extractor = createProfileAwareTextExtractor({
    defaultExtractor: {
      async extract(frame) {
        calls.push("default");
        return { ...frame, text: "default" };
      },
    },
    profileExtractors: {
      relicsFull: {
        async extract(frame) {
          calls.push("relicsFull");
          return { ...frame, text: "windows" };
        },
      },
    },
  });

  const relicFrame = await extractor.extract({ bytes: Buffer.from("x") }, { profile: { id: "relicsFull" } });
  const runFrame = await extractor.extract({ bytes: Buffer.from("x") }, { profile: { id: "runStatusFull" } });

  assert.equal(relicFrame.text, "windows");
  assert.equal(runFrame.text, "default");
  assert.deepEqual(calls, ["relicsFull", "default"]);
});
