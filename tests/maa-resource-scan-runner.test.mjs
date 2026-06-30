import test from "node:test";
import assert from "node:assert/strict";

import { runMaaResourceRecognition } from "../app/domain/recognition/maa-resource-scan-runner.js";
import { extractRunStatusCandidates } from "../app/domain/recognition/run-status-extractor.js";

const pipeline = {
  RhodesOcrRegion_run_hope_current: {
    attach: { id: "run.hope.current" },
  },
  RhodesOcrRegion_run_hope_max: {
    attach: { id: "run.hope.max" },
  },
  RhodesOcrRegion_run_ingot: {
    attach: { id: "run.ingot" },
  },
};

test("runMaaResourceRecognition feeds MAA Resource OCR results into existing candidate extractors", async () => {
  const result = await runMaaResourceRecognition({
    profile: { id: "runStatusFull", label: "基礎情報" },
    pipeline,
    taskResults: [
      {
        entry: "RhodesOcrRegion_run_hope_current",
        algorithm: "OCR",
        recognitionDetailJson: JSON.stringify({ best: { text: "3", score: 0.94, box: [941, 17, 32, 35] } }),
      },
      {
        entry: "RhodesOcrRegion_run_hope_max",
        algorithm: "OCR",
        recognitionDetailJson: JSON.stringify({ best: { text: "8", score: 0.95, box: [965, 17, 64, 35] } }),
      },
      {
        entry: "RhodesOcrRegion_run_ingot",
        algorithm: "OCR",
        recognitionDetailJson: JSON.stringify({ best: { text: "20", score: 0.96, box: [1190, 10, 90, 52] } }),
      },
    ],
    candidateExtractors: [extractRunStatusCandidates],
    recognitionContext: {
      campaignId: "is5_sarkaz",
      squads: [],
      difficultyGrades: {},
    },
    scanId: "maa-resource-scan-1",
    now: () => new Date("2026-06-30T10:00:00.000Z"),
  });

  assert.equal(result.status, "completed");
  assert.deepEqual(result.counts, {
    taskResults: 3,
    ocrResults: 3,
    templateResults: 0,
    candidates: 3,
    suggestions: 3,
  });
  assert.equal(result.frame.source, "maa-framework");
  assert.equal(result.candidates.find((candidate) => candidate.field === "hope")?.value, 3);
  assert.equal(result.candidates.find((candidate) => candidate.field === "maxHope")?.value, 8);
  assert.equal(result.candidates.find((candidate) => candidate.field === "ingot")?.value, 20);
  assert.deepEqual(result.suggestions.map((suggestion) => suggestion.profileId), ["runStatusFull", "runStatusFull", "runStatusFull"]);
});
