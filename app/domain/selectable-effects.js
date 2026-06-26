export function matchesGroupLabels(item, groupLabels) {
  return !Array.isArray(groupLabels) || !groupLabels.length || groupLabels.includes(item.groupLabel || item.slotLabel || "");
}

export function getConfiguredStackOptions(rawOptions) {
  return (Array.isArray(rawOptions) ? rawOptions : []).map((option) => {
    if (typeof option === "string") return { id: option, label: option, effect: "" };
    const id = option?.id || option?.value || option?.label || option?.name;
    if (!id) return null;
    return { id: String(id), label: option.label || option.name || String(id), effect: option.effect || option.description || "" };
  }).filter(Boolean);
}

export function getStackEmptyStateId(field) {
  return field.emptyStateId || "none";
}

export function getCampaignSelectableEffects(selectableEffects, campaignId, slot = null) {
  return (selectableEffects || [])
    .filter((item) => item.campaignId === campaignId && (!slot || item.slot === slot))
    .sort((a, b) => (a.order - b.order) || String(a.name).localeCompare(String(b.name), "ja"));
}

export function getSelectableEffectsForField(selectableEffects, field, campaignId) {
  return getCampaignSelectableEffects(selectableEffects, campaignId, field.effectSlot || field.id);
}

export function getStackStateOptions(field, campaignId, selectableEffects = []) {
  const configured = getConfiguredStackOptions(field?.stateOptions);
  const stateSlot = field?.stateEffectSlot || field?.effectSlot || field?.id;
  const dynamic = stateSlot && Array.isArray(field?.stateGroupLabels)
    ? getCampaignSelectableEffects(selectableEffects, campaignId, stateSlot)
      .filter((item) => matchesGroupLabels(item, field.stateGroupLabels))
      .map((item) => ({ id: item.id, label: item.name, effect: item.effect || "" }))
    : [];
  const options = [...configured, ...dynamic];
  const unique = [...new Map(options.map((option) => [option.id, option])).values()];
  const allowEmpty = field?.allowEmptyState !== false;
  const empty = { id: getStackEmptyStateId(field), label: field?.emptyStateLabel || "なし", effect: "", empty: true };
  if (!unique.length) return allowEmpty ? [empty] : [{ id: "normal", label: "通常", effect: "" }];
  return allowEmpty ? [empty, ...unique.filter((option) => option.id !== empty.id)] : unique;
}

export function normalizeStackState(field, value, campaignId, selectableEffects = []) {
  const options = getStackStateOptions(field, campaignId, selectableEffects);
  const raw = value === null || value === undefined || value === "" ? "" : String(value);
  return options.some((option) => option.id === raw) ? raw : options[0].id;
}

export function isEmptyStackState(field, value, campaignId, selectableEffects = []) {
  return normalizeStackState(field, value, campaignId, selectableEffects) === getStackEmptyStateId(field);
}

export function getStackStateLabel(field, value, campaignId, selectableEffects = []) {
  const stateId = normalizeStackState(field, value, campaignId, selectableEffects);
  return getStackStateOptions(field, campaignId, selectableEffects).find((option) => option.id === stateId)?.label || stateId;
}

export function getStackStateEffect(field, value, campaignId, selectableEffects = []) {
  const stateId = normalizeStackState(field, value, campaignId, selectableEffects);
  const fromOption = getStackStateOptions(field, campaignId, selectableEffects).find((option) => option.id === stateId)?.effect;
  return fromOption || field?.stateEffects?.[stateId] || "";
}

export function getCoinOptions(selectableEffects, field, campaignId) {
  return getCampaignSelectableEffects(selectableEffects, campaignId, field.effectSlot || field.id || "coin");
}

export function getCoinStatusOptions(selectableEffects, field, campaignId) {
  return getCampaignSelectableEffects(selectableEffects, campaignId, field.statusSlot || "coinStatus");
}

export function getEffectStackOptions(selectableEffects, field, campaignId) {
  return getSelectableEffectsForField(selectableEffects, field, campaignId)
    .filter((item) => matchesGroupLabels(item, field.optionGroupLabels))
    .filter((item) => !Array.isArray(field.excludeOptionGroupLabels) || !field.excludeOptionGroupLabels.includes(item.groupLabel || item.slotLabel || ""));
}

export function getRevelationBoardGroupLabels(field, group) {
  if (group === "cause") return field?.causeGroupLabels || ["本因"];
  if (group === "structure") return field?.structureGroupLabels || ["構成"];
  if (group === "rhetoric") return field?.rhetoricGroupLabels || ["修辞"];
  return [];
}

export function getRevelationBoardOptions(selectableEffects, field, campaignId, group) {
  return getSelectableEffectsForField(selectableEffects, field, campaignId)
    .filter((item) => matchesGroupLabels(item, getRevelationBoardGroupLabels(field, group)));
}

export function getRankedEffectGroups(selectableEffects, field, campaignId) {
  const grouped = new Map();
  for (const item of getSelectableEffectsForField(selectableEffects, field, campaignId)) {
    const key = item.parentKey || item.group || item.id;
    if (!grouped.has(key)) grouped.set(key, { key, parentName: item.parentName || item.name, groupLabel: item.groupLabel || item.slotLabel || "", items: [] });
    grouped.get(key).items.push(item);
  }
  const rankOrder = { lower: 1, upper: 2, formation: 1, expansion: 2, prime: 3, mourou: 1, meiryou: 2, nyuukotsu: 3 };
  return [...grouped.values()].map((group) => ({
    ...group,
    items: group.items.sort((a, b) => (rankOrder[a.variantRank] || 99) - (rankOrder[b.variantRank] || 99) || (a.order - b.order)),
  })).sort((a, b) => (a.items[0]?.order || 0) - (b.items[0]?.order || 0));
}