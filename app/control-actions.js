import { asCoinEntries, asEffectStackEntries, asRevelationBoardValue, asSpecialArray, asSpecialObject, clampCoinCount, clampSpecialNumber, mergeCoinEntries, normalizeCoinFace } from "./domain/special-values.js";
import { clampOverlayScrollSpeed, isOverlayScrollSpeedField, overlayScrollSpeedDefaults } from "./lib/overlay-config.js";
import { clampGridColumns } from "./lib/preferences.js";
import { normalizeControlMode } from "./domain/ui-modes.js";
import { RUN_STAT_FIELD_IDS, normalizeRunStatValue } from "./domain/run-stats.js";

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

export function updateRevelationBoardSlot(state, campaignId, fieldId, kind, value, fieldConfig, normalizeRevelationBoardValue) {
  const special = ensureCampaignSpecial(state, campaignId);
  const board = asRevelationBoardValue(special[fieldId]);
  if (kind === "cause") board.causeId = value || null;
  if (kind === "structure") board.structureId = value || null;
  special[fieldId] = normalizeRevelationBoardValue(fieldConfig, campaignId, board);
}

export function addRevelationBoardRhetoric(state, campaignId, fieldId, rhetoricId, fieldConfig, normalizeRevelationBoardValue) {
  const special = ensureCampaignSpecial(state, campaignId);
  const board = asRevelationBoardValue(special[fieldId]);
  board.rhetorics.push({ effectId: rhetoricId, count: 1 });
  special[fieldId] = normalizeRevelationBoardValue(fieldConfig, campaignId, board);
}

export function removeRevelationBoardRhetoric(state, campaignId, fieldId, index, fieldConfig, normalizeRevelationBoardValue) {
  const special = ensureCampaignSpecial(state, campaignId);
  const board = asRevelationBoardValue(special[fieldId]);
  board.rhetorics.splice(index, 1);
  special[fieldId] = normalizeRevelationBoardValue(fieldConfig, campaignId, board);
}

