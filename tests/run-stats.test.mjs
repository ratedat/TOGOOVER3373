import test from "node:test";
import assert from "node:assert/strict";
import { updateRunField } from "../app/control-actions.js";
import { formatRunStatValue, normalizeRunStatValue, normalizeRunStats, runStatDisplayItems } from "../app/domain/run-stats.js";

test("normalizeRunStatValue accepts blank values as unset", () => {
  assert.equal(normalizeRunStatValue("hope", ""), null);
  assert.equal(normalizeRunStatValue("lifePoints", null), null);
  assert.equal(formatRunStatValue({}, "shield"), "-");
  assert.equal(formatRunStatValue({}, "ingot"), "-");
});

test("normalizeRunStatValue clamps numeric run resources", () => {
  assert.equal(normalizeRunStatValue("hope", "12.9"), 12);
  assert.equal(normalizeRunStatValue("maxHope", "11"), 11);
  assert.equal(normalizeRunStatValue("lifePoints", "-4"), 0);
  assert.equal(normalizeRunStatValue("shield", "1200"), 999);
  assert.equal(normalizeRunStatValue("ingot", "20"), 20);
  assert.equal(normalizeRunStatValue("commandLevel", "0"), 1);
  assert.equal(normalizeRunStatValue("commandLevel", "120"), 99);
});

test("normalizeRunStats fills all run stat fields", () => {
  const run = normalizeRunStats({ hope: "8", maxHope: "11", ingot: "20", lifePoints: undefined, shield: "bad", commandLevel: "4" });
  assert.deepEqual(run, { hope: 8, maxHope: 11, ingot: 20, lifePoints: null, shield: null, commandLevel: 4 });
});

test("updateRunField writes numeric run stat fields", () => {
  const state = { run: {}, preferences: {} };
  updateRunField(state, "hope", "18");
  updateRunField(state, "maxHope", "11");
  updateRunField(state, "lifePoints", "5");
  updateRunField(state, "ingot", "20");
  updateRunField(state, "shield", "");
  updateRunField(state, "commandLevel", "3");
  assert.equal(state.run.hope, 18);
  assert.equal(state.run.maxHope, 11);
  assert.equal(state.run.lifePoints, 5);
  assert.equal(state.run.ingot, 20);
  assert.equal(state.run.shield, null);
  assert.equal(state.run.commandLevel, 3);
  assert.deepEqual(runStatDisplayItems(state.run).map((item) => [item.id, item.value]), [
    ["hope", "18"],
    ["maxHope", "11"],
    ["ingot", "20"],
    ["lifePoints", "5"],
    ["shield", "-"],
    ["commandLevel", "3"],
  ]);
});