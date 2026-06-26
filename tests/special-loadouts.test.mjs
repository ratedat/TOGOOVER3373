import test from "node:test";
import assert from "node:assert/strict";

import {
  addCoinEntry,
  addSpecialEffect,
  updateCoinEntryStatus,
} from "../app/control-actions.js";
import { formatCoinLoadoutValue } from "../app/domain/special-display.js";
import { mergeCoinEntries } from "../app/domain/special-values.js";
import { renderSpecialEffectSelectOptions } from "../app/components/special-controls.js";

const coinMap = new Map([
  ["coin-a", { id: "coin-a", name: "通宝A", effect: "通宝効果" }],
  ["status-a", { id: "status-a", name: "錆色", effect: "状態効果A" }],
  ["status-b", { id: "status-b", name: "存護", effect: "状態効果B" }],
]);

test("IS#3 revelation effects can be added through the generic add action", () => {
  const state = { run: { special: { is3_mizuki: {} } } };

  addSpecialEffect(state, "is3_mizuki", "revelations", "is3_mizuki_selectable_revelation_mcasci1");
  addSpecialEffect(state, "is3_mizuki", "revelations", "is3_mizuki_selectable_revelation_mcasci1");
  addSpecialEffect(state, "is3_mizuki", "revelations", "is3_mizuki_selectable_revelation_mcasci2");

  assert.deepEqual(state.run.special.is3_mizuki.revelations, [
    "is3_mizuki_selectable_revelation_mcasci1",
    "is3_mizuki_selectable_revelation_mcasci2",
  ]);
});

test("coin loadouts keep the same coin as separate rows when status or face differs", () => {
  const entries = mergeCoinEntries([
    { coinId: "coin-a", count: 1, statusId: null, face: "front" },
    { coinId: "coin-a", count: 2, statusId: "status-a", face: "front" },
    { coinId: "coin-a", count: 3, statusId: "status-a", face: "back" },
  ]);

  assert.deepEqual(entries, [
    { coinId: "coin-a", count: 1, statusId: null, face: "front" },
    { coinId: "coin-a", count: 2, statusId: "status-a", face: "front" },
    { coinId: "coin-a", count: 3, statusId: "status-a", face: "back" },
  ]);
});

test("adding a coin with a selected status creates a visible second slot", () => {
  const state = { run: { special: { is6_sui: {} } } };

  addCoinEntry(state, "is6_sui", "coins", { coinId: "coin-a", count: 1, statusId: null, face: "front" });
  addCoinEntry(state, "is6_sui", "coins", { coinId: "coin-a", count: 1, statusId: "status-a", face: "front" });

  assert.deepEqual(state.run.special.is6_sui.coins, [
    { coinId: "coin-a", count: 1, statusId: null, face: "front" },
    { coinId: "coin-a", count: 1, statusId: "status-a", face: "front" },
  ]);

  assert.equal(formatCoinLoadoutValue({ id: "coins" }, state.run.special.is6_sui.coins, { selectableEffectMap: coinMap }), "2枚 / 2枠");
});

test("changing a coin status preserves a separate status row unless the exact slot already exists", () => {
  const state = {
    run: {
      special: {
        is6_sui: {
          coins: [
            { coinId: "coin-a", count: 1, statusId: null, face: "front" },
            { coinId: "coin-a", count: 1, statusId: "status-a", face: "front" },
          ],
        },
      },
    },
  };

  updateCoinEntryStatus(state, "is6_sui", "coins", 0, "status-b");

  assert.deepEqual(state.run.special.is6_sui.coins, [
    { coinId: "coin-a", count: 1, statusId: "status-b", face: "front" },
    { coinId: "coin-a", count: 1, statusId: "status-a", face: "front" },
  ]);
});

test("select labels include group context for same named future effects", () => {
  const rendered = renderSpecialEffectSelectOptions([
    { id: "a", name: "同名", groupLabel: "通常", slotLabel: "通宝" },
    { id: "b", name: "同名", groupLabel: "特殊", slotLabel: "通宝" },
  ]);

  assert.match(rendered, />通常 \/ 同名<\/option>/);
  assert.match(rendered, />特殊 \/ 同名<\/option>/);
});