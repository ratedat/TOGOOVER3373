import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

import { runScanProfile } from "../app/domain/recognition/scan-runner.js";
import { createMaaStyleRecognizer } from "../app/domain/recognition/maa-style-recognizer.js";
import { normalizeRecognitionText } from "../app/domain/recognition/text-normalize.js";

function createAdapter(frames) {
  const queue = [...frames];
  return {
    async getActualResolution() {
      return { width: 2560, height: 1440 };
    },
    async capture() {
      return queue.shift() || { ocrResults: [] };
    },
    async swipe() {},
    async back() {},
    async wait() {},
  };
}

const tasks = {
  screens: [
    {
      id: "is5.sarkaz.map_select.header",
      screenId: "is5-sarkaz-map-select",
      profileIds: ["runStatusFull"],
      recognition: {
        expected: ["サルカズの炉辺奇談", "魂に直面"],
        match: "all",
        normalize: ["remove_spaces"],
      },
    },
  ],
  candidates: [
    {
      id: "is5.sarkaz.map_select.campaign",
      profileIds: ["runStatusFull"],
      recognition: {
        expected: ["サルカズの炉辺奇談"],
        normalize: ["remove_spaces"],
      },
      candidate: {
        kind: "runStatus",
        field: "campaignId",
        label: "統合戦略",
        value: "is5_sarkaz",
        confidence: 0.82,
      },
    },
  ],
};

test("MAA-style text normalization removes Japanese OCR spaces and fixes number-like text", () => {
  assert.equal(normalizeRecognitionText("サ ル カ ズ の 炉 辺 奇 談", ["remove_spaces"]), "サルカズの炉辺奇談");
  assert.equal(normalizeRecognitionText("+ IO", ["jp_numeric"]), "+10");
});

test("MAA-style recognizer classifies a profile screen from OCR text", async () => {
  const recognizer = createMaaStyleRecognizer({ tasks });
  const result = await recognizer.classify({
    ocrResults: [{ text: "サ ル カ ズ の 炉 辺 奇 談 / 魂 に 直 面・18", confidence: 0.91 }],
  }, { profile: { id: "runStatusFull" } });

  assert.equal(result.known, true);
  assert.equal(result.screenId, "is5-sarkaz-map-select");
  assert.equal(result.engine, "maa-style");
});

test("MAA-style screen tasks can require all expected OCR terms across split results", async () => {
  const recognizer = createMaaStyleRecognizer({ tasks });
  const partial = await recognizer.classify({
    ocrResults: [{ text: "サ ル カ ズ の 炉 辺 奇 談", confidence: 0.91 }],
  }, { profile: { id: "runStatusFull" } });
  const split = await recognizer.classify({
    ocrResults: [
      { text: "サ ル カ ズ の 炉 辺 奇 談", confidence: 0.89 },
      { text: "魂 に 直 面・18", confidence: 0.86 },
    ],
  }, { profile: { id: "runStatusFull" } });

  assert.equal(partial.known, false);
  assert.equal(split.known, true);
  assert.equal(split.screenId, "is5-sarkaz-map-select");
});

test("scan runner can use MAA-style tasks without changing the scan interface", async () => {
  const profile = {
    id: "runStatusFull",
    label: "基本情報スキャン",
    baseResolution: { width: 1280, height: 720 },
    openSteps: [],
    restoreSteps: [],
    maxScrolls: 0,
    scanRegion: { x: 0, y: 0, width: 520, height: 126 },
  };
  const frame = { ocrResults: [{ text: "サ ル カ ズ の 炉 辺 奇 談 / 魂 に 直 面・18", confidence: 0.91 }] };
  const result = await runScanProfile({
    profile,
    adapter: createAdapter([frame, frame]),
    recognizer: createMaaStyleRecognizer({ tasks }),
    scanId: "maa-style-scan",
    now: () => new Date("2026-06-26T00:00:00.000Z"),
  });

  assert.equal(result.status, "completed");
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].kind, "runStatus");
  assert.equal(result.candidates[0].value, "is5_sarkaz");
  assert.equal(result.suggestions.length, 1);
});


