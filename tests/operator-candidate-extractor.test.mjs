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
  { id: "leizi", name: "レイズ", rarity: 5, class: "術師", branch: "連鎖術師" },
  { id: "leizi2", name: "司霆レイズ", rarity: 6, class: "前衛", branch: "解放者" },
  { id: "yu", name: "ユー", rarity: 6, class: "重装", branch: "本源衛士" },
  { id: "eunectes", name: "ユーネクテス", rarity: 6, class: "重装", branch: "決闘者" },
  { id: "humus", name: "ヒューマス", rarity: 4, class: "前衛", branch: "鎌撃士" },
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
    { pattern: "^レイズ", maaReplacement: "惊蛰", localMatches: [{ id: "leizi", name: "レイズ" }] },
    { pattern: "(司|霆).*レイズ", maaReplacement: "司霆惊蛰", localMatches: [{ id: "leizi2", name: "司霆レイズ" }] },
    { pattern: "^ユー(?:$|[^ネ])", maaReplacement: "余", localMatches: [{ id: "yu", name: "ユー" }, { id: "eunectes", name: "ユーネクテス" }] },
    { pattern: "ヒューマス", maaReplacement: "休谟斯", localMatches: [{ id: "humus", name: "ヒューマス" }] },
  ],
  equivalenceClasses: [["ン", "ソ"], ["-", "ー", "一"], ["フ", "ブ", "プ"]],
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

test("operator candidate extractor maps the Sarkaz operator list PMEY OCR drift to Leizi alter", async () => {
  const extractor = createOperatorCandidateExtractor({ operators, operatorOcrMap });
  const candidates = await extractor({
    ocrResults: [{ text: "PMEY", regionId: "operator.name.left.1", roi: { x: 1200, y: 290, width: 460, height: 124 }, confidence: 0.47 }],
  }, { profile: { id: "operatorsFull" }, region: { x: 700, y: 140, width: 1720, height: 1110 } });

  assert.equal(candidates[0].operatorId, "leizi2");
  assert.equal(candidates[0].name, "司霆レイズ");
});

test("operator candidate extractor maps Leizi alter when Windows OCR drops the dakuten", async () => {
  const extractor = createOperatorCandidateExtractor({ operators, operatorOcrMap });
  const candidates = await extractor({
    ocrResults: [{ text: "司 霆 レ イ ス 、", regionId: "operator.name.left.1", roi: { x: 1333, y: 346, width: 260, height: 49 }, confidence: 0.7 }],
  }, { profile: { id: "operatorsFull" }, region: { x: 700, y: 140, width: 1720, height: 1110 } });

  assert.equal(candidates[0].operatorId, "leizi2");
  assert.equal(candidates[0].name, "司霆レイズ");
});

test("operator candidate extractor maps normal Leizi when Windows OCR drops the dakuten", async () => {
  const extractor = createOperatorCandidateExtractor({ operators, operatorOcrMap });
  const candidates = await extractor({
    ocrResults: [{ text: "ー レ イ ス", regionId: "operator.name.left.1", roi: { x: 1333, y: 346, width: 260, height: 49 }, confidence: 0.7 }],
  }, { profile: { id: "operatorsFull" }, region: { x: 700, y: 140, width: 1720, height: 1110 } });

  assert.deepEqual(candidates.map((item) => item.operatorId), ["leizi"]);
  assert.equal(candidates[0].name, "レイズ");
  assert.equal(candidates[0].source, "local-ocr-drift");
});

test("operator candidate extractor does not turn partial Humus OCR into Yu or Eunectes", async () => {
  const extractor = createOperatorCandidateExtractor({ operators, operatorOcrMap });
  const candidates = await extractor({
    ocrResults: [
      { text: "ユ ー マ ス", regionId: "operator.name.left.2", roi: { x: 768, y: 389.2, width: 79.8, height: 17.2 }, confidence: 0.7 },
      { text: "、 。 - ー ・ ヒ ュ ー マ ス", regionId: "operator.name.left.2", roi: { x: 808.8, y: 390.5, width: 126, height: 20 }, confidence: 0.7 },
    ],
  }, { profile: { id: "operatorsFull" }, region: { x: 350, y: 70, width: 880, height: 555 } });

  assert.deepEqual(candidates.map((item) => item.operatorId), ["humus"]);
});

test("operator candidate extractor ignores OCR outside operatorsFull", async () => {
  const extractor = createOperatorCandidateExtractor({ operators, operatorOcrMap });
  const candidates = await extractor({ ocrResults: [{ text: "ブレイズ", regionId: "operator.list_text" }] }, { profile: { id: "relicsFull" } });

  assert.deepEqual(candidates, []);
});
