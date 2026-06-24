import { bossDisplaySubline, bossDisplayTitle, renderBossCard, renderBossChip } from "./components/boss.js";
import { renderOperatorControlRow as renderOperatorControlRowComponent, renderRelicControlRow as renderRelicControlRowComponent } from "./components/choice-cards.js";
import { renderOperatorListArea as renderOperatorListAreaComponent, renderRelicListArea as renderRelicListAreaComponent, renderRelicListContent as renderRelicListContentComponent } from "./components/choice-lists.js";
import { renderOverlayCompact as renderOverlayCompactComponent, renderOverlayDefault as renderOverlayDefaultComponent, renderOverlayDense as renderOverlayDenseComponent } from "./components/overlay-layouts.js";
import { renderEffectList } from "./components/effects.js";
import * as specialControls from "./components/special-controls.js";
import { renderCompactSpecialPicker as renderCompactSpecialPickerComponent, renderSpecialField as renderSpecialFieldComponent } from "./components/special-fields.js";
import { renderCoinEntryRow as renderCoinEntryRowComponent, renderCoinLoadoutField as renderCoinLoadoutFieldComponent, renderEffectStackEntryRow as renderEffectStackEntryRowComponent, renderEffectStackLoadoutField as renderEffectStackLoadoutFieldComponent, renderEffectStackStateOptions as renderEffectStackStateOptionsComponent } from "./components/special-loadouts.js";
import { renderSpecialOverlayBlock as renderSpecialOverlayBlockComponent } from "./components/special-overlay.js";
import * as controlActions from "./control-actions.js";
import { bossSectionAllowsMultiple, buildBossFlagEntries } from "./domain/boss-flags.js";
import { createLookupMaps } from "./domain/master-maps.js";
import { difficultyEffectTexts, difficultySummary as summarizeDifficultyGrade, getDifficultyGradeConfig as readDifficultyGradeConfig, getSelectedDifficultyGrade as readSelectedDifficultyGrade } from "./domain/difficulty.js";
import { isActiveManualRule, summarizeRelicEffects as summarizeRelicEffectMetrics, summarizeTextEffects } from "./domain/effect-metrics.js";
import { operatorReleaseMatches as operatorMatchesRelease, sortOperators as sortOperatorsByPreference, uniqueValues } from "./domain/operators.js";
import { apiJson, masterUrl, resetStateUrl, stateUrl } from "./lib/api.js";
import { asCoinEntries, asEffectStackEntries, asSpecialArray, asSpecialObject, clampCoinCount, clampSpecialNumber, coinFaceLabels, mergeCoinEntries, normalizeCoinFace } from "./domain/special-values.js";
import * as selectableEffects from "./domain/selectable-effects.js";
import { assetUrl, html, normalizeText, stableOverlayStateJson, stars } from "./lib/format.js";
import { clampOverlayScrollSpeed, isOverlayScrollSpeedField, overlayScrollSpeedDefaults, overlayScrollSpeedLabels, resolveOverlayLayout, resolveOverlaySize } from "./lib/overlay-config.js";
import { mediaUrl } from "./lib/media.js";
import { clampGridColumns, gridColumnOptions, normalizePreferences } from "./lib/preferences.js";
import { cancelOverlayAutoScroll, setupOverlayAutoScroll } from "./overlay/autoscroll.js";

const app = document.querySelector("#app");
const routeParams = new URLSearchParams(location.search);
const view = location.pathname.includes("overlay") || routeParams.get("view") === "overlay" ? "overlay" : "control";
const overlayLayout = resolveOverlayLayout(routeParams.get("layout"));
const overlaySize = resolveOverlaySize(routeParams.get("size") || routeParams.get("scale"));
if (view === "overlay") document.documentElement.classList.add("overlay-mode");

const ui = {
  tab: "run",
  relicSearch: "",
  relicCategory: "all",
  operatorRarity: "all",
  operatorClass: "all",
  operatorBranch: "all",
  operatorRelease: "released",
  bossDraft: "",
  importDraft: "",
  notice: "",
  saveStatus: "未保存",
};

let master = null;
let state = null;
let maps = null;
let saveTimer = null;
let lastStateJson = "";




function buildMaps() {
  maps = createLookupMaps(master, isActiveManualRule);
}

function getCampaign() {
  return maps.campaign.get(state?.run?.campaignId) || master.campaigns[0];
}

function getCampaignSquads() {
  const campaign = getCampaign();
  return master.squads.filter((item) => item.campaignId === campaign.id);
}

function getCampaignRelics() {
  const campaign = getCampaign();
  return master.relics.filter((item) => item.campaignId === campaign.id);
}

function getCampaignPerformances(campaignId = getCampaign()?.id) {
  return (master.performances || []).filter((item) => item.campaignId === campaignId);
}

function getSelectedPerformance() {
  const id = state?.run?.performanceId;
  return id ? maps.performance.get(id) : null;
}


function getSelectableEffectSource() {
  return master.selectableEffects || [];
}

function getStackEmptyStateId(field) {
  return selectableEffects.getStackEmptyStateId(field);
}

function getStackStateOptions(field, campaignId = getCampaign()?.id) {
  return selectableEffects.getStackStateOptions(field, campaignId, getSelectableEffectSource());
}

function normalizeStackState(field, value, campaignId = getCampaign()?.id) {
  return selectableEffects.normalizeStackState(field, value, campaignId, getSelectableEffectSource());
}

function isEmptyStackState(field, value, campaignId = getCampaign()?.id) {
  return selectableEffects.isEmptyStackState(field, value, campaignId, getSelectableEffectSource());
}

function getStackStateLabel(field, value, campaignId = getCampaign()?.id) {
  return selectableEffects.getStackStateLabel(field, value, campaignId, getSelectableEffectSource());
}

function getStackStateEffect(field, value, campaignId = getCampaign()?.id) {
  return selectableEffects.getStackStateEffect(field, value, campaignId, getSelectableEffectSource());
}

function normalizeEffectStackEntry(field, entry, campaignId = getCampaign()?.id) {
  return {
    ...entry,
    count: clampCoinCount(entry.count),
    stateId: normalizeStackState(field, entry.stateId, campaignId),
  };
}

function effectStackEntryKey(entry) {
  return `${entry.effectId}\u001f${entry.stateId || ""}`;
}

