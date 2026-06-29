import test from "node:test";
import assert from "node:assert/strict";

import { applyChoiceListFilters, normalizeChoiceFilterIds } from "../app/domain/choice-filters.js";

const items = [
  { id: "a", name: "A" },
  { id: "b", name: "B" },
  { id: "c", name: "C" },
  { id: "d", name: "D" },
];

test("normalizeChoiceFilterIds keeps unique non-empty ids", () => {
  assert.deepEqual(normalizeChoiceFilterIds(["a", "", " a ", null, "b", "a"]), ["a", "b"]);
});

test("applyChoiceListFilters can show selected items first without changing base order inside groups", () => {
  const result = applyChoiceListFilters(items, {
    selectedIds: ["c", "a"],
    showSelectedFirst: true,
  });

  assert.deepEqual(result.map((item) => item.id), ["a", "c", "b", "d"]);
});

test("applyChoiceListFilters can hide excluded items and keep only selected items", () => {
  const result = applyChoiceListFilters(items, {
    selectedIds: ["b", "c", "d"],
    excludedIds: ["c"],
    selectedOnly: true,
    hideExcluded: true,
  });

  assert.deepEqual(result.map((item) => item.id), ["b", "d"]);
});