export function updateRevelationBoardRhetoricCount(state, campaignId, fieldId, index, value, fieldConfig, normalizeRevelationBoardValue) {
  const special = ensureCampaignSpecial(state, campaignId);
  const board = asRevelationBoardValue(special[fieldId]);
  const entry = board.rhetorics[index];
  if (entry) entry.count = clampCoinCount(value);
  special[fieldId] = normalizeRevelationBoardValue(fieldConfig, campaignId, board);
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

export function updateRunField(state, field, value, checked) {
  if (field === "mode") {
    state.mode = normalizeControlMode(value);
  } else if (field === "campaignId") {
    state.run.campaignId = value;
    state.run.squadId = null;
    state.run.squad = null;
    state.run.squadRandomEffectOptionId = null;
    state.run.performanceId = null;
    state.run.difficulty = null;
    state.run.difficultyTierId = null;
    state.relics = [];
    state.bossFlags = [];
    state.bossSelections ||= {};
    state.bossSelections[value] ||= {};
  } else if (field === "difficulty") {
    state.run.difficulty = value === "" ? null : Number(value);
  } else if (RUN_STAT_FIELD_IDS.has(field)) {
    state.run[field] = normalizeRunStatValue(field, value);
  } else if (field === "squadId") {
    state.run.squadId = value || null;
    state.run.squad = null;
    state.run.squadRandomEffectOptionId = null;
  } else if (field === "squadRandomEffectOptionId") {
    state.run.squadRandomEffectOptionId = value || null;
  } else if (field === "performanceId") {
    state.run.performanceId = value || null;
  } else if (field === "operatorSort") {
    state.preferences.operatorSort = value;
  } else if (field === "operatorGridColumns") {
    state.preferences.operatorGridColumns = clampGridColumns(value);
  } else if (field === "relicGridColumns") {
    state.preferences.relicGridColumns = clampGridColumns(value);
  } else if (isOverlayScrollSpeedField(field)) {
    state.preferences[field] = clampOverlayScrollSpeed(value, overlayScrollSpeedDefaults[field]);
  } else if (field === "showUnreleasedOperators") {
    state.preferences.showUnreleasedOperators = checked;
  }
}

function ensureBossSelection(state, campaignId) {
  state.bossSelections ||= {};
  state.bossSelections[campaignId] ||= {};
  return state.bossSelections[campaignId];
}

export function updateBossSelect(state, campaignId, field, value) {
  ensureBossSelection(state, campaignId)[field] = value || null;
}

export function updateBossToggle(state, campaignId, field, value, checked) {
  const selections = ensureBossSelection(state, campaignId);
  const current = selections[field];
  const next = new Set(Array.isArray(current) ? current : (current ? [current] : []));
  if (checked) next.add(value);
  else next.delete(value);
  selections[field] = [...next];
}

export function updateSpecialVisibility(state, campaignId, key, checked) {
  const special = ensureCampaignSpecial(state, campaignId);
  special[key] = checked;
}

export function updateSpecialField(state, campaignId, fieldId, value, fieldConfig) {
  const special = ensureCampaignSpecial(state, campaignId);
  special[fieldId] = fieldConfig?.type === "number"
    ? clampSpecialNumber(value, fieldConfig.min, fieldConfig.max)
    : (value === "" ? null : value);
}

export function updateSpecialEffectToggle(state, campaignId, fieldId, value, checked) {
  const special = ensureCampaignSpecial(state, campaignId);
  const selected = new Set(asSpecialArray(special[fieldId]));
  if (checked) selected.add(value);
  else selected.delete(value);
  special[fieldId] = [...selected];
}

export function updateSpecialRankedField(state, campaignId, fieldId, parentKey, value) {
  const special = ensureCampaignSpecial(state, campaignId);
  const selected = { ...asSpecialObject(special[fieldId]) };
  if (value) selected[parentKey] = value;
  else delete selected[parentKey];
  special[fieldId] = selected;
}

export function updateEffectStackEntryCount(state, campaignId, fieldId, index, value, fieldConfig, mergeEffectStackEntries) {
  const entries = asEffectStackEntries(state.run.special[campaignId]?.[fieldId]);
  const entry = entries[index];
  if (entry) entry.count = clampCoinCount(value);
  const special = ensureCampaignSpecial(state, campaignId);
  special[fieldId] = mergeEffectStackEntries(fieldConfig, entries, campaignId);
}

export function updateEffectStackEntryState(state, campaignId, fieldId, index, stateId, fieldConfig, mergeEffectStackEntries) {
  const entries = asEffectStackEntries(state.run.special[campaignId]?.[fieldId]);
  const entry = entries[index];
  if (entry) entry.stateId = stateId;
  const special = ensureCampaignSpecial(state, campaignId);
  special[fieldId] = mergeEffectStackEntries(fieldConfig, entries, campaignId);
}

export function updateCoinEntryCount(state, campaignId, fieldId, index, value) {
  const entries = asCoinEntries(state.run.special[campaignId]?.[fieldId]);
  const entry = entries[index];
  if (entry) entry.count = clampCoinCount(value);
  const special = ensureCampaignSpecial(state, campaignId);
  special[fieldId] = mergeCoinEntries(entries);
}

export function updateCoinEntryStatus(state, campaignId, fieldId, index, value) {
  const entries = asCoinEntries(state.run.special[campaignId]?.[fieldId]);
  const entry = entries[index];
  if (entry) entry.statusId = value || null;
  const special = ensureCampaignSpecial(state, campaignId);
  special[fieldId] = mergeCoinEntries(entries);
}

export function updateCoinEntryFace(state, campaignId, fieldId, index, value) {
  const entries = asCoinEntries(state.run.special[campaignId]?.[fieldId]);
  const entry = entries[index];
  if (entry) entry.face = normalizeCoinFace(value);
  const special = ensureCampaignSpecial(state, campaignId);
  special[fieldId] = mergeCoinEntries(entries);
}

export function toggleChoice(state, type, id) {
  const key = type === "relic" ? "relics" : "operators";
  const set = new Set(state[key] || []);
  if (set.has(id)) set.delete(id);
  else set.add(id);
  state[key] = [...set];
}
