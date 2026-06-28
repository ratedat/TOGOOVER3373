import test from "node:test";
import assert from "node:assert/strict";

import { buildThoughtRecognitionDb, createThoughtCandidateExtractor, normalizeThoughtRecognitionText } from "../app/domain/recognition/thought-candidate-extractor.js";

const thoughts = [
  { id: "insp_01", campaignId: "is5_sarkaz", slot: "thought", name: "築壁", groupLabel: "妙想", thoughtRank: "✦3", thoughtLoad: "▲3", image: { localPath: "assets/thought/insp_01.png" } },
  { id: "legacy_01", campaignId: "is5_sarkaz", slot: "thought", name: "純白の花びら", groupLabel: "宿願", thoughtRank: "✦4", thoughtLoad: "▲5", image: { localPath: "assets/thought/legacy_01.png" } },
  { id: "revelation_01", campaignId: "is4_sami", slot: "revelation", name: "関係ない啓示", groupLabel: "啓示" },
];

test("thought recognition text normalization removes OCR spaces and punctuation", () => {
  assert.equal(normalizeThoughtRecognitionText(" 純 白 の 花 び ら "), "純白の花びら");
  assert.equal(normalizeThoughtRecognitionText("『築壁』"), "築壁");
});

test("thought recognition DB keeps IS5 thought metadata", () => {
  const db = buildThoughtRecognitionDb(thoughts, { campaignId: "is5_sarkaz" });

  assert.deepEqual(db.map((item) => item.thoughtId), ["insp_01", "legacy_01"]);
  assert.equal(db[0].groupLabel, "妙想");
  assert.equal(db[0].imagePath, "assets/thought/insp_01.png");
});

test("thought candidate extractor matches inspiration and legacy thoughts from OCR rows", async () => {
  const extractor = createThoughtCandidateExtractor({ selectableEffects: thoughts, campaignId: "is5_sarkaz" });
  const candidates = await extractor({
    ocrResults: [
      { text: "築 壁", regionId: "full", roi: { x: 260, y: 160, width: 120, height: 34 }, confidence: 0.7 },
      { text: "純 白 の 花 び ら", regionId: "full", roi: { x: 260, y: 260, width: 220, height: 34 }, confidence: 0.7 },
      { text: "思考負荷", regionId: "full", roi: { x: 1300, y: 1300, width: 120, height: 30 }, confidence: 0.7 },
    ],
  }, { profile: { id: "is5ThoughtFull" }, region: { x: 180, y: 120, width: 2200, height: 1080 } });

  assert.deepEqual(candidates.map((item) => item.thoughtId), ["insp_01", "legacy_01"]);
  assert.equal(candidates[0].kind, "thought");
  assert.equal(candidates[0].groupLabel, "妙想");
  assert.equal(candidates[1].groupLabel, "宿願");
  assert.equal(candidates[1].thoughtRank, "✦4");
});

test("thought candidate extractor preserves duplicate visible thought rows", async () => {
  const extractor = createThoughtCandidateExtractor({ selectableEffects: thoughts, campaignId: "is5_sarkaz" });
  const candidates = await extractor({
    ocrResults: [
      { text: "築 壁", regionId: "full", roi: { x: 260, y: 160, width: 120, height: 34 }, confidence: 0.7 },
      { text: "築 壁", regionId: "full", roi: { x: 760, y: 160, width: 120, height: 34 }, confidence: 0.7 },
      { text: "築 壁", regionId: "full", roi: { x: 260, y: 300, width: 120, height: 34 }, confidence: 0.7 },
    ],
  }, { profile: { id: "is5ThoughtFull" }, region: { x: 180, y: 120, width: 2200, height: 1080 } });

  assert.deepEqual(candidates.map((item) => item.thoughtId), ["insp_01", "insp_01", "insp_01"]);
  assert.deepEqual(candidates.map((item) => item.instanceId), ["roi:260,160", "roi:760,160", "roi:260,300"]);
});

test("thought candidate extractor ignores other profiles and OCR outside the scan region", async () => {
  const extractor = createThoughtCandidateExtractor({ selectableEffects: thoughts, campaignId: "is5_sarkaz" });
  const wrongProfile = await extractor({ ocrResults: [{ text: "築壁", roi: { x: 260, y: 160, width: 120, height: 34 } }] }, { profile: { id: "relicsFull" } });
  const outside = await extractor({ ocrResults: [{ text: "築壁", roi: { x: 10, y: 10, width: 120, height: 34 } }] }, { profile: { id: "is5ThoughtFull" }, region: { x: 180, y: 120, width: 2200, height: 1080 } });

  assert.deepEqual(wrongProfile, []);
  assert.deepEqual(outside, []);
});
