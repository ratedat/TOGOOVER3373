import test from "node:test";
import assert from "node:assert/strict";

import { extractRunStatusCandidates } from "../app/domain/recognition/run-status-extractor.js";

const squads = [
  { id: "is5_sarkaz_squad_03", campaignId: "is5_sarkaz", name: "位置測定分隊" },
  { id: "is5_sarkaz_squad_04", campaignId: "is5_sarkaz", name: "指揮分隊" },
  {
    id: "is5_sarkaz_squad_16",
    campaignId: "is5_sarkaz",
    name: "奇想天外分隊",
    randomEffectOptions: [
      {
        id: "is5_sarkaz_mimic_02",
        label: "組み合わせ02",
        effect: "★4以上の【術師】を招集時に消費する希望-2、昇進時に消費する希望-1、【術師】を初めて招集する際、昇進済の状態で招集できる。初めから「生還者の契約」を所持",
      },
      {
        id: "is5_sarkaz_mimic_03",
        label: "組み合わせ03",
        effect: "★4以上の【特殊】を招集時に消費する希望-2、昇進時に消費する希望-1、【特殊】を初めて招集する際、昇進済の状態で招集できる。初めから「生還者の契約」を所持",
      },
    ],
  },
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

test("run status extractor maps 奇想天外分隊 description to a random squad effect option", () => {
  const candidates = extractRunStatusCandidates({
    ocrResults: [
      { text: "奇 想 天 外 分 隊", regionId: "run.squad_name" },
      { text: "★4以上の【術師】を招集時に消費する希望-2、昇進時に消費する希望-1、【術師】を初めて招集する際、昇進済の状態で招集できる。初めから「生還者の契約」を所持", regionId: "run.squad_card" },
    ],
  }, { campaignId: "is5_sarkaz", squads, difficultyGrades });

  assert.deepEqual(candidates.filter((item) => ["squadId", "squadRandomEffectOptionId"].includes(item.field)).map((item) => [item.field, item.value]), [
    ["squadId", "is5_sarkaz_squad_16"],
    ["squadRandomEffectOptionId", "is5_sarkaz_mimic_02"],
  ]);
});

test("run status extractor does not infer random squad effect for non-奇想天外 squads", () => {
  const candidates = extractRunStatusCandidates({
    ocrResults: [
      { text: "指 揮 分 隊", regionId: "run.squad_name" },
      { text: "★4以上の【術師】を招集時に消費する希望-2、昇進時に消費する希望-1、【術師】を初めて招集する際、昇進済の状態で招集できる。初めから「生還者の契約」を所持", regionId: "run.squad_card" },
    ],
  }, { campaignId: "is5_sarkaz", squads, difficultyGrades });

  assert.equal(candidates.some((item) => item.field === "squadRandomEffectOptionId"), false);
});


test("run status extractor prefers dedicated difficulty grade ROI over decorative OCR noise", () => {
  const candidates = extractRunStatusCandidates({
    text: "魂 に 直 面 CDIFFICULTY\"I 5 位 置 測 定 分 隊",
    ocrResults: [{ text: "18", regionId: "run.difficulty_grade" }],
  }, { campaignId: "is5_sarkaz", squads, difficultyGrades });

  assert.equal(candidates.find((item) => item.field === "difficulty").value, 18);
});

test("run status extractor prefers labeled difficulty text over stray grade ROI digits", () => {
  const candidates = extractRunStatusCandidates({
    ocrResults: [
      { text: "魂 に 直 面 18", regionId: "run.difficulty_block" },
      { text: "2", regionId: "run.difficulty_grade" },
    ],
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



test("run status extractor reads Sarkaz idea count from the icon-anchored current value", () => {
  const candidates = extractRunStatusCandidates({
    ocrResults: [
      { text: "29/32", regionId: "run.thought_burden" },
      { text: "2", regionId: "run.idea.current.0" },
      { text: "位 置 測 定 分 隊", regionId: "run.squad_card" },
      { text: "魂 に 直 面", regionId: "run.difficulty_block" },
      { text: "18", regionId: "run.difficulty_grade" },
    ],
  }, { campaignId: "is5_sarkaz", squads, difficultyGrades });

  const idea = candidates.find((item) => item.field === "idea");
  assert.equal(idea.label, "構想");
  assert.equal(idea.value, 2);
});

test("run status extractor reads IS5 top-bar resources and bottom conception count", () => {
  const candidates = extractRunStatusCandidates({
    ocrResults: [
      { text: "3 <8 20", regionId: "run.resource_numbers", confidence: 0.91 },
      { text: "3 <8", regionId: "run.hope", confidence: 0.95 },
      { text: "3", regionId: "run.hope.current", confidence: 0.99 },
      { text: "8", regionId: "run.hope.max", confidence: 0.99 },
      { text: "20", regionId: "run.ingot", confidence: 0.99 },
      { text: "3", regionId: "run.top_ingot", confidence: 0.99 },
      { text: "8", regionId: "run.top_hope", confidence: 0.99 },
      { text: "8", regionId: "run.top_ingot.wide", confidence: 0.99 },
      { text: "22", regionId: "run.top_idea", confidence: 0.7 },
      { text: "20", regionId: "run.top_idea", confidence: 0.99 },
      { text: "9", regionId: "run.idea.current.0", confidence: 0.99 },
      { text: "9", regionId: "run.idea", confidence: 0.76 },
      { text: "位 置 測 定 分 隊", regionId: "run.squad_card" },
      { text: "魂 に 直 面", regionId: "run.difficulty_block" },
      { text: "18", regionId: "run.difficulty_grade" },
    ],
  }, { campaignId: "is5_sarkaz", squads, difficultyGrades });

  assert.deepEqual(candidates.filter((item) => ["hope", "maxHope", "ingot", "idea"].includes(item.field)).map((item) => [item.field, item.value]), [
    ["hope", 3],
    ["maxHope", 8],
    ["ingot", 20],
    ["idea", 9],
  ]);
});

test("run status extractor ignores thought burden fraction OCR as conception data", () => {
  const candidates = extractRunStatusCandidates({
    ocrResults: [
      { text: "0/5", regionId: "run.idea", confidence: 0.7 },
      { text: "思 考 負 荷", regionId: "run.idea", confidence: 0.7 },
      { text: "22", regionId: "run.top_idea", confidence: 0.99 },
      { text: "破 棘 成 金 分 隊", regionId: "run.squad_card" },
      { text: "魂 に 直 面", regionId: "run.difficulty_block" },
      { text: "18", regionId: "run.difficulty_grade" },
    ],
  }, { campaignId: "is5_sarkaz", squads, difficultyGrades });

  assert.equal(candidates.some((item) => item.field === "idea"), false);
});

test("run status extractor prefers the narrow conception current ROI over compact wide OCR noise", () => {
  const candidates = extractRunStatusCandidates({
    ocrResults: [
      { text: "1", regionId: "run.idea.current", confidence: 0.99 },
      { text: "35", regionId: "run.idea", confidence: 0.99 },
      { text: "思 考 負 荷", regionId: "run.idea", confidence: 0.7 },
      { text: "破 棘 成 金 分 隊", regionId: "run.squad_card" },
      { text: "魂 に 直 面", regionId: "run.difficulty_block" },
      { text: "18", regionId: "run.difficulty_grade" },
    ],
  }, { campaignId: "is5_sarkaz", squads, difficultyGrades });

  const idea = candidates.find((item) => item.field === "idea");
  assert.equal(idea.value, 1);
});

test("run status extractor handles reversed compact OCR from the narrow conception current ROI", () => {
  for (const text of ["51", "15"]) {
    const candidates = extractRunStatusCandidates({
      ocrResults: [
        { text, regionId: "run.idea.current", confidence: 0.99 },
        { text: "35", regionId: "run.idea", confidence: 0.99 },
        { text: "破 棘 成 金 分 隊", regionId: "run.squad_card" },
        { text: "魂 に 直 面", regionId: "run.difficulty_block" },
        { text: "18", regionId: "run.difficulty_grade" },
      ],
    }, { campaignId: "is5_sarkaz", squads, difficultyGrades });

    const idea = candidates.find((item) => item.field === "idea");
    assert.equal(idea.value, 1);
  }
});

test("run status extractor accepts template-suffixed resource region IDs", () => {
  const candidates = extractRunStatusCandidates({
    ocrResults: [
      { text: "1", regionId: "run.hope.current.0", confidence: 0.99 },
      { text: "7", regionId: "run.hope.max.0", confidence: 0.99 },
      { text: "20", regionId: "run.ingot.0", confidence: 0.99 },
      { text: "4", regionId: "run.life_points.0", confidence: 0.99 },
      { text: "2", regionId: "run.shield.0", confidence: 0.99 },
      { text: "3", regionId: "run.idea.current.0", confidence: 0.99 },
      { text: "17<720", regionId: "run.resource_numbers", confidence: 0.91 },
      { text: "破 棘 成 金 分 隊", regionId: "run.squad_card" },
      { text: "魂 に 直 面", regionId: "run.difficulty_block" },
      { text: "18", regionId: "run.difficulty_grade" },
    ],
  }, { campaignId: "is5_sarkaz", squads, difficultyGrades });

  assert.deepEqual(candidates.filter((item) => ["hope", "maxHope", "ingot", "lifePoints", "shield", "idea"].includes(item.field)).map((item) => [item.field, item.value]), [
    ["hope", 1],
    ["maxHope", 7],
    ["ingot", 20],
    ["idea", 3],
    ["lifePoints", 4],
    ["shield", 2],
  ]);
});

test("run status extractor corrects reversed leading zero from ingot template OCR", () => {
  const candidates = extractRunStatusCandidates({
    ocrResults: [
      { text: "0", regionId: "run.hope.current.0", confidence: 0.99 },
      { text: "7", regionId: "run.hope.max.0", confidence: 0.99 },
      { text: "02", regionId: "run.ingot.0", confidence: 0.99 },
      { text: "1", regionId: "run.idea.current.0", confidence: 0.99 },
      { text: "5", regionId: "run.life_points.0", confidence: 0.99 },
      { text: "2", regionId: "run.shield.0", confidence: 0.99 },
      { text: "魂 に 直 面", regionId: "run.difficulty_block" },
      { text: "18", regionId: "run.difficulty_grade" },
    ],
  }, { campaignId: "is5_sarkaz", squads, difficultyGrades });

  assert.deepEqual(candidates.filter((item) => ["hope", "maxHope", "ingot", "idea", "lifePoints", "shield"].includes(item.field)).map((item) => [item.field, item.value]), [
    ["hope", 0],
    ["maxHope", 7],
    ["ingot", 20],
    ["idea", 1],
    ["lifePoints", 5],
    ["shield", 2],
  ]);
});

test("run status extractor ignores compact wide conception OCR without a separator", () => {
  const candidates = extractRunStatusCandidates({
    ocrResults: [
      { text: "35", regionId: "run.idea", confidence: 0.99 },
      { text: "思 考 負 荷", regionId: "run.idea", confidence: 0.7 },
      { text: "破 棘 成 金 分 隊", regionId: "run.squad_card" },
      { text: "魂 に 直 面", regionId: "run.difficulty_block" },
      { text: "18", regionId: "run.difficulty_grade" },
    ],
  }, { campaignId: "is5_sarkaz", squads, difficultyGrades });

  assert.equal(candidates.some((item) => item.field === "idea"), false);
});

test("run status extractor switches to wide top-bar resource ROIs when the compact ingot crop is blank", () => {
  const candidates = extractRunStatusCandidates({
    ocrResults: [
      { text: "6", regionId: "run.top_hope", confidence: 0.99 },
      { text: "6", regionId: "run.top_ingot.wide", confidence: 0.99 },
      { text: "6", regionId: "run.top_hope.wide", confidence: 0.99 },
      { text: "14", regionId: "run.top_idea", confidence: 0.99 },
      { text: "0<614", regionId: "run.resource_numbers", confidence: 0.91 },
      { text: "0<6", regionId: "run.hope", confidence: 0.95 },
      { text: "1", regionId: "run.hope.current", confidence: 0.7 },
      { text: "66", regionId: "run.hope.max", confidence: 0.99 },
      { text: "14", regionId: "run.ingot", confidence: 0.99 },
      { text: "2", regionId: "run.idea", confidence: 0.76 },
      { text: "破 棘 成 金 分 隊", regionId: "run.squad_card" },
      { text: "魂 に 直 面", regionId: "run.difficulty_block" },
      { text: "18", regionId: "run.difficulty_grade" },
    ],
  }, { campaignId: "is5_sarkaz", squads, difficultyGrades });

  assert.deepEqual(candidates.filter((item) => ["hope", "maxHope", "ingot", "idea"].includes(item.field)).map((item) => [item.field, item.value]), [
    ["hope", 0],
    ["maxHope", 6],
    ["ingot", 14],
  ]);
});

test("run status extractor does not treat top-bar originium as IS5 conception", () => {
  for (const { topResource, bottomIdea } of [{ topResource: "14", bottomIdea: "2" }, { topResource: "20", bottomIdea: "3" }]) {
    const candidates = extractRunStatusCandidates({
      ocrResults: [
        { text: "0", regionId: "run.top_hope", confidence: 0.99 },
        { text: "6", regionId: "run.top_hope.wide", confidence: 0.99 },
        { text: topResource, regionId: "run.top_idea", confidence: 0.99 },
        { text: "0<6", regionId: "run.hope", confidence: 0.95 },
        { text: topResource, regionId: "run.ingot", confidence: 0.99 },
        { text: bottomIdea, regionId: "run.idea", confidence: 0.76 },
        { text: "破 棘 成 金 分 隊", regionId: "run.squad_card" },
        { text: "魂 に 直 面", regionId: "run.difficulty_block" },
        { text: "18", regionId: "run.difficulty_grade" },
      ],
    }, { campaignId: "is5_sarkaz", squads, difficultyGrades });

    assert.deepEqual(candidates.filter((item) => ["hope", "maxHope", "ingot", "idea"].includes(item.field)).map((item) => [item.field, item.value]), [
      ["hope", 0],
      ["maxHope", 6],
      ["ingot", Number(topResource)],
    ]);
  }
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

test("run status extractor splits hope current and max values from the same OCR region", () => {
  const candidates = extractRunStatusCandidates({
    ocrResults: [
      { text: "3 < 11", regionId: "run.hope" },
      { text: "位 置 測 定 分 隊", regionId: "run.squad_card" },
      { text: "魂 に 直 面", regionId: "run.difficulty_block" },
      { text: "18", regionId: "run.difficulty_grade" },
    ],
  }, { campaignId: "is5_sarkaz", squads, difficultyGrades });

  assert.deepEqual(candidates.filter((item) => ["hope", "maxHope"].includes(item.field)).map((item) => [item.field, item.value]), [
    ["hope", 3],
    ["maxHope", 11],
  ]);
});
test("run status extractor splits compact hope OCR when the separator is dropped", () => {
  const candidates = extractRunStatusCandidates({
    ocrResults: [
      { text: "311", regionId: "run.hope" },
      { text: "位 置 測 定 分 隊", regionId: "run.squad_card" },
      { text: "魂 に 直 面", regionId: "run.difficulty_block" },
      { text: "18", regionId: "run.difficulty_grade" },
    ],
  }, { campaignId: "is5_sarkaz", squads, difficultyGrades });

  assert.deepEqual(candidates.filter((item) => ["hope", "maxHope"].includes(item.field)).map((item) => [item.field, item.value]), [
    ["hope", 3],
    ["maxHope", 11],
  ]);
});

test("run status extractor combines separated hope current and max OCR regions", () => {
  const candidates = extractRunStatusCandidates({
    ocrResults: [
      { text: "6", regionId: "run.hope.current" },
      { text: "6", regionId: "run.hope.max" },
      { text: "20", regionId: "run.ingot" },
      { text: "位 置 測 定 分 隊", regionId: "run.squad_card" },
      { text: "魂 に 直 面", regionId: "run.difficulty_block" },
      { text: "18", regionId: "run.difficulty_grade" },
    ],
  }, { campaignId: "is5_sarkaz", squads, difficultyGrades });

  assert.deepEqual(candidates.filter((item) => ["hope", "maxHope", "ingot"].includes(item.field)).map((item) => [item.field, item.value]), [
    ["hope", 6],
    ["maxHope", 6],
    ["ingot", 20],
  ]);
});

test("run status extractor reads hope current, hope max, and ingot from the resource-number crop", () => {
  const candidates = extractRunStatusCandidates({
    ocrResults: [
      { text: "29", regionId: "run.hope" },
      { text: "29", regionId: "run.hope.max" },
      { text: "1+1 -29 14", regionId: "run.resource_numbers" },
      { text: "専 門 家 分 隊", regionId: "run.squad_card" },
      { text: "魂 に 直 面", regionId: "run.difficulty_block" },
      { text: "18", regionId: "run.difficulty_grade" },
    ],
  }, { campaignId: "is5_sarkaz", squads, difficultyGrades });

  assert.deepEqual(candidates.filter((item) => ["hope", "maxHope", "ingot"].includes(item.field)).map((item) => [item.field, item.value]), [
    ["hope", 1],
    ["maxHope", 29],
    ["ingot", 14],
  ]);
});

test("run status extractor splits compact resource-number crop OCR", () => {
  const candidates = extractRunStatusCandidates({
    ocrResults: [
      { text: "12914", regionId: "run.resource_numbers" },
      { text: "専 門 家 分 隊", regionId: "run.squad_card" },
      { text: "魂 に 直 面", regionId: "run.difficulty_block" },
      { text: "18", regionId: "run.difficulty_grade" },
    ],
  }, { campaignId: "is5_sarkaz", squads, difficultyGrades });

  assert.deepEqual(candidates.filter((item) => ["hope", "maxHope", "ingot"].includes(item.field)).map((item) => [item.field, item.value]), [
    ["hope", 1],
    ["maxHope", 29],
    ["ingot", 14],
  ]);
});

test("run status extractor recovers hope current from top-right status when the small ROI misses it", () => {
  const candidates = extractRunStatusCandidates({
    ocrResults: [
      { text: "29", regionId: "run.hope" },
      { text: "29", regionId: "run.hope.max" },
      { text: "1+1 -29 14", regionId: "run.top_right_status" },
      { text: "14", regionId: "run.ingot" },
      { text: "専 門 家 分 隊", regionId: "run.squad_card" },
      { text: "魂 に 直 面", regionId: "run.difficulty_block" },
      { text: "18", regionId: "run.difficulty_grade" },
    ],
  }, { campaignId: "is5_sarkaz", squads, difficultyGrades });

  assert.deepEqual(candidates.filter((item) => ["hope", "maxHope", "ingot"].includes(item.field)).map((item) => [item.field, item.value]), [
    ["hope", 1],
    ["maxHope", 29],
    ["ingot", 14],
  ]);
});

test("run status extractor prefers valid split hope ROIs when whole hope reads duplicated max", () => {
  const candidates = extractRunStatusCandidates({
    ocrResults: [
      { text: "29 < 29", regionId: "run.hope" },
      { text: "1", regionId: "run.hope.current" },
      { text: "29", regionId: "run.hope.max" },
      { text: "位 置 測 定 分 隊", regionId: "run.squad_card" },
      { text: "魂 に 直 面", regionId: "run.difficulty_block" },
      { text: "18", regionId: "run.difficulty_grade" },
    ],
  }, { campaignId: "is5_sarkaz", squads, difficultyGrades });

  assert.deepEqual(candidates.filter((item) => ["hope", "maxHope"].includes(item.field)).map((item) => [item.field, item.value]), [
    ["hope", 1],
    ["maxHope", 29],
  ]);
});

test("run status extractor prefers the full hope pair over noisy split hope ROIs", () => {
  const candidates = extractRunStatusCandidates({
    ocrResults: [
      { text: "<10<10", regionId: "run.hope" },
      { text: "1", regionId: "run.hope.current" },
      { text: "101", regionId: "run.hope.max" },
      { text: "1", regionId: "run.ingot" },
      { text: "位 置 測 定 分 隊", regionId: "run.squad_card" },
      { text: "魂 に 直 面", regionId: "run.difficulty_block" },
      { text: "18", regionId: "run.difficulty_grade" },
    ],
  }, { campaignId: "is5_sarkaz", squads, difficultyGrades });

  assert.deepEqual(candidates.filter((item) => ["hope", "maxHope", "ingot"].includes(item.field)).map((item) => [item.field, item.value]), [
    ["hope", 10],
    ["maxHope", 10],
    ["ingot", 1],
  ]);
});

test("run status extractor ignores partial two-digit whole hope OCR before a full pair", () => {
  const candidates = extractRunStatusCandidates({
    ocrResults: [
      { text: "12", regionId: "run.hope" },
      { text: "10<10", regionId: "run.hope" },
      { text: "1", regionId: "run.hope.current" },
      { text: "101", regionId: "run.hope.max" },
      { text: "1", regionId: "run.ingot" },
      { text: "位 置 測 定 分 隊", regionId: "run.squad_card" },
      { text: "魂 に 直 面", regionId: "run.difficulty_block" },
      { text: "18", regionId: "run.difficulty_grade" },
    ],
  }, { campaignId: "is5_sarkaz", squads, difficultyGrades });

  assert.deepEqual(candidates.filter((item) => ["hope", "maxHope", "ingot"].includes(item.field)).map((item) => [item.field, item.value]), [
    ["hope", 10],
    ["maxHope", 10],
    ["ingot", 1],
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

test("run status extractor does not join difficulty name with unrelated status values", () => {
  const candidates = extractRunStatusCandidates({
    ocrResults: [
      { text: "魂 に 直 面", regionId: "run.difficulty_block" },
      { text: "2 / 5", regionId: "run.life_points" },
      { text: "イ 8 下", regionId: "run.difficulty_grade" },
    ],
  }, { campaignId: "is5_sarkaz", squads, difficultyGrades });

  assert.equal(candidates.find((item) => item.field === "difficulty").value, 18);
});

test("run status extractor normalizes katakana-one OCR in difficulty numbers", () => {
  const candidates = extractRunStatusCandidates({
    ocrResults: [
      { text: "イ 8 下", regionId: "run.difficulty_grade" },
    ],
  }, { campaignId: "is5_sarkaz", squads, difficultyGrades });

  assert.equal(candidates.find((item) => item.field === "difficulty").value, 18);
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
