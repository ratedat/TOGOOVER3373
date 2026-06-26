import test from "node:test";
import assert from "node:assert/strict";

import { getRecognitionScanActions } from "../app/domain/recognition/scan-actions.js";

const ids = (campaignId) => getRecognitionScanActions(campaignId).map((item) => item.profile);

test("recognition scan actions always include common run, operator, and relic scans", () => {
  assert.deepEqual(ids("is2_phantom"), ["runStatusFull", "operatorsFull", "relicsFull"]);
  assert.deepEqual(ids("is3_mizuki"), ["runStatusFull", "operatorsFull", "relicsFull"]);
});

test("recognition scan actions expose only the selected campaign special scan", () => {
  assert.deepEqual(ids("is4_sami"), ["runStatusFull", "operatorsFull", "relicsFull", "is4RevelationFull"]);
  assert.deepEqual(ids("is5_sarkaz"), ["runStatusFull", "operatorsFull", "relicsFull", "is5ThoughtFull"]);
  assert.deepEqual(ids("is6_sui"), ["runStatusFull", "operatorsFull", "relicsFull", "is6CoinsFull"]);
});

test("recognition scan action labels are stable for UI buttons", () => {
  assert.deepEqual(
    getRecognitionScanActions("is6_sui").map((item) => item.label),
    ["基本情報", "オペレーター", "秘宝", "通宝"],
  );
});

test("recognition scan actions return defensive copies", () => {
  const first = getRecognitionScanActions("is5_sarkaz");
  first.push({ profile: "bad", label: "bad" });

  assert.deepEqual(ids("is5_sarkaz"), ["runStatusFull", "operatorsFull", "relicsFull", "is5ThoughtFull"]);
});
