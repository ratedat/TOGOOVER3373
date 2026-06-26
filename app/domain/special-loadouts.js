import * as selectableEffects from "./selectable-effects.js";
import { asCoinEntries, asEffectStackEntries, asRevelationBoardValue, clampCoinCount, mergeCoinEntries, normalizeCoinFace } from "./special-values.js";

export function normalizeEffectStackEntry(field, entry, campaignId, selectableEffectSource = []) {
  return {
    ...entry,
    count: clampCoinCount(entry.count),
    stateId: selectableEffects.normalizeStackState(field, entry.stateId, campaignId, selectableEffectSource),
  };
}

function effectStackEntryKey(entry) {
  return `${entry.effectId}\u001f${entry.stateId || ""}`;
}

export function mergeEffectStackEntries(field, entries, campaignId, selectableEffectSource = []) {
  const merged = new Map();
  for (const rawEntry of asEffectStackEntries(entries)) {
    const entry = normalizeEffectStackEntry(field, rawEntry, campaignId, selectableEffectSource);
    const key = effectStackEntryKey(entry);
    if (merged.has(key)) {
      const current = merged.get(key);
      current.count = clampCoinCount(current.count + entry.count);
    } else {
      merged.set(key, entry);
    }
  }
  return [...merged.values()];
}

export function normalizeEffectStackEntries(field, campaignId, value, selectableEffectSource = []) {
  const validEffects = new Set(selectableEffects.getEffectStackOptions(selectableEffectSource, field, campaignId).map((item) => item.id));
  const normalized = asEffectStackEntries(value)
    .filter((entry) => validEffects.has(entry.effectId))
    .map((entry) => normalizeEffectStackEntry(field, entry, campaignId, selectableEffectSource));
  return mergeEffectStackEntries(field, normalized, campaignId, selectableEffectSource);
}

export function normalizeCoinLoadoutEntries(field, campaignId, value, selectableEffectSource = []) {
  const validCoins = new Set(selectableEffects.getCoinOptions(selectableEffectSource, field, campaignId).map((item) => item.id));
  const validStatuses = new Set(selectableEffects.getCoinStatusOptions(selectableEffectSource, field, campaignId).map((item) => item.id));
  const normalized = asCoinEntries(value)
    .filter((entry) => validCoins.has(entry.coinId))
    .map((entry) => ({
      ...entry,
      count: clampCoinCount(entry.count),
      statusId: validStatuses.has(entry.statusId) ? entry.statusId : null,
      face: normalizeCoinFace(entry.face),
    }));
  return mergeCoinEntries(normalized);
}
function revelationBoardOptionSet(field, campaignId, group, selectableEffectSource) {
  return new Set(selectableEffects.getRevelationBoardOptions(selectableEffectSource, field, campaignId, group).map((item) => item.id));
}

function selectableEffectMap(selectableEffectSource) {
  return new Map((selectableEffectSource || []).map((item) => [item.id, item]));
}

export function mergeRevelationRhetorics(entries) {
  const merged = new Map();
  for (const entry of asEffectStackEntries(entries)) {
    const key = entry.effectId;
    if (merged.has(key)) {
      const current = merged.get(key);
      current.count = clampCoinCount(current.count + entry.count);
    } else {
      merged.set(key, { effectId: entry.effectId, count: clampCoinCount(entry.count) });
    }
  }
  return [...merged.values()];
}

export function normalizeRevelationBoardValue(field, campaignId, value, selectableEffectSource = []) {
  const causeOptions = revelationBoardOptionSet(field, campaignId, "cause", selectableEffectSource);
  const structureOptions = revelationBoardOptionSet(field, campaignId, "structure", selectableEffectSource);
  const rhetoricOptions = revelationBoardOptionSet(field, campaignId, "rhetoric", selectableEffectSource);
  const byId = selectableEffectMap(selectableEffectSource);
  const next = { causeId: null, structureId: null, rhetorics: [] };

  if (Array.isArray(value)) {
    for (const entry of asEffectStackEntries(value)) {
      const item = byId.get(entry.effectId);
      if (item && causeOptions.has(item.id) && !next.causeId) next.causeId = item.id;
      else if (item && structureOptions.has(item.id) && !next.structureId) next.structureId = item.id;
      else if (item && rhetoricOptions.has(item.id)) next.rhetorics.push({ effectId: item.id, count: entry.count });

      if (entry.stateId && rhetoricOptions.has(entry.stateId)) {
        next.rhetorics.push({ effectId: entry.stateId, count: entry.count });
      }
    }
    next.rhetorics = mergeRevelationRhetorics(next.rhetorics);
    return next;
  }

  const raw = asRevelationBoardValue(value);
  next.causeId = causeOptions.has(raw.causeId) ? raw.causeId : null;
  next.structureId = structureOptions.has(raw.structureId) ? raw.structureId : null;
  next.rhetorics = mergeRevelationRhetorics(raw.rhetorics.filter((entry) => rhetoricOptions.has(entry.effectId)));
  return next;
}