test("MAA-style recognizer can enrich byte frames through a text extractor and dynamic candidates", async () => {
  const textExtractor = {
    async extract(frame, context) {
      assert.equal(Buffer.isBuffer(frame.bytes), true);
      assert.equal(context.regions.length > 0, true);
      return {
        ...frame,
        ocrResults: [{ text: "指 揮 Lv 魂 に 直 面 18 秘 宝", confidence: 0.8 }],
      };
    },
  };
  const candidateExtractors = [async () => [{ kind: "runStatus", field: "difficulty", value: 18, rawText: "魂に直面・18" }]];
  const recognizer = createMaaStyleRecognizer({
    tasks: {
      ocrRegions: [{ id: "run.difficulty_block", profileIds: ["runStatusFull"], roi: [0, 520, 900, 190], scale: 2 }],
      screens: [{
        id: "run.squad_info_panel",
        screenId: "run-squad-info-panel",
        profileIds: ["runStatusFull"],
        recognition: { expected: ["指揮", "秘宝"], match: "all", normalize: ["remove_spaces"] },
      }],
      candidates: [],
    },
    textExtractor,
    candidateExtractors,
  });

  const frame = { bytes: Buffer.from("fake") };
  const context = { profile: { id: "runStatusFull" }, scale: { scaleX: 2, scaleY: 2 } };
  const classification = await recognizer.classify(frame, context);
  const candidates = await recognizer.recognize(frame, context);

  assert.equal(classification.known, true);
  assert.equal(classification.screenId, "run-squad-info-panel");
  assert.deepEqual(candidates.map((item) => [item.field, item.value]), [["difficulty", 18]]);
});


test("MAA-style recognizer applies MAA ocrReplace rules before matching OCR text", async () => {
  const recognizer = createMaaStyleRecognizer({
    tasks: {
      candidates: [{
        id: "replace-rule-task",
        profileIds: ["runStatusFull"],
        recognition: {
          expected: ["ブループリント分隊"],
          ocrReplace: [["ブループリント分.*", "ブループリント分隊"]],
          normalize: ["remove_spaces"],
        },
        candidate: { kind: "runStatus", field: "squadId", valueFrom: "replacedText" },
      }],
    },
  });

  const candidates = await recognizer.recognize({ text: "ブループリント分  OCR崩れ" }, { profile: { id: "runStatusFull" } });

  assert.equal(candidates[0].value, "ブループリント分隊");
});

test("MAA-style recognizer can classify fixed-ROI screens from extracted candidates", async () => {
  const recognizer = createMaaStyleRecognizer({
    tasks: { screens: [] },
    candidateExtractors: [async () => [{ kind: "runStatus", field: "shield", value: 2, rawText: "シールド 2", confidence: 0.91 }]],
  });

  const result = await recognizer.classify({
    ocrResults: [{ text: "02", regionId: "run.shield", confidence: 0.93 }],
  }, { profile: { id: "runStatusFull", inferredScreenId: "run-squad-info-panel" } });

  assert.equal(result.known, true);
  assert.equal(result.screenId, "run-squad-info-panel");
  assert.equal(result.engine, "candidate-extractor");
});


test("recognition task data exposes separated hope current and max OCR regions", async () => {
  const rawTasks = JSON.parse(await fs.readFile(new URL("../data/recognition/maa-tasks.json", import.meta.url), "utf8"));
  const regions = rawTasks.ocrRegions.filter((region) => region.profileIds?.includes("runStatusFull"));

  assert.ok(regions.some((region) => region.id === "run.resource_numbers"));
  assert.ok(regions.some((region) => region.id === "run.hope"));
  assert.ok(regions.some((region) => region.id === "run.hope.current"));
  assert.ok(regions.some((region) => region.id === "run.hope.max"));
});

test("recognition task data exposes a dedicated relic footer OCR region", async () => {
  const rawTasks = JSON.parse(await fs.readFile(new URL("../data/recognition/maa-tasks.json", import.meta.url), "utf8"));
  let regions = [];
  const recognizer = createMaaStyleRecognizer({
    tasks: rawTasks,
    textExtractor: {
      async extract(frame, context = {}) {
        regions = context.regions || [];
        return {
          ...frame,
          ocrResults: [{
            text: "5宝",
            regionId: "run.map_footer.relic",
            roi: { x: 268, y: 1296, width: 168, height: 120 },
            confidence: 0.44,
          }],
        };
      },
    },
  });

  const result = await recognizer.classify(
    { bytes: Buffer.from("fake screenshot") },
    { profile: { id: "relicsFull" }, scale: { scaleX: 2, scaleY: 2 } },
  );

  assert.ok(regions.some((region) => region.id === "run.map_footer.relic"));
  assert.equal(result.known, true);
  assert.equal(result.screenId, "run-home");
});

test("MAA-style recognizer classifies the map footer as run-home for scan entry points", async () => {
  const recognizer = createMaaStyleRecognizer({
    tasks: {
      screens: [{
        id: "run.map_footer",
        screenId: "run-home",
        profileIds: ["relicsFull"],
        recognition: {
          expected: ["秘宝", "思案", "隊員"],
          match: "any",
          normalize: ["remove_spaces"],
          ocrReplace: [["5宝", "秘宝"]],
        },
      }],
    },
  });

  const result = await recognizer.classify({
    ocrResults: [{ text: "5宝", confidence: 0.88 }],
  }, { profile: { id: "relicsFull" } });

  assert.equal(result.known, true);
  assert.equal(result.screenId, "run-home");
});
