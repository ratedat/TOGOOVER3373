import test from "node:test";
import assert from "node:assert/strict";

import { normalizeWindowsOcrPayload, parseWindowsOcrStdout, shouldIncludeFullFrameOcr } from "../app/recognition/adapters/windows-ocr-adapter.js";

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
