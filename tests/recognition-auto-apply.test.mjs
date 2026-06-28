import test from "node:test";
import assert from "node:assert/strict";

import { applyRecognitionScanCompletionToState } from "../app/domain/recognition/auto-apply.js";

test("thought full scan auto-apply preserves duplicate thought instances", () => {
  const state = {
    run: {
      campaignId: "is5_sarkaz",
      special: { is5_sarkaz: { thought: [] } },
    },
  };
  const suggestions = [
    {
      profileId: "is5ThoughtFull",
      recognitionKey: "thought:is5_sarkaz:t1:_:_:roi:100,200",
      candidate: { kind: "thought", campaignId: "is5_sarkaz", thoughtId: "t1", instanceId: "roi:100,200" },
    },
    {
      profileId: "is5ThoughtFull",
      recognitionKey: "thought:is5_sarkaz:t1:_:_:roi:800,200",
      candidate: { kind: "thought", campaignId: "is5_sarkaz", thoughtId: "t1", instanceId: "roi:800,200" },
    },
  ];

  const result = applyRecognitionScanCompletionToState(state, { profileId: "is5ThoughtFull", suggestions });

  assert.deepEqual(result.state.run.special.is5_sarkaz.thought, ["t1", "t1"]);
  assert.equal(result.autoApplied.length, 2);
  assert.equal(result.remainingSuggestions.length, 0);
});
