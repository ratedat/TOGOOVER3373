import test from "node:test";
import assert from "node:assert/strict";

import { buildRelicRecognitionDb, createRelicCandidateExtractor } from "../app/domain/recognition/relic-candidate-extractor.js";

const relics = [
  {
    id: "is5_sarkaz_relic_250",
    campaignId: "is5_sarkaz",
    number: 250,
    name: "時と光",
    category: "No.238〜262 古びた遺物",
    image: { localPath: "assets/relics/wikiru/img/scso_250.png" },
  },
  {
    id: "is5_sarkaz_relic_022",
    campaignId: "is5_sarkaz",
    number: 22,
    name: "独奏のオルゴール",
    category: "No.021〜055 生存の一助",
    image: { localPath: "assets/relics/wikiru/img/pcso_144.png" },
  },
  {
    id: "is5_sarkaz_relic_110",
    campaignId: "is5_sarkaz",
    number: 110,
    name: "迷夢の香油",
    category: "No.059〜143 闘争の爪牙",
    image: { localPath: "assets/relics/wikiru/img/pcso_156.png" },
  },
  {
    id: "is5_sarkaz_relic_193",
    campaignId: "is5_sarkaz",
    number: 193,
    name: "諸王の冠",
    category: "No.187〜240 巧者の利器",
    image: { localPath: "assets/relics/wikiru/img/mcao_128.png" },
  },
  {
    id: "is5_sarkaz_relic_209",
    campaignId: "is5_sarkaz",
    number: 209,
    name: "王様の延伸",
    category: "No.187〜240 巧者の利器",
    image: { localPath: "assets/relics/wikiru/img/ewso_024.png" },
  },
  {
    id: "is5_sarkaz_relic_267",
    campaignId: "is5_sarkaz",
    number: 267,
    name: "「小さなグランファーロ」",
    category: "No.263〜275 いにしえの遺物",
    image: { localPath: "assets/relics/wikiru/img/ewso_072.png" },
  },
  {
    id: "is5_sarkaz_relic_271",
    campaignId: "is5_sarkaz",
    number: 271,
    name: "ゴルドルの沈黙",
    category: "No.263〜275 いにしえの遺物",
    image: { localPath: "assets/relics/wikiru/img/ewso_076.png" },
  },
  {
    id: "is5_sarkaz_relic_276",
    campaignId: "is5_sarkaz",
    number: 276,
    name: "論断：前衛",
    category: "No.276〜296 古びた遺物",
    image: { localPath: "assets/relics/wikiru/img/ewso_077.png" },
  },
  {
    id: "is3_mizuki_relic_001",
    campaignId: "is3_mizuki",
    number: 1,
    name: "波乱万丈",
    category: "No.001〜020 多元化珍品",
    image: { localPath: "assets/relics/wikiru/img/mcao_001.png" },
  },
];

test("relic recognition DB keeps campaign, name, number, and local image path", () => {
  const db = buildRelicRecognitionDb(relics);

  const byId = new Map(db.map((item) => [item.relicId, item]));
  assert.deepEqual([byId.get("is5_sarkaz_relic_250").campaignId, byId.get("is5_sarkaz_relic_250").number, byId.get("is5_sarkaz_relic_250").name, byId.get("is5_sarkaz_relic_250").imagePath], [
    "is5_sarkaz",
    250,
    "時と光",
    "assets/relics/wikiru/img/scso_250.png",
  ]);
  assert.deepEqual([byId.get("is3_mizuki_relic_001").campaignId, byId.get("is3_mizuki_relic_001").number, byId.get("is3_mizuki_relic_001").name, byId.get("is3_mizuki_relic_001").imagePath], [
    "is3_mizuki",
    1,
    "波乱万丈",
    "assets/relics/wikiru/img/mcao_001.png",
  ]);
});

test("relic candidate extractor matches OCR text only for the active campaign", async () => {
  const extractor = createRelicCandidateExtractor({ relics, campaignId: "is5_sarkaz" });
  const candidates = await extractor({
    ocrResults: [
      { text: "No.250 時 と 光", confidence: 0.81, roi: { x: 100, y: 100, width: 300, height: 80 } },
      { text: "No.1 波乱万丈", confidence: 0.92, roi: { x: 100, y: 210, width: 300, height: 80 } },
    ],
  }, {
    profile: { id: "relicsFull" },
    region: { x: 90, y: 84, width: 1100, height: 540 },
  });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].kind, "relic");
  assert.equal(candidates[0].relicId, "is5_sarkaz_relic_250");
  assert.equal(candidates[0].name, "時と光");
  assert.equal(candidates[0].imagePath, "assets/relics/wikiru/img/scso_250.png");
  assert.equal(candidates[0].needsReview, true);
});

