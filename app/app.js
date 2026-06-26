import { bossDisplaySubline, bossDisplayTitle, renderBossCard, renderBossChip } from "./components/boss.js";
import { renderOperatorControlRow as renderOperatorControlRowComponent, renderRelicControlRow as renderRelicControlRowComponent } from "./components/choice-cards.js";
import { renderOperatorListArea as renderOperatorListAreaComponent, renderRelicListArea as renderRelicListAreaComponent, renderRelicListContent as renderRelicListContentComponent } from "./components/choice-lists.js";
import { renderOverlayCompact as renderOverlayCompactComponent, renderOverlayDefault as renderOverlayDefaultComponent, renderOverlayDense as renderOverlayDenseComponent } from "./components/overlay-layouts.js";
import { overlayPartOptions, renderOverlayPart as renderOverlayPartComponent } from "./components/overlay-parts.js";
import { renderEffectList } from "./components/effects.js";
import * as specialControls from "./components/special-controls.js";
import { renderCompactSpecialPicker as renderCompactSpecialPickerComponent, renderSpecialField as renderSpecialFieldComponent } from "./components/special-fields.js";
import { renderCoinEntryRow as renderCoinEntryRowComponent, renderCoinLoadoutField as renderCoinLoadoutFieldComponent, renderEffectStackEntryRow as renderEffectStackEntryRowComponent, renderEffectStackLoadoutField as renderEffectStackLoadoutFieldComponent, renderEffectStackStateOptions as renderEffectStackStateOptionsComponent, renderRevelationBoardLoadoutField as renderRevelationBoardLoadoutFieldComponent } from "./components/special-loadouts.js";
import { renderSpecialOverlayBlock as renderSpecialOverlayBlockComponent } from "./components/special-overlay.js";
import { registerControlEvents } from "./control-events.js";
import { bossSectionAllowsMultiple, bossSelectionValues as readBossSelectionValues, buildBossFlagEntries, getBossManualSections as readBossManualSections, getSelectedFloor3Boss as readSelectedFloor3Boss, getSelectedManualBosses as readSelectedManualBosses, normalizeBossSelections as normalizeBossSelectionsState } from "./domain/boss-flags.js";
import { createLookupMaps } from "./domain/master-maps.js";
import { applyDifficultyTier, difficultyEffectTexts, difficultySummary as summarizeDifficultyGrade, getDifficultyGradeConfig as readDifficultyGradeConfig, getDifficultyTierLabel as readDifficultyTierLabel, getSelectedDifficultyGrade as readSelectedDifficultyGrade } from "./domain/difficulty.js";
import { isActiveManualRule, summarizeRelicEffects as summarizeRelicEffectMetrics, summarizeTextEffects } from "./domain/effect-metrics.js";
import { getOperatorFilterView, sortOperators as sortOperatorsByPreference } from "./domain/operators.js";
import { getRelicCategories, getRelicListView as buildRelicListView } from "./domain/relics.js";
import { buildStartTemplateSummary, getEffectiveRelicIds, mergeEffectiveSpecial, phaseLabel } from "./domain/start-templates.js";
import { controlModeOptions, getControlMode, getModeOrderedTabs, normalizeControlMode } from "./domain/ui-modes.js";
import { controlV2ScreenOptions, getControlV2ScreenMeta, normalizeControlV2Screen } from "./domain/control-v2-screens.js";
import { apiJson, masterUrl, resetStateUrl, stateUrl } from "./lib/api.js";
import { asCoinEntries, asSpecialArray, asSpecialObject, clampSpecialNumber } from "./domain/special-values.js";
import * as selectableEffects from "./domain/selectable-effects.js";
import * as specialLoadouts from "./domain/special-loadouts.js";
import * as specialDisplay from "./domain/special-display.js";
import { assetUrl, html, stableOverlayStateJson, stars } from "./lib/format.js";
import { clampOverlayScrollSpeed, isOverlayScrollSpeedField, overlayScrollSpeedDefaults, overlayScrollSpeedLabels, resolveOverlayLayout, resolveOverlayPart, resolveOverlaySize } from "./lib/overlay-config.js";
import { mediaUrl } from "./lib/media.js";
import { clampGridColumns, gridColumnOptions, normalizePreferences } from "./lib/preferences.js";
import { resolveAppView } from "./lib/view-route.js";
import { cancelOverlayAutoScroll, setupOverlayAutoScroll } from "./overlay/autoscroll.js";
import { RUN_STAT_FIELDS, formatRunStatValue, normalizeRunStats, runStatDisplayItems } from "./domain/run-stats.js";
import { getRecognitionScanActions } from "./domain/recognition/scan-actions.js";

const app = document.querySelector("#app");
const routeParams = new URLSearchParams(location.search);
const view = resolveAppView(location.pathname, location.search);
const overlayPart = resolveOverlayPart(routeParams.get("part") || location.pathname.match(/^\/overlay\/part\/([^/]+)/)?.[1]);
const overlayLayout = resolveOverlayLayout(routeParams.get("layout"));
const overlaySize = resolveOverlaySize(routeParams.get("size") || routeParams.get("scale"));
if (view === "overlay") document.documentElement.classList.add("overlay-mode");

const controlTabs = [
  { id: "run", label: "ラン状態", icon: "R" },
  { id: "relics", label: "秘宝", icon: "T" },
  { id: "operators", label: "招集", icon: "O" },
  { id: "flags", label: "ボス/大会", icon: "F" },
  { id: "obs", label: "OBSパーツ", icon: "P" },
  { id: "json", label: "入出力", icon: "J" },
];

