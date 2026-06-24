import { asCoinEntries, asEffectStackEntries, asSpecialArray, mergeCoinEntries } from "./domain/special-values.js";

function ensureCampaignSpecial(state, campaignId) {
  state.run.special[campaignId] ||= {};
  return state.run.special[campaignId];
}

export function addSpecialEffect(state, campaignId, fieldId, value) {
  const special = ensureCampaignSpecial(state, campaignId);
  const selected = new Set(asSpecialArray(special[fieldId]));
  selected.add(value);
  special[fieldId] = [...selected];
}

export function removeSpecialEffect(state, campaignId, fieldId, id) {
  const special = ensureCampaignSpecial(state, campaignId);
  special[fieldId] = asSpecialArray(special[fieldId]).filter((itemId) => itemId !== id);
}

export function addEffectStackEntry(state, campaignId, fieldId, entry, fieldConfig, mergeEffectStackEntries) {
  const special = ensureCampaignSpecial(state, campaignId);
  const entries = asEffectStackEntries(special[fieldId]);
  entries.push(entry);
  special[fieldId] = mergeEffectStackEntries(fieldConfig, entries, campaignId);
}

export function removeEffectStackEntry(state, campaignId, fieldId, index) {
  const special = ensureCampaignSpecial(state, campaignId);
  const entries = asEffectStackEntries(special[fieldId]);
  entries.splice(index, 1);
  special[fieldId] = entries;
}

export function addCoinEntry(state, campaignId, fieldId, entry) {
  const special = ensureCampaignSpecial(state, campaignId);
  const entries = asCoinEntries(special[fieldId]);
  entries.push(entry);
  special[fieldId] = mergeCoinEntries(entries);
}

export function removeCoinEntry(state, campaignId, fieldId, index) {
  const special = ensureCampaignSpecial(state, campaignId);
  const entries = asCoinEntries(special[fieldId]);
  entries.splice(index, 1);
  special[fieldId] = entries;
}

export function clearRelics(state) {
  state.relics = [];
}

export function addBossFlag(state, text) {
  state.bossFlags = [...(state.bossFlags || []), text];
}

export function removeBossFlag(state, index) {
  state.bossFlags.splice(index, 1);
}

export function dismissSuggestion(state, index) {
  state.pendingSuggestions.splice(index, 1);
}

export function holdTournamentState(state, pendingState) {
  state.tournament = {
    pendingState,
    lastSubmissionAt: new Date().toISOString(),
    submittedBy: "external-json",
  };
}

export function clearTournamentState(state) {
  state.tournament = { pendingState: null, lastSubmissionAt: null, submittedBy: null };
}
