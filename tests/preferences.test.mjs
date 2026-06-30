import test from "node:test";
import assert from "node:assert/strict";

import { normalizeOcrEngine, normalizePreferences, ocrEngineOptions } from "../app/lib/preferences.js";

test("OCR engine preference defaults to profile routing", () => {
  assert.equal(normalizeOcrEngine(""), "profile");
  assert.equal(normalizeOcrEngine("unknown"), "profile");
  assert.equal(normalizePreferences({}).ocrEngine, "profile");
});

test("OCR engine preference accepts GLM verification engines", () => {
  assert.equal(normalizeOcrEngine("glm-ocr"), "glm-ocr");
  assert.equal(normalizeOcrEngine("windows-glm"), "windows-glm");
  assert.ok(ocrEngineOptions.some((option) => option.id === "windows-glm"));
});

test("OCR engine preference exposes MAA-first engines", () => {
  assert.equal(normalizeOcrEngine("hybrid"), "hybrid");
  assert.equal(normalizeOcrEngine("maa-onnx"), "maa-onnx");
  assert.equal(normalizeOcrEngine("paddle"), "paddle");
  assert.ok(ocrEngineOptions.some((option) => option.id === "maa-onnx"));
  assert.ok(ocrEngineOptions.some((option) => option.id === "paddle"));
});

test("choice list filter preferences are normalized", () => {
  const preferences = normalizePreferences({
    operatorShowSelectedFirst: "true",
    operatorHideExcluded: false,
    operatorSelectedOnly: "1",
    operatorExcludedIds: ["texas", "", "texas", "exusiai"],
    relicShowSelectedFirst: true,
    relicHideExcluded: "false",
    relicSelectedOnly: 0,
    relicExcludedIds: ["is5_sarkaz_relic_001", null, "is5_sarkaz_relic_001"],
  });

  assert.equal(preferences.operatorShowSelectedFirst, true);
  assert.equal(preferences.operatorHideExcluded, false);
  assert.equal(preferences.operatorSelectedOnly, true);
  assert.deepEqual(preferences.operatorExcludedIds, ["texas", "exusiai"]);
  assert.equal(preferences.relicShowSelectedFirst, true);
  assert.equal(preferences.relicHideExcluded, false);
  assert.equal(preferences.relicSelectedOnly, false);
  assert.deepEqual(preferences.relicExcludedIds, ["is5_sarkaz_relic_001"]);
});