function mergeEffectStackEntries(field, entries, campaignId = getCampaign()?.id) {
  const merged = new Map();
  for (const rawEntry of asEffectStackEntries(entries)) {
    const entry = normalizeEffectStackEntry(field, rawEntry, campaignId);
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

function getCampaignSelectableEffects(campaignId = getCampaign()?.id, slot = null) {
  return selectableEffects.getCampaignSelectableEffects(getSelectableEffectSource(), campaignId, slot);
}

function getSelectableEffectsForField(field, campaignId = getCampaign()?.id) {
  return selectableEffects.getSelectableEffectsForField(getSelectableEffectSource(), field, campaignId);
}

function getSpecialFieldConfig(campaignId, fieldId) {
  const campaign = maps.campaign.get(campaignId);
  return (campaign?.specialFields || []).find((field) => field.id === fieldId) || null;
}

function getCoinOptions(field, campaignId = getCampaign()?.id) {
  return selectableEffects.getCoinOptions(getSelectableEffectSource(), field, campaignId);
}

function getCoinStatusOptions(field, campaignId = getCampaign()?.id) {
  return selectableEffects.getCoinStatusOptions(getSelectableEffectSource(), field, campaignId);
}

function getEffectStackOptions(field, campaignId = getCampaign()?.id) {
  return selectableEffects.getEffectStackOptions(getSelectableEffectSource(), field, campaignId);
}

function normalizeEffectStackEntries(field, campaignId, value) {
  const validEffects = new Set(getEffectStackOptions(field, campaignId).map((item) => item.id));
  const normalized = asEffectStackEntries(value)
    .filter((entry) => validEffects.has(entry.effectId))
    .map((entry) => normalizeEffectStackEntry(field, entry, campaignId));
  return mergeEffectStackEntries(field, normalized, campaignId);
}

function normalizeCoinLoadoutEntries(field, campaignId, value) {
  const validCoins = new Set(getCoinOptions(field, campaignId).map((item) => item.id));
  const validStatuses = new Set(getCoinStatusOptions(field, campaignId).map((item) => item.id));
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

function getRankedEffectGroups(field, campaignId = getCampaign()?.id) {
  return selectableEffects.getRankedEffectGroups(getSelectableEffectSource(), field, campaignId);
}

function getSpecialEffectName(id) {
  const item = maps.selectableEffect.get(id);
  return item?.name || item?.title || id;
}

function formatCoinLoadoutValue(field, value) {
  const entries = asCoinEntries(value).filter((entry) => maps.selectableEffect.has(entry.coinId));
  if (!entries.length) return "";
  const total = entries.reduce((sum, entry) => sum + clampCoinCount(entry.count), 0);
  if (entries.length === 1) {
    const entry = entries[0];
    const coin = maps.selectableEffect.get(entry.coinId);
    const status = entry.statusId ? maps.selectableEffect.get(entry.statusId) : null;
    return [coin?.name, `x${entry.count}`, status?.name, coinFaceLabels[entry.face]].filter(Boolean).join(" / ");
  }
  return `${total}枚 / ${entries.length}枠`;
}

function formatEffectStackValue(field, value) {
  const entries = asEffectStackEntries(value)
    .map((entry) => normalizeEffectStackEntry(field, entry))
    .filter((entry) => maps.selectableEffect.has(entry.effectId));
  if (!entries.length) return "";
  const total = entries.reduce((sum, entry) => sum + clampCoinCount(entry.count), 0);
  const unit = field.unitLabel || "件";
  if (entries.length === 1) {
    const entry = entries[0];
    const item = maps.selectableEffect.get(entry.effectId);
    const stateLabel = isEmptyStackState(field, entry.stateId) ? "" : getStackStateLabel(field, entry.stateId);
    return [item?.name, `x${entry.count}`, stateLabel].filter(Boolean).join(" / ");
  }
  return `${total}${unit} / ${entries.length}枠`;
}

function formatSpecialValue(field, value) {
  if (field.type === "effectSelect") return value ? getSpecialEffectName(value) : "";
  if (field.type === "effectMultiSelect") {
    const names = asSpecialArray(value).map(getSpecialEffectName).filter(Boolean);
    if (names.length <= 1) return names[0] || "";
    return `${names.length}件`;
  }
  if (field.type === "effectRankedMultiSelect") {
    const names = Object.values(asSpecialObject(value)).map(getSpecialEffectName).filter(Boolean);
    if (names.length <= 1) return names[0] || "";
    return `${names.length}件`;
  }
  if (field.type === "effectStackLoadout") return formatEffectStackValue(field, value);
  if (field.type === "coinLoadout") return formatCoinLoadoutValue(field, value);
  if (field.type === "number") return value === null || value === undefined || value === "" ? "" : String(value);
  return value ?? "";
}

function getSpecialOverlayToggleKey(field) {
  return field.overlayToggleKey || `${field.id}OverlayVisible`;
}

function isSpecialFieldVisibleOnOverlay(field, special) {
  if (!field.overlayToggle) return true;
  return Boolean(special[getSpecialOverlayToggleKey(field)]);
}

function getSpecialTags(specialFields, special, options = {}) {
  return specialFields
    .filter((field) => !options.overlay || isSpecialFieldVisibleOnOverlay(field, special))
    .map((field) => ({ label: field.label, value: formatSpecialValue(field, special[field.id]) }))
    .filter((item) => item.value !== null && item.value !== undefined && item.value !== "");
}

function getSelectedSpecialEffectsForField(field, special) {
  const effects = [];
  if (field.type === "effectSelect") {
    const item = maps.selectableEffect.get(special[field.id]);
    if (item) effects.push(item);
  } else if (field.type === "effectMultiSelect") {
    for (const id of asSpecialArray(special[field.id])) {
      const item = maps.selectableEffect.get(id);
      if (item) effects.push(item);
    }
  } else if (field.type === "effectRankedMultiSelect") {
    for (const id of Object.values(asSpecialObject(special[field.id]))) {
      const item = maps.selectableEffect.get(id);
      if (item) effects.push(item);
    }
  } else if (field.type === "effectStackLoadout") {
    for (const rawEntry of asEffectStackEntries(special[field.id])) {
      const entry = normalizeEffectStackEntry(field, rawEntry);
      const item = maps.selectableEffect.get(entry.effectId);
      if (!item) continue;
      const hasState = !isEmptyStackState(field, entry.stateId);
      const stateLabel = hasState ? getStackStateLabel(field, entry.stateId) : "";
      const stateEffect = hasState ? getStackStateEffect(field, entry.stateId) : "";
      const titleParts = [`x${entry.count}`, stateLabel].filter(Boolean);
      const effectParts = [item.effect, stateEffect ? `${field.stateLabel || "状態"} ${stateLabel}: ${stateEffect}` : ""].filter(Boolean);
      effects.push({
        ...item,
        slotLabel: field.label || item.slotLabel,
        name: `${item.name} ${titleParts.join(" / ")}`,
        effect: effectParts.join(" / "),
      });
    }
  } else if (field.type === "coinLoadout") {
    for (const entry of asCoinEntries(special[field.id])) {
      const coin = maps.selectableEffect.get(entry.coinId);
      if (!coin) continue;
      const status = entry.statusId ? maps.selectableEffect.get(entry.statusId) : null;
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

function getSelectedSpecialEffects(campaignId = getCampaign()?.id, options = {}) {
  const campaign = maps.campaign.get(campaignId);
  const special = state.run.special?.[campaignId] || {};
  const effects = [];
  for (const field of campaign?.specialFields || []) {
    if (options.overlay && !isSpecialFieldVisibleOnOverlay(field, special)) continue;
    effects.push(...getSelectedSpecialEffectsForField(field, special));
  }
  return effects;
}

function getOverlaySpecialEffects(campaignId, specialFields, special) {
  const effects = [];
  for (const field of specialFields || []) {
    if (!field.overlayToggle || !isSpecialFieldVisibleOnOverlay(field, special)) continue;
    effects.push(...getSelectedSpecialEffectsForField(field, special));
  }
  return effects;
}


function renderSpecialOverlayBlock(items, mode, speedKey) {
  return renderSpecialOverlayBlockComponent(items, mode, speedKey, getOverlayScrollSpeed);
}

function renderSpecialOverlayToggle(field, special) {
  return specialControls.renderSpecialOverlayToggle(field, special, getSpecialOverlayToggleKey);
}

function renderSpecialEffectGroupHeader(field, special) {
  return specialControls.renderSpecialEffectGroupHeader(field, special, getSpecialOverlayToggleKey);
}

function renderSpecialEffectOption(field, item, selected) {
  return specialControls.renderSpecialEffectOption(field, item, selected);
}

function renderRankedSpecialEffectRow(field, group, selectedId) {
  return specialControls.renderRankedSpecialEffectRow(field, group, selectedId);
}

function renderSpecialEffectSelectOptions(options, current = "", placeholder = "未選択", excludedIds = new Set()) {
  return specialControls.renderSpecialEffectSelectOptions(options, current, placeholder, excludedIds);
}

function renderSpecialSelectedChip(field, item) {
  return specialControls.renderSpecialSelectedChip(field, item);
}

function renderSpecialFieldContext() {
  return {
    getSelectableEffectsForField,
    asSpecialArray,
    asSpecialObject,
    selectableEffectById: maps.selectableEffect,
    renderSpecialEffectGroupHeader,
    renderSpecialEffectSelectOptions,
    renderSpecialEffectOption,
    renderSpecialSelectedChip,
    getRankedEffectGroups,
    renderRankedSpecialEffectRow,
    renderEffectStackLoadoutField,
    renderCoinLoadoutField,
  };
}

function renderCompactSpecialPicker(field, campaignId, special) {
  return renderCompactSpecialPickerComponent(field, campaignId, special, renderSpecialFieldContext());
}

function renderCoinFaceOptions(current) {
  return specialControls.renderCoinFaceOptions(current);
}

function renderSpecialLoadoutContext() {
  return {
    selectableEffectById: maps.selectableEffect,
    getCoinOptions,
    getCoinStatusOptions,
    asCoinEntries,
    renderSpecialEffectGroupHeader,
    renderSpecialEffectSelectOptions,
    renderCoinFaceOptions,
    formatCoinLoadoutValue,
    getEffectStackOptions,
    getStackStateOptions,
    getStackEmptyStateId,
    normalizeStackState,
    normalizeEffectStackEntry,
    normalizeEffectStackEntries,
    formatEffectStackValue,
  };
}

function renderCoinEntryRow(field, entry, index, statusOptions) {
  return renderCoinEntryRowComponent(field, entry, index, statusOptions, renderSpecialLoadoutContext());
}

function renderCoinLoadoutField(field, campaignId, special) {
  return renderCoinLoadoutFieldComponent(field, campaignId, special, renderSpecialLoadoutContext());
}

function renderEffectStackStateOptions(field, current, campaignId = getCampaign()?.id) {
  return renderEffectStackStateOptionsComponent(field, current, campaignId, renderSpecialLoadoutContext());
}

function renderEffectStackEntryRow(field, entry, index, campaignId = getCampaign()?.id) {
  return renderEffectStackEntryRowComponent(field, entry, index, campaignId, renderSpecialLoadoutContext());
}

function renderEffectStackLoadoutField(field, campaignId, special) {
  return renderEffectStackLoadoutFieldComponent(field, campaignId, special, renderSpecialLoadoutContext());
}

function renderSpecialField(field, campaignId, special) {
  return renderSpecialFieldComponent(field, campaignId, special, renderSpecialFieldContext());
}

function normalizeSpecialFieldSelections() {
  for (const campaign of master.campaigns) {
    const special = state.run.special[campaign.id] ||= {};
    for (const field of campaign.specialFields || []) {
      if (field.type === "effectSelect") {
        const validIds = new Set(getSelectableEffectsForField(field, campaign.id).map((item) => item.id));
        if (special[field.id] && !validIds.has(special[field.id])) special[field.id] = null;
      } else if (field.type === "effectMultiSelect") {
        const validIds = new Set(getSelectableEffectsForField(field, campaign.id).map((item) => item.id));
        special[field.id] = asSpecialArray(special[field.id]).filter((id) => validIds.has(id));
      } else if (field.type === "effectRankedMultiSelect") {
        const validIds = new Set(getSelectableEffectsForField(field, campaign.id).map((item) => item.id));
        const next = {};
        for (const [parentKey, id] of Object.entries(asSpecialObject(special[field.id]))) if (validIds.has(id)) next[parentKey] = id;
        special[field.id] = next;
      } else if (field.type === "effectStackLoadout") {
        special[field.id] = normalizeEffectStackEntries(field, campaign.id, special[field.id]);
      } else if (field.type === "coinLoadout") {
        special[field.id] = normalizeCoinLoadoutEntries(field, campaign.id, special[field.id]);
      } else if (field.type === "number") {
        special[field.id] = clampSpecialNumber(special[field.id], field.min, field.max);
      } else if (!(field.id in special)) {
        special[field.id] = null;
      }
      if (field.overlayToggle) {
        const key = getSpecialOverlayToggleKey(field);
        special[key] = Boolean(special[key]);
      }
    }
  }
}
function performanceGroupLabel(group) {
  if (group === "standard") return "通常";
  if (group === "crimson") return "緋染め";
  return group || "その他";
}

function renderPerformanceSelect(campaignId) {
  const performances = getCampaignPerformances(campaignId);
  const current = state?.run?.performanceId || "";
  if (!performances.length) return `<select data-field="performanceId"><option value="">対象外</option></select>`;
  const grouped = new Map();
  for (const item of performances) {
    const key = item.group || "other";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(item);
  }
  const preferred = ["standard", "crimson"];
  const groupKeys = [...preferred.filter((key) => grouped.has(key)), ...[...grouped.keys()].filter((key) => !preferred.includes(key))];
  return `<select data-field="performanceId">
    <option value="">未選択</option>
    ${groupKeys.map((group) => `<optgroup label="${html(performanceGroupLabel(group))}">${grouped.get(group).map((item) => `<option value="${html(item.id)}" ${item.id === current ? "selected" : ""}>${html(item.name)}</option>`).join("")}</optgroup>`).join("")}
  </select>`;
}

function getSelectedSquad() {
  const id = state?.run?.squadId || (typeof state?.run?.squad === "string" ? state.run.squad : null);
  return id ? maps.squad.get(id) : null;
}

function getSelectedSquadOption(squad = getSelectedSquad()) {
  const options = squad?.randomEffectOptions || [];
  const id = state?.run?.squadRandomEffectOptionId;
  return options.find((item) => item.id === id) || null;
}

function getOwnedRelics() {
  return (state.relics || []).map((id) => maps.relic.get(id)).filter(Boolean);
}



function getBossConfig(campaignId = getCampaign()?.id) {
  return maps.campaign.get(campaignId)?.bossFlags || null;
}

function getBossManualSections(campaignId = getCampaign()?.id) {
  const cfg = getBossConfig(campaignId);
  if (!cfg) return [];
  const sections = Array.isArray(cfg.manualSections) ? [...cfg.manualSections] : [];
  if (cfg.floor3 && !sections.some((section) => section.field === cfg.floor3.field)) sections.unshift(cfg.floor3);
  return sections.filter((section) => section?.field);
}

function getBossSelection(campaignId = getCampaign()?.id) {
  state.bossSelections ||= {};
  state.bossSelections[campaignId] ||= {};
  return state.bossSelections[campaignId];
}


function bossSelectionValues(section, campaignId = getCampaign()?.id) {
  const selection = getBossSelection(campaignId);
  const current = selection[section.field];
  if (bossSectionAllowsMultiple(section)) return Array.isArray(current) ? current.filter(Boolean) : (current ? [current] : []);
  return current ? [current] : [];
}

function normalizeBossSelections() {
  state.bossSelections ||= {};
  for (const campaign of master.campaigns) {
    state.bossSelections[campaign.id] ||= {};
    for (const section of getBossManualSections(campaign.id)) {
      const validIds = new Set((section.options || []).map((item) => item.id));
      if (bossSectionAllowsMultiple(section)) {
        const current = state.bossSelections[campaign.id][section.field];
        const values = Array.isArray(current) ? current : (current ? [current] : []);
        state.bossSelections[campaign.id][section.field] = values.filter((id) => validIds.has(id));
      } else {
        const current = state.bossSelections[campaign.id][section.field] || null;
        const id = Array.isArray(current) ? current[0] : current;
        state.bossSelections[campaign.id][section.field] = validIds.has(id) ? id : null;
      }
    }
  }
}

function getSelectedManualBosses(campaignId = getCampaign()?.id) {
  return getBossManualSections(campaignId)
    .flatMap((section) => bossSelectionValues(section, campaignId).map((id) => {
      const item = (section.options || []).find((option) => option.id === id);
      return item ? { ...item, type: "manualBoss", label: item.label || section.label || "手動", source: "manual", sectionId: section.id || section.field } : null;
    }))
    .filter(Boolean);
}

function getSelectedFloor3Boss(campaignId = getCampaign()?.id) {
  return getSelectedManualBosses(campaignId).find((item) => Number(item.floor) === 3 || item.sectionId === "floor3BossId") || null;
}


function getBossFlagEntries(campaignId = getCampaign()?.id) {
  return buildBossFlagEntries({
    config: getBossConfig(campaignId),
    relicIds: state.relics || [],
    manualBosses: getSelectedManualBosses(campaignId),
    manualFlags: state.bossFlags || [],
    relicMap: maps.relic,
  });
}
function getRecruitedOperators() {
  const ops = (state.operators || []).map((id) => maps.operator.get(id)).filter(Boolean);
  return sortOperators(ops);
}

function sortOperators(operators) {
  return sortOperatorsByPreference(operators, state.preferences?.operatorSort || "rarity_desc");
}

function getDifficultyGradeConfig(campaignId = state?.run?.campaignId) {
  return readDifficultyGradeConfig(master, campaignId);
}

function getSelectedDifficultyGrade() {
  return readSelectedDifficultyGrade(master, state?.run);
}

function renderDifficultySelect(campaignId) {
  const cfg = getDifficultyGradeConfig(campaignId);
  const current = state?.run?.difficulty;
  if (!cfg?.grades?.length) {
    return `<select data-field="difficulty"><option value="">未設定</option></select>`;
  }
  return `<select data-field="difficulty">
    <option value="">未選択</option>
    ${cfg.grades.map((item) => `<option value="${html(item.grade)}" ${Number(current) === Number(item.grade) ? "selected" : ""}>${html(item.label)}</option>`).join("")}
  </select>`;
}

function difficultySummary(grade) {
  return summarizeDifficultyGrade(grade);
}

function renderDifficultyFields(grade, mode = "control") {
  const fields = (grade?.fields || []).filter((item) => item.value !== null && item.value !== undefined && item.value !== "");
  if (!grade || !fields.length) return "";
  return `<div class="difficulty-summary ${mode === "overlay" ? "overlay-detail" : ""}">
    <div class="difficulty-summary-title">${html(grade.label)}</div>
    <div class="difficulty-field-list">
      ${fields.map((item) => `<div class="difficulty-field"><span>${html(item.label)}</span><strong>${html(item.value)}</strong></div>`).join("")}
    </div>
  </div>`;
}

function operatorReleaseMatches(item) {
  return operatorMatchesRelease(item, ui.operatorRelease);
}

function getOverlayScrollSpeed(key) {
  return clampOverlayScrollSpeed(state?.preferences?.[key], overlayScrollSpeedDefaults[key] ?? 12);
}

function renderScrollSpeedControl(key) {
  const value = getOverlayScrollSpeed(key);
  return `<label>${html(overlayScrollSpeedLabels[key] || key)} <span class="range-value">${value}</span>
    <input type="range" min="0" max="30" step="1" value="${value}" data-field="${key}" />
  </label>`;
}

function getOperatorGridColumns() {
  return clampGridColumns(state?.preferences?.operatorGridColumns ?? 2);
}

function getRelicGridColumns() {
  return clampGridColumns(state?.preferences?.relicGridColumns ?? 2);
}
function normalizeOperatorFilters() {
  const releaseBase = master.operators.filter(operatorReleaseMatches);
  const rarityValues = new Set(releaseBase.map((item) => String(item.rarity)));
  if (ui.operatorRarity !== "all" && !rarityValues.has(ui.operatorRarity)) ui.operatorRarity = "all";
  const rarityBase = releaseBase.filter((item) => ui.operatorRarity === "all" || String(item.rarity) === ui.operatorRarity);
  const classValues = new Set(rarityBase.map((item) => item.class).filter(Boolean));
  if (ui.operatorClass !== "all" && !classValues.has(ui.operatorClass)) {
    ui.operatorClass = "all";
    ui.operatorBranch = "all";
  }
  const classBase = rarityBase.filter((item) => ui.operatorClass === "all" || item.class === ui.operatorClass);
  const branchValues = new Set(classBase.map((item) => item.branch).filter(Boolean));
  if (ui.operatorBranch !== "all" && !branchValues.has(ui.operatorBranch)) ui.operatorBranch = "all";
}
function deriveDifficultyTier() {
  const campaignId = state?.run?.campaignId;
  const cfg = master?.difficultyTiers?.[campaignId];
  if (!cfg) {
    state.run.difficultyTierId = null;
    return null;
  }
  const raw = state.run.difficulty;
  const value = raw === null || raw === undefined || raw === "" ? null : Number(raw);
  if (!Number.isFinite(value)) {
    state.run.difficultyTierId = null;
    return null;
  }
  const tier = cfg.tiers.find((item) => value >= item.minDifficulty && (item.maxDifficulty === null || value <= item.maxDifficulty));
  state.run.difficultyTierId = tier?.id || cfg.defaultTierId || null;
  return tier || null;
}

function getDifficultyTierLabel() {
  const campaignId = state?.run?.campaignId;
  const tierId = state?.run?.difficultyTierId;
  const cfg = master?.difficultyTiers?.[campaignId];
  if (!cfg || !tierId) return "未解決";
  const tier = cfg.tiers.find((item) => item.id === tierId);
  return tier ? tier.label : tierId;
}

function relicEffectForDisplay(relic) {
  const group = maps.variantGroup.get(relic.id);
  if (!group) return relic.effect || "";
  const tierId = state.run.difficultyTierId || group.fallbackTierId;
  const variant = group.variants.find((item) => item.tierId === tierId) || group.variants.find((item) => item.tierId === group.fallbackTierId);
  return variant?.effect || relic.effect || "";
}

function summarizeRelicEffects() {
  return summarizeRelicEffectMetrics({
    ownedRelics: getOwnedRelics(),
    rulesByRelic: maps.effectRuleByRelic,
    tagGroups: maps.effectRuleTags,
    effectTextForRelic: relicEffectForDisplay,
  });
}

function getDifficultyEffectTexts(grade = getSelectedDifficultyGrade()) {
  return difficultyEffectTexts(grade);
}

function summarizeDifficultyEffects(grade = getSelectedDifficultyGrade()) {
  return summarizeTextEffects("等級", getDifficultyEffectTexts(grade));
}

function getActiveEffects({ includeRelics = true, includeDifficulty = true, overlay = false } = {}) {
  const effects = [];
  const pushEffect = (type, title, effect) => {
    if (!effect) return;
    effects.push({ type, title: title || type, effect });
  };
  const squad = getSelectedSquad();
  const option = getSelectedSquadOption(squad);
  const performance = getSelectedPerformance();
  pushEffect("分隊", squad?.name, squad?.effect);
  pushEffect("分隊追加", option?.label || "ランダム効果", option?.effect);
  pushEffect("演目", performance?.name || performance?.title, performance?.effect);
  for (const effect of getSelectedSpecialEffects(getCampaign()?.id, { overlay })) pushEffect(effect.slotLabel || "特殊", effect.name || effect.title, effect.effect);
  if (includeDifficulty) effects.push(...summarizeDifficultyEffects());
  if (includeRelics) effects.push(...summarizeRelicEffects());
  return effects;
}


function ensureStateShape() {
  state.run ||= {};
  state.run.campaignId ||= "is5_sarkaz";
  state.run.performanceId ??= null;
  state.run.special ||= {};
  for (const campaign of master.campaigns) state.run.special[campaign.id] ||= {};
  if (state.run.performanceId && !getCampaignPerformances(state.run.campaignId).some((item) => item.id === state.run.performanceId)) state.run.performanceId = null;
  normalizeSpecialFieldSelections();
  state.relics = Array.isArray(state.relics) ? state.relics : [];
  state.operators = Array.isArray(state.operators) ? state.operators : [];
  state.bossFlags = Array.isArray(state.bossFlags) ? state.bossFlags : [];
  normalizeBossSelections();
  state.pendingSuggestions = Array.isArray(state.pendingSuggestions) ? state.pendingSuggestions : [];
  state.preferences = normalizePreferences(state.preferences);
  state.tournament ||= { pendingState: null, lastSubmissionAt: null, submittedBy: null };
  deriveDifficultyTier();
}


function setNotice(text) {
  ui.notice = text;
  if (view === "control") renderControl();
}

function scheduleSave() {
  ui.saveStatus = "保存中";
  renderControlHeaderStatus();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveState, 220);
}

async function saveState() {
  try {
    deriveDifficultyTier();
    state = await apiJson(stateUrl, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(state),
    });
    ensureStateShape();
    lastStateJson = stableOverlayStateJson(state);
    ui.saveStatus = "保存済み";
  } catch (error) {
    ui.saveStatus = "保存失敗";
    console.error(error);
  }
  renderControlHeaderStatus();
}

function captureListScroll() {
  if (view !== "control") return null;
  const list = document.querySelector(".list-area");
  if (!list) return null;
  return {
    tab: ui.tab,
    scrollTop: list.scrollTop,
    scrollLeft: list.scrollLeft,
  };
}

function restoreListScroll(snapshot) {
  if (!snapshot || view !== "control" || snapshot.tab !== ui.tab) return;
  requestAnimationFrame(() => {
    const list = document.querySelector(".list-area");
    if (!list) return;
    list.scrollTop = snapshot.scrollTop;
    list.scrollLeft = snapshot.scrollLeft;
  });
}

function mutate(fn, options = {}) {
  const { render = true } = options;
  const scrollSnapshot = render ? captureListScroll() : null;
  fn(state);
  ensureStateShape();
  if (view === "control" && render) {
    renderControl();
    restoreListScroll(scrollSnapshot);
  }
  scheduleSave();
}

function setChoicePressed(element, active) {
  if (!element) return;
  element.classList.toggle("active", active);
  element.setAttribute("aria-pressed", active ? "true" : "false");
}

function refreshChoiceCountLabels() {
  const subtitle = document.querySelector(".panel-header .panel-subtitle");
  if (!subtitle) return;
  if (ui.tab === "relics") {
    subtitle.textContent = subtitle.textContent.replace(/所持\d+件/, `所持${state.relics.length}件`);
  } else if (ui.tab === "operators") {
    subtitle.textContent = subtitle.textContent.replace(/招集\d+名/, `招集${state.operators.length}名`);
  }
}

function toggleChoiceElement(element, type, id) {
  mutate((s) => controlActions.toggleChoice(s, type, id), { render: false });
  const active = type === "relic" ? state.relics.includes(id) : state.operators.includes(id);
  setChoicePressed(element, active);
  refreshChoiceCountLabels();
}

function renderControlHeaderStatus() {
  const el = document.querySelector(".save-status");
  if (el) el.textContent = ui.saveStatus;
}

function navButton(id, label, icon) {
  return `<button class="nav-button ${ui.tab === id ? "active" : ""}" data-action="tab" data-tab="${id}"><span class="nav-icon">${icon}</span><span>${label}</span></button>`;
}

function renderControl() {
  app.dataset.loading = "false";
  document.body.className = "";
  app.className = "control-app";
  app.innerHTML = `
    <header class="control-topbar">
      <div class="brand">
        <div class="brand-mark">IS</div>
        <div>
          <h1>Arknights Rogue OBS Tool</h1>
          <p>${html(getCampaign()?.fullTitle)} / ${html(state.mode || "manual")}</p>
        </div>
      </div>
      <div class="topbar-actions">
        <a href="/overlay" target="_blank">Overlay</a>
        <a href="/control" target="_self">Control</a>
        <span class="save-status">${html(ui.saveStatus)}</span>
        <button class="ghost" data-action="reset-state">リセット</button>
      </div>
    </header>
    <div class="control-layout">
      <nav class="control-nav">
        ${navButton("run", "ラン状態", "R")}
        ${navButton("relics", "秘宝", "T")}
        ${navButton("operators", "招集", "O")}
        ${navButton("flags", "ボス/大会", "F")}
        ${navButton("json", "入出力", "J")}
      </nav>
      <main class="control-main">
        ${ui.notice ? `<div class="panel" style="margin-bottom:14px"><div class="panel-body">${html(ui.notice)}</div></div>` : ""}
        ${renderCurrentTab()}
      </main>
    </div>
  `;
}

function renderCurrentTab() {
  if (ui.tab === "relics") return renderRelicsTab();
  if (ui.tab === "operators") return renderOperatorsTab();
  if (ui.tab === "flags") return renderFlagsTab();
  if (ui.tab === "json") return renderJsonTab();
  return renderRunTab();
}

function renderRunTab() {
  const campaign = getCampaign();
  const squads = getCampaignSquads();
  const selectedSquad = getSelectedSquad();
  const randomOptions = selectedSquad?.randomEffectOptions || [];
  const performances = getCampaignPerformances(campaign.id);
  const selectedPerformance = getSelectedPerformance();
  const activeEffects = getActiveEffects();
  const specialFields = campaign.specialFields || [];
  const special = state.run.special?.[campaign.id] || {};
  const specialTags = getSpecialTags(specialFields, special);
  const bossEntries = getBossFlagEntries(campaign.id);
  const tierCfg = master.difficultyTiers?.[campaign.id];
  const difficultyGrade = getSelectedDifficultyGrade();
  return `
    <section class="panel-grid">
      <div class="panel half">
        <div class="panel-header"><h2 class="panel-title">ラン基本情報</h2><span class="panel-subtitle">OBS表示の主状態</span></div>
        <div class="panel-body form-grid two">
          <label>統合戦略
            <select data-field="campaignId">
              ${master.campaigns.map((item) => `<option value="${item.id}" ${item.id === campaign.id ? "selected" : ""}>IS#${item.number} ${html(item.title)}</option>`).join("")}
            </select>
          </label>
          <label>等級 / 難易度
            ${renderDifficultySelect(campaign.id)}
          </label>
          <label class="field-wide">分隊
            <select data-field="squadId">
              <option value="">未選択</option>
              ${squads.map((item) => `<option value="${item.id}" ${item.id === state.run.squadId ? "selected" : ""}>${html(item.name)}</option>`).join("")}
            </select>
          </label>
          ${randomOptions.length ? `<label class="field-wide">ランダム分隊効果
            <select data-field="squadRandomEffectOptionId">
              <option value="">未選択</option>
              ${randomOptions.map((item) => `<option value="${item.id}" ${item.id === state.run.squadRandomEffectOptionId ? "selected" : ""}>${html(item.label || item.id)}</option>`).join("")}
            </select>
          </label>` : ""}
          ${performances.length ? `<label class="field-wide">演目
            ${renderPerformanceSelect(campaign.id)}
          </label>` : ""}
        </div>
      </div>
      <div class="panel half">
        <div class="panel-header"><h2 class="panel-title">特殊表示</h2><span class="panel-subtitle">シリーズ固有値</span></div>
        <div class="panel-body form-grid two">
          ${specialFields.length ? specialFields.map((field) => renderSpecialField(field, campaign.id, special)).join("") : `<div class="empty-state field-wide">この統合戦略に特殊表示はありません。</div>`}
        </div>
      </div>
      <div class="panel">
        <div class="panel-header"><h2 class="panel-title">OBSスクロール速度</h2><span class="panel-subtitle">0で停止 / 30が最速</span></div>
        <div class="panel-body form-grid">
          ${Object.keys(overlayScrollSpeedDefaults).map((key) => renderScrollSpeedControl(key)).join("")}
        </div>
      </div>
      <div class="panel">
        <div class="panel-header"><h2 class="panel-title">現在の表示サマリー</h2><span class="panel-subtitle">保存するとOverlayへ反映</span></div>
        <div class="panel-body">
          <div class="tag-list">
            <span class="tag accent">秘宝 ${state.relics.length}</span>
            <span class="tag info">招集 ${state.operators.length}</span>
            <span class="tag">ボス ${bossEntries.length}</span>
            <span class="tag">等級 ${html(difficultyGrade?.label || "未選択")}</span>
            <span class="tag">難易度ティア ${html(tierCfg ? getDifficultyTierLabel() : "対象外")}</span>
            ${performances.length ? `<span class="tag">演目 ${html(selectedPerformance?.title || "未選択")}</span>` : ""}
            ${specialTags.map((item) => `<span class="tag info">${html(item.label)} ${html(item.value)}</span>`).join("")}
          </div>
          ${selectedSquad ? `<p><strong>${html(selectedSquad.name)}</strong><br><span class="panel-subtitle">${html(selectedSquad.effect)}</span></p>` : `<p class="panel-subtitle">分隊は未選択です。</p>`}
          ${selectedPerformance ? `<p><strong>${html(selectedPerformance.name)}</strong><br><span class="panel-subtitle">${html(selectedPerformance.effect)}</span></p>` : ""}
          ${difficultyGrade ? renderDifficultyFields(difficultyGrade) : `<p class="panel-subtitle">等級は未選択です。</p>`}
          <div class="effect-block">
            <div class="effect-block-title">発動効果</div>
            ${renderEffectList(activeEffects, "control-effect-list", "分隊・演目・等級・秘宝の発動効果は未設定です。")}
          </div>
        </div>
      </div>
    </section>
  `;
}

function getRelicListView() {
  const relics = getCampaignRelics();
  const q = normalizeText(ui.relicSearch);
  const filtered = relics.filter((item) => {
    if (ui.relicCategory !== "all" && (item.category || "未分類") !== ui.relicCategory) return false;
    if (!q) return true;
    return normalizeText(`${item.number} ${item.name} ${item.category} ${item.effect}`).includes(q);
  });
  return {
    filtered,
    shown: filtered.slice(0, 500),
    owned: new Set(state.relics),
    gridColumns: getRelicGridColumns(),
  };
}

function renderRelicListContent(viewData) {
  return renderRelicListContentComponent(viewData, renderRelicControlRow);
}

function renderRelicListArea(viewData) {
  return renderRelicListAreaComponent(viewData, renderRelicListContent);
}

function refreshRelicListOnly() {
  if (view !== "control" || ui.tab !== "relics") return false;
  const viewData = getRelicListView();
  const subtitle = document.querySelector(".panel-header .panel-subtitle");
  if (subtitle) subtitle.textContent = `${viewData.filtered.length}件 / 所持${viewData.owned.size}件`;
  const list = document.querySelector(".relic-pick-grid");
  if (!list) return false;
  list.style.setProperty("--relic-grid-columns", viewData.gridColumns);
  list.innerHTML = renderRelicListContent(viewData);
  return true;
}

function renderRelicsTab() {
  const relics = getCampaignRelics();
  const categories = [...new Set(relics.map((item) => item.category || "未分類"))];
  const viewData = getRelicListView();
  return `
    <section class="panel-grid">
      <div class="panel">
        <div class="panel-header"><h2 class="panel-title">秘宝所持</h2><span class="panel-subtitle">${viewData.filtered.length}件 / 所持${viewData.owned.size}件</span></div>
        <div class="panel-body">
          <div class="search-strip relic-filter-strip">
            <label>検索<input value="${html(ui.relicSearch)}" data-ui="relicSearch" placeholder="秘宝名、番号、効果" /></label>
            <label>カテゴリ<select data-ui="relicCategory"><option value="all">すべて</option>${categories.map((cat) => `<option value="${html(cat)}" ${cat === ui.relicCategory ? "selected" : ""}>${html(cat)}</option>`).join("")}</select></label>
            <label>表示列<select data-field="relicGridColumns">${gridColumnOptions.map((count) => `<option value="${count}" ${count === viewData.gridColumns ? "selected" : ""}>${count}列</option>`).join("")}</select></label>
            <button data-action="clear-relics">秘宝を全解除</button>
          </div>
          ${renderRelicListArea(viewData)}
        </div>
      </div>
    </section>
  `;
}

function renderRelicControlRow(item, active) {
  return renderRelicControlRowComponent(item, active, relicEffectForDisplay(item));
}

function renderOperatorsTab() {
  normalizeOperatorFilters();
  const releaseBase = master.operators.filter(operatorReleaseMatches);
  const rarityOptions = [6, 5, 4, 3, 2, 1].filter((rarity) => releaseBase.some((item) => Number(item.rarity) === rarity));
  const rarityBase = releaseBase.filter((item) => ui.operatorRarity === "all" || String(item.rarity) === ui.operatorRarity);
  const classOptions = uniqueValues(rarityBase, "class");
  const classBase = rarityBase.filter((item) => ui.operatorClass === "all" || item.class === ui.operatorClass);
  const branchOptions = uniqueValues(classBase, "branch");
  const operators = classBase.filter((item) => ui.operatorBranch === "all" || item.branch === ui.operatorBranch);
  const shown = sortOperators(operators).slice(0, 500);
  const selected = new Set(state.operators);
  const gridColumns = getOperatorGridColumns();
  return `
    <section class="panel-grid">
      <div class="panel">
        <div class="panel-header"><h2 class="panel-title">招集オペレーター</h2><span class="panel-subtitle">${operators.length}件 / 招集${selected.size}名</span></div>
        <div class="panel-body">
          <div class="search-strip operator-filter-strip">
            <label>実装状態<select data-ui="operatorRelease"><option value="released" ${ui.operatorRelease === "released" ? "selected" : ""}>日本実装のみ</option><option value="all" ${ui.operatorRelease === "all" ? "selected" : ""}>すべて</option><option value="unreleased" ${ui.operatorRelease === "unreleased" ? "selected" : ""}>日本未実装のみ</option></select></label>
            <label>レア度<select data-ui="operatorRarity"><option value="all">すべて</option>${rarityOptions.map((rarity) => `<option value="${rarity}" ${String(rarity) === ui.operatorRarity ? "selected" : ""}>★${rarity}</option>`).join("")}</select></label>
            <label>職業<select data-ui="operatorClass"><option value="all">すべて</option>${classOptions.map((value) => `<option value="${html(value)}" ${value === ui.operatorClass ? "selected" : ""}>${html(value)}</option>`).join("")}</select></label>
            <label>職分<select data-ui="operatorBranch"><option value="all">すべて</option>${branchOptions.map((value) => `<option value="${html(value)}" ${value === ui.operatorBranch ? "selected" : ""}>${html(value)}</option>`).join("")}</select></label>
            <label>並び順<select data-field="operatorSort"><option value="rarity_desc" ${state.preferences.operatorSort === "rarity_desc" ? "selected" : ""}>レア度 高い順</option><option value="rarity_asc" ${state.preferences.operatorSort === "rarity_asc" ? "selected" : ""}>レア度 低い順</option><option value="name" ${state.preferences.operatorSort === "name" ? "selected" : ""}>名前順</option></select></label>
            <label>表示列<select data-field="operatorGridColumns">${gridColumnOptions.map((count) => `<option value="${count}" ${count === gridColumns ? "selected" : ""}>${count}列</option>`).join("")}</select></label>
          </div>
          ${renderOperatorListAreaComponent({ shown, operators, selected, gridColumns }, renderOperatorControlRow)}
        </div>
      </div>
    </section>
  `;
}
function renderOperatorControlRow(item, active) {
  return renderOperatorControlRowComponent(item, active);
}

function renderBossToggleSection(section, campaignId) {
  const selected = new Set(bossSelectionValues(section, campaignId));
  const helper = section.helper ? '<small>' + html(section.helper) + '</small>' : "";
  const options = (section.options || []).map((item) => {
    const checked = selected.has(item.id);
    const title = bossDisplayTitle(item);
    const subline = bossDisplaySubline(item, title);
    return '<label class="boss-toggle-option ' + (checked ? "selected" : "") + '">' +
      '<input type="checkbox" value="' + html(item.id) + '" data-boss-toggle="' + html(section.field) + '" ' + (checked ? "checked" : "") + ' />' +
      '<span><strong>' + html(title) + '</strong><em>' + html([item.label, subline].filter(Boolean).join(" / ")) + '</em></span>' +
    '</label>';
  }).join("");
  return '<div class="boss-toggle-section field-wide">' +
    '<div class="boss-toggle-title"><span>' + html(section.label || "ボスフラグ") + '</span>' + helper + '</div>' +
    '<div class="boss-toggle-grid">' + options + '</div>' +
  '</div>';
}

function renderBossSelector(section, campaignId) {
  if (bossSectionAllowsMultiple(section)) return renderBossToggleSection(section, campaignId);
  const value = getBossSelection(campaignId)[section.field] || "";
  const options = (section.options || []).map((item) => {
    const prefix = item.optionLabel || item.group || item.label || "";
    const name = item.stageName && item.bossName ? item.stageName + " / " + item.bossName : (item.stageName || item.bossName || item.title);
    const text = [prefix, name].filter(Boolean).join(" - ");
    return '<option value="' + html(item.id) + '" ' + (item.id === value ? "selected" : "") + '>' + html(text) + '</option>';
  }).join("");
  return '<label>' + html(section.label || "ボス") +
    '<select data-boss-select="' + html(section.field) + '">' +
      '<option value="">未確認</option>' + options +
    '</select>' +
  '</label>';
}
function renderFlagsTab() {
  const campaign = getCampaign();
  const pending = state.tournament?.pendingState;
  const entries = getBossFlagEntries(campaign.id);
  const sections = getBossManualSections(campaign.id);
  const bossConfig = getBossConfig(campaign.id);
  const bossFlagSubtitle = bossConfig?.derivedFromRelics === false ? "手動切り替え / ランダム・追加ルートを統合表示" : "秘宝所持から自動判定 / ランダム・異相は手動選択";
  return `
    <section class="panel-grid">
      <div class="panel">
        <div class="panel-header"><h2 class="panel-title">ボスフラグ</h2><span class="panel-subtitle">${html(bossFlagSubtitle)}</span></div>
        <div class="panel-body form-grid two">
          ${sections.length ? sections.map((section) => renderBossSelector(section, campaign.id)).join("") : `<div class="empty-state field-wide">この統合戦略のボスフラグ定義は未登録です。</div>`}
          <div class="field-wide boss-card-grid">
            ${entries.length ? entries.map((entry) => renderBossCard(entry)).join("") : `<div class="empty-state">ボスフラグは未設定です。</div>`}
          </div>
        </div>
      </div>
      <div class="panel half">
        <div class="panel-header"><h2 class="panel-title">手動メモ</h2><span class="panel-subtitle">大会・例外用の自由入力</span></div>
        <div class="panel-body form-grid one">
          <label>追加するメモ<input value="${html(ui.bossDraft)}" data-ui="bossDraft" placeholder="例: 3層で緊急、特殊ルールなど" /></label>
          <button class="primary" data-action="add-boss-flag">追加</button>
          <div class="tag-list">
            ${(state.bossFlags || []).map((flag, index) => `<span class="tag accent">${html(flag)} <button class="icon ghost" data-action="remove-boss-flag" data-index="${index}" title="削除">x</button></span>`).join("") || `<span class="panel-subtitle">未設定</span>`}
          </div>
        </div>
      </div>
      <div class="panel half">
        <div class="panel-header"><h2 class="panel-title">大会入力</h2><span class="panel-subtitle">レビューしてから反映</span></div>
        <div class="panel-body">
          ${pending ? `<p>保留中の提出があります。</p><div class="inline-row"><button class="primary" data-action="approve-tournament">反映</button><button data-action="reject-tournament">破棄</button></div>` : `<div class="empty-state">保留中の大会入力はありません。JSON入出力タブから提出できます。</div>`}
        </div>
      </div>
      <div class="panel">
        <div class="panel-header"><h2 class="panel-title">OCR候補</h2><span class="panel-subtitle">今後ADB/OCRからここへ入る</span></div>
        <div class="panel-body">
          ${(state.pendingSuggestions || []).length ? state.pendingSuggestions.map((item, index) => `<div class="item-row compact"><div><div class="item-title">${html(item.label || item.type || "候補")}</div><div class="item-meta">${html(item.rawText || item.value || "")}</div></div><button data-action="dismiss-suggestion" data-index="${index}">削除</button></div>`).join("") : `<div class="empty-state">候補はありません。</div>`}
        </div>
      </div>
    </section>
  `;
}
function renderJsonTab() {
  const exportJson = JSON.stringify(state, null, 2);
  return `
    <section class="panel-grid">
      <div class="panel half">
        <div class="panel-header"><h2 class="panel-title">現在状態をエクスポート</h2><span class="panel-subtitle">大会共有・バックアップ用</span></div>
        <div class="panel-body form-grid one">
          <textarea readonly>${html(exportJson)}</textarea>
          <button data-action="copy-state-json">コピー</button>
        </div>
      </div>
      <div class="panel half">
        <div class="panel-header"><h2 class="panel-title">JSONインポート</h2><span class="panel-subtitle">直接反映または大会提出</span></div>
        <div class="panel-body form-grid one">
          <textarea data-ui="importDraft" placeholder="状態JSONを貼り付け">${html(ui.importDraft)}</textarea>
          <div class="inline-row"><button class="primary" data-action="import-state-now">直接反映</button><button data-action="submit-tournament-state">大会入力として保留</button></div>
        </div>
      </div>
    </section>
  `;
}

function renderOverlayContext() {
  return {
    mode: state.mode,
    getSpecialTags,
    getOverlaySpecialEffects,
    getBossFlagEntries,
    getDifficultyTierLabel,
    getOverlayScrollSpeed,
    renderSpecialOverlayBlock,
    renderEffectList,
    renderBossChip,
    renderBossCard,
    renderDifficultyFields,
    relicEffectForDisplay,
  };
}

function renderOverlayCompact(args) {
  return renderOverlayCompactComponent(args, renderOverlayContext());
}

function renderOverlayDense(args) {
  return renderOverlayDenseComponent(args, renderOverlayContext());
}

function renderOverlay() {
  cancelOverlayAutoScroll();
  app.dataset.loading = "false";
  app.className = `overlay-app overlay-${overlayLayout} overlay-size-${overlaySize}`;
  document.body.className = "overlay-body";
  const campaign = getCampaign();
  const squad = getSelectedSquad();
  const option = getSelectedSquadOption(squad);
  const relics = getOwnedRelics();
  const operators = getRecruitedOperators();
  const specialFields = campaign.specialFields || [];
  const special = state.run.special?.[campaign.id] || {};
  const difficultyGrade = getSelectedDifficultyGrade();
  const performance = getSelectedPerformance();
  const activeEffects = getActiveEffects({ overlay: true });
  if (overlayLayout === "compact") {
    app.innerHTML = renderOverlayCompact({ campaign, squad, option, performance, activeEffects, relics, operators, specialFields, special, difficultyGrade });
    setupOverlayAutoScroll(app);
    return;
  }
  if (overlayLayout === "vertical" || overlayLayout === "horizontal") {
    app.innerHTML = renderOverlayDense({ campaign, squad, option, performance, activeEffects, relics, operators, specialFields, special, difficultyGrade, orientation: overlayLayout });
    setupOverlayAutoScroll(app);
    return;
  }
  app.innerHTML = renderOverlayDefaultComponent({
    campaign,
    squad,
    option,
    performance,
    activeEffects,
    relics,
    operators,
    specialFields,
    special,
    difficultyGrade,
    mode: state.mode,
    runDifficulty: state.run.difficulty,
    updatedAt: state.updatedAt,
    bossFlagCount: state.bossFlags.length,
  }, renderOverlayContext());
  setupOverlayAutoScroll(app);
}


function parseImportDraft() {
  if (!ui.importDraft.trim()) throw new Error("JSONが空です");
  const parsed = JSON.parse(ui.importDraft);
  if (!parsed || typeof parsed !== "object") throw new Error("状態JSONではありません");
  return parsed;
}

app.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button || view !== "control") return;
  const action = button.dataset.action;
  const id = button.dataset.id;

  if (action === "add-special-effect") {
    const fieldId = button.dataset.specialPickerField;
    const container = button.closest("[data-special-picker]");
    const value = container?.querySelector("[data-special-picker-select]")?.value;
    if (fieldId && value) {
      mutate((s) => controlActions.addSpecialEffect(s, getCampaign().id, fieldId, value));
    }
    return;
  }
  if (action === "remove-special-effect") {
    const fieldId = button.dataset.specialPickerField;
    if (fieldId && id) {
      mutate((s) => controlActions.removeSpecialEffect(s, getCampaign().id, fieldId, id));
    }
    return;
  }
  if (action === "add-effect-stack-entry") {
    const fieldId = button.dataset.effectStackField;
    const container = button.closest("[data-effect-stack-builder]");
    const effectId = container?.querySelector('[data-effect-stack-input="effect"]')?.value;
    if (fieldId && effectId) {
      const campaignId = getCampaign().id;
      const fieldConfig = getSpecialFieldConfig(campaignId, fieldId) || { id: fieldId };
      const count = clampCoinCount(container?.querySelector('[data-effect-stack-input="count"]')?.value);
      const stateId = normalizeStackState(fieldConfig, container?.querySelector('[data-effect-stack-input="state"]')?.value, campaignId);
      mutate((s) => controlActions.addEffectStackEntry(s, campaignId, fieldId, { effectId, count, stateId }, fieldConfig, mergeEffectStackEntries));
    }
    return;
  }
  if (action === "remove-effect-stack-entry") {
    const fieldId = button.dataset.effectStackField;
    const index = Number(button.dataset.index);
    if (fieldId && Number.isInteger(index)) {
      mutate((s) => controlActions.removeEffectStackEntry(s, getCampaign().id, fieldId, index));
    }
    return;
  }
  if (action === "add-coin-entry") {
    const fieldId = button.dataset.coinField;
    const container = button.closest("[data-coin-builder]");
    const coinId = container?.querySelector('[data-coin-input="coin"]')?.value;
    if (fieldId && coinId) {
      const count = clampCoinCount(container?.querySelector('[data-coin-input="count"]')?.value);
      const statusId = container?.querySelector('[data-coin-input="status"]')?.value || null;
      const face = normalizeCoinFace(container?.querySelector('[data-coin-input="face"]')?.value);
      mutate((s) => controlActions.addCoinEntry(s, getCampaign().id, fieldId, { coinId, count, statusId, face }));
    }
    return;
  }
  if (action === "remove-coin-entry") {
    const fieldId = button.dataset.coinField;
    const index = Number(button.dataset.index);
    if (fieldId && Number.isInteger(index)) {
      mutate((s) => controlActions.removeCoinEntry(s, getCampaign().id, fieldId, index));
    }
    return;
  }
  if (action === "tab") { ui.tab = button.dataset.tab; renderControl(); return; }
  if (action === "toggle-relic") { toggleChoiceElement(button, "relic", id); return; }
  if (action === "toggle-operator") { toggleChoiceElement(button, "operator", id); return; }
  if (action === "clear-relics") mutate(controlActions.clearRelics);
  if (action === "reset-state") {
    if (confirm("状態を初期化しますか？")) {
      state = await apiJson(resetStateUrl, { method: "POST" });
      ensureStateShape();
      renderControl();
      setNotice("状態を初期化しました。");
    }
  }
  if (action === "add-boss-flag") {
    const text = ui.bossDraft.trim();
    if (text) mutate((s) => { controlActions.addBossFlag(s, text); ui.bossDraft = ""; });
  }
  if (action === "remove-boss-flag") mutate((s) => controlActions.removeBossFlag(s, Number(button.dataset.index)));
  if (action === "dismiss-suggestion") mutate((s) => controlActions.dismissSuggestion(s, Number(button.dataset.index)));
  if (action === "copy-state-json") {
    await navigator.clipboard.writeText(JSON.stringify(state, null, 2));
    setNotice("状態JSONをコピーしました。");
  }
  if (action === "import-state-now") {
    try {
      state = parseImportDraft();
      ensureStateShape();
      renderControl();
      scheduleSave();
      setNotice("JSONを直接反映しました。");
    } catch (error) { setNotice(error.message); }
  }
  if (action === "submit-tournament-state") {
    try {
      const pending = parseImportDraft();
      mutate((s) => controlActions.holdTournamentState(s, pending));
      setNotice("大会入力として保留しました。ボス/大会タブで反映できます。");
    } catch (error) { setNotice(error.message); }
  }
  if (action === "approve-tournament") {
    const pending = state.tournament?.pendingState;
    if (pending) {
      state = pending;
      ensureStateShape();
      state.tournament = { pendingState: null, lastSubmissionAt: null, submittedBy: null };
      renderControl();
      scheduleSave();
      setNotice("大会入力を反映しました。");
    }
  }
  if (action === "reject-tournament") mutate(controlActions.clearTournamentState);
});

app.addEventListener("keydown", (event) => {
  if (view !== "control") return;
  if (event.key !== "Enter" && event.key !== " ") return;
  const target = event.target.closest('.operator-choice[data-action="toggle-operator"], .relic-choice[data-action="toggle-relic"]');
  if (!target) return;
  event.preventDefault();
  const id = target.dataset.id;
  if (target.dataset.action === "toggle-relic") {
    toggleChoiceElement(target, "relic", id);
  } else {
    toggleChoiceElement(target, "operator", id);
  }
});
app.addEventListener("input", (event) => {
  if (view !== "control") return;
  const target = event.target;
  if (!target.matches("[data-ui]")) return;
  const key = target.dataset.ui;
  ui[key] = target.value;
  if (key === "relicSearch") {
    if (!event.isComposing && !refreshRelicListOnly()) renderControl();
  }
});

app.addEventListener("compositionend", (event) => {
  if (view !== "control") return;
  const target = event.target;
  if (!target.matches('[data-ui="relicSearch"]')) return;
  ui.relicSearch = target.value;
  if (!refreshRelicListOnly()) renderControl();
});

app.addEventListener("change", (event) => {
  if (view !== "control") return;
  const target = event.target;
  if (target.matches("[data-ui]")) {
    ui[target.dataset.ui] = target.value;
    renderControl();
    return;
  }
  const field = target.dataset.field;
  if (field) {
    mutate((s) => controlActions.updateRunField(s, field, target.value, target.checked));
  }
  const bossSelect = target.dataset.bossSelect;
  if (bossSelect) {
    mutate((s) => controlActions.updateBossSelect(s, getCampaign().id, bossSelect, target.value));
  }
  const bossToggle = target.dataset.bossToggle;
  if (bossToggle) {
    mutate((s) => controlActions.updateBossToggle(s, getCampaign().id, bossToggle, target.value, target.checked));
  }
  const specialVisibility = target.dataset.specialVisibility;
  if (specialVisibility) {
    const campaign = getCampaign();
    const fieldConfig = (campaign.specialFields || []).find((field) => field.id === specialVisibility) || { id: specialVisibility };
    const key = getSpecialOverlayToggleKey(fieldConfig);
    mutate((s) => controlActions.updateSpecialVisibility(s, campaign.id, key, target.checked));
  }
  const specialField = target.dataset.specialField;
  if (specialField) {
    const campaignId = getCampaign().id;
    const fieldConfig = getSpecialFieldConfig(campaignId, specialField);
    mutate((s) => controlActions.updateSpecialField(s, campaignId, specialField, target.value, fieldConfig));
  }
  const specialEffectToggle = target.dataset.specialEffectToggle;
  if (specialEffectToggle) {
    mutate((s) => controlActions.updateSpecialEffectToggle(s, getCampaign().id, specialEffectToggle, target.value, target.checked));
  }
  const specialRankedField = target.dataset.specialRankedField;
  if (specialRankedField) {
    mutate((s) => controlActions.updateSpecialRankedField(s, getCampaign().id, specialRankedField, target.dataset.effectParent, target.value));
  }

  const effectStackEntryCount = target.dataset.effectStackEntryCount;
  if (effectStackEntryCount) {
    const campaignId = getCampaign().id;
    const fieldConfig = getSpecialFieldConfig(campaignId, effectStackEntryCount) || { id: effectStackEntryCount };
    mutate((s) => controlActions.updateEffectStackEntryCount(s, campaignId, effectStackEntryCount, Number(target.dataset.index), target.value, fieldConfig, mergeEffectStackEntries));
  }
  const effectStackEntryState = target.dataset.effectStackEntryState;
  if (effectStackEntryState) {
    const campaignId = getCampaign().id;
    const fieldConfig = getSpecialFieldConfig(campaignId, effectStackEntryState) || { id: effectStackEntryState };
    const stateId = normalizeStackState(fieldConfig, target.value, campaignId);
    mutate((s) => controlActions.updateEffectStackEntryState(s, campaignId, effectStackEntryState, Number(target.dataset.index), stateId, fieldConfig, mergeEffectStackEntries));
  }
  const coinEntryCount = target.dataset.coinEntryCount;
  if (coinEntryCount) {
    mutate((s) => controlActions.updateCoinEntryCount(s, getCampaign().id, coinEntryCount, Number(target.dataset.index), target.value));
  }
  const coinEntryStatus = target.dataset.coinEntryStatus;
  if (coinEntryStatus) {
    mutate((s) => controlActions.updateCoinEntryStatus(s, getCampaign().id, coinEntryStatus, Number(target.dataset.index), target.value));
  }
  const coinEntryFace = target.dataset.coinEntryFace;
  if (coinEntryFace) {
    mutate((s) => controlActions.updateCoinEntryFace(s, getCampaign().id, coinEntryFace, Number(target.dataset.index), target.value));
  }
});

async function pollOverlay() {
  try {
    const next = await apiJson(stateUrl);
    state = next;
    ensureStateShape();
    const json = stableOverlayStateJson(state);
    if (json !== lastStateJson) {
      lastStateJson = json;
      renderOverlay();
    }
  } catch (error) {
    console.error(error);
  } finally {
    setTimeout(pollOverlay, 1000);
  }
}

async function boot() {
  try {
    const [masterData, initialState] = await Promise.all([apiJson(masterUrl), apiJson(stateUrl)]);
    master = masterData;
    state = initialState;
    buildMaps();
    ensureStateShape();
    lastStateJson = stableOverlayStateJson(state);
    if (view === "overlay") {
      renderOverlay();
      pollOverlay();
    } else {
      ui.saveStatus = "保存済み";
      renderControl();
    }
  } catch (error) {
    app.dataset.loading = "false";
    app.innerHTML = `<div class="empty-state">起動に失敗しました: ${html(error.message)}</div>`;
    console.error(error);
  }
}

boot();




