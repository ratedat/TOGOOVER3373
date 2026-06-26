import test from "node:test";
import assert from "node:assert/strict";

import { extractRunStatusCandidates } from "../app/domain/recognition/run-status-extractor.js";

const squads = [
  { id: "is5_sarkaz_squad_03", campaignId: "is5_sarkaz", name: "位置測定分隊" },
  { id: "is5_sarkaz_squad_04", campaignId: "is5_sarkaz", name: "指揮分隊" },
];

const difficultyGrades = {
  is5_sarkaz: {
    campaignId: "is5_sarkaz",
    difficultyName: "魂に直面",
    grades: Array.from({ length: 18 }, (_, index) => ({
      id: `is5_sarkaz_grade_${index + 1}`,
      campaignId: "is5_sarkaz",
      difficultyName: "魂に直面",
      grade: index + 1,
      label: `魂に直面・${index + 1}`,
    })),
  },
};

test("run status extractor maps OCR squad text and difficulty grade to current campaign IDs", () => {
  const candidates = extractRunStatusCandidates({
    ocrResults: [
      { text: "位 置 測 定 分 隊 ス ポ ッ ト 更 新 回 数 + 1", regionId: "run.squad_card" },
      { text: "魂 に 直 面 18 下 、 秘 宝", regionId: "run.difficulty_block" },
    ],
  }, { campaignId: "is5_sarkaz", squads, difficultyGrades });

  assert.deepEqual(candidates.map((item) => [item.field, item.value]), [
    ["squadId", "is5_sarkaz_squad_03"],
    ["difficulty", 18],
  ]);
});

test("run status extractor ignores unrelated numbers before the difficulty name", () => {
  const candidates = extractRunStatusCandidates({
    text: "位置測定分隊 スポット更新回数+1 初期構想+1 魂に直面 18",
  }, { campaignId: "is5_sarkaz", squads, difficultyGrades });

  assert.equal(candidates.find((item) => item.field === "difficulty").value, 18);
});


test("run status extractor prefers dedicated difficulty grade ROI over decorative OCR noise", () => {
  const candidates = extractRunStatusCandidates({
    text: "魂 に 直 面 CDIFFICULTY\"I 5 位 置 測 定 分 隊",
    ocrResults: [{ text: "18", regionId: "run.difficulty_grade" }],
  }, { campaignId: "is5_sarkaz", squads, difficultyGrades });

  assert.equal(candidates.find((item) => item.field === "difficulty").value, 18);
});

test("run status extractor reads command level OCR roman one without treating command exp as a level", () => {
  const candidates = extractRunStatusCandidates({
    text: "指 揮 Lv I ー 溶 魂 の 端 緒 0 / 10 魂 に 直 面 18 位 置 測 定 分 隊",
  }, { campaignId: "is5_sarkaz", squads, difficultyGrades });

  assert.equal(candidates.find((item) => item.field === "commandLevel").value, 1);
});

test("run status extractor ignores unrelated numbers before the command level label", () => {
  const candidates = extractRunStatusCandidates({
    text: "22 指 揮 Lv I 分 隊 選 択 4 / 4 0 / 10 魂 に 直 面 18 位 置 測 定 分 隊",
  }, { campaignId: "is5_sarkaz", squads, difficultyGrades });

  assert.equal(candidates.find((item) => item.field === "commandLevel").value, 1);
});

test("run status extractor treats roman-like command level OCR as roman, not repeated digits", () => {
  const candidates = extractRunStatusCandidates({
    text: "指 揮 Lv II ー 溶 魂 の 端 緒 0 / 10 魂 に 直 面 18 位 置 測 定 分 隊",
  }, { campaignId: "is5_sarkaz", squads, difficultyGrades });

  assert.equal(candidates.find((item) => item.field === "commandLevel").value, 2);
});

test("run status extractor does not use command exp 0/10 as command level", () => {
  const candidates = extractRunStatusCandidates({
    text: "指 揮 Lv 0 / 10 魂 に 直 面 18 位 置 測 定 分 隊",
  }, { campaignId: "is5_sarkaz", squads, difficultyGrades });

  assert.equal(candidates.some((item) => item.field === "commandLevel"), false);
});



test("run status extractor reads Sarkaz idea count from the thought-side region", () => {
  const candidates = extractRunStatusCandidates({
    ocrResults: [
      { text: "12/5", regionId: "run.idea" },
      { text: "位 置 測 定 分 隊", regionId: "run.squad_card" },
      { text: "魂 に 直 面", regionId: "run.difficulty_block" },
      { text: "18", regionId: "run.difficulty_grade" },
    ],
  }, { campaignId: "is5_sarkaz", squads, difficultyGrades });

  const idea = candidates.find((item) => item.field === "idea");
  assert.equal(idea.label, "構想");
  assert.equal(idea.value, 12);
});

test("run status extractor reads hope and originium ingots from dedicated resource regions", () => {
  const candidates = extractRunStatusCandidates({
    ocrResults: [
      { text: "6 < 6", regionId: "run.hope" },
      { text: "20", regionId: "run.ingot" },
      { text: "位 置 測 定 分 隊", regionId: "run.squad_card" },
      { text: "魂 に 直 面", regionId: "run.difficulty_block" },
      { text: "18", regionId: "run.difficulty_grade" },
    ],
  }, { campaignId: "is5_sarkaz", squads, difficultyGrades });

  assert.deepEqual(candidates.filter((item) => ["hope", "ingot"].includes(item.field)).map((item) => [item.field, item.value]), [
    ["hope", 6],
    ["ingot", 20],
  ]);
});

test("run status extractor reads life and shield values from dedicated OCR regions", () => {
  const candidates = extractRunStatusCandidates({
    ocrResults: [
      { text: "ト 6", regionId: "run.life_points" },
      { text: "12", regionId: "run.shield" },
      { text: "△", regionId: "run.shield" },
      { text: "位 置 測 定 分 隊", regionId: "run.squad_card" },
      { text: "魂 に 直 面 18", regionId: "run.difficulty_block" },
    ],
  }, { campaignId: "is5_sarkaz", squads, difficultyGrades });

  assert.deepEqual(candidates.filter((item) => ["lifePoints", "shield"].includes(item.field)).map((item) => [item.field, item.value]), [
    ["lifePoints", 6],
    ["shield", 12],
  ]);
});


test("run status extractor uses the current life value before slash from status ROI", () => {
  const candidates = extractRunStatusCandidates({
    ocrResults: [
      { text: "6 / 10", regionId: "run.life_points" },
      { text: "2", regionId: "run.shield" },
      { text: "1", regionId: "run.command_level" },
      { text: "位 置 測 定 分 隊", regionId: "run.squad_card" },
      { text: "魂 に 直 面", regionId: "run.difficulty_block" },
      { text: "18", regionId: "run.difficulty_grade" },
    ],
  }, { campaignId: "is5_sarkaz", squads, difficultyGrades });

  assert.deepEqual(candidates.filter((item) => ["lifePoints", "shield", "commandLevel"].includes(item.field)).map((item) => [item.field, item.value]), [
    ["commandLevel", 1],
    ["lifePoints", 6],
    ["shield", 2],
  ]);
});

test("run status extractor uses dedicated difficulty grade ROI even when difficulty name OCR is missing", () => {
  const candidates = extractRunStatusCandidates({
    ocrResults: [
      { text: "18", regionId: "run.difficulty_grade" },
      { text: "民18", regionId: "run.difficulty_block" },
    ],
  }, { campaignId: "is5_sarkaz", squads, difficultyGrades });

  assert.equal(candidates.find((item) => item.field === "difficulty").value, 18);
});
