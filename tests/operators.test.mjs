import test from "node:test";
import assert from "node:assert/strict";
import { sortOperators } from "../app/domain/operators.js";

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
