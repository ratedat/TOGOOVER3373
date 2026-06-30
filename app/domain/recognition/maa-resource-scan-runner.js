import { randomUUID } from "node:crypto";
import { maaTaskResultsToFrame } from "./maa-resource-results.js";
import { buildRecognitionSuggestions, dedupeRecognitionCandidates } from "./suggestions.js";

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

async function extractCandidates(frame, context = {}, candidateExtractors = []) {
  const candidates = [];
  for (const extractor of candidateExtractors || []) {
    const extracted = await extractor(frame, context);
    if (Array.isArray(extracted)) candidates.push(...extracted);
  }
  return dedupeRecognitionCandidates(candidates);
}

export async function runMaaResourceRecognition({
  taskResults = [],
  pipeline = {},
  candidateExtractors = [],
  recognitionContext = {},
  profile = null,
  source = "maa-framework",
  scanId = randomUUID(),
  now = () => new Date(),
} = {}) {
  const startedAt = now();
  const frame = maaTaskResultsToFrame(taskResults, { pipeline, source });
  const context = {
    ...recognitionContext,
    profile: profile || recognitionContext.profile || null,
    source,
  };
  const candidates = await extractCandidates(frame, context, candidateExtractors);
  const createdAt = now().toISOString();
  const suggestions = buildRecognitionSuggestions(candidates, {
    scanId,
    source,
    profile: context.profile,
    createdAt,
  });
  const finishedAt = now();

  return {
    scanId,
    profileId: context.profile?.id || null,
    source,
    status: "completed",
    reason: null,
    frame,
    candidates,
    suggestions,
    counts: {
      taskResults: asArray(taskResults).length,
      ocrResults: frame.ocrResults.length,
      templateResults: frame.templateResults.length,
      candidates: candidates.length,
      suggestions: suggestions.length,
    },
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
  };
}
