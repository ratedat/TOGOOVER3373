import test from "node:test";
import assert from "node:assert/strict";
import { getOperatorFilterView, sortOperators } from "../app/domain/operators.js";

const operators = [
  { id: "old-six", name: "旧★6", rarity: 6, displayOrder: 9, implementationOrder: 1 },
  { id: "new-four", name: "新★4", rarity: 4, displayOrder: 2, implementationOrder: 3 },
  { id: "mid-five", name: "中★5", rarity: 5, displayOrder: 4, implementationOrder: 2 },
];

test("sortOperators can sort by implementation order newest first", () => {
  assert.deepEqual(sortOperators(operators, "implementation_desc").map((item) => item.id), [
    "new-four",
    "mid-five",
    "old-six",
  ]);
});

test("sortOperators can sort by implementation order oldest first", () => {
  assert.deepEqual(sortOperators(operators, "implementation_asc").map((item) => item.id), [
    "old-six",
    "mid-five",
    "new-four",
  ]);
});

test("sortOperators falls back to displayOrder when implementation order is missing", () => {
  const sourceOnly = [
    { id: "third", name: "三番", rarity: 6, displayOrder: 3 },
    { id: "first", name: "一番", rarity: 3, displayOrder: 1 },
    { id: "second", name: "二番", rarity: 4, displayOrder: 2 },
  ];
  assert.deepEqual(sortOperators(sourceOnly, "implementation_asc").map((item) => item.id), [
    "first",
    "second",
    "third",
  ]);
});


test("sortOperators can use implementation dates for future synced data", () => {
  const dated = [
    { id: "later", name: "後発", rarity: 4, implementationDate: "2024-05-01", displayOrder: 1 },
    { id: "earlier", name: "先発", rarity: 6, implementationDate: "2020-01-16", displayOrder: 2 },
  ];
  assert.deepEqual(sortOperators(dated, "implementation_desc").map((item) => item.id), [
    "later",
    "earlier",
  ]);
});


test("sortOperators places operators without implementation data after dated operators", () => {
  const mixed = [
    { id: "unknown", name: "未掲載", rarity: 6, displayOrder: 0 },
    { id: "later", name: "後発", rarity: 4, implementationDate: "2024-05-01", displayOrder: 1 },
    { id: "earlier", name: "先発", rarity: 6, implementationDate: "2020-01-16", displayOrder: 2 },
  ];
  assert.deepEqual(sortOperators(mixed, "implementation_desc").map((item) => item.id), [
    "later",
    "earlier",
    "unknown",
  ]);
});

test("sortOperators can sort by operator class order", () => {
  const byClass = [
    { id: "special", name: "特殊", class: "特殊", rarity: 6, displayOrder: 8 },
    { id: "vanguard", name: "先鋒", class: "先鋒", rarity: 4, displayOrder: 1 },
    { id: "medic", name: "医療", class: "医療", rarity: 5, displayOrder: 6 },
    { id: "guard", name: "前衛", class: "前衛", rarity: 6, displayOrder: 2 },
    { id: "caster", name: "術師", class: "術師", rarity: 3, displayOrder: 5 },
    { id: "defender", name: "重装", class: "重装", rarity: 5, displayOrder: 3 },
    { id: "supporter", name: "補助", class: "補助", rarity: 4, displayOrder: 7 },
    { id: "sniper", name: "狙撃", class: "狙撃", rarity: 6, displayOrder: 4 },
  ];

  assert.deepEqual(sortOperators(byClass, "class").map((item) => item.id), [
    "vanguard",
    "guard",
    "defender",
    "sniper",
    "caster",
    "medic",
    "supporter",
    "special",
  ]);
});

