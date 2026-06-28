import test from "node:test";
import assert from "node:assert/strict";

import { getRecognitionScanActions } from "../app/domain/recognition/scan-actions.js";

const profiles = (campaignId) => getRecognitionScanActions(campaignId).map((item) => item.profiles || [item.profile]);
const ids = (campaignId) => profiles(campaignId).map((item) => item[0]);
const labels = (campaignId) => getRecognitionScanActions(campaignId).map((item) => item.label);

test("recognition scan actions always include common run, operator, and relic scans", () => {
  assert.deepEqual(ids("is2_phantom"), ["runStatusFull", "operatorsFull", "relicsFull"]);
  assert.deepEqual(ids("is3_mizuki"), ["runStatusFull", "operatorsFull", "relicsFull"]);
});

test("recognition scan actions expose only the selected campaign special scan", () => {
  assert.deepEqual(ids("is4_sami"), ["runStatusFull", "operatorsFull", "relicsFull", "is4RevelationFull"]);
  assert.deepEqual(profiles("is5_sarkaz"), [["runStatusFull", "is5AgeFull"], ["operatorsFull"], ["relicsFull"], ["is5ThoughtFull"]]);
  assert.deepEqual(ids("is6_sui"), ["runStatusFull", "operatorsFull", "relicsFull", "is6CoinsFull"]);
});

test("recognition scan action labels are stable for UI buttons", () => {
  assert.deepEqual(labels("is5_sarkaz"), ["サルカズ基礎", "オペレーター", "秘宝", "思案"]);
  assert.deepEqual(labels("is6_sui"), ["基本情報", "オペレーター", "秘宝", "通宝"]);
});

test("recognition scan actions return defensive copies", () => {
  const first = getRecognitionScanActions("is5_sarkaz");
  first[0].profiles.push("bad");
  first.push({ profile: "bad", label: "bad" });

  assert.deepEqual(profiles("is5_sarkaz"), [["runStatusFull", "is5AgeFull"], ["operatorsFull"], ["relicsFull"], ["is5ThoughtFull"]]);
});
