import { mergeCoinEntries } from "./special-values.js";

function getTemplates(master) {
  return Array.isArray(master?.startTemplates) ? master.startTemplates : [];
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function triggerMatches(trigger = {}, run = {}) {
  if (!trigger.type || trigger.type === "always") return true;
  if (trigger.type === "difficultyMin") {
    const difficulty = numberOrNull(run.difficulty);
    return difficulty !== null && difficulty >= Number(trigger.value);
  }
  if (trigger.type === "difficultyExact") {
    const difficulty = numberOrNull(run.difficulty);
    return difficulty !== null && difficulty === Number(trigger.value);
  }
  if (trigger.type === "squad") return Boolean(trigger.squadId) && run.squadId === trigger.squadId;
  if (trigger.type === "squadOption") {
    return Boolean(trigger.squadId)
      && run.squadId === trigger.squadId
      && run.squadRandomEffectOptionId === trigger.optionId;
  }
  return false;
}

function addRelic(summary, template, operation) {
  if (!operation.relicId) return;
  if (!summary.relicIds.includes(operation.relicId)) summary.relicIds.push(operation.relicId);
  summary.relicSources[operation.relicId] ||= [];
  summary.relicSources[operation.relicId].push({ templateId: template.id, title: template.title, phase: template.phase });
}

function addSpecialPatch(summary, campaignId, fieldId, value) {
  if (!fieldId) return;
  summary.specialPatch[campaignId] ||= {};
  summary.specialPatch[campaignId][fieldId] ||= [];
  summary.specialPatch[campaignId][fieldId].push(value);
}

function addCoin(summary, template, operation) {
  if (!operation.coinId) return;
  addSpecialPatch(summary, template.campaignId, operation.fieldId || "coins", {
    coinId: operation.coinId,
    count: operation.count || 1,
    statusId: operation.statusId || null,
    face: operation.face || "front",
  });
}

function addArrayItem(summary, template, operation) {
  if (!operation.effectId) return;
  addSpecialPatch(summary, template.campaignId, operation.fieldId, operation.effectId);
}

function addManualChoice(summary, template, operation) {
  summary.manualChoices.push({
    templateId: template.id,
    templateTitle: template.title,
    phase: template.phase,
    label: operation.label || template.title,
    count: operation.count || 1,
    relicIds: Array.isArray(operation.relicIds) ? operation.relicIds : [],
  });
}

function addNote(summary, template, operation) {
  summary.notes.push({
    templateId: template.id,
    templateTitle: template.title,
    phase: template.phase,
    label: operation.label || template.title,
    value: operation.value ?? "",
  });
}

export function getActiveStartTemplates(master, run = {}) {
  const campaignId = run?.campaignId;
  return getTemplates(master).filter((template) => template.campaignId === campaignId && triggerMatches(template.trigger, run));
}

export function buildStartTemplateSummary(master, run = {}) {
  const summary = {
    templates: getActiveStartTemplates(master, run),
    relicIds: [],
    relicSources: {},
    specialPatch: {},
    manualChoices: [],
    notes: [],
  };
  for (const template of summary.templates) {
    for (const operation of template.operations || []) {
      if (operation.type === "addRelic") addRelic(summary, template, operation);
      else if (operation.type === "addCoin") addCoin(summary, template, operation);
      else if (operation.type === "addSpecialArrayItem") addArrayItem(summary, template, operation);
      else if (operation.type === "manualChoice") addManualChoice(summary, template, operation);
      else if (operation.type === "note") addNote(summary, template, operation);
    }
  }
  return summary;
}

export function getEffectiveRelicIds(manualRelicIds = [], summary = {}) {
  return [...new Set([...(manualRelicIds || []), ...(summary.relicIds || [])].filter(Boolean))];
}

export function mergeEffectiveSpecial(baseSpecial = {}, patch = {}) {
  const merged = structuredClone(baseSpecial || {});
  for (const [fieldId, values] of Object.entries(patch || {})) {
    if (fieldId === "coins") merged[fieldId] = mergeCoinEntries([...(merged[fieldId] || []), ...values]);
    else if (Array.isArray(merged[fieldId])) merged[fieldId] = [...new Set([...merged[fieldId], ...values].filter(Boolean))];
    else if (merged[fieldId] === null || merged[fieldId] === undefined || merged[fieldId] === "") merged[fieldId] = values[0] ?? merged[fieldId];
    else if (Array.isArray(values) && values.length) merged[fieldId] = merged[fieldId];
  }
  return merged;
}

export function phaseLabel(phase) {
  if (phase === "runStart") return "開始時";
  if (phase === "floor3Start") return "第三層";
  if (phase === "areaEnter") return "エリア";
  return phase || "テンプレート";
}
