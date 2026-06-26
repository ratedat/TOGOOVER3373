import * as selectableEffects from "./selectable-effects.js";
import { normalizeEffectStackEntry, normalizeRevelationBoardValue } from "./special-loadouts.js";
import { asCoinEntries, asEffectStackEntries, asSpecialArray, asSpecialObject, clampCoinCount, coinFaceLabels } from "./special-values.js";

function getSelectableEffect(context, id) {
  return context.selectableEffectMap?.get(id) || null;
}

export function getSpecialEffectName(id, selectableEffectMap) {
  const item = selectableEffectMap?.get(id);
  return item?.name || item?.title || id;
}

export function formatCoinLoadoutValue(field, value, context) {
  const entries = asCoinEntries(value).filter((entry) => getSelectableEffect(context, entry.coinId));
  if (!entries.length) return "";
  const total = entries.reduce((sum, entry) => sum + clampCoinCount(entry.count), 0);
  if (entries.length === 1) {
    const entry = entries[0];
    const coin = getSelectableEffect(context, entry.coinId);
    const status = entry.statusId ? getSelectableEffect(context, entry.statusId) : null;
    return [coin?.name, `x${entry.count}`, status?.name, coinFaceLabels[entry.face]].filter(Boolean).join(" / ");
  }
  return `${total}枚 / ${entries.length}枠`;
}

export function formatEffectStackValue(field, value, context) {
  const entries = asEffectStackEntries(value)
    .map((entry) => normalizeEffectStackEntry(field, entry, context.campaignId, context.selectableEffectSource))
    .filter((entry) => getSelectableEffect(context, entry.effectId));
  if (!entries.length) return "";
  const total = entries.reduce((sum, entry) => sum + clampCoinCount(entry.count), 0);
  const unit = field.unitLabel || "件";
  if (entries.length === 1) {
    const entry = entries[0];
    const item = getSelectableEffect(context, entry.effectId);
    const stateLabel = selectableEffects.isEmptyStackState(field, entry.stateId, context.campaignId, context.selectableEffectSource)
      ? ""
      : selectableEffects.getStackStateLabel(field, entry.stateId, context.campaignId, context.selectableEffectSource);
    return [item?.name, `x${entry.count}`, stateLabel].filter(Boolean).join(" / ");
  }
  return `${total}${unit} / ${entries.length}枠`;
}

export function formatRevelationBoardValue(field, value, context) {
  const board = normalizeRevelationBoardValue(field, context.campaignId, value, context.selectableEffectSource);
  const cause = getSelectableEffect(context, board.causeId);
  const structure = getSelectableEffect(context, board.structureId);
  const rhetoricTotal = board.rhetorics.reduce((sum, entry) => sum + clampCoinCount(entry.count), 0);
  return [cause?.name, structure?.name, rhetoricTotal ? `修辞${rhetoricTotal}枚` : ""].filter(Boolean).join(" / ");
}

export function formatSpecialValue(field, value, context) {
  if (field.type === "effectSelect") return value ? getSpecialEffectName(value, context.selectableEffectMap) : "";
  if (field.type === "effectMultiSelect") {
    const names = asSpecialArray(value).map((id) => getSpecialEffectName(id, context.selectableEffectMap)).filter(Boolean);
    if (names.length <= 1) return names[0] || "";
    return `${names.length}件`;
  }
  if (field.type === "effectRankedMultiSelect") {
    const names = Object.values(asSpecialObject(value)).map((id) => getSpecialEffectName(id, context.selectableEffectMap)).filter(Boolean);
    if (names.length <= 1) return names[0] || "";
    return `${names.length}件`;
  }
  if (field.type === "effectStackLoadout") return formatEffectStackValue(field, value, context);
  if (field.type === "revelationBoardLoadout") return formatRevelationBoardValue(field, value, context);
  if (field.type === "coinLoadout") return formatCoinLoadoutValue(field, value, context);
  if (field.type === "number") return value === null || value === undefined || value === "" ? "" : String(value);
  return value ?? "";
}

export function getSpecialOverlayToggleKey(field) {
  return field.overlayToggleKey || `${field.id}OverlayVisible`;
}

export function isSpecialFieldVisibleOnOverlay(field, special) {
  if (!field.overlayToggle) return true;
  return Boolean(special[getSpecialOverlayToggleKey(field)]);
}