const ui = {
  tab: controlTabs.some((tab) => tab.id === routeParams.get("tab")) ? routeParams.get("tab") : "run",
  controlV2Screen: normalizeControlV2Screen(routeParams.get("screen") || (["operators", "relics"].includes(routeParams.get("choice")) ? routeParams.get("choice") : "common")),
  controlV2ChoiceTab: ["operators", "relics"].includes(routeParams.get("choice")) ? routeParams.get("choice") : "operators",
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

function renderRunStatInputs(extraClass = "") {
  const className = ["run-stat-input-grid", "field-wide", extraClass].filter(Boolean).join(" ");
  return `<div class="${className}" aria-label="ラン基本値">
    ${RUN_STAT_FIELDS.map((field) => `<label>${html(field.label)}<input type="number" min="${field.min}" max="${field.max}" step="1" inputmode="numeric" data-field="${field.id}" value="${html(formatRunStatValue(state.run, field.id) === "-" ? "" : formatRunStatValue(state.run, field.id))}" placeholder="-" /></label>`).join("")}
  </div>`;
}

function renderRunStatTags() {
  return runStatDisplayItems(state.run).map((item) => `<span class="tag">${html(item.label)} ${html(item.value)}</span>`).join("");
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
  return specialLoadouts.normalizeEffectStackEntry(field, entry, campaignId, getSelectableEffectSource());
}

function mergeEffectStackEntries(field, entries, campaignId = getCampaign()?.id) {
  return specialLoadouts.mergeEffectStackEntries(field, entries, campaignId, getSelectableEffectSource());
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

function getCurrentControlMode() {
  return getControlMode(state?.mode);
}

function renderControlModeOptions() {
  const selected = getCurrentControlMode().id;
  return controlModeOptions.map((option) => `<option value="${option.id}" ${option.id === selected ? "selected" : ""}>${html(option.label)}</option>`).join("");
}

function renderModeCards() {
  const selected = getCurrentControlMode().id;
  return controlModeOptions.map((option) => `
    <label class="mode-card ${option.id === selected ? "active" : ""}">
      <input type="radio" name="control-mode" data-field="mode" value="${option.id}" ${option.id === selected ? "checked" : ""}>
      <span class="mode-card-title">${html(option.label)}</span>
      <span class="mode-card-meta">${html(option.subtitle)}</span>
      <span class="mode-card-copy">${html(option.description)}</span>
    </label>
  `).join("");
}

function renderModeOrderedNavButtons() {
  const tabMap = new Map(controlTabs.map((tab) => [tab.id, tab]));
  return getModeOrderedTabs(state?.mode, controlTabs.map((tab) => tab.id))
    .map((tabId) => tabMap.get(tabId))
    .filter(Boolean)
    .map((tab) => navButton(tab.id, tab.label, tab.icon))
    .join("");
}

function absoluteAppUrl(path) {
  return `${location.origin}${path}`;
}

function renderObsPartCards() {
  return overlayPartOptions.map((item) => renderObsUrlCard(item.label, item.hint, `/overlay/part/${item.id}`)).join("");
}

function renderObsUrlCard(title, subtitle, path) {
  const url = absoluteAppUrl(path);
  return `
    <div class="obs-url-card">
      <div class="obs-url-head">
        <strong>${html(title)}</strong>
        <span>${html(subtitle)}</span>
      </div>
      <input readonly value="${html(url)}" aria-label="${html(title)} URL">
      <div class="obs-url-actions">
        <button type="button" data-action="copy-text" data-copy-label="${html(title)}" data-value="${html(url)}">URLをコピー</button>
        <a href="${html(path)}" target="_blank" rel="noreferrer">プレビューを開く</a>
      </div>
    </div>
  `;
}

function getCoinStatusOptions(field, campaignId = getCampaign()?.id) {
  return selectableEffects.getCoinStatusOptions(getSelectableEffectSource(), field, campaignId);
}

function getEffectStackOptions(field, campaignId = getCampaign()?.id) {
  return selectableEffects.getEffectStackOptions(getSelectableEffectSource(), field, campaignId);
}

function getRevelationBoardOptions(field, campaignId = getCampaign()?.id, group) {
  return selectableEffects.getRevelationBoardOptions(getSelectableEffectSource(), field, campaignId, group);
}

function normalizeRevelationBoardValue(field, campaignId, value) {
  return specialLoadouts.normalizeRevelationBoardValue(field, campaignId, value, getSelectableEffectSource());
}

function formatRevelationBoardValue(field, value) {
  return specialDisplay.formatRevelationBoardValue(field, value, getSpecialDisplayContext());
}

function normalizeEffectStackEntries(field, campaignId, value) {
  return specialLoadouts.normalizeEffectStackEntries(field, campaignId, value, getSelectableEffectSource());
}

function normalizeCoinLoadoutEntries(field, campaignId, value) {
  return specialLoadouts.normalizeCoinLoadoutEntries(field, campaignId, value, getSelectableEffectSource());
}

function getRankedEffectGroups(field, campaignId = getCampaign()?.id) {
  return selectableEffects.getRankedEffectGroups(getSelectableEffectSource(), field, campaignId);
}

function getSpecialDisplayContext(campaignId = getCampaign()?.id) {
  return {
    campaignId,
    selectableEffectMap: maps.selectableEffect,
    selectableEffectSource: getSelectableEffectSource(),
  };
}

function getSpecialEffectName(id) {
  return specialDisplay.getSpecialEffectName(id, maps.selectableEffect);
}

function formatCoinLoadoutValue(field, value) {
  return specialDisplay.formatCoinLoadoutValue(field, value, getSpecialDisplayContext());
}

function formatEffectStackValue(field, value) {
  return specialDisplay.formatEffectStackValue(field, value, getSpecialDisplayContext());
}

function formatSpecialValue(field, value) {
  return specialDisplay.formatSpecialValue(field, value, getSpecialDisplayContext());
}

function getSpecialOverlayToggleKey(field) {
  return specialDisplay.getSpecialOverlayToggleKey(field);
}

function isSpecialFieldVisibleOnOverlay(field, special) {
  return specialDisplay.isSpecialFieldVisibleOnOverlay(field, special);
}

function getSpecialTags(specialFields, special, options = {}) {
  return specialDisplay.getSpecialTags(specialFields, special, getSpecialDisplayContext(), options);
}

function getSelectedSpecialEffectsForField(field, special, campaignId = getCampaign()?.id) {
  return specialDisplay.getSelectedSpecialEffectsForField(field, special, getSpecialDisplayContext(campaignId));
}

function getSelectedSpecialEffects(campaignId = getCampaign()?.id, options = {}) {
  const campaign = maps.campaign.get(campaignId);
  const special = options.includeStartTemplates ? getEffectiveSpecial(campaignId) : state.run.special?.[campaignId] || {};
  return specialDisplay.getSelectedSpecialEffects(campaign?.specialFields || [], special, getSpecialDisplayContext(campaignId), options);
}

function getOverlaySpecialEffects(campaignId, specialFields, special) {
  return specialDisplay.getOverlaySpecialEffects(specialFields, special, getSpecialDisplayContext(campaignId));
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
    renderRevelationBoardLoadoutField,
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
    getRevelationBoardOptions,
    normalizeRevelationBoardValue,
    formatRevelationBoardValue,
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

function renderRevelationBoardLoadoutField(field, campaignId, special) {
  return renderRevelationBoardLoadoutFieldComponent(field, campaignId, special, renderSpecialLoadoutContext());
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

function getStartTemplateSummary() {
  return buildStartTemplateSummary(master, state?.run || {});
}

function getEffectiveRelicIdList() {
  return getEffectiveRelicIds(state.relics || [], getStartTemplateSummary());
}

function getTemplateRelicIds() {
  return new Set(getStartTemplateSummary().relicIds || []);
}

function getOwnedRelics() {
  return getEffectiveRelicIdList().map((id) => maps.relic.get(id)).filter(Boolean);
}

function getEffectiveSpecial(campaignId = getCampaign()?.id) {
  const base = state.run.special?.[campaignId] || {};
  const patch = getStartTemplateSummary().specialPatch?.[campaignId] || {};
  return mergeEffectiveSpecial(base, patch);
}

function renderStartTemplateSummary(summary = getStartTemplateSummary()) {
  if (!summary.templates.length) return "";
  const autoRelics = summary.relicIds
    .map((id) => maps.relic.get(id)?.name || id)
    .map((name) => '<span class="tag info">自動秘宝 ' + html(name) + '</span>')
    .join("");
  const autoSpecials = Object.entries(summary.specialPatch || {})
    .flatMap(([campaignId, patch]) => Object.entries(patch).flatMap(([fieldId, values]) => {
      const field = getSpecialFieldConfig(campaignId, fieldId);
      return values.map((value) => {
        const itemId = value?.coinId || value?.effectId || value;
        const item = maps.selectableEffect.get(itemId);
        const count = value?.count ? ' x' + value.count : '';
        return '<span class="tag info">自動' + html(field?.label || fieldId) + ' ' + html(item?.name || itemId) + html(count) + '</span>';
      });
    }))
    .join("");
  const manualChoices = summary.manualChoices
    .map((item) => '<span class="tag">' + html(phaseLabel(item.phase)) + ' ' + html(item.label) + ' x' + html(item.count) + '</span>')
    .join("");
  const notes = summary.notes
    .map((item) => '<span class="tag">' + html(item.label) + ' ' + html(item.value) + '</span>')
    .join("");
  const rows = summary.templates
    .map((template) => '<div class="start-template-row"><strong>' + html(phaseLabel(template.phase)) + '</strong><span>' + html(template.title) + '</span></div>')
    .join("");
  return '<div class="effect-block start-template-block">'
    + '<div class="effect-block-title">開始/進行テンプレート</div>'
    + '<div class="tag-list">' + autoRelics + autoSpecials + manualChoices + notes + '</div>'
    + '<div class="start-template-list">' + rows + '</div>'
    + '</div>';
}



function getBossConfig(campaignId = getCampaign()?.id) {
  return maps.campaign.get(campaignId)?.bossFlags || null;
}

function getBossManualSections(campaignId = getCampaign()?.id) {
  return readBossManualSections(getBossConfig(campaignId));
}

function getBossSelection(campaignId = getCampaign()?.id) {
  state.bossSelections ||= {};
  state.bossSelections[campaignId] ||= {};
  return state.bossSelections[campaignId];
}


function bossSelectionValues(section, campaignId = getCampaign()?.id) {
  return readBossSelectionValues(section, getBossSelection(campaignId));
}

function normalizeBossSelections() {
  state.bossSelections = normalizeBossSelectionsState(master.campaigns, state.bossSelections || {});
}

function getSelectedManualBosses(campaignId = getCampaign()?.id) {
  return readSelectedManualBosses(getBossManualSections(campaignId), getBossSelection(campaignId));
}

function getSelectedFloor3Boss(campaignId = getCampaign()?.id) {
  return readSelectedFloor3Boss(getSelectedManualBosses(campaignId));
}


function getBossFlagEntries(campaignId = getCampaign()?.id) {
  return buildBossFlagEntries({
    config: getBossConfig(campaignId),
    relicIds: getEffectiveRelicIdList(),
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
function getOperatorFilterViewForUi() {
  const viewData = getOperatorFilterView(master.operators, ui);
  Object.assign(ui, viewData.filters);
  return viewData;
}

function normalizeOperatorFilters() {
  getOperatorFilterViewForUi();
}
function deriveDifficultyTier() {
  return applyDifficultyTier(master, state?.run);
}

function getDifficultyTierLabel() {
  return readDifficultyTierLabel(master, state?.run);
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
  const pushSummarizedEffect = (type, effect) => {
    if (!effect) return;
    effects.push(...summarizeTextEffects(type, [effect]));
  };
  const squad = getSelectedSquad();
  const option = getSelectedSquadOption(squad);
  const performance = getSelectedPerformance();
  pushSummarizedEffect("分隊", squad?.effect);
  pushSummarizedEffect("分隊追加", option?.effect);
  pushSummarizedEffect("演目", performance?.effect);
  for (const effect of getSelectedSpecialEffects(getCampaign()?.id, { overlay, includeStartTemplates: overlay })) pushSummarizedEffect(effect.slotLabel || "特殊", effect.effect);
  if (includeDifficulty) effects.push(...summarizeDifficultyEffects());
  if (includeRelics) effects.push(...summarizeRelicEffects());
  return effects;
}


function ensureStateShape() {
  state.run ||= {};
  state.run.campaignId ||= "is5_sarkaz";
  state.run.performanceId ??= null;
  normalizeRunStats(state.run);
  state.run.special ||= {};
  for (const campaign of master.campaigns) state.run.special[campaign.id] ||= {};
  if (state.run.performanceId && !getCampaignPerformances(state.run.campaignId).some((item) => item.id === state.run.performanceId)) state.run.performanceId = null;
  normalizeSpecialFieldSelections();
  state.relics = Array.isArray(state.relics) ? state.relics : [];
  state.operators = Array.isArray(state.operators) ? state.operators : [];
  state.bossFlags = Array.isArray(state.bossFlags) ? state.bossFlags : [];
  normalizeBossSelections();
  state.pendingSuggestions = Array.isArray(state.pendingSuggestions) ? state.pendingSuggestions : [];
  state.mode = normalizeControlMode(state.mode);
  state.preferences = normalizePreferences(state.preferences);
  state.tournament ||= { pendingState: null, lastSubmissionAt: null, submittedBy: null };
  deriveDifficultyTier();
}


function isInteractiveView() {
  return view === "control" || view === "control-v2" || view === "sidecar";
}

function renderInteractive() {
  if (view === "sidecar") return renderSidecar();
  if (view === "control-v2") return renderControlV2();
  return renderControl();
}
function setNotice(text) {
  ui.notice = text;
  if (isInteractiveView()) renderInteractive();
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
  if (isInteractiveView() && render) {
    renderInteractive();
    restoreListScroll(scrollSnapshot);
  }
  scheduleSave();
}


function renderControlHeaderStatus() {
  const el = document.querySelector(".save-status");
  if (el) el.textContent = ui.saveStatus;
}

function navButton(id, label, icon) {
  return `<button class="nav-button ${ui.tab === id ? "active" : ""}" data-action="tab" data-tab="${id}"><span class="nav-icon">${icon}</span><span>${label}</span></button>`;
}

function renderControl() {
  const mode = getCurrentControlMode();
  app.dataset.loading = "false";
  document.body.className = "";
  app.className = "control-app";
  app.innerHTML = `
    <header class="control-topbar">
      <div class="brand">
        <div class="brand-mark">IS</div>
        <div>
          <h1>RHODES OBS COMMANDER3373</h1>
          <p>${html(getCampaign()?.fullTitle)} / ${html(mode.label)}</p>
        </div>
      </div>
      <div class="topbar-actions">
        <label class="topbar-mode">モード<select data-field="mode">${renderControlModeOptions()}</select></label>
        <a href="/control-v2" target="_self">Control v2</a>
        <a href="/sidecar" target="_self">Sidecar</a>
        <a href="/overlay" target="_blank">Overlay</a>
        <a href="/control" target="_self">Control</a>
        <span class="save-status">${html(ui.saveStatus)}</span>
        <button class="ghost" data-action="reset-state">リセット</button>
      </div>
    </header>
    <div class="control-layout">
      <nav class="control-nav">
        <a class="nav-button" href="/control-v2" target="_self"><span class="nav-icon">V2</span><span>Control v2</span></a>
          ${renderModeOrderedNavButtons()}
      </nav>
      <main class="control-main">
        ${ui.notice ? `<div class="panel" style="margin-bottom:14px"><div class="panel-body">${html(ui.notice)}</div></div>` : ""}
        ${renderCurrentTab()}
      </main>
    </div>
  `;
}

function renderControlV2RunPanel() {
  const campaign = getCampaign();
  const squads = getCampaignSquads();
  const selectedSquad = getSelectedSquad();
  const randomOptions = selectedSquad?.randomEffectOptions || [];
  const performances = getCampaignPerformances(campaign.id);
  return `
    <section class="control-v2-panel control-v2-run-panel">
      <div class="control-v2-panel-head"><h2>ラン基本</h2><span>run setup</span></div>
      <div class="control-v2-panel-body control-v2-form-grid">
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
        ${performances.length ? `<label class="field-wide">演目${renderPerformanceSelect(campaign.id)}</label>` : ""}
        ${renderRunStatInputs()}
      </div>
    </section>
  `;
}

function renderControlV2SpecialPanel() {
  const campaign = getCampaign();
  const specialFields = campaign.specialFields || [];
  const special = state.run.special?.[campaign.id] || {};
  return `
    <section class="control-v2-panel control-v2-special-panel">
      <div class="control-v2-panel-head"><div><h2>特殊値</h2><p>状態・重複を含むIS固有値</p></div><span>series values</span></div>
      <div class="control-v2-panel-body control-v2-special-grid">
        ${specialFields.length ? specialFields.map((field) => renderSpecialField(field, campaign.id, special)).join("") : `<div class="empty-state field-wide">この統合戦略に特殊表示はありません。</div>`}
      </div>
    </section>
  `;
}

function renderControlV2CommonSummaryPanel() {
  const campaign = getCampaign();
  const selectedSquad = getSelectedSquad();
  const difficultyGrade = getSelectedDifficultyGrade();
  const startTemplateSummary = getStartTemplateSummary();
  const specialFields = campaign.specialFields || [];
  const special = state.run.special?.[campaign.id] || {};
  const specialTags = getSpecialTags(specialFields, special);
  const bossEntries = getBossFlagEntries(campaign.id);
  const activeEffects = getActiveEffects();
  const rows = [
    ["ラン", `IS#${campaign.number} ${campaign.title}`],
    ["等級", difficultyGrade?.label || "未選択"],
    ["分隊", selectedSquad?.name || "未選択"],
    ["所持", `秘宝 ${getEffectiveRelicIdList().length} / 招集 ${state.operators.length}`],
    ["特殊", specialTags.length ? specialTags.map((item) => `${item.label} ${item.value}`).join(" / ") : "未設定"],
    ["ボス", bossEntries.length ? bossEntries.map((entry) => bossDisplayTitle(entry)).join(" / ") : "未設定"],
    ["敵効果", activeEffects.length ? `${activeEffects.length}件` : "未設定"],
  ];
  return `
    <section class="control-v2-panel control-v2-summary-panel">
      <div class="control-v2-panel-head"><div><h2>現在反映中</h2><p>編集ではなく確認。詳細は各ワークスペースへ</p></div><span>summary</span></div>
      <div class="control-v2-panel-body control-v2-summary-body">
        <div class="control-v2-summary-list">
          ${rows.map(([label, value]) => `<div><b>${html(label)}</b><span>${html(value)}</span></div>`).join("")}
        </div>
        <div class="control-v2-deep-links" aria-label="詳細画面への導線">
          <button type="button" data-action="control-v2-screen" data-screen="operators">オペレーターへ</button>
          <button type="button" data-action="control-v2-screen" data-screen="relics">秘宝へ</button>
          <button type="button" data-action="control-v2-screen" data-screen="special">特殊値へ</button>
          <button type="button" data-action="control-v2-screen" data-screen="obs">OBS設定へ</button>
        </div>
        ${startTemplateSummary.length ? `<div class="control-v2-inline-template">${renderStartTemplateSummary(startTemplateSummary)}</div>` : ""}
      </div>
    </section>
  `;
}

function renderControlV2SpecialModelRail() {
  const current = getCampaign();
  const labels = (current.specialFields || []).map((field) => field.label).join(" / ");
  return `
    <aside class="control-v2-special-rail" aria-label="特殊値の対象統合戦略">
      <div class="control-v2-special-rail-head"><strong>対象IS</strong><span>固定</span></div>
      <div class="control-v2-special-current">
        <strong>IS#${html(current.number)} ${html(current.title)}</strong>
        <span>${html(labels || "特殊表示なし")}</span>
        <em>変更は共通設定の統合戦略で行います。</em>
      </div>
    </aside>
  `;
}

function renderControlV2SpecialScreen() {
  const campaign = getCampaign();
  const specialFields = campaign.specialFields || [];
  const special = state.run.special?.[campaign.id] || {};
  const activeTags = getSpecialTags(specialFields, special);
  return `
    <section class="control-v2-screen control-v2-special-screen" aria-label="特殊値">
      ${renderControlV2SpecialModelRail()}
      <div class="control-v2-special-editor">
        ${renderControlV2SpecialPanel()}
      </div>
      <aside class="control-v2-panel control-v2-special-preview">
        <div class="control-v2-panel-head"><div><h2>OBS表示</h2><p>選択済みだけを短く表示</p></div><span>active</span></div>
        <div class="control-v2-panel-body">
          <div class="control-v2-summary-list">
            ${activeTags.length ? activeTags.map((item) => `<div><b>${html(item.label)}</b><span>${html(item.value)}</span></div>`).join("") : `<div><b>特殊</b><span>未設定</span></div>`}
          </div>
          <div class="control-v2-special-notes">
            <span>啓示板: 本因/構成/修辞を分離</span>
            <span>思案: 名称 + 状態のスロット</span>
            <span>通宝: 名称 + 状態 + 表裏 + 個数</span>
          </div>
        </div>
      </aside>
    </section>
  `;
}

function renderRecognitionScanControls() {
  const campaign = getCampaign();
  const actions = getRecognitionScanActions(campaign.id);
  return `
    <div class="recognition-scan-scope">IS#${html(campaign.number)}向け</div>
    <div class="inline-row recognition-scan-actions">
      ${actions.map(({ profile, label }) => `<button type="button" data-action="trigger-recognition-scan" data-profile="${html(profile)}">${html(label)}を取得</button>`).join("")}
      <button type="button" class="ghost" data-action="cancel-recognition-scan">停止</button>
    </div>
  `;
}


function renderRecognitionSuggestionList(limit = Infinity) {
  const suggestions = state.pendingSuggestions || [];
  const visible = suggestions.slice(0, limit);
  if (!visible.length) return `<div class="empty-state">候補はありません。</div>`;
  return `
    ${visible.map((item, index) => `<div class="item-row compact"><div><div class="item-title">${html(item.label || item.type || "候補")}</div><div class="item-meta">${html(item.rawText || item.value || "")}</div></div><button data-action="dismiss-suggestion" data-index="${index}">削除</button></div>`).join("")}
    ${suggestions.length > visible.length ? `<div class="empty-state">ほか ${suggestions.length - visible.length} 件</div>` : ""}
  `;
}

function renderControlV2RecognitionPanel() {
  const suggestions = state.pendingSuggestions || [];
  return `
    <section class="control-v2-panel control-v2-recognition-panel">
      <div class="control-v2-panel-head"><h2>ADB取得</h2><span>候補 ${suggestions.length}</span></div>
      <div class="control-v2-panel-body control-v2-effect-stack">
        <div class="control-v2-subsection">
          <div class="control-v2-subhead"><strong>外部取得</strong><span>候補承認までOverlayには反映しません</span></div>
          ${renderRecognitionScanControls()}
        </div>
        <div class="control-v2-subsection">
          <div class="control-v2-subhead"><strong>レビュー待ち</strong><span>削除のみ / 反映UIは次段階</span></div>
          ${renderRecognitionSuggestionList(4)}
        </div>
      </div>
    </section>
  `;
}
function renderControlV2EffectPanel() {
  const campaign = getCampaign();
  const activeEffects = getActiveEffects();
  const entries = getBossFlagEntries(campaign.id);
  const sections = getBossManualSections(campaign.id);
  return `
    <section class="control-v2-panel control-v2-effect-panel">
      <div class="control-v2-panel-head"><h2>敵効果 / ボス</h2><span>${activeEffects.length} effects / ${entries.length} boss</span></div>
      <div class="control-v2-panel-body control-v2-effect-stack">
        <div class="control-v2-subsection">
          <div class="control-v2-subhead"><strong>ボスフラグ</strong><span>手動・秘宝連動</span></div>
          <div class="control-v2-boss-selectors">
            ${sections.length ? sections.map((section) => renderBossSelector(section, campaign.id)).join("") : `<div class="empty-state field-wide">ボスフラグ定義は未登録です。</div>`}
          </div>
          <div class="boss-card-grid control-v2-boss-cards">
            ${entries.length ? entries.map((entry) => renderBossCard(entry, "compact")).join("") : `<div class="empty-state">ボスフラグは未設定です。</div>`}
          </div>
        </div>
        <div class="control-v2-subsection">
          <div class="control-v2-subhead"><strong>発動効果</strong><span>敵・ラン・報酬系のみ</span></div>
          ${renderEffectList(activeEffects, "control-effect-list control-v2-effect-list", "敵側に集計できる発動効果は未設定です。")}
        </div>
      </div>
    </section>
  `;
}

function renderControlV2StatusStrip() {
  const campaign = getCampaign();
  const difficultyGrade = getSelectedDifficultyGrade();
  const selectedSquad = getSelectedSquad();
  const performances = getCampaignPerformances(campaign.id);
  const selectedPerformance = getSelectedPerformance();
  const startTemplateSummary = getStartTemplateSummary();
  const specialFields = campaign.specialFields || [];
  const special = state.run.special?.[campaign.id] || {};
  const specialTags = getSpecialTags(specialFields, special);
  const tierCfg = master.difficultyTiers?.[campaign.id];
  const bossEntries = getBossFlagEntries(campaign.id);
  const activeEffects = getActiveEffects();
  const runStatCards = runStatDisplayItems(state.run).map((item) => [item.label, item.value, "ラン基本値"]);
  const cards = [
    ["統合戦略", `IS#${campaign.number}`, campaign.title],
    ["等級", difficultyGrade?.label || "未選択", tierCfg ? `Tier ${getDifficultyTierLabel()}` : "固定"],
    ["分隊", selectedSquad?.name || "未選択", performances.length ? `演目 ${selectedPerformance?.title || "未選択"}` : ""],
    ["所持", `秘宝 ${getEffectiveRelicIdList().length}`, `招集 ${state.operators.length}`],
    ["フラグ", `ボス ${bossEntries.length}`, `効果 ${activeEffects.length}`],
    ["特殊", specialTags[0] ? `${specialTags[0].label} ${specialTags[0].value}` : "未設定", specialTags.slice(1, 3).map((item) => `${item.label} ${item.value}`).join(" / ")],
    ...runStatCards,
  ];
  return `
    <section class="control-v2-status-strip" aria-label="現在のラン状態">
      ${cards.map(([label, value, detail]) => `<div class="control-v2-status-card"><span>${html(label)}</span><strong>${html(value)}</strong>${detail ? `<em>${html(detail)}</em>` : ""}</div>`).join("")}
    </section>
    ${startTemplateSummary.length ? `<section class="control-v2-template-strip">${renderStartTemplateSummary(startTemplateSummary)}</section>` : ""}
  `;
}

function renderControlV2OperatorsPanel() {
  const { rarityOptions, classOptions, branchOptions, operators } = getOperatorFilterViewForUi();
  const shown = sortOperators(operators).slice(0, 500);
  const selected = new Set(state.operators);
  const gridColumns = getOperatorGridColumns();
  return `
    <section class="control-v2-panel control-v2-choice-panel">
      <div class="control-v2-panel-head"><h2>オペレーター</h2><span class="control-v2-operator-count">${operators.length}件 / 招集${selected.size}名</span></div>
      <div class="control-v2-filter-grid">
        <label>実装状態<select data-ui="operatorRelease"><option value="released" ${ui.operatorRelease === "released" ? "selected" : ""}>日本実装のみ</option><option value="all" ${ui.operatorRelease === "all" ? "selected" : ""}>すべて</option><option value="unreleased" ${ui.operatorRelease === "unreleased" ? "selected" : ""}>日本未実装のみ</option></select></label>
        <label>レア度<select data-ui="operatorRarity"><option value="all">すべて</option>${rarityOptions.map((rarity) => `<option value="${rarity}" ${String(rarity) === ui.operatorRarity ? "selected" : ""}>★${rarity}</option>`).join("")}</select></label>
        <label>職業<select data-ui="operatorClass"><option value="all">すべて</option>${classOptions.map((value) => `<option value="${html(value)}" ${value === ui.operatorClass ? "selected" : ""}>${html(value)}</option>`).join("")}</select></label>
        <label>職分<select data-ui="operatorBranch"><option value="all">すべて</option>${branchOptions.map((value) => `<option value="${html(value)}" ${value === ui.operatorBranch ? "selected" : ""}>${html(value)}</option>`).join("")}</select></label>
        <label>並び順<select data-field="operatorSort"><option value="rarity_desc" ${state.preferences.operatorSort === "rarity_desc" ? "selected" : ""}>レア度 高い順</option><option value="rarity_asc" ${state.preferences.operatorSort === "rarity_asc" ? "selected" : ""}>レア度 低い順</option><option value="implementation_desc" ${state.preferences.operatorSort === "implementation_desc" ? "selected" : ""}>実装順 新しい順</option><option value="implementation_asc" ${state.preferences.operatorSort === "implementation_asc" ? "selected" : ""}>実装順 古い順</option><option value="class" ${state.preferences.operatorSort === "class" ? "selected" : ""}>職業順</option><option value="name" ${state.preferences.operatorSort === "name" ? "selected" : ""}>名前順</option></select></label>
        <label>表示列<select data-field="operatorGridColumns">${gridColumnOptions.map((count) => `<option value="${count}" ${count === gridColumns ? "selected" : ""}>${count}列</option>`).join("")}</select></label>
      </div>
      ${renderOperatorListAreaComponent({ shown, operators, selected, gridColumns }, renderOperatorControlRow)}
    </section>
  `;
}

function renderControlV2RelicsPanel() {
  const categories = getRelicCategories(getCampaignRelics());
  const viewData = getRelicListView();
  return `
    <section class="control-v2-panel control-v2-choice-panel">
      <div class="control-v2-panel-head"><h2>秘宝</h2><span class="control-v2-relic-count">${viewData.filtered.length}件 / 所持${viewData.owned.size}件</span></div>
      <div class="control-v2-filter-grid compact">
        <label>検索<input value="${html(ui.relicSearch)}" data-ui="relicSearch" placeholder="秘宝名、番号、効果" /></label>
        <label>カテゴリ<select data-ui="relicCategory"><option value="all">すべて</option>${categories.map((cat) => `<option value="${html(cat)}" ${cat === ui.relicCategory ? "selected" : ""}>${html(cat)}</option>`).join("")}</select></label>
        <label>表示列<select data-field="relicGridColumns">${gridColumnOptions.map((count) => `<option value="${count}" ${count === viewData.gridColumns ? "selected" : ""}>${count}列</option>`).join("")}</select></label>
        <button data-action="clear-relics">手入力秘宝を全解除</button>
      </div>
      ${renderRelicListArea(viewData)}
    </section>
  `;
}


function getControlV2Screen() {
  return normalizeControlV2Screen(ui.controlV2Screen);
}

function renderControlV2Nav() {
  const screen = getControlV2Screen();
  return `
    <nav class="control-v2-actions" aria-label="Control v2 画面切り替え">
      <div class="control-v2-nav-buttons" role="tablist" aria-label="編集画面">
        ${controlV2ScreenOptions.map((item) => `<button type="button" role="tab" aria-selected="${screen === item.id ? "true" : "false"}" class="control-v2-nav-button ${screen === item.id ? "active" : ""}" data-action="control-v2-screen" data-screen="${html(item.id)}">${html(item.label)}</button>`).join("")}
      </div>
      <div class="control-v2-utility-actions">
        <span class="save-status">${html(ui.saveStatus)}</span>
        <button class="ghost" data-action="reset-state">リセット</button>
      </div>
    </nav>
  `;
}

function renderControlV2ScreenToolbar(screen) {
  const meta = getControlV2ScreenMeta(screen);
  return `
    <section class="control-v2-screen-toolbar" aria-label="現在の作業画面">
      <div>
        <h2>${html(meta.label)}</h2>
        <p>${html(meta.description)}</p>
      </div>
      <a class="control-v2-detach-current" href="${html(absoluteAppUrl(meta.detachPath))}" target="_blank" rel="noreferrer">別ウィンドウで開く</a>
    </section>
  `;
}



function renderControlV2SidecarScreen() {
  const campaign = getCampaign();
  const suggestions = state.pendingSuggestions || [];
  const pending = state.tournament?.pendingState;
  const activeEffects = getActiveEffects();
  const bossEntries = getBossFlagEntries(campaign.id);
  const sidecarUrl = absoluteAppUrl("/sidecar");
  const detachTargets = [
    ["operators", "オペレーター", "招集画面を別ウィンドウで開く"],
    ["relics", "秘宝", "所持秘宝画面を別ウィンドウで開く"],
    ["special", "特殊値", "啓示・思案・通宝を別ウィンドウで開く"],
    ["obs", "OBS設定", "配信ソース設定を別ウィンドウで開く"],
  ];
  return `
    <section class="control-v2-screen control-v2-sidecar-screen" aria-label="サイドカー">
      <section class="control-v2-panel control-v2-sidecar-hero">
        <div class="control-v2-panel-head"><div><h2>サイドカー</h2><p>配信外で使う確認・自動取得・レビュー用の操作面</p></div><span>private support</span></div>
        <div class="control-v2-panel-body control-v2-sidecar-hero-body">
          <div class="control-v2-sidecar-kpis">
            <div><span>候補</span><strong>${html(suggestions.length)}</strong><em>レビュー待ち</em></div>
            <div><span>ボス</span><strong>${html(bossEntries.length)}</strong><em>表示中フラグ</em></div>
            <div><span>敵効果</span><strong>${html(activeEffects.length)}</strong><em>集計対象</em></div>
            <div><span>大会入力</span><strong>${pending ? "1" : "0"}</strong><em>保留</em></div>
          </div>
          <div class="control-v2-sidecar-launches">
            <a class="control-v2-launch-button primary" href="${html(sidecarUrl)}" target="_blank" rel="noreferrer">Sidecarを別画面で開く</a>
            <a class="control-v2-launch-button" href="${html(absoluteAppUrl("/control"))}" target="_blank" rel="noreferrer">旧Controlを開く</a>
          </div>
        </div>
      </section>

      <section class="control-v2-panel control-v2-sidecar-scan-panel">
        <div class="control-v2-panel-head"><div><h2>ADB / OCR取得</h2><p>取得結果は候補扱い。承認までOverlayへ反映しません</p></div><span>scan</span></div>
        <div class="control-v2-panel-body control-v2-sidecar-stack">
          ${renderRecognitionScanControls()}
          <div class="control-v2-subsection">
            <div class="control-v2-subhead"><strong>レビュー待ち</strong><span>${html(suggestions.length)}件</span></div>
            ${renderRecognitionSuggestionList(8)}
          </div>
        </div>
      </section>

      <section class="control-v2-panel control-v2-sidecar-detach-panel">
        <div class="control-v2-panel-head"><div><h2>剥離ウィンドウ</h2><p>大会スタッフや別モニター向けに作業面を分離</p></div><span>detachable</span></div>
        <div class="control-v2-panel-body control-v2-detach-grid">
          ${detachTargets.map(([screen, label, detail]) => `<a class="control-v2-detach-card" href="${html(absoluteAppUrl(`/control-v2?screen=${screen}`))}" target="_blank" rel="noreferrer"><strong>${html(label)}</strong><span>${html(detail)}</span></a>`).join("")}
        </div>
      </section>

      <section class="control-v2-panel control-v2-sidecar-review-panel">
        <div class="control-v2-panel-head"><div><h2>大会 / 反映確認</h2><p>第三者入力と例外状態の確認</p></div><span>review</span></div>
        <div class="control-v2-panel-body control-v2-sidecar-stack">
          ${pending ? `<div class="control-v2-pending-card"><strong>保留中の大会入力があります</strong><span>内容を確認してから反映してください。</span><div class="inline-row"><button class="primary" data-action="approve-tournament">反映</button><button data-action="reject-tournament">破棄</button></div></div>` : `<div class="empty-state">保留中の大会入力はありません。</div>`}
          <div class="control-v2-subsection">
            <div class="control-v2-subhead"><strong>敵効果インスペクタ</strong><span>${html(activeEffects.length)}件</span></div>
            ${renderEffectList(activeEffects, "control-effect-list control-v2-effect-list", "敵側に集計できる発動効果は未設定です。")}
          </div>
        </div>
      </section>
    </section>
  `;
}

function renderControlV2ObsScreen() {
  return `
    <section class="control-v2-screen control-v2-obs-screen" aria-label="OBS設定">
      <section class="control-v2-panel control-v2-obs-panel">
        <div class="control-v2-panel-head"><h2>OBSプリセット</h2><span>browser source URLs</span></div>
        <div class="control-v2-panel-body obs-url-grid">
          ${renderObsUrlCard("標準オーバーレイ", "全体情報を1枚で表示", "/overlay")}
          ${renderObsUrlCard("コンパクト", "ゲーム画面上に重ねる小型表示", "/overlay?layout=compact")}
          ${renderObsUrlCard("横長 S", "下帯向け / 小", "/overlay?layout=horizontal&size=small")}
          ${renderObsUrlCard("横長 M", "下帯向け / 中", "/overlay?layout=horizontal&size=medium")}
          ${renderObsUrlCard("横長 L", "下帯向け / 大", "/overlay?layout=horizontal&size=large")}
          ${renderObsUrlCard("縦長 S", "左右サイドバー向け / 小", "/overlay?layout=vertical&size=small")}
          ${renderObsUrlCard("縦長 M", "左右サイドバー向け / 中", "/overlay?layout=vertical&size=medium")}
          ${renderObsUrlCard("縦長 L", "左右サイドバー向け / 大", "/overlay?layout=vertical&size=large")}
        </div>
      </section>
      <section class="control-v2-panel control-v2-obs-panel">
        <div class="control-v2-panel-head"><h2>分割パーツ</h2><span>OBSで個別ソースとして配置</span></div>
        <div class="control-v2-panel-body obs-url-grid">${renderObsPartCards()}</div>
      </section>
      <section class="control-v2-panel control-v2-obs-panel control-v2-obs-sidecar-note">
        <div class="control-v2-panel-head"><h2>サイドカー / 大会運用</h2><span>operator review workflow</span></div>
        <div class="control-v2-panel-body obs-part-list">
          <div><strong>Sidecar</strong><span>配信外で参照する支援画面。上部のサイドカーボタンから開きます。</span></div>
          <div><strong>別ウィンドウ化</strong><span>オペレーター・秘宝は次段階でElectronの専用ウィンドウとして分離し、大会スタッフ入力に使える導線へ拡張します。</span></div>
          <div><strong>OBS設定</strong><span>この画面は共通設定から独立しており、アンカー移動ではなくControl v2内の画面切り替えで扱います。</span></div>
        </div>
      </section>
    </section>
  `;
}

function renderControlV2Screen() {
  const screen = getControlV2Screen();
  const toolbar = renderControlV2ScreenToolbar(screen);
  if (screen === "operators") {
    ui.controlV2ChoiceTab = "operators";
    return toolbar + `<section class="control-v2-screen control-v2-single-choice-screen">${renderControlV2OperatorsPanel()}</section>`;
  }
  if (screen === "relics") {
    ui.controlV2ChoiceTab = "relics";
    return toolbar + `<section class="control-v2-screen control-v2-single-choice-screen">${renderControlV2RelicsPanel()}</section>`;
  }
  if (screen === "special") return toolbar + renderControlV2SpecialScreen();
  if (screen === "obs") return toolbar + renderControlV2ObsScreen();
  if (screen === "sidecar") return toolbar + renderControlV2SidecarScreen();
  return toolbar + `
    <section class="control-v2-screen control-v2-common-screen">
      ${renderControlV2RunPanel()}
      ${renderControlV2CommonSummaryPanel()}
      ${renderControlV2EffectPanel()}
      ${renderControlV2RecognitionPanel()}
    </section>
  `;
}


function renderControlV2ChoiceTabs() {
  const relicView = getRelicListView();
  const operatorCount = state.operators.length;
  const active = ui.controlV2ChoiceTab === "relics" ? "relics" : "operators";
  const tabs = [
    { id: "operators", label: "オペレーター", count: `招集${operatorCount}名`, countClass: "control-v2-operator-count", detail: "招集済み・職業/レア度フィルタ" },
    { id: "relics", label: "秘宝", count: `所持${relicView.owned.size}件`, countClass: "control-v2-relic-count", detail: "所持秘宝・カテゴリ/検索" },
  ];
  return `
    <div class="control-v2-selection-tabs" role="tablist" aria-label="選択作業の切り替え">
      ${tabs.map((tab) => `<button type="button" role="tab" aria-selected="${tab.id === active ? "true" : "false"}" class="control-v2-tab-button ${tab.id === active ? "active" : ""}" data-action="control-v2-choice-tab" data-choice-tab="${tab.id}"><span>${html(tab.label)}</span><strong class="${tab.countClass}">${html(tab.count)}</strong><em>${html(tab.detail)}</em></button>`).join("")}
    </div>
  `;
}

function renderControlV2SelectionWorkspace() {
  const active = ui.controlV2ChoiceTab === "relics" ? "relics" : "operators";
  return `
    <section id="selection" class="control-v2-selection-workspace">
      ${renderControlV2ChoiceTabs()}
      <div class="control-v2-selection-panel" role="tabpanel">
        ${active === "relics" ? renderControlV2RelicsPanel() : renderControlV2OperatorsPanel()}
      </div>
    </section>
  `;
}

function renderControlV2() {
  const campaign = getCampaign();
  const difficultyGrade = getSelectedDifficultyGrade();
  app.dataset.loading = "false";
  document.body.className = "control-v2-body";
  app.className = "control-v2-app";
  app.innerHTML = `
    <header class="control-v2-topbar">
      <div class="control-v2-title">
        <span>IS#${campaign.number}</span>
        <div><h1>${html(campaign.title)}</h1><p>${html(difficultyGrade?.label || "等級未選択")} / ${html(getSelectedSquad()?.name || "分隊未選択")}</p></div>
      </div>
      ${renderControlV2Nav()}
    </header>
    <main class="control-v2-workbench">
      ${ui.notice ? `<div class="control-v2-notice">${html(ui.notice)}</div>` : ""}
      ${renderControlV2StatusStrip()}
      ${renderControlV2Screen()}
    </main>
  `;
}
function renderCurrentTab() {
  if (ui.tab === "relics") return renderRelicsTab();
  if (ui.tab === "operators") return renderOperatorsTab();
  if (ui.tab === "flags") return renderFlagsTab();
  if (ui.tab === "obs") return renderObsPartsTab();
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
  const startTemplateSummary = getStartTemplateSummary();
  const effectiveRelicCount = getEffectiveRelicIdList().length;
  const bossEntries = getBossFlagEntries(campaign.id);
  const tierCfg = master.difficultyTiers?.[campaign.id];
  const difficultyGrade = getSelectedDifficultyGrade();
  const mode = getCurrentControlMode();
  return `
    <section class="panel-grid">
      <div class="panel">
        <div class="panel-header"><h2 class="panel-title">マザーUIモード</h2><span class="panel-subtitle">${html(mode.subtitle)}</span></div>
        <div class="panel-body">
          <div class="mode-card-grid">${renderModeCards()}</div>
        </div>
      </div>

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
          ${renderRunStatInputs()}
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
            <span class="tag accent">秘宝 ${effectiveRelicCount}${effectiveRelicCount !== state.relics.length ? " / 手入力 " + state.relics.length : ""}</span>
            <span class="tag info">招集 ${state.operators.length}</span>
            <span class="tag">ボス ${bossEntries.length}</span>
            <span class="tag">等級 ${html(difficultyGrade?.label || "未選択")}</span>
            <span class="tag">難易度ティア ${html(tierCfg ? getDifficultyTierLabel() : "対象外")}</span>
            ${performances.length ? `<span class="tag">演目 ${html(selectedPerformance?.title || "未選択")}</span>` : ""}
            ${specialTags.map((item) => `<span class="tag info">${html(item.label)} ${html(item.value)}</span>`).join("")}
            ${renderRunStatTags()}
          </div>
          ${selectedSquad ? `<p><strong>${html(selectedSquad.name)}</strong><br><span class="panel-subtitle">${html(selectedSquad.effect)}</span></p>` : `<p class="panel-subtitle">分隊は未選択です。</p>`}
          ${selectedPerformance ? `<p><strong>${html(selectedPerformance.name)}</strong><br><span class="panel-subtitle">${html(selectedPerformance.effect)}</span></p>` : ""}
          ${difficultyGrade ? renderDifficultyFields(difficultyGrade) : `<p class="panel-subtitle">等級は未選択です。</p>`}
          ${renderStartTemplateSummary(startTemplateSummary)}
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
  return buildRelicListView(getCampaignRelics(), ui, getEffectiveRelicIdList(), getRelicGridColumns());
}

function renderRelicListContent(viewData) {
  return renderRelicListContentComponent(viewData, renderRelicControlRow);
}

function renderRelicListArea(viewData) {
  return renderRelicListAreaComponent(viewData, renderRelicListContent);
}

function refreshRelicListOnly() {
  if (view !== "control" && view !== "control-v2") return false;
  if (view === "control" && ui.tab !== "relics") return false;
  const viewData = getRelicListView();
  const subtitle = document.querySelector(".panel-header .panel-subtitle");
  if (subtitle) subtitle.textContent = `${viewData.filtered.length}件 / 所持${viewData.owned.size}件`;
  const v2Count = document.querySelector(".control-v2-relic-count");
  if (v2Count) v2Count.textContent = `${viewData.filtered.length}件 / 所持${viewData.owned.size}件`;
  const list = document.querySelector(".relic-pick-grid");
  if (!list) return false;
  list.style.setProperty("--relic-grid-columns", viewData.gridColumns);
  list.innerHTML = renderRelicListContent(viewData);
  return true;
}

function renderRelicsTab() {
  const categories = getRelicCategories(getCampaignRelics());
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
            <button data-action="clear-relics">手入力秘宝を全解除</button>
          </div>
          ${renderRelicListArea(viewData)}
        </div>
      </div>
    </section>
  `;
}

function renderRelicControlRow(item, active) {
  const manual = new Set(state.relics || []).has(item.id);
  const template = getTemplateRelicIds().has(item.id);
  return renderRelicControlRowComponent(item, active, relicEffectForDisplay(item), { manual, template });
}

function renderOperatorsTab() {
  const { rarityOptions, classOptions, branchOptions, operators } = getOperatorFilterViewForUi();
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
            <label>並び順<select data-field="operatorSort"><option value="rarity_desc" ${state.preferences.operatorSort === "rarity_desc" ? "selected" : ""}>レア度 高い順</option><option value="rarity_asc" ${state.preferences.operatorSort === "rarity_asc" ? "selected" : ""}>レア度 低い順</option><option value="implementation_desc" ${state.preferences.operatorSort === "implementation_desc" ? "selected" : ""}>実装順 新しい順</option><option value="implementation_asc" ${state.preferences.operatorSort === "implementation_asc" ? "selected" : ""}>実装順 古い順</option><option value="class" ${state.preferences.operatorSort === "class" ? "selected" : ""}>職業順</option><option value="name" ${state.preferences.operatorSort === "name" ? "selected" : ""}>名前順</option></select></label>
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
        <div class="panel-header"><h2 class="panel-title">ADB/OCR候補</h2><span class="panel-subtitle">取得結果は承認まで状態に反映しない</span></div>
        <div class="panel-body">
          ${renderRecognitionScanControls()}
          ${renderRecognitionSuggestionList()}
        </div>
      </div>
    </section>
  `;
}
function renderObsPartsTab() {
  return `
    <section class="panel-grid">
      <div class="panel">
        <div class="panel-header"><h2 class="panel-title">OBSプリセット</h2><span class="panel-subtitle">現行でそのまま使えるURL</span></div>
        <div class="panel-body obs-url-grid">
          ${renderObsUrlCard("標準オーバーレイ", "全体情報を1枚で表示", "/overlay")}
          ${renderObsUrlCard("コンパクト", "ゲーム画面上に重ねる小型表示", "/overlay?layout=compact")}
          ${renderObsUrlCard("横長 S", "下帯向け / 小", "/overlay?layout=horizontal&size=small")}
          ${renderObsUrlCard("横長 M", "下帯向け / 中", "/overlay?layout=horizontal&size=medium")}
          ${renderObsUrlCard("横長 L", "下帯向け / 大", "/overlay?layout=horizontal&size=large")}
          ${renderObsUrlCard("縦長 S", "左右サイドバー向け / 小", "/overlay?layout=vertical&size=small")}
          ${renderObsUrlCard("縦長 M", "左右サイドバー向け / 中", "/overlay?layout=vertical&size=medium")}
          ${renderObsUrlCard("縦長 L", "左右サイドバー向け / 大", "/overlay?layout=vertical&size=large")}
        </div>
      </div>
      <div class="panel">
        <div class="panel-header"><h2 class="panel-title">分割パーツ</h2><span class="panel-subtitle">OBSで個別ソースとして配置</span></div>
        <div class="panel-body obs-url-grid">${renderObsPartCards()}</div>
      </div>
      <div class="panel half">
        <div class="panel-header"><h2 class="panel-title">サイドカー想定</h2><span class="panel-subtitle">配信外の支援画面</span></div>
        <div class="panel-body obs-part-list">
          <div><strong>Run Console</strong><span>入力、検索、選択操作を集約</span></div>
          <div><strong>Review Queue</strong><span>大会入力やOCR候補の確認</span></div>
          <div><strong>Effect Inspector</strong><span>条件付き効果と合算根拠の確認</span></div>
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

function renderSidecarRelics(relics) {
  if (!relics.length) return `<div class="empty-state">所持秘宝はありません。</div>`;
  return `<div class="sidecar-mini-list sidecar-relic-list">
    ${relics.map((item) => renderRelicControlRow(item, true)).join("")}
  </div>`;
}

function renderSidecarOperators(operators) {
  if (!operators.length) return `<div class="empty-state">招集オペレーターはありません。</div>`;
  const groups = [6, 5, 4, 3, 2, 1]
    .map((rarity) => ({ rarity, items: operators.filter((item) => Number(item.rarity) === rarity) }))
    .filter((group) => group.items.length);
  return `<div class="sidecar-operator-groups">
    ${groups.map((group) => `<section class="sidecar-operator-group"><h3>${stars(group.rarity)} <span>${group.items.length}</span></h3><div class="sidecar-mini-list">${group.items.map((item) => renderOperatorControlRow(item, true)).join("")}</div></section>`).join("")}
  </div>`;
}

function renderSidecarReviewQueue() {
  const pending = state.tournament?.pendingState;
  const suggestions = state.pendingSuggestions || [];
  if (!pending && !suggestions.length) return `<div class="empty-state">保留中の大会入力・OCR候補はありません。</div>`;
  return `
    ${pending ? `<div class="sidecar-review-item"><strong>大会入力が保留中</strong><span>反映前に確認してください。</span><div class="inline-row"><button class="primary" data-action="approve-tournament">反映</button><button data-action="reject-tournament">破棄</button></div></div>` : ""}
    ${suggestions.map((item, index) => `<div class="sidecar-review-item"><strong>${html(item.label || item.type || "候補")}</strong><span>${html(item.rawText || item.value || "")}</span><button data-action="dismiss-suggestion" data-index="${index}">削除</button></div>`).join("")}
  `;
}

function renderSidecar() {
  cancelOverlayAutoScroll();
  const campaign = getCampaign();
  const mode = getCurrentControlMode();
  const squads = getCampaignSquads();
  const selectedSquad = getSelectedSquad();
  const randomOptions = selectedSquad?.randomEffectOptions || [];
  const performances = getCampaignPerformances(campaign.id);
  const selectedPerformance = getSelectedPerformance();
  const relics = getOwnedRelics();
  const operators = getRecruitedOperators();
  const specialFields = campaign.specialFields || [];
  const special = state.run.special?.[campaign.id] || {};
  const specialTags = getSpecialTags(specialFields, special);
  const bossEntries = getBossFlagEntries(campaign.id);
  const bossSections = getBossManualSections(campaign.id);
  const difficultyGrade = getSelectedDifficultyGrade();
  const activeEffects = getActiveEffects();
  app.dataset.loading = "false";
  document.body.className = "sidecar-body";
  app.className = "sidecar-app";
  app.innerHTML = `
    <header class="sidecar-topbar">
      <div class="sidecar-brand">
        <span class="brand-mark">IS</span>
        <div><h1>Sidecar</h1><p>IS#${html(campaign.number)} ${html(campaign.title)} / ${html(mode.label)}</p></div>
      </div>
      <div class="sidecar-actions">
        <label>モード<select data-field="mode">${renderControlModeOptions()}</select></label>
        <a href="/control" target="_self">Control</a>
        <a href="/overlay" target="_blank">Overlay</a>
        <span class="save-status">${html(ui.saveStatus)}</span>
      </div>
    </header>
    <main class="sidecar-main">
      <div class="sidecar-column">
        ${ui.notice ? `<div class="sidecar-notice">${html(ui.notice)}</div>` : ""}
        <section class="sidecar-panel">
          <div class="sidecar-panel-head"><h2>ラン状態</h2><span>${html(difficultyGrade?.label || state.run.difficulty || "等級未選択")}</span></div>
          <div class="sidecar-kpis">
            <div><span>秘宝</span><strong>${relics.length}</strong></div>
            <div><span>招集</span><strong>${operators.length}</strong></div>
            <div><span>Boss</span><strong>${bossEntries.length}</strong></div>
            ${runStatDisplayItems(state.run).map((item) => `<div><span>${html(item.label)}</span><strong>${html(item.value)}</strong></div>`).join("")}
          </div>
          <div class="sidecar-form-grid">
            <label>統合戦略<select data-field="campaignId">${master.campaigns.map((item) => `<option value="${item.id}" ${item.id === campaign.id ? "selected" : ""}>IS#${item.number} ${html(item.title)}</option>`).join("")}</select></label>
            <label>等級${renderDifficultySelect(campaign.id)}</label>
            <label class="sidecar-wide">分隊<select data-field="squadId"><option value="">未選択</option>${squads.map((item) => `<option value="${item.id}" ${item.id === state.run.squadId ? "selected" : ""}>${html(item.name)}</option>`).join("")}</select></label>
            ${randomOptions.length ? `<label class="sidecar-wide">ランダム分隊効果<select data-field="squadRandomEffectOptionId"><option value="">未選択</option>${randomOptions.map((item) => `<option value="${item.id}" ${item.id === state.run.squadRandomEffectOptionId ? "selected" : ""}>${html(item.label || item.id)}</option>`).join("")}</select></label>` : ""}
            ${performances.length ? `<label class="sidecar-wide">演目${renderPerformanceSelect(campaign.id)}</label>` : ""}
            ${renderRunStatInputs("sidecar-wide")}
          </div>
          <div class="tag-list sidecar-tags">
            ${selectedSquad ? `<span class="tag accent">${html(selectedSquad.name)}</span>` : `<span class="tag">分隊未選択</span>`}
            ${selectedPerformance ? `<span class="tag info">${html(selectedPerformance.title || selectedPerformance.name)}</span>` : ""}
            ${specialTags.map((item) => `<span class="tag info">${html(item.label)} ${html(item.value)}</span>`).join("")}
            ${renderRunStatTags()}
          </div>
        </section>
        ${specialFields.length ? `<section class="sidecar-panel"><div class="sidecar-panel-head"><h2>特殊値</h2><span>${specialFields.length}</span></div><div class="sidecar-form-grid sidecar-special-grid">${specialFields.map((field) => renderSpecialField(field, campaign.id, special)).join("")}</div></section>` : ""}
        <section class="sidecar-panel">
          <div class="sidecar-panel-head"><h2>ボス</h2><span>${bossEntries.length}</span></div>
          <div class="sidecar-form-grid">${bossSections.length ? bossSections.map((section) => renderBossSelector(section, campaign.id)).join("") : `<div class="empty-state sidecar-wide">この統合戦略のボスフラグ定義は未登録です。</div>`}</div>
          <div class="sidecar-boss-grid">${bossEntries.length ? bossEntries.map((entry) => renderBossCard(entry, "compact")).join("") : `<div class="empty-state">ボスフラグは未設定です。</div>`}</div>
        </section>
      </div>
      <div class="sidecar-column">
        <section class="sidecar-panel">
          <div class="sidecar-panel-head"><h2>発動効果</h2><span>${activeEffects.length}</span></div>
          <div class="sidecar-scroll sidecar-effect-scroll">${renderEffectList(activeEffects, "sidecar-effect-list", "分隊・演目・等級・秘宝の発動効果は未設定です。")}</div>
        </section>
        <section class="sidecar-panel">
          <div class="sidecar-panel-head"><h2>所持秘宝</h2><a href="/control?tab=relics" target="_self">編集</a></div>
          ${renderSidecarRelics(relics)}
        </section>
        <section class="sidecar-panel">
          <div class="sidecar-panel-head"><h2>招集オペレーター</h2><a href="/control?tab=operators" target="_self">編集</a></div>
          ${renderSidecarOperators(operators)}
        </section>
        <section class="sidecar-panel">
          <div class="sidecar-panel-head"><h2>レビュー</h2><a href="/control?tab=flags" target="_self">詳細</a></div>
          <div class="sidecar-review-list">${renderSidecarReviewQueue()}</div>
        </section>
      </div>
    </main>
  `;
}
function renderOverlayContext() {
  return {
    mode: getCurrentControlMode().label,
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
    runStatDisplayItems,
  };
}

function renderOverlayCompact(args) {
  return renderOverlayCompactComponent(args, renderOverlayContext());
}

function renderOverlayPart(args) {
  return renderOverlayPartComponent(overlayPart, args, renderOverlayContext());
}

function renderOverlayDense(args) {
  return renderOverlayDenseComponent(args, renderOverlayContext());
}

function renderOverlay() {
  cancelOverlayAutoScroll();
  app.dataset.loading = "false";
  app.className = overlayPart ? `overlay-app overlay-part overlay-part-${overlayPart} overlay-size-${overlaySize}` : `overlay-app overlay-${overlayLayout} overlay-size-${overlaySize}`;
  document.body.className = "overlay-body";
  const campaign = getCampaign();
  const squad = getSelectedSquad();
  const option = getSelectedSquadOption(squad);
  const relics = getOwnedRelics();
  const operators = getRecruitedOperators();
  const specialFields = campaign.specialFields || [];
  const special = getEffectiveSpecial(campaign.id);
  const difficultyGrade = getSelectedDifficultyGrade();
  const performance = getSelectedPerformance();
  const activeEffects = getActiveEffects({ overlay: true });
  if (overlayPart) {
    app.innerHTML = renderOverlayPart({ campaign, squad, option, performance, activeEffects, relics, operators, specialFields, special, difficultyGrade, run: state.run, runDifficulty: state.run.difficulty, updatedAt: state.updatedAt });
    setupOverlayAutoScroll(app);
    return;
  }
  if (overlayLayout === "compact") {
    app.innerHTML = renderOverlayCompact({ campaign, squad, option, performance, activeEffects, relics, operators, specialFields, special, difficultyGrade, run: state.run });
    setupOverlayAutoScroll(app);
    return;
  }
  if (overlayLayout === "vertical" || overlayLayout === "horizontal") {
    app.innerHTML = renderOverlayDense({ campaign, squad, option, performance, activeEffects, relics, operators, specialFields, special, difficultyGrade, run: state.run, orientation: overlayLayout });
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
    run: state.run,
    mode: getCurrentControlMode().label,
    runDifficulty: state.run.difficulty,
    updatedAt: state.updatedAt,
    bossFlagCount: state.bossFlags.length,
  }, renderOverlayContext());
  setupOverlayAutoScroll(app);
}


function replaceState(nextState) {
  state = nextState;
  ensureStateShape();
}

function getControlEventContext() {
  return {
    view,
    ui,
    getState: () => state,
    replaceState,
    mutate,
    renderControl: renderInteractive,
    scheduleSave,
    setNotice,
    refreshRelicListOnly,
    getCampaign,
    getChoiceActive: (type, id) => type === "relic" ? getEffectiveRelicIdList().includes(id) : (state.operators || []).includes(id),
    getEffectiveRelicCount: () => getEffectiveRelicIdList().length,
    getRelicChoiceMeta: (id) => ({ manual: new Set(state.relics || []).has(id), template: getTemplateRelicIds().has(id) }),
    getSpecialFieldConfig,
    getSpecialOverlayToggleKey,
    mergeEffectStackEntries,
    normalizeStackState,
  };
}

registerControlEvents(app, getControlEventContext());
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
      renderInteractive();
    }
  } catch (error) {
    app.dataset.loading = "false";
    app.innerHTML = `<div class="empty-state">起動に失敗しました: ${html(error.message)}</div>`;
    console.error(error);
  }
}

boot();




