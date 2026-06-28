import test from "node:test";
import assert from "node:assert/strict";

import {
  appendRecognitionSuggestionsToState,
  buildRecognitionSuggestions,
  dedupeRecognitionCandidates,
  recognitionCandidateKey,
} from "../app/domain/recognition/suggestions.js";

test("run status, operator, relic, revelation, thought, age, and coin candidates use stable dedupe keys", () => {
  assert.equal(recognitionCandidateKey({ kind: "runStatus", field: "hope", value: 8 }), "runStatus:hope:8");
  assert.equal(recognitionCandidateKey({ kind: "operator", operatorId: "char_002_amiya" }), "operator:char_002_amiya");
  assert.equal(recognitionCandidateKey({ kind: "relic", relicId: "r1" }), "relic:r1");
  assert.equal(recognitionCandidateKey({ kind: "revelation", campaignId: "is4_sami", fieldId: "revelationBoard", slotKind: "rhetoric", effectId: "x" }), "revelation:is4_sami:revelationBoard:rhetoric:x:_");
  assert.equal(recognitionCandidateKey({ kind: "thought", campaignId: "is5_sarkaz", thoughtId: "t1", stateId: "s1" }), "thought:is5_sarkaz:t1:s1:_");
  assert.equal(recognitionCandidateKey({ kind: "age", campaignId: "is5_sarkaz", ageId: "a1" }), "age:is5_sarkaz:a1");
  assert.equal(recognitionCandidateKey({ kind: "coin", campaignId: "is6_sui", coinId: "c1", statusId: "rust", face: "front", count: 2 }), "coin:is6_sui:c1:rust:front:2");
});

test("recognition candidates dedupe repeated detections but keep different coin slots", () => {
  const candidates = dedupeRecognitionCandidates([
    { kind: "relic", relicId: "r1", name: "秘宝A", confidence: 0.7 },
    { kind: "relic", relicId: "r1", name: "秘宝A", confidence: 0.9 },
    { kind: "coin", campaignId: "is6_sui", coinId: "coin-a", statusId: null, face: "front", count: 1 },
    { kind: "coin", campaignId: "is6_sui", coinId: "coin-a", statusId: "status-a", face: "front", count: 1 },
    { kind: "coin", campaignId: "is6_sui", coinId: "coin-a", statusId: "status-a", face: "back", count: 1 },
  ]);

  assert.equal(candidates.length, 4);
  assert.equal(candidates.find((item) => item.kind === "relic").confidence, 0.9);
});

test("recognition suggestions append to pendingSuggestions without mutating active run state", () => {
  const state = {
    relics: [],
    operators: [],
    run: { special: { is6_sui: { coins: [] } } },
    pendingSuggestions: [],
  };
  const suggestions = buildRecognitionSuggestions([
    { kind: "runStatus", field: "hope", label: "希望", value: 8, rawText: "希望 8", confidence: 0.8 },
    { kind: "operator", operatorId: "char_002_amiya", name: "アーミヤ", rawText: "アーミヤ", confidence: 0.8 },
    { kind: "relic", relicId: "r1", name: "秘宝A", rawText: "秘宝A", confidence: 0.8 },
    { kind: "coin", campaignId: "is6_sui", coinId: "coin-a", name: "通宝A", statusId: "status-a", face: "front", count: 2 },
  ], { scanId: "scan-1", source: "adb", profile: { id: "relicsFull", label: "秘宝フルスキャン" }, createdAt: "2026-06-25T00:00:00.000Z" });

  const next = appendRecognitionSuggestionsToState(state, suggestions);

  assert.deepEqual(state.relics, []);
  assert.deepEqual(state.run.special.is6_sui.coins, []);
  assert.equal(next.pendingSuggestions.length, 4);
  assert.deepEqual(next.relics, []);
  assert.deepEqual(next.run.special.is6_sui.coins, []);
});