export function getSpecialTags(specialFields, special, context, options = {}) {
  return specialFields
    .filter((field) => !options.overlay || isSpecialFieldVisibleOnOverlay(field, special))
    .map((field) => ({ label: field.label, value: formatSpecialValue(field, special[field.id], context) }))
    .filter((item) => item.value !== null && item.value !== undefined && item.value !== "");
}

export function getSelectedSpecialEffectsForField(field, special, context) {
  const effects = [];
  if (field.type === "effectSelect") {
    const item = getSelectableEffect(context, special[field.id]);
    if (item) effects.push(item);
  } else if (field.type === "effectMultiSelect") {
    for (const id of asSpecialArray(special[field.id])) {
      const item = getSelectableEffect(context, id);
      if (item) effects.push(item);
    }
  } else if (field.type === "effectRankedMultiSelect") {
    for (const id of Object.values(asSpecialObject(special[field.id]))) {
      const item = getSelectableEffect(context, id);
      if (item) effects.push(item);
    }
  } else if (field.type === "effectStackLoadout") {
    for (const rawEntry of asEffectStackEntries(special[field.id])) {
      const entry = normalizeEffectStackEntry(field, rawEntry, context.campaignId, context.selectableEffectSource);
      const item = getSelectableEffect(context, entry.effectId);
      if (!item) continue;
      const hasState = !selectableEffects.isEmptyStackState(field, entry.stateId, context.campaignId, context.selectableEffectSource);
      const stateLabel = hasState ? selectableEffects.getStackStateLabel(field, entry.stateId, context.campaignId, context.selectableEffectSource) : "";
      const stateEffect = hasState ? selectableEffects.getStackStateEffect(field, entry.stateId, context.campaignId, context.selectableEffectSource) : "";
      const titleParts = [`x${entry.count}`, stateLabel].filter(Boolean);
      const effectParts = [item.effect, stateEffect ? `${field.stateLabel || "状態"} ${stateLabel}: ${stateEffect}` : ""].filter(Boolean);
      effects.push({
        ...item,
        slotLabel: field.label || item.slotLabel,
        name: `${item.name} ${titleParts.join(" / ")}`,
        effect: effectParts.join(" / "),
      });
    }
  } else if (field.type === "revelationBoardLoadout") {
    const board = normalizeRevelationBoardValue(field, context.campaignId, special[field.id], context.selectableEffectSource);
    const cause = getSelectableEffect(context, board.causeId);
    if (cause) effects.push({ ...cause, slotLabel: `${field.label || cause.slotLabel} 本因` });
    const structure = getSelectableEffect(context, board.structureId);
    if (structure) effects.push({ ...structure, slotLabel: `${field.label || structure.slotLabel} 構成` });
    for (const entry of board.rhetorics) {
      const item = getSelectableEffect(context, entry.effectId);
      if (!item) continue;
      effects.push({
        ...item,
        slotLabel: `${field.label || item.slotLabel} 修辞`,
        name: `${item.name} x${entry.count}`,
      });
    }
  } else if (field.type === "coinLoadout") {
    for (const entry of asCoinEntries(special[field.id])) {
      const coin = getSelectableEffect(context, entry.coinId);
      if (!coin) continue;
      const status = entry.statusId ? getSelectableEffect(context, entry.statusId) : null;
      const titleParts = [`x${entry.count}`, coinFaceLabels[entry.face], status?.name].filter(Boolean);
      const effectParts = [coin.effect, status?.effect ? `${status.name}: ${status.effect}` : ""].filter(Boolean);
      effects.push({
        ...coin,
        slotLabel: field.label || coin.slotLabel,
        name: `${coin.name} ${titleParts.join(" / ")}`,
        effect: effectParts.join(" / "),
      });
    }
  }
  return effects;
}

export function getSelectedSpecialEffects(specialFields, special, context, options = {}) {
  const effects = [];
  for (const field of specialFields || []) {
    if (options.overlay && !isSpecialFieldVisibleOnOverlay(field, special)) continue;
    effects.push(...getSelectedSpecialEffectsForField(field, special, context));
  }
  return effects;
}

export function getOverlaySpecialEffects(specialFields, special, context) {
  const effects = [];
  for (const field of specialFields || []) {
    if (!field.overlayToggle || !isSpecialFieldVisibleOnOverlay(field, special)) continue;
    effects.push(...getSelectedSpecialEffectsForField(field, special, context));
  }
  return effects;
}