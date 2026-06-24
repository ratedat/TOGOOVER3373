import test from "node:test";
import assert from "node:assert/strict";
import { getChoiceActive, getChoiceCount } from "../app/control-events.js";

test("template relics count as active choices even when not manually selected", () => {
  const state = { relics: [], operators: [] };
  const context = {
    getChoiceActive: (type, id) => type === "relic" && id === "is3_mizuki_relic_261",
    getEffectiveRelicCount: () => 2,
  };

  assert.equal(getChoiceActive("relic", "is3_mizuki_relic_261", state, context), true);
  assert.equal(getChoiceCount({ tab: "relics" }, state, context), 2);
});
