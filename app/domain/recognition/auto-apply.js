import { RUN_STAT_FIELD_IDS, normalizeRunStatValue } from "../run-stats.js";

export const IS5_AUTO_APPLY_CAMPAIGN_ID = "is5_sarkaz";

const autoApplyProfiles = new Set(["runStatusFull", "relicsFull", "operatorsFull", "is5ThoughtFull", "is5AgeFull"]);

function candidateFromSuggestion(suggestion = {}) {
  return suggestion.candidate && typeof suggestion.candidate === "object" ? suggestion.candidate : suggestion;
}

function suggestionKey(suggestion = {}) {
  return suggestion.recognitionKey || suggestion.id || null;
}

function numericValue(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : null;
}

function currentCampaignId(state) {
  return state?.run?.campaignId || IS5_AUTO_APPLY_CAMPAIGN_ID;
}

function isIs5State(state) {
  return currentCampaignId(state) === IS5_AUTO_APPLY_CAMPAIGN_ID;
}

function ensureIs5Special(run) {
  run.special ||= {};
  run.special[IS5_AUTO_APPLY_CAMPAIGN_ID] ||= {};
  return run.special[IS5_AUTO_APPLY_CAMPAIGN_ID];
}

function applyRunStatusCandidate(state, candidate) {
  const run = state.run ||= {};
  const field = candidate.field;

  if (RUN_STAT_FIELD_IDS.has(field)) {
    const value = normalizeRunStatValue(field, candidate.value);
    if (value === null) return false;
    run[field] = value;
    return true;
  }

  if (field === "difficulty") {
    const value = numericValue(candidate.value);
    if (value === null || value < 1) return false;
    run.difficulty = value;
    return true;
  }

  if (field === "squadId") {
    if (!candidate.value) return false;
    const nextSquadId = String(candidate.value);
    if (run.squadId !== nextSquadId) run.squadRandomEffectOptionId = null;
    run.squadId = nextSquadId;
    run.squad = null;
    return true;
  }

  if (field === "squadRandomEffectOptionId") {
    if (!candidate.value) return false;
    run.squadRandomEffectOptionId = String(candidate.value);
    return true;
  }

  if (field === "idea") {
    const value = numericValue(candidate.value);
    if (value === null || value < 0) return false;
    ensureIs5Special(run).idea = Math.min(999, value);
    return true;
  }

  return false;
}

function isAutoAppliedIs5RelicId(relicId) {
  return typeof relicId === "string" && relicId.startsWith(IS5_AUTO_APPLY_CAMPAIGN_ID + "_relic_");
}

function relicIdFromCandidate(candidate = {}) {
  const relicId = candidate.relicId || candidate.value;
  if (!relicId || typeof relicId !== "string") return null;
  if (candidate.campaignId && candidate.campaignId !== IS5_AUTO_APPLY_CAMPAIGN_ID) return null;
  return isAutoAppliedIs5RelicId(relicId) ? relicId : null;
}

function applyRelicCandidate(state, candidate) {
  const relicId = relicIdFromCandidate(candidate);
  if (!relicId) return false;
  const relics = new Set(Array.isArray(state.relics) ? state.relics : []);
  relics.add(relicId);
  state.relics = [...relics];
  return true;
}

function operatorIdFromCandidate(candidate = {}) {
  const operatorId = candidate.operatorId || candidate.value;
  return typeof operatorId === "string" && operatorId ? operatorId : null;
}

function thoughtIdFromCandidate(candidate = {}) {
  const thoughtId = candidate.thoughtId || candidate.value;
  if (!thoughtId || typeof thoughtId !== "string") return null;
  if (candidate.campaignId && candidate.campaignId !== IS5_AUTO_APPLY_CAMPAIGN_ID) return null;
  return thoughtId;
}

function ageIdFromCandidate(candidate = {}) {
  const ageId = candidate.ageId || candidate.value;
  if (!ageId || typeof ageId !== "string") return null;
  if (candidate.campaignId && candidate.campaignId !== IS5_AUTO_APPLY_CAMPAIGN_ID) return null;
  return ageId;
}

