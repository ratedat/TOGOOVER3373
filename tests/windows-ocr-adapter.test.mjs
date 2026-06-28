import test from "node:test";
import assert from "node:assert/strict";

import { normalizeWindowsOcrPayload, parseWindowsOcrStdout, resolveWindowsTemplateOcrRegions, shouldIncludeFullFrameOcr } from "../app/recognition/adapters/windows-ocr-adapter.js";

test("Windows OCR payload normalization keeps line text, region IDs, and ROIs", () => {
  const payload = normalizeWindowsOcrPayload({
    text: "魂 に 直 面 18",
    ocrResults: [
      {
        text: "魂 に 直 面 18",
        regionId: "run.difficulty_block",
        roi: { x: 0, y: 1040, width: 1800, height: 380 },
        confidence: 0.7,
      },
      { text: "   " },
    ],
  });

  assert.equal(payload.text, "魂 に 直 面 18");
  assert.deepEqual(payload.ocrResults, [
    {
      text: "魂 に 直 面 18",
      regionId: "run.difficulty_block",
      roi: { x: 0, y: 1040, width: 1800, height: 380 },
      confidence: 0.7,
    },
  ]);
});


test("Windows OCR stdout parser decodes UTF-8 Japanese JSON from the final base64 line", () => {
  const payload = {
    text: "魂 に 直 面 18 位 置 測 定 分 隊",
    ocrResults: [{ text: "指 揮 Lv 7", regionId: "run.status_top" }],
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");

  assert.deepEqual(parseWindowsOcrStdout(`diagnostic noise\n${encoded}\n`), payload);
});

test("Windows OCR can skip full-frame recognition for ROI-only profiles", () => {
  assert.equal(shouldIncludeFullFrameOcr({ profile: { id: "operatorsFull", ocrFullFrame: false } }), false);
  assert.equal(shouldIncludeFullFrameOcr({ profile: { id: "runStatusFull" } }), true);
});

test("Windows OCR resolves MAA-style template OCR regions with screen scale", () => {
  const regions = resolveWindowsTemplateOcrRegions({
    profile: {
      templateOcrRegions: [{
        idPrefix: "operator.recruit.name",
        templatePath: "third_party/maa/resource/template/Roguelike/base/RoguelikeRecruitOcrFlag.png",
        searchRoi: { x: 525, y: 110, width: 640, height: 500 },
        ocrOffset: { x: 13, y: 26, width: 120, height: 23 },
        threshold: 0.88,
        numericFallback: true,
        numericStartYRatio: 0,
        suppressStaticRegionIdPattern: "^operator\\.name\\.",
      }],
    },
    scale: { scaleX: 2, scaleY: 2 },
  }, "O:/Arknights_Rogue_OBSTool");

  assert.equal(regions.length, 1);
  assert.equal(regions[0].idPrefix, "operator.recruit.name");
  assert.deepEqual(regions[0].searchRoi, { x: 1050, y: 220, width: 1280, height: 1000 });
  assert.deepEqual(regions[0].ocrOffset, { x: 26, y: 52, width: 240, height: 46 });
  assert.equal(regions[0].templateScaleX, 2);
  assert.equal(regions[0].templateScaleY, 2);
  assert.equal(regions[0].threshold, 0.88);
  assert.equal(regions[0].numericFallback, true);
  assert.equal(regions[0].numericStartYRatio, 0);
  assert.equal(regions[0].suppressStaticRegionIdPattern, "^operator\\.name\\.");
});
