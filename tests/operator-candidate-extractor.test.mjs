import test from "node:test";
import assert from "node:assert/strict";

import { buildOperatorRecognitionDb, createOperatorCandidateExtractor, normalizeOperatorRecognitionText } from "../app/domain/recognition/operator-candidate-extractor.js";

const operators = [
  { id: "blaze", name: "ブレイズ", rarity: 6, class: "前衛", branch: "強襲者", image: { localPath: "assets/operators/blaze.png" } },
  { id: "wisadel", name: "ウィシャデル", rarity: 6, class: "狙撃", branch: "投擲手", image: { localPath: "assets/operators/wisadel.png" } },
  { id: "hoederer", name: "ヘドリー", rarity: 6, class: "前衛", branch: "重剣士" },
  { id: "silverash2", name: "凛御シルバーアッシュ", rarity: 6, class: "先鋒", branch: "策士" },
  { id: "lumen", name: "ルーメン", rarity: 6, class: "医療", branch: "療養師" },
  { id: "ines", name: "イネス", rarity: 6, class: "先鋒", branch: "偵察兵" },
  { id: "myrtle", name: "テンニンカ", rarity: 4, class: "先鋒", branch: "旗手" },
  { id: "ray", name: "レイ", rarity: 6, class: "狙撃", branch: "狩人" },
];

const operatorOcrMap = {
  rules: [
    { pattern: "^ブレイ(ズ|ス)", maaReplacement: "煌", localMatches: [{ id: "blaze", name: "ブレイズ" }] },
    { pattern: "(ウ)?(ィ|イ)シャデル", maaReplacement: "维什戴尔", localMatches: [{ id: "wisadel", name: "ウィシャデル" }] },
    { pattern: "へドリー", maaReplacement: "赫德雷", localMatches: [{ id: "hoederer", name: "ヘドリー" }] },
    { pattern: "(凛|御).*シルバ.*", maaReplacement: "凛御银灰", localMatches: [{ id: "silverash2", name: "凛御シルバーアッシュ" }] },
    { pattern: "ルーメン", maaReplacement: "流明", localMatches: [{ id: "lumen", name: "ルーメン" }] },
    { pattern: "イネ(ス|ズ).*", maaReplacement: "伊内丝", localMatches: [{ id: "ines", name: "イネス" }] },
    { pattern: "テンニンカ", maaReplacement: "桃金娘", localMatches: [{ id: "myrtle", name: "テンニンカ" }] },
  ],
  equivalenceClasses: [["ン", "ソ"], ["-", "ー", "一"], ["フ", "ブ", "プ"], ["ス", "ズ"]],
};

test("operator recognition text normalization removes OCR punctuation and MAA equivalence drift", () => {
  assert.equal(normalizeOperatorRecognitionText("テ ソ ニ ン カ", operatorOcrMap), "テンニンカ");
  assert.equal(normalizeOperatorRecognitionText("ル一メン", operatorOcrMap), "ルーメン");
});

test("operator recognition DB keeps local operator metadata and MAA regex rules", () => {
  const db = buildOperatorRecognitionDb(operators, { operatorOcrMap });
  const blaze = db.find((item) => item.operatorId === "blaze");

  assert.equal(blaze.name, "ブレイズ");
  assert.equal(blaze.imagePath, "assets/operators/blaze.png");
  assert.ok(blaze.ocrPatterns.some((pattern) => pattern.source === "maa" && pattern.pattern === "^ブレイ(ズ|ス)"));
});

test("operator candidate extractor matches visible operator names from OCR rows", async () => {
  const extractor = createOperatorCandidateExtractor({ operators, operatorOcrMap });
  const candidates = await extractor({
    ocrResults: [
      { text: "ブレイズ", regionId: "operator.list_text", roi: { x: 720, y: 250, width: 160, height: 42 }, confidence: 0.83 },
      { text: "ウィシャデル", regionId: "operator.list_text", roi: { x: 1540, y: 250, width: 190, height: 42 }, confidence: 0.86 },
      { text: "ヘドリー", regionId: "operator.list_text", roi: { x: 720, y: 415, width: 160, height: 42 }, confidence: 0.8 },
      { text: "凛御シルバーアッシュ", regionId: "operator.list_text", roi: { x: 1500, y: 420, width: 260, height: 42 }, confidence: 0.82 },
      { text: "ルーメン", regionId: "operator.list_text", roi: { x: 720, y: 585, width: 160, height: 42 }, confidence: 0.81 },
      { text: "イネス", regionId: "operator.list_text", roi: { x: 720, y: 765, width: 160, height: 42 }, confidence: 0.8 },
      { text: "テンニンカ", regionId: "operator.list_text", roi: { x: 1500, y: 765, width: 160, height: 42 }, confidence: 0.8 },
    ],
  }, { profile: { id: "operatorsFull" }, region: { x: 700, y: 140, width: 1720, height: 1110 } });

  assert.deepEqual(candidates.map((item) => item.operatorId), ["blaze", "wisadel", "hoederer", "silverash2", "lumen", "ines", "myrtle"]);
});

test("operator candidate extractor uses MAA hiragana-katakana rules for Japanese operator names", async () => {
  const extractor = createOperatorCandidateExtractor({ operators, operatorOcrMap });
  const candidates = await extractor({
    ocrResults: [{ text: "ヘドリー", regionId: "operator.list_text", roi: { x: 720, y: 415, width: 160, height: 42 }, confidence: 0.8 }],
  }, { profile: { id: "operatorsFull" }, region: { x: 700, y: 140, width: 1720, height: 1110 } });

  assert.equal(candidates[0].operatorId, "hoederer");
  assert.equal(candidates[0].source, "maa-ocr-rule");
  assert.equal(candidates[0].matchedPattern, "へドリー");
});

test("operator candidate extractor uses MAA regex when OCR has a known Japanese name drift", async () => {
  const extractor = createOperatorCandidateExtractor({ operators, operatorOcrMap });
  const candidates = await extractor({
    ocrResults: [{ text: "ブレイス", regionId: "operator.list_text", roi: { x: 720, y: 250, width: 160, height: 42 }, confidence: 0.78 }],
  }, { profile: { id: "operatorsFull" }, region: { x: 700, y: 140, width: 1720, height: 1110 } });

  assert.equal(candidates[0].operatorId, "blaze");
  assert.equal(candidates[0].source, "maa-ocr-rule");
});


test("operator candidate extractor prefers MAA rules over short local-name fragments", async () => {
  const extractor = createOperatorCandidateExtractor({ operators, operatorOcrMap });
  const candidates = await extractor({
    ocrResults: [{ text: "ー プ レ イ ス", regionId: "operator.list_text", roi: { x: 720, y: 250, width: 160, height: 42 }, confidence: 0.7 }],
  }, { profile: { id: "operatorsFull" }, region: { x: 700, y: 140, width: 1720, height: 1110 } });

  assert.deepEqual(candidates.map((item) => item.operatorId), ["blaze"]);
  assert.equal(candidates[0].source, "maa-ocr-rule");
});

test("operator candidate extractor ignores OCR outside operatorsFull", async () => {
  const extractor = createOperatorCandidateExtractor({ operators, operatorOcrMap });
  const candidates = await extractor({ ocrResults: [{ text: "ブレイズ", regionId: "operator.list_text" }] }, { profile: { id: "relicsFull" } });

  assert.deepEqual(candidates, []);
});
