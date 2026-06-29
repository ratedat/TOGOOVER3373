import test from "node:test";
import assert from "node:assert/strict";
import { getChoiceActive, getChoiceCount, registerControlEvents, syncControlV2UiAfterStateReplace } from "../app/control-events.js";
import { toggleChoiceExcluded } from "../app/control-actions.js";

test("template relics count as active choices even when not manually selected", () => {
  const state = { relics: [], operators: [] };
  const context = {
    getChoiceActive: (type, id) => type === "relic" && id === "is3_mizuki_relic_261",
    getEffectiveRelicCount: () => 2,
  };

  assert.equal(getChoiceActive("relic", "is3_mizuki_relic_261", state, context), true);
  assert.equal(getChoiceCount({ controlV2ChoiceTab: "relics" }, state, context), 2);
});

test("state replacement keeps Control v2 choice screen and tab in sync", () => {
  const ui = { controlV2Screen: "relics", controlV2ChoiceTab: "operators" };

  syncControlV2UiAfterStateReplace(ui);

  assert.equal(ui.controlV2Screen, "relics");
  assert.equal(ui.controlV2ChoiceTab, "relics");
  assert.equal(ui.forceFullChoiceRender, true);
});

test("state replacement preserves non-choice screen but normalizes invalid choice tab", () => {
  const ui = { controlV2Screen: "common", controlV2ChoiceTab: "unknown" };

  syncControlV2UiAfterStateReplace(ui);

  assert.equal(ui.controlV2Screen, "common");
  assert.equal(ui.controlV2ChoiceTab, "operators");
  assert.equal(ui.forceFullChoiceRender, true);
});

test("toggleChoiceExcluded stores operator and relic display exclusion ids", () => {
  const state = { preferences: {} };

  toggleChoiceExcluded(state, "operator", "exusiai");
  toggleChoiceExcluded(state, "relic", "is5_sarkaz_relic_001");
  toggleChoiceExcluded(state, "operator", "exusiai");

  assert.deepEqual(state.preferences.operatorExcludedIds, []);
  assert.deepEqual(state.preferences.relicExcludedIds, ["is5_sarkaz_relic_001"]);
});


test("reset state replaces state and schedules a control view reload", async () => {
  const originalFetch = globalThis.fetch;
  const originalConfirm = globalThis.confirm;
  const nextState = { run: { campaignId: "is5_sarkaz" }, relics: [], operators: [] };
  let clickHandler = null;
  let replacedState = null;
  let notice = "";
  let reloads = 0;
  const ui = { controlV2Screen: "common", controlV2ChoiceTab: "operators" };

  globalThis.fetch = async (url, options) => {
    assert.equal(url, "/api/state/reset");
    assert.equal(options.method, "POST");
    return { ok: true, json: async () => nextState };
  };
  globalThis.confirm = () => true;

  const app = {
    addEventListener(type, handler) {
      if (type === "click") clickHandler = handler;
    },
  };
  const context = {
    view: "control-v2",
    ui,
    replaceState(state) { replacedState = state; },
    reloadView() { reloads += 1; },
    setNotice(text) { notice = text; },
  };
  const button = {
    dataset: { action: "reset-state" },
    closest(selector) { return selector === "[data-action]" ? this : null; },
  };

  try {
    registerControlEvents(app, context);
    await clickHandler({ target: button });
    await new Promise((resolve) => setTimeout(resolve, 5));
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.confirm = originalConfirm;
  }

  assert.equal(replacedState, nextState);
  assert.equal(ui.forceFullChoiceRender, true);
  assert.equal(notice, "状態を初期化しました。画面を再読み込みします。");
  assert.equal(reloads, 1);
});