function syncRelicFullScanCandidates(state, suggestions = []) {
  const relicSuggestions = [];
  const relicIds = new Set();
  for (const suggestion of suggestions || []) {
    const candidate = candidateFromSuggestion(suggestion);
    if (!canAutoApplySuggestion(state, suggestion, candidate)) continue;
    if (suggestion.profileId !== "relicsFull" || candidate.kind !== "relic") continue;
    const relicId = relicIdFromCandidate(candidate);
    if (!relicId) continue;
    relicSuggestions.push(suggestion);
    relicIds.add(relicId);
  }
  if (!relicSuggestions.length) return { applied: [], keys: new Set() };

  const preserved = (Array.isArray(state.relics) ? state.relics : []).filter((relicId) => !isAutoAppliedIs5RelicId(relicId));
  state.relics = [...preserved, ...relicIds];
  return {
    applied: relicSuggestions,
    keys: new Set(relicSuggestions.map(suggestionKey).filter(Boolean)),
  };
}

function syncOperatorFullScanCandidates(state, suggestions = []) {
  const operatorSuggestions = [];
  const operatorIds = [];
  const seen = new Set();
  for (const suggestion of suggestions || []) {
    const candidate = candidateFromSuggestion(suggestion);
    if (!canAutoApplySuggestion(state, suggestion, candidate)) continue;
    if (suggestion.profileId !== "operatorsFull" || candidate.kind !== "operator") continue;
    const operatorId = operatorIdFromCandidate(candidate);
    if (!operatorId) continue;
    operatorSuggestions.push(suggestion);
    if (!seen.has(operatorId)) {
      seen.add(operatorId);
      operatorIds.push(operatorId);
    }
  }
  if (!operatorSuggestions.length) return { applied: [], keys: new Set() };

  state.operators = operatorIds;
  return {
    applied: operatorSuggestions,
    keys: new Set(operatorSuggestions.map(suggestionKey).filter(Boolean)),
  };
}

function syncIs5ThoughtFullScanCandidates(state, suggestions = []) {
  const thoughtSuggestions = [];
  const thoughtIds = [];
  const seen = new Set();
  for (const suggestion of suggestions || []) {
    const candidate = candidateFromSuggestion(suggestion);
    if (!canAutoApplySuggestion(state, suggestion, candidate)) continue;
    if (suggestion.profileId !== "is5ThoughtFull" || candidate.kind !== "thought") continue;
    const thoughtId = thoughtIdFromCandidate(candidate);
    if (!thoughtId) continue;
    thoughtSuggestions.push(suggestion);
    if (!seen.has(thoughtId)) {
      seen.add(thoughtId);
      thoughtIds.push(thoughtId);
    }
  }
  if (!thoughtSuggestions.length) return { applied: [], keys: new Set() };

  const run = state.run ||= {};
  ensureIs5Special(run).thought = thoughtIds;
  return {
    applied: thoughtSuggestions,
    keys: new Set(thoughtSuggestions.map(suggestionKey).filter(Boolean)),
  };
}

function syncIs5AgeFullScanCandidates(state, suggestions = []) {
  const ageSuggestions = [];
  for (const suggestion of suggestions || []) {
    const candidate = candidateFromSuggestion(suggestion);
    if (!canAutoApplySuggestion(state, suggestion, candidate)) continue;
    if (suggestion.profileId !== "is5AgeFull" || candidate.kind !== "age") continue;
    if (!ageIdFromCandidate(candidate)) continue;
    ageSuggestions.push(suggestion);
  }
  if (!ageSuggestions.length) return { applied: [], keys: new Set() };

  const best = ageSuggestions.toSorted((left, right) => Number(candidateFromSuggestion(right).confidence || 0) - Number(candidateFromSuggestion(left).confidence || 0))[0];
  const run = state.run ||= {};
  ensureIs5Special(run).age = ageIdFromCandidate(candidateFromSuggestion(best));
  return {
    applied: ageSuggestions,
    keys: new Set(ageSuggestions.map(suggestionKey).filter(Boolean)),
  };
}