test("relic candidate extractor ignores OCR outside the scan region", async () => {
  const extractor = createRelicCandidateExtractor({ relics, campaignId: "is5_sarkaz" });
  const candidates = await extractor({
    ocrResults: [{ text: "時と光", confidence: 0.95, roi: { x: 10, y: 10, width: 100, height: 40 } }],
  }, {
    profile: { id: "relicsFull" },
    region: { x: 90, y: 84, width: 1100, height: 540 },
  });

  assert.deepEqual(candidates, []);
});

test("relic candidate extractor ignores aggregate OCR text without a row ROI", async () => {
  const extractor = createRelicCandidateExtractor({ relics, campaignId: "is5_sarkaz" });
  const candidates = await extractor({
    text: "時と光 小さなグランファーロ ゴルドルの沈黙",
    confidence: 0.95,
    ocrResults: [{ text: "関係ない行", confidence: 0.92, roi: { x: 100, y: 100, width: 140, height: 40 } }],
  }, {
    profile: { id: "relicsFull" },
    region: { x: 90, y: 84, width: 1100, height: 540 },
  });

  assert.deepEqual(candidates, []);
});

test("relic candidate extractor ignores full-list OCR blobs even when they have the scan ROI", async () => {
  const extractor = createRelicCandidateExtractor({ relics, campaignId: "is5_sarkaz" });
  const candidates = await extractor({
    ocrResults: [{
      text: "時と光 味方全員の最大HPが上昇する 長い説明文が続く",
      confidence: 0.95,
      roi: { x: 90, y: 84, width: 1100, height: 540 },
      regionId: "relic.list_text",
    }],
  }, {
    profile: { id: "relicsFull" },
    region: { x: 90, y: 84, width: 1100, height: 540 },
  });

  assert.deepEqual(candidates, []);
});

test("relic candidate extractor uses aggregate OCR as fallback after enough row anchors", async () => {
  const extractor = createRelicCandidateExtractor({ relics, campaignId: "is5_sarkaz" });
  const candidates = await extractor({
    text: "ゴルドルの沈黙 全ての敵の防御力+3000 王様の延伸 シールド値+3 小さなグランファーロ",
    confidence: 0.5,
    ocrResults: [
      { text: "独 奏 の オ ル ゴ ー ル", confidence: 0.7, roi: { x: 100, y: 100, width: 300, height: 40 } },
      { text: "迷 夢 の 香 油", confidence: 0.7, roi: { x: 100, y: 180, width: 260, height: 40 } },
      { text: "諸 王 の 冠", confidence: 0.7, roi: { x: 100, y: 260, width: 220, height: 40 } },
    ],
  }, {
    profile: { id: "relicsFull" },
    region: { x: 90, y: 84, width: 1100, height: 540 },
  });

  assert.deepEqual(candidates.map((candidate) => [candidate.relicId, candidate.source]).sort(), [
    ["is5_sarkaz_relic_022", "ocr-row"],
    ["is5_sarkaz_relic_110", "ocr-row"],
    ["is5_sarkaz_relic_193", "ocr-row"],
    ["is5_sarkaz_relic_209", "ocr-aggregate"],
    ["is5_sarkaz_relic_267", "ocr-aggregate"],
    ["is5_sarkaz_relic_271", "ocr-aggregate"],
  ].sort());
});


test("relic candidate extractor tolerates separator OCR drift in relic names", async () => {
  const extractor = createRelicCandidateExtractor({ relics, campaignId: "is5_sarkaz" });
  const candidates = await extractor({
    ocrResults: [
      { text: "論 断 . 前 衛", confidence: 0.72, roi: { x: 100, y: 100, width: 300, height: 40 } },
    ],
  }, {
    profile: { id: "relicsFull" },
    region: { x: 90, y: 84, width: 1100, height: 540 },
  });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].relicId, "is5_sarkaz_relic_276");
  assert.equal(candidates[0].name, "論断：前衛");
});