test("operator class filter options use the Integrated Strategies class order", () => {
  const view = getOperatorFilterView([
    { id: "medic", class: "医療", rarity: 5 },
    { id: "vanguard", class: "先鋒", rarity: 4 },
    { id: "special", class: "特殊", rarity: 6 },
    { id: "caster", class: "術師", rarity: 3 },
    { id: "guard", class: "前衛", rarity: 6 },
    { id: "defender", class: "重装", rarity: 5 },
    { id: "supporter", class: "補助", rarity: 4 },
    { id: "sniper", class: "狙撃", rarity: 6 },
  ], { operatorRelease: "all" });

  assert.deepEqual(view.classOptions, ["先鋒", "前衛", "重装", "狙撃", "術師", "医療", "補助", "特殊"]);
});

test("operator branch filter options use the Integrated Strategies branch order for a selected class", () => {
  const view = getOperatorFilterView([
    { id: "merchant", class: "特殊", branch: "行商人", rarity: 6 },
    { id: "trapmaster", class: "特殊", branch: "罠師", rarity: 5 },
    { id: "executor", class: "特殊", branch: "執行者", rarity: 6 },
    { id: "ambusher", class: "特殊", branch: "潜伏者", rarity: 4 },
    { id: "geek", class: "特殊", branch: "鬼才", rarity: 5 },
    { id: "dollkeeper", class: "特殊", branch: "傀儡師", rarity: 6 },
    { id: "pusher", class: "特殊", branch: "推撃手", rarity: 4 },
    { id: "hookmaster", class: "特殊", branch: "鉤縄師", rarity: 4 },
    { id: "alchemist", class: "特殊", branch: "錬金士", rarity: 5 },
    { id: "loopshooter", class: "特殊", branch: "巡空者", rarity: 6 },
  ], { operatorRelease: "all", operatorClass: "特殊" });

  assert.deepEqual(view.branchOptions, ["執行者", "推撃手", "潜伏者", "鉤縄師", "鬼才", "行商人", "罠師", "傀儡師", "錬金士", "巡空者"]);
});

test("operator branch filter options keep branch order across all classes", () => {
  const view = getOperatorFilterView([
    { id: "loopshooter", class: "特殊", branch: "巡空者", rarity: 6 },
    { id: "medic", class: "医療", branch: "医師", rarity: 5 },
    { id: "pioneer", class: "先鋒", branch: "先駆兵", rarity: 4 },
    { id: "merchant", class: "特殊", branch: "行商人", rarity: 6 },
    { id: "fighter", class: "前衛", branch: "闘士", rarity: 6 },
    { id: "guardian", class: "重装", branch: "重盾衛士", rarity: 5 },
    { id: "watcher", class: "医療", branch: "守望者", rarity: 6 },
    { id: "marksman", class: "狙撃", branch: "速射手", rarity: 6 },
    { id: "splash-caster", class: "術師", branch: "拡散術師", rarity: 5 },
    { id: "slower", class: "補助", branch: "緩速師", rarity: 4 },
  ], { operatorRelease: "all" });

  assert.deepEqual(view.branchOptions, ["先駆兵", "闘士", "重盾衛士", "速射手", "拡散術師", "医師", "守望者", "緩速師", "行商人", "巡空者"]);
});

test("sortOperators uses branch order within operator class order", () => {
  const byBranch = [
    { id: "merchant", name: "行商人", class: "特殊", branch: "行商人", rarity: 6, displayOrder: 1 },
    { id: "tactician", name: "戦術家", class: "先鋒", branch: "戦術家", rarity: 6, displayOrder: 1 },
    { id: "executor", name: "執行者", class: "特殊", branch: "執行者", rarity: 3, displayOrder: 9 },
    { id: "pioneer", name: "先駆兵", class: "先鋒", branch: "先駆兵", rarity: 1, displayOrder: 9 },
    { id: "hookmaster", name: "鉤縄師", class: "特殊", branch: "鉤縄師", rarity: 1, displayOrder: 0 },
  ];

  assert.deepEqual(sortOperators(byBranch, "class").map((item) => item.id), [
    "pioneer",
    "tactician",
    "executor",
    "hookmaster",
    "merchant",
  ]);
});