function canAutoApplySuggestion(state, suggestion, candidate) {
  if (!autoApplyProfiles.has(suggestion.profileId)) return false;
  if (candidate.kind === "operator") return suggestion.profileId === "operatorsFull";
  if (candidate.kind === "runStatus") return isIs5State(state) && suggestion.profileId === "runStatusFull";
  if (candidate.kind === "relic") return isIs5State(state) && suggestion.profileId === "relicsFull";
  if (candidate.kind === "thought") {
    return isIs5State(state)
      && suggestion.profileId === "is5ThoughtFull"
      && (!candidate.campaignId || candidate.campaignId === IS5_AUTO_APPLY_CAMPAIGN_ID);
  }
  if (candidate.kind === "age") {
    return isIs5State(state)
      && suggestion.profileId === "is5AgeFull"
      && (!candidate.campaignId || candidate.campaignId === IS5_AUTO_APPLY_CAMPAIGN_ID);
  }
  return false;
}

function addSyncedSuggestions(target, synced) {
  for (const suggestion of synced.applied) target.autoApplied.push(suggestion);
  for (const key of synced.keys) target.autoAppliedKeys.add(key);
}

function hasValidAgeSuggestion(suggestions = []) {
  return (suggestions || []).some((suggestion) => {
    const candidate = candidateFromSuggestion(suggestion);
    return suggestion.profileId === "is5AgeFull" && candidate.kind === "age" && Boolean(ageIdFromCandidate(candidate));
  });
}

export function applyRecognitionSuggestionsToState(state, suggestions = []) {
  const next = structuredClone(state || {});
  const remainingSuggestions = [];
  const autoApplied = [];
  const autoAppliedKeys = new Set();
  const syncedTarget = { autoApplied, autoAppliedKeys };

  addSyncedSuggestions(syncedTarget, syncOperatorFullScanCandidates(next, suggestions));
  addSyncedSuggestions(syncedTarget, syncRelicFullScanCandidates(next, suggestions));
  addSyncedSuggestions(syncedTarget, syncIs5ThoughtFullScanCandidates(next, suggestions));
  addSyncedSuggestions(syncedTarget, syncIs5AgeFullScanCandidates(next, suggestions));

  for (const suggestion of suggestions || []) {
    const existingKey = suggestionKey(suggestion);
    if (existingKey && autoAppliedKeys.has(existingKey)) continue;
    const candidate = candidateFromSuggestion(suggestion);
    let applied = false;
    if (canAutoApplySuggestion(next, suggestion, candidate)) {
      if (candidate.kind === "runStatus") applied = applyRunStatusCandidate(next, candidate);
      else if (candidate.kind === "relic") applied = applyRelicCandidate(next, candidate);
    }

    if (applied) {
      autoApplied.push(suggestion);
      const key = suggestionKey(suggestion);
      if (key) autoAppliedKeys.add(key);
    } else {
      remainingSuggestions.push(suggestion);
    }
  }

  if (autoAppliedKeys.size && Array.isArray(next.pendingSuggestions)) {
    next.pendingSuggestions = next.pendingSuggestions.filter((suggestion) => !autoAppliedKeys.has(suggestionKey(suggestion)));
  }

  return { state: next, autoApplied, remainingSuggestions };
}


export function applyRecognitionScanCompletionToState(state, { profileId = null, suggestions = [] } = {}) {
  const applied = applyRecognitionSuggestionsToState(state, suggestions);
  const next = applied.state;
  if (profileId === "is5AgeFull" && isIs5State(next) && !hasValidAgeSuggestion(suggestions)) {
    const run = next.run ||= {};
    ensureIs5Special(run).age = null;
  }
  return { ...applied, state: next };
}
