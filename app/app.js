import { bossFloorLabel, bossImages, bossSectionAllowsMultiple, buildBossFlagEntries } from "./domain/boss-flags.js";
import { createLookupMaps } from "./domain/master-maps.js";
import { isActiveManualRule, summarizeRelicEffects as summarizeRelicEffectMetrics, summarizeTextEffects } from "./domain/effect-metrics.js";
import { apiJson, masterUrl, resetStateUrl, stateUrl } from "./lib/api.js";
import { asCoinEntries, asEffectStackEntries, asSpecialArray, asSpecialObject, clampCoinCount, clampSpecialNumber, coinFaceLabels, mergeCoinEntries, normalizeCoinFace } from "./domain/special-values.js";
import * as selectableEffects from "./domain/selectable-effects.js";
import { assetUrl, html, normalizeText, stableOverlayStateJson, stars } from "./lib/format.js";
import { clampOverlayScrollSpeed, isOverlayScrollSpeedField, overlayScrollSpeedDefaults, overlayScrollSpeedLabels, resolveOverlayLayout, resolveOverlaySize } from "./lib/overlay-config.js";
import { mediaUrl, specialEffectImageSrc } from "./lib/media.js";
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


function renderSpecialOverlayItems(items) {
  return `<div class="special-overlay-grid">
    ${items.map((item) => {
      const imageSrc = specialEffectImageSrc(item);
      const label = item.groupLabel && item.groupLabel !== item.slotLabel ? `${item.slotLabel} / ${item.groupLabel}` : item.slotLabel;
      return `<div class="special-overlay-chip" title="${html(item.effect)}">
        ${imageSrc ? `<img src="${html(imageSrc)}" alt="" />` : `<span class="special-overlay-fallback">${html((item.name || "?").slice(0, 1))}</span>`}
        <div><span>${html(label || "特殊")}</span><strong>${html(item.name)}</strong></div>
      </div>`;
    }).join("")}
  </div>`;
}

function renderSpecialOverlayBlock(items, mode, speedKey) {
  if (!items.length) return "";
  const isCompact = mode === "compact";
  return `<section class="${isCompact ? "compact-section compact-special-section" : "stream-special-section"}">
    <div class="${isCompact ? "compact-section-head" : "stream-section-head"}"><span>Special</span><span>${items.length}</span></div>
    <div class="stream-scroll ${isCompact ? "compact-special-scroll" : "stream-special-scroll"}" data-autoscroll data-scroll-speed="${getOverlayScrollSpeed(speedKey)}">
      ${renderSpecialOverlayItems(items)}
    </div>
  </section>`;
}

function renderSpecialOverlayToggle(field, special) {
  if (!field.overlayToggle) return "";
  const key = getSpecialOverlayToggleKey(field);
  return `<label class="special-overlay-toggle"><input type="checkbox" data-special-visibility="${html(field.id)}" ${special[key] ? "checked" : ""} />${html(field.overlayToggleLabel || "OBS表示")}</label>`;
}

function renderSpecialEffectGroupHeader(field, special) {
  return `<div class="special-effect-group-head"><div class="special-effect-group-title">${html(field.label)}</div>${renderSpecialOverlayToggle(field, special)}</div>`;
}

function renderSpecialEffectOption(field, item, selected) {
  const groupPrefix = item.groupLabel && item.groupLabel !== item.slotLabel ? `${item.groupLabel} / ` : "";
  const imageSrc = specialEffectImageSrc(item);
  return `<label class="special-effect-option" title="${html(item.effect)}">
    <input type="checkbox" value="${html(item.id)}" data-special-effect-toggle="${html(field.id)}" ${selected.has(item.id) ? "checked" : ""} />
    ${imageSrc ? `<img src="${html(imageSrc)}" alt="" loading="lazy" />` : ""}
    <span>${html(groupPrefix + item.name)}</span>
  </label>`;
}

function renderRankedSpecialEffectRow(field, group, selectedId) {
  const groupLabel = group.groupLabel ? `<span>${html(group.groupLabel)}</span>` : "";
  return `<div class="special-effect-ranked-row">
    <div class="special-effect-ranked-title"><strong>${html(group.parentName)}</strong>${groupLabel}</div>
    <select data-special-ranked-field="${html(field.id)}" data-effect-parent="${html(group.key)}">
      <option value="">なし</option>
      ${group.items.map((item) => {
        const label = item.variantLabel && !String(item.name).includes(item.variantLabel) ? `${item.variantLabel}: ${item.name}` : item.name;
        return `<option value="${html(item.id)}" ${item.id === selectedId ? "selected" : ""}>${html(label)}</option>`;
      }).join("")}
    </select>
  </div>`;
}

function renderSpecialEffectSelectOptions(options, current = "", placeholder = "未選択", excludedIds = new Set()) {
  const grouped = new Map();
  for (const item of options) {
    if (excludedIds.has(item.id) && item.id !== current) continue;
    const key = item.groupLabel || item.slotLabel || "その他";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(item);
  }
  return `<option value="">${html(placeholder)}</option>${[...grouped.entries()].map(([group, items]) => `<optgroup label="${html(group)}">${items.map((item) => `<option value="${html(item.id)}" ${item.id === current ? "selected" : ""}>${html(item.name)}</option>`).join("")}</optgroup>`).join("")}`;
}

function renderSpecialSelectedChip(field, item) {
  const imageSrc = specialEffectImageSrc(item);
  const groupPrefix = item.groupLabel && item.groupLabel !== item.slotLabel ? `${item.groupLabel} / ` : "";
  return `<button type="button" class="special-selected-chip" data-action="remove-special-effect" data-special-picker-field="${html(field.id)}" data-id="${html(item.id)}" title="${html(item.effect)}">
    ${imageSrc ? `<img src="${html(imageSrc)}" alt="" loading="lazy" />` : ""}
    <span>${html(groupPrefix + item.name)}</span>
    <b>×</b>
  </button>`;
}

function renderCompactSpecialPicker(field, campaignId, special) {
  const options = getSelectableEffectsForField(field, campaignId);
  const selectedIds = asSpecialArray(special[field.id]);
  const selected = new Set(selectedIds);
  const selectedItems = selectedIds.map((id) => maps.selectableEffect.get(id)).filter(Boolean);
  return `<div class="field-wide special-effect-group compact-special-picker" data-special-picker="${html(field.id)}">
    ${renderSpecialEffectGroupHeader(field, special)}
    <div class="special-picker-row">
      <select data-special-picker-select="${html(field.id)}">
        ${renderSpecialEffectSelectOptions(options, "", `${field.label}を追加`, selected)}
      </select>
      <button type="button" data-action="add-special-effect" data-special-picker-field="${html(field.id)}">追加</button>
    </div>
    <div class="special-selected-list">
      ${selectedItems.length ? selectedItems.map((item) => renderSpecialSelectedChip(field, item)).join("") : `<div class="empty-state">未選択</div>`}
    </div>
  </div>`;
}

function renderCoinFaceOptions(current) {
  return Object.entries(coinFaceLabels).map(([value, label]) => `<option value="${html(value)}" ${value === current ? "selected" : ""}>${html(label)}</option>`).join("");
}

function renderCoinEntryRow(field, entry, index, statusOptions) {
  const coin = maps.selectableEffect.get(entry.coinId);
  if (!coin) return "";
  const imageSrc = specialEffectImageSrc(coin);
  return `<div class="coin-entry-row">
    ${imageSrc ? `<img src="${html(imageSrc)}" alt="" loading="lazy" />` : `<span class="coin-entry-fallback">${html(coin.name.slice(0, 1))}</span>`}
    <div class="coin-entry-title"><strong>${html(coin.name)}</strong><span>${html(coin.groupLabel || coin.slotLabel || "通宝")}</span></div>
    <input type="number" min="1" max="99" value="${html(entry.count)}" data-coin-entry-count="${html(field.id)}" data-index="${html(index)}" aria-label="${html(coin.name)}の個数" />
    <select data-coin-entry-status="${html(field.id)}" data-index="${html(index)}" aria-label="${html(coin.name)}の状態">
      ${renderSpecialEffectSelectOptions(statusOptions, entry.statusId || "", "状態なし")}
    </select>
    <select data-coin-entry-face="${html(field.id)}" data-index="${html(index)}" aria-label="${html(coin.name)}の表裏">
      ${renderCoinFaceOptions(entry.face)}
    </select>
    <button type="button" data-action="remove-coin-entry" data-coin-field="${html(field.id)}" data-index="${html(index)}" aria-label="${html(coin.name)}を削除">×</button>
  </div>`;
}

function renderCoinLoadoutField(field, campaignId, special) {
  const coinOptions = getCoinOptions(field, campaignId);
  const statusOptions = getCoinStatusOptions(field, campaignId);
  const entries = asCoinEntries(special[field.id]).filter((entry) => maps.selectableEffect.has(entry.coinId));
  return `<div class="field-wide special-effect-group coin-loadout-field">
    ${renderSpecialEffectGroupHeader(field, special)}
    <div class="coin-loadout-builder" data-coin-builder="${html(field.id)}">
      <select data-coin-input="coin">${renderSpecialEffectSelectOptions(coinOptions, "", "通宝を追加")}</select>
      <input type="number" min="1" max="99" value="1" data-coin-input="count" aria-label="追加する通宝の個数" />
      <select data-coin-input="status">${renderSpecialEffectSelectOptions(statusOptions, "", "状態なし")}</select>
      <select data-coin-input="face" aria-label="追加する通宝の表裏">${renderCoinFaceOptions("front")}</select>
      <button type="button" data-action="add-coin-entry" data-coin-field="${html(field.id)}">追加</button>
    </div>
    <div class="coin-entry-summary">${html(formatCoinLoadoutValue(field, entries) || "未選択")}</div>
    <div class="coin-entry-list">
      ${entries.length ? entries.map((entry, index) => renderCoinEntryRow(field, entry, index, statusOptions)).join("") : `<div class="empty-state">通宝なし</div>`}
    </div>
  </div>`;
}

function renderEffectStackStateOptions(field, current, campaignId = getCampaign()?.id) {
  const selected = normalizeStackState(field, current, campaignId);
  return getStackStateOptions(field, campaignId).map((option) => `<option value="${html(option.id)}" ${option.id === selected ? "selected" : ""}>${html(option.label)}</option>`).join("");
}

function renderEffectStackEntryRow(field, entry, index, campaignId = getCampaign()?.id) {
  const normalized = normalizeEffectStackEntry(field, entry, campaignId);
  const item = maps.selectableEffect.get(normalized.effectId);
  if (!item) return "";
  const imageSrc = specialEffectImageSrc(item);
  return `<div class="coin-entry-row effect-stack-entry-row">
    ${imageSrc ? `<img src="${html(imageSrc)}" alt="" loading="lazy" />` : `<span class="coin-entry-fallback">${html(item.name.slice(0, 1))}</span>`}
    <div class="coin-entry-title"><strong>${html(item.name)}</strong><span>${html(item.groupLabel || item.slotLabel || field.label)}</span></div>
    <input type="number" min="1" max="99" value="${html(normalized.count)}" data-effect-stack-entry-count="${html(field.id)}" data-index="${html(index)}" aria-label="${html(item.name)}の個数" />
    <select data-effect-stack-entry-state="${html(field.id)}" data-index="${html(index)}" aria-label="${html(item.name)}の${html(field.stateLabel || "状態")}">
      ${renderEffectStackStateOptions(field, normalized.stateId, campaignId)}
    </select>
    <button type="button" data-action="remove-effect-stack-entry" data-effect-stack-field="${html(field.id)}" data-index="${html(index)}" aria-label="${html(item.name)}を削除">×</button>
  </div>`;
}

function renderEffectStackLoadoutField(field, campaignId, special) {
  const options = getEffectStackOptions(field, campaignId);
  const defaultState = getStackStateOptions(field, campaignId)[0]?.id || getStackEmptyStateId(field);
  const entries = normalizeEffectStackEntries(field, campaignId, special[field.id]);
  return `<div class="field-wide special-effect-group effect-stack-loadout-field">
    ${renderSpecialEffectGroupHeader(field, special)}
    <div class="effect-stack-loadout-builder" data-effect-stack-builder="${html(field.id)}">
      <select data-effect-stack-input="effect">${renderSpecialEffectSelectOptions(options, "", `${field.label}を追加`)}</select>
      <input type="number" min="1" max="99" value="1" data-effect-stack-input="count" aria-label="追加する${html(field.label)}の個数" />
      <select data-effect-stack-input="state" aria-label="追加する${html(field.label)}の${html(field.stateLabel || "状態")}">${renderEffectStackStateOptions(field, defaultState, campaignId)}</select>
      <button type="button" data-action="add-effect-stack-entry" data-effect-stack-field="${html(field.id)}">追加</button>
    </div>
    <div class="effect-stack-entry-summary">${html(formatEffectStackValue(field, entries) || "未選択")}</div>
    <div class="effect-stack-entry-list">
      ${entries.length ? entries.map((entry, index) => renderEffectStackEntryRow(field, entry, index, campaignId)).join("") : `<div class="empty-state">${html(field.label)}なし</div>`}
    </div>
  </div>`;
}

function renderSpecialField(field, campaignId, special) {
  if (field.type === "effectSelect") {
    const options = getSelectableEffectsForField(field, campaignId);
    const current = special[field.id] || "";
    return `<label>${html(field.label)}
      <select data-special-field="${html(field.id)}">
        ${renderSpecialEffectSelectOptions(options, current, "未選択")}
      </select>
    </label>`;
  }
  if (field.type === "effectMultiSelect") {
    if (field.compact) return renderCompactSpecialPicker(field, campaignId, special);
    const options = getSelectableEffectsForField(field, campaignId);
    const selected = new Set(asSpecialArray(special[field.id]));
    return `<div class="field-wide special-effect-group">
      ${renderSpecialEffectGroupHeader(field, special)}
      <div class="special-effect-options">
        ${options.length ? options.map((item) => renderSpecialEffectOption(field, item, selected)).join("") : `<div class="empty-state">選択肢がありません。</div>`}
      </div>
    </div>`;
  }
  if (field.type === "effectRankedMultiSelect") {
    const groups = getRankedEffectGroups(field, campaignId);
    const selected = asSpecialObject(special[field.id]);
    return `<div class="field-wide special-effect-group">
      ${renderSpecialEffectGroupHeader(field, special)}
      <div class="special-effect-ranked-list">
        ${groups.length ? groups.map((group) => renderRankedSpecialEffectRow(field, group, selected[group.key])).join("") : `<div class="empty-state">選択肢がありません。</div>`}
      </div>
    </div>`;
  }
  if (field.type === "effectStackLoadout") return renderEffectStackLoadoutField(field, campaignId, special);
  if (field.type === "coinLoadout") return renderCoinLoadoutField(field, campaignId, special);
  const minAttr = field.min !== undefined ? ` min="${html(field.min)}"` : "";
  const maxAttr = field.max !== undefined ? ` max="${html(field.max)}"` : "";
  return `<label>${html(field.label)}
    <input type="${field.type === "number" ? "number" : "text"}"${minAttr}${maxAttr} value="${html(special[field.id] ?? "")}" data-special-field="${html(field.id)}" />
  </label>`;
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
function renderBossImages(entry) {
  const images = bossImages(entry);
  if (!images.length) return `<div class="boss-card-fallback">${html(String(entry.floor || "F").slice(0, 2))}</div>`;
  return `<div class="boss-icon-stack">${images.map((image) => `<img src="${html(mediaUrl(image))}" alt="" />`).join("")}</div>`;
}

function bossDisplayTitle(entry) {
  if (entry.primaryDisplay === "stage" && entry.stageName) return entry.stageName;
  return entry.bossName || entry.title || entry.stageName || "未設定";
}

function bossDisplaySubline(entry, title = bossDisplayTitle(entry)) {
  const subline = entry.primaryDisplay === "stage" ? (entry.bossName || entry.title || "") : (entry.stageName || "");
  return subline && subline !== title ? subline : "";
}

function renderBossCard(entry, className = "") {
  const title = bossDisplayTitle(entry);
  const subline = bossDisplaySubline(entry, title);
  const floor = bossFloorLabel(entry);
  const triggerRelics = entry.triggerRelics?.length ? entry.triggerRelics : (entry.triggerRelic ? [entry.triggerRelic] : []);
  const trigger = triggerRelics.length ? `<div class="boss-trigger">${triggerRelics.map((relic) => `<img src="${html(mediaUrl(relic.image))}" alt="" />`).join("")}<span>${html(triggerRelics.map((relic) => relic.name).join(" / "))}</span></div>` : "";
  const note = entry.note || entry.requiredNote || "";
  return `<div class="boss-card ${className}" title="${html(entry.effect || note || entry.stageName || title)}">
    ${renderBossImages(entry)}
    <div class="boss-card-main">
      <div class="boss-card-meta"><span>${html(floor)}</span><span>${html(entry.label || "Boss")}</span></div>
      <div class="boss-card-title">${html(title)}</div>
      ${subline ? `<div class="boss-card-stage">${html(subline)}</div>` : ""}
      ${note ? `<div class="boss-card-stage">${html(note)}</div>` : ""}
      ${trigger}
    </div>
  </div>`;
}
function renderBossChip(entry) {
  const title = bossDisplayTitle(entry);
  const subline = bossDisplaySubline(entry, title);
  const img = bossImages(entry)[0];
  return `<span class="boss-chip" title="${html(subline || entry.stageName || title)}">${img ? `<img src="${html(mediaUrl(img))}" alt="" />` : ""}<span>${html(bossFloorLabel(entry))}</span><strong>${html(title)}</strong></span>`;
}

function getRecruitedOperators() {
  const ops = (state.operators || []).map((id) => maps.operator.get(id)).filter(Boolean);
  return sortOperators(ops);
}

function sortOperators(operators) {
  const mode = state.preferences?.operatorSort || "rarity_desc";
  return [...operators].sort((a, b) => {
    if (mode === "rarity_asc") return (a.rarity - b.rarity) || (a.displayOrder - b.displayOrder) || a.name.localeCompare(b.name, "ja");
    if (mode === "name") return a.name.localeCompare(b.name, "ja");
    return (b.rarity - a.rarity) || (a.displayOrder - b.displayOrder) || a.name.localeCompare(b.name, "ja");
  });
}

function getDifficultyGradeConfig(campaignId = state?.run?.campaignId) {
  return master?.difficultyGrades?.[campaignId] || null;
}

function getSelectedDifficultyGrade() {
  const cfg = getDifficultyGradeConfig();
  const raw = state?.run?.difficulty;
  const value = raw === null || raw === undefined || raw === "" ? null : Number(raw);
  if (!cfg || !Number.isFinite(value)) return null;
  return (cfg.grades || []).find((item) => Number(item.grade) === value) || null;
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
  return (grade?.fields || [])
    .filter((item) => item.value !== null && item.value !== undefined && item.value !== "")
    .map((item) => `${item.label}: ${item.value}`)
    .join(" / ");
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
  if (ui.operatorRelease === "all") return true;
  if (ui.operatorRelease === "unreleased") return Boolean(item.hiddenByDefault);
  return !item.hiddenByDefault;
}

function uniqueValues(items, key) {
  return [...new Set(items.map((item) => item[key]).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "ja"));
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
  const condition = grade?.condition || (grade?.fields || []).find((item) => item.key === "condition")?.value;
  return condition ? [String(condition)] : [];
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

function renderEffectText(item) {
  return `<span class="effect-text">${html(item.effect)}</span>`;
}

function renderEffectList(effects, className = "", emptyText = "発動効果はありません。") {
  if (!effects.length) return `<div class="empty-state effect-empty">${html(emptyText)}</div>`;
  return `<div class="effect-list ${className}">
    ${effects.map((item) => `<div class="effect-row"><span class="effect-type">${html(item.type)}</span><strong class="effect-title">${html(item.title)}</strong>${renderEffectText(item)}</div>`).join("")}
  </div>`;
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
  mutate((s) => {
    if (type === "relic") s.relics = toggleId(s.relics, id);
    else s.operators = toggleId(s.operators, id);
  }, { render: false });
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

function renderRelicListContent({ shown, filtered, owned }) {
  return `
    ${shown.map((item) => renderRelicControlRow(item, owned.has(item.id))).join("")}
    ${shown.length < filtered.length ? `<div class="empty-state field-wide">表示を絞り込んでください。残り${filtered.length - shown.length}件があります。</div>` : ""}
  `;
}

function renderRelicListArea(viewData) {
  return `<div class="list-area relic-pick-grid" style="--relic-grid-columns: ${viewData.gridColumns}">
    ${renderRelicListContent(viewData)}
  </div>`;
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
  return `
    <div class="item-row relic-choice ${active ? "active" : ""}" data-action="toggle-relic" data-id="${item.id}" role="button" tabindex="0" aria-pressed="${active ? "true" : "false"}">
      <img class="item-thumb" src="${html(assetUrl(item.image?.localPath))}" alt="" loading="lazy" />
      <div>
        <div class="item-title">No.${html(item.number)} ${html(item.name)}</div>
        <div class="item-meta">${html(item.category || "")}</div>
        <div class="item-effect">${html(relicEffectForDisplay(item))}</div>
      </div>
    </div>
  `;
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
          <div class="list-area operator-pick-grid" style="--operator-grid-columns: ${gridColumns}">
            ${shown.map((item) => renderOperatorControlRow(item, selected.has(item.id))).join("")}
            ${shown.length < operators.length ? `<div class="empty-state field-wide">表示を絞り込んでください。残り${operators.length - shown.length}件があります。</div>` : ""}
          </div>
        </div>
      </div>
    </section>
  `;
}
function renderOperatorControlRow(item, active) {
  return `
    <div class="item-row operator-choice ${active ? "active" : ""}" data-action="toggle-operator" data-id="${item.id}" role="button" tabindex="0" aria-pressed="${active ? "true" : "false"}">
      <img class="item-thumb" src="${html(assetUrl(item.image?.localPath))}" alt="" loading="lazy" />
      <div>
        <div class="item-title">${html(item.name)} <span class="stars">${stars(item.rarity)}</span></div>
        <div class="item-meta">${html(item.class)} / ${html(item.branch)}${item.hiddenByDefault ? " / 日本未実装" : ""}</div>
      </div>
    </div>
  `;
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

function renderOverlayCompact({ campaign, squad, option, performance, activeEffects, relics, operators, specialFields, special, difficultyGrade }) {
  const specialTags = getSpecialTags(specialFields, special, { overlay: true });
  const specialItems = getOverlaySpecialEffects(campaign.id, specialFields, special);
  const flags = getBossFlagEntries(campaign.id);
  return `
    <section class="compact-overlay-shell">
      <header class="compact-head">
        <div class="compact-title-block">
          <div class="compact-kicker">IS#${html(campaign.number)}</div>
          <div class="compact-title">${html(campaign.title)}</div>
        </div>
        <div class="compact-counts">
          <span>秘宝 ${relics.length}</span><span>招集 ${operators.length}</span><span>Boss ${flags.length}</span>
        </div>
      </header>
      <div class="compact-row"><span>分隊</span><strong>${html(squad?.name || "未選択")}</strong></div>
      ${option?.label ? `<div class="compact-row compact-muted"><span>効果</span><strong>${html(option.label)}</strong></div>` : ""}
      ${performance ? `<div class="compact-row compact-muted"><span>演目</span><strong>${html(performance.title || performance.name)}</strong></div>` : ""}
      <div class="compact-chip-row">
        <span class="tag accent">${html(difficultyGrade?.label || "等級未選択")}</span>
        <span class="tag">Tier ${html(getDifficultyTierLabel())}</span>
        ${specialTags.map((item) => `<span class="tag info">${html(item.label)} ${html(item.value)}</span>`).join("")}
      </div>
      ${renderSpecialOverlayBlock(specialItems, "compact", "compactRelicScrollSpeed")}
      ${activeEffects.length ? `<section class="compact-section compact-effects-section">
        <div class="compact-section-head"><span>Effects</span><span>${activeEffects.length}</span></div>
        <div class="stream-scroll compact-effect-scroll" data-autoscroll data-scroll-speed="${getOverlayScrollSpeed("compactRelicScrollSpeed")}">
          ${renderEffectList(activeEffects, "compact-effect-list", "発動効果なし")}
        </div>
      </section>` : ""}
      <section class="compact-section">
        <div class="compact-section-head"><span>Relics</span><span>${relics.length}</span></div>
        <div class="stream-scroll compact-relic-scroll" data-autoscroll data-scroll-speed="${getOverlayScrollSpeed("compactRelicScrollSpeed")}">
          <div class="compact-relic-strip">
            ${relics.length ? relics.map((item) => `<img src="${html(assetUrl(item.image?.localPath))}" title="${html(item.name)}" alt="" />`).join("") : `<span class="compact-empty">なし</span>`}
          </div>
        </div>
      </section>
      <section class="compact-section">
        <div class="compact-section-head"><span>Operators</span><span>${operators.length}</span></div>
        <div class="compact-operator-strip">
          ${operators.length ? operators.slice(0, 8).map((item) => `<div class="compact-operator"><img src="${html(assetUrl(item.image?.localPath))}" alt="" /><span>${html(item.name)}</span><strong>${stars(item.rarity)}</strong></div>`).join("") : `<span class="compact-empty">なし</span>`}
          ${operators.length > 8 ? `<span class="compact-more">+${operators.length - 8}</span>` : ""}
        </div>
      </section>
      ${flags.length ? `<section class="compact-section"><div class="compact-section-head"><span>Boss</span><span>${flags.length}</span></div><div class="compact-boss-list">${flags.slice(0, 4).map((flag) => renderBossChip(flag)).join("")}${flags.length > 4 ? `<span class="compact-more">+${flags.length - 4}</span>` : ""}</div></section>` : ""}
    </section>
  `;
}

function renderOverlayDense({ campaign, squad, option, performance, activeEffects, relics, operators, specialFields, special, difficultyGrade, orientation }) {
  const specialTags = getSpecialTags(specialFields, special, { overlay: true });
  const specialItems = getOverlaySpecialEffects(campaign.id, specialFields, special);
  const flags = getBossFlagEntries(campaign.id);
  return `
    <section class="stream-overlay-shell stream-${orientation}">
      <header class="stream-head">
        <div>
          <div class="stream-kicker">IS#${html(campaign.number)} / ${html(state.mode || "manual")}</div>
          <div class="stream-title">${html(campaign.title)}</div>
        </div>
        <div class="stream-counts">
          <span>秘宝 ${relics.length}</span><span>招集 ${operators.length}</span><span>Boss ${flags.length}</span>
        </div>
      </header>
      <section class="stream-run">
        <div class="stream-line"><span>分隊</span><strong>${html(squad?.name || "未選択")}</strong></div>
        ${option?.label || option?.effect ? `<div class="stream-note">${html(option?.label || option?.effect)}</div>` : ""}
        ${performance ? `<div class="stream-note"><strong>演目</strong> ${html(performance.title || performance.name)}</div>` : ""}
        <div class="stream-chip-row">
          <span class="tag accent">${html(difficultyGrade?.label || "等級未選択")}</span>
          <span class="tag">Tier ${html(getDifficultyTierLabel())}</span>
          ${specialTags.map((item) => `<span class="tag info">${html(item.label)} ${html(item.value)}</span>`).join("")}
          ${flags.map((flag) => renderBossChip(flag)).join("")}
        </div>
        ${renderSpecialOverlayBlock(specialItems, "stream", orientation + "RelicScrollSpeed")}
        ${activeEffects.length ? `<div class="stream-scroll stream-effect-scroll" data-autoscroll data-scroll-speed="${getOverlayScrollSpeed(`${orientation}RelicScrollSpeed`)}">
          ${renderEffectList(activeEffects, "stream-effect-list", "発動効果なし")}
        </div>` : ""}
      </section>
      <section class="stream-panel stream-relic-panel">
        <div class="stream-section-head"><span>Relics</span><strong>${relics.length}</strong></div>
        <div class="stream-scroll stream-relic-scroll" data-autoscroll data-scroll-speed="${getOverlayScrollSpeed(`${orientation}RelicScrollSpeed`)}">
          <div class="stream-relic-grid">
            ${relics.length ? relics.map((item) => `<div class="stream-relic-tile" title="${html(relicEffectForDisplay(item))}"><img src="${html(assetUrl(item.image?.localPath))}" alt="" /><strong>${html(item.name)}</strong></div>`).join("") : `<div class="stream-empty">秘宝なし</div>`}
          </div>
        </div>
      </section>
      <section class="stream-panel stream-operator-panel">
        <div class="stream-section-head"><span>Operators</span><strong>${operators.length}</strong></div>
        <div class="stream-scroll stream-operator-scroll" data-autoscroll data-scroll-speed="${getOverlayScrollSpeed(`${orientation}OperatorScrollSpeed`)}">
          <div class="stream-operator-grid">
            ${operators.length ? operators.map((item) => `<div class="stream-operator-tile"><img src="${html(assetUrl(item.image?.localPath))}" alt="" /><div><strong>${html(item.name)}</strong><span>${stars(item.rarity)} / ${html(item.class || "-")}</span></div></div>`).join("") : `<div class="stream-empty">未招集</div>`}
          </div>
        </div>
      </section>
    </section>
  `;
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
  app.innerHTML = `
    <header class="overlay-top">
      <section class="overlay-card">
        <div class="overlay-card-header"><span>Campaign</span><span>IS#${campaign.number}</span></div>
        <div class="overlay-card-body">
          <div class="campaign-title">${html(campaign.title)}</div>
          <div class="campaign-sub">${html(campaign.fullTitle)}</div>
        </div>
      </section>
      <section class="overlay-card">
        <div class="overlay-card-header"><span>Run</span><span>${html(state.mode || "manual")}</span></div>
        <div class="overlay-card-body overlay-kpis">
          <div class="kpi"><div class="kpi-label">等級</div><div class="kpi-value">${html(difficultyGrade?.label || (state.run.difficulty ?? "-"))}</div></div>
          <div class="kpi"><div class="kpi-label">Tier</div><div class="kpi-value">${html(getDifficultyTierLabel())}</div></div>
          ${getSpecialTags(specialFields, special, { overlay: true }).map((item) => `<div class="kpi"><div class="kpi-label">${html(item.label)}</div><div class="kpi-value">${html(item.value || "-")}</div></div>`).join("")}
          ${difficultyGrade ? renderDifficultyFields(difficultyGrade, "overlay") : ""}
        </div>
      </section>
      <section class="overlay-card">
        <div class="overlay-card-header"><span>Count</span><span>${html(new Date(state.updatedAt || Date.now()).toLocaleTimeString("ja-JP"))}</span></div>
        <div class="overlay-card-body overlay-kpis">
          <div class="kpi"><div class="kpi-label">秘宝</div><div class="kpi-value">${relics.length}</div></div>
          <div class="kpi"><div class="kpi-label">招集</div><div class="kpi-value">${operators.length}</div></div>
          <div class="kpi"><div class="kpi-label">Flag</div><div class="kpi-value">${state.bossFlags.length}</div></div>
        </div>
      </section>
    </header>
    <main class="overlay-main">
      <div class="overlay-left">
        <section class="overlay-card">
          <div class="overlay-card-header"><span>Squad</span><span>${squad ? "selected" : "none"}</span></div>
          <div class="overlay-card-body">
            <div class="squad-name">${html(squad?.name || "分隊未選択")}</div>
            <div class="squad-effect">${html(squad?.effect || "")}</div>
            ${option?.effect ? `<div class="squad-effect squad-option-effect">${html(option.label || "ランダム分隊効果")}: ${html(option.effect)}</div>` : ""}
            ${performance ? `<div class="squad-effect squad-option-effect">演目: ${html(performance.name)}</div>` : ""}
          </div>
        </section>
        <section class="overlay-card">
          <div class="overlay-card-header"><span>Active effects</span><span>${activeEffects.length}</span></div>
          <div class="overlay-card-body overlay-effect-scroll stream-scroll" data-autoscroll data-scroll-speed="${getOverlayScrollSpeed("verticalRelicScrollSpeed")}">
            ${renderEffectList(activeEffects, "overlay-effect-list", "発動効果なし")}
          </div>
        </section>
        <section class="overlay-card">
          <div class="overlay-card-header"><span>Relics</span><span>${relics.length}</span></div>
          <div class="overlay-card-body relic-grid">
            ${relics.length ? relics.map((item) => `<div class="relic-tile" title="${html(relicEffectForDisplay(item))}"><img src="${html(assetUrl(item.image?.localPath))}" alt="" /><div>${html(item.name)}</div></div>`).join("") : `<div class="empty-state">秘宝なし</div>`}
          </div>
        </section>
      </div>
      <aside class="overlay-right">
        <section class="overlay-card">
          <div class="overlay-card-header"><span>Boss</span><span>${getBossFlagEntries().length}</span></div>
          <div class="overlay-card-body boss-list">
            ${getBossFlagEntries().length ? getBossFlagEntries().map((flag) => renderBossCard(flag, "compact")).join("") : `<span class="panel-subtitle">未設定</span>`}
          </div>
        </section>
        <section class="overlay-card">
          <div class="overlay-card-header"><span>Operators</span><span>${operators.length}</span></div>
          <div class="overlay-card-body operator-list">
            ${operators.length ? operators.slice(0, 14).map((item) => `<div class="operator-row"><img src="${html(assetUrl(item.image?.localPath))}" alt="" /><div><div class="operator-name">${html(item.name)}</div><div class="operator-meta">${html(item.class)} / ${html(item.branch)}</div></div><div class="stars">${stars(item.rarity)}</div></div>`).join("") : `<div class="empty-state">未招集</div>`}
          </div>
        </section>
        <div class="footer-note">Manual state / OCR suggestions require confirmation</div>
      </aside>
    </main>
  `;
  setupOverlayAutoScroll(app);
}

function toggleId(list, id) {
  const set = new Set(list || []);
  if (set.has(id)) set.delete(id); else set.add(id);
  return [...set];
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
      mutate((s) => {
        const campaignId = getCampaign().id;
        s.run.special[campaignId] ||= {};
        const selected = new Set(asSpecialArray(s.run.special[campaignId][fieldId]));
        selected.add(value);
        s.run.special[campaignId][fieldId] = [...selected];
      });
    }
    return;
  }
  if (action === "remove-special-effect") {
    const fieldId = button.dataset.specialPickerField;
    if (fieldId && id) {
      mutate((s) => {
        const campaignId = getCampaign().id;
        s.run.special[campaignId] ||= {};
        s.run.special[campaignId][fieldId] = asSpecialArray(s.run.special[campaignId][fieldId]).filter((itemId) => itemId !== id);
      });
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
      mutate((s) => {
        s.run.special[campaignId] ||= {};
        const entries = asEffectStackEntries(s.run.special[campaignId][fieldId]);
        entries.push({ effectId, count, stateId });
        s.run.special[campaignId][fieldId] = mergeEffectStackEntries(fieldConfig, entries, campaignId);
      });
    }
    return;
  }
  if (action === "remove-effect-stack-entry") {
    const fieldId = button.dataset.effectStackField;
    const index = Number(button.dataset.index);
    if (fieldId && Number.isInteger(index)) {
      mutate((s) => {
        const campaignId = getCampaign().id;
        s.run.special[campaignId] ||= {};
        const entries = asEffectStackEntries(s.run.special[campaignId][fieldId]);
        entries.splice(index, 1);
        s.run.special[campaignId][fieldId] = entries;
      });
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
      mutate((s) => {
        const campaignId = getCampaign().id;
        s.run.special[campaignId] ||= {};
        const entries = asCoinEntries(s.run.special[campaignId][fieldId]);
        entries.push({ coinId, count, statusId, face });
        s.run.special[campaignId][fieldId] = mergeCoinEntries(entries);
      });
    }
    return;
  }
  if (action === "remove-coin-entry") {
    const fieldId = button.dataset.coinField;
    const index = Number(button.dataset.index);
    if (fieldId && Number.isInteger(index)) {
      mutate((s) => {
        const campaignId = getCampaign().id;
        s.run.special[campaignId] ||= {};
        const entries = asCoinEntries(s.run.special[campaignId][fieldId]);
        entries.splice(index, 1);
        s.run.special[campaignId][fieldId] = entries;
      });
    }
    return;
  }
  if (action === "tab") { ui.tab = button.dataset.tab; renderControl(); return; }
  if (action === "toggle-relic") { toggleChoiceElement(button, "relic", id); return; }
  if (action === "toggle-operator") { toggleChoiceElement(button, "operator", id); return; }
  if (action === "clear-relics") mutate((s) => { s.relics = []; });
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
    if (text) mutate((s) => { s.bossFlags = [...(s.bossFlags || []), text]; ui.bossDraft = ""; });
  }
  if (action === "remove-boss-flag") mutate((s) => { s.bossFlags.splice(Number(button.dataset.index), 1); });
  if (action === "dismiss-suggestion") mutate((s) => { s.pendingSuggestions.splice(Number(button.dataset.index), 1); });
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
      mutate((s) => { s.tournament = { pendingState: pending, lastSubmissionAt: new Date().toISOString(), submittedBy: "external-json" }; });
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
  if (action === "reject-tournament") mutate((s) => { s.tournament = { pendingState: null, lastSubmissionAt: null, submittedBy: null }; });
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
    mutate((s) => {
      if (field === "campaignId") {
        s.run.campaignId = target.value;
        s.run.squadId = null;
        s.run.squad = null;
        s.run.squadRandomEffectOptionId = null;
        s.run.performanceId = null;
        s.run.difficulty = null;
        s.run.difficultyTierId = null;
        s.relics = [];
        s.bossFlags = [];
        s.bossSelections ||= {};
        s.bossSelections[target.value] ||= {};
      } else if (field === "difficulty") {
        s.run.difficulty = target.value === "" ? null : Number(target.value);
      } else if (field === "squadId") {
        s.run.squadId = target.value || null;
        s.run.squad = null;
        s.run.squadRandomEffectOptionId = null;
      } else if (field === "squadRandomEffectOptionId") {
        s.run.squadRandomEffectOptionId = target.value || null;
      } else if (field === "performanceId") {
        s.run.performanceId = target.value || null;
      } else if (field === "operatorSort") {
        s.preferences.operatorSort = target.value;
      } else if (field === "operatorGridColumns") {
        s.preferences.operatorGridColumns = clampGridColumns(target.value);
      } else if (field === "relicGridColumns") {
        s.preferences.relicGridColumns = clampGridColumns(target.value);
      } else if (isOverlayScrollSpeedField(field)) {
        s.preferences[field] = clampOverlayScrollSpeed(target.value, overlayScrollSpeedDefaults[field]);
      } else if (field === "showUnreleasedOperators") {
        s.preferences.showUnreleasedOperators = target.checked;
      }
    });
  }
  const bossSelect = target.dataset.bossSelect;
  if (bossSelect) {
    mutate((s) => {
      const campaignId = getCampaign().id;
      s.bossSelections ||= {};
      s.bossSelections[campaignId] ||= {};
      s.bossSelections[campaignId][bossSelect] = target.value || null;
    });
  }
  const bossToggle = target.dataset.bossToggle;
  if (bossToggle) {
    mutate((s) => {
      const campaignId = getCampaign().id;
      s.bossSelections ||= {};
      s.bossSelections[campaignId] ||= {};
      const current = s.bossSelections[campaignId][bossToggle];
      const next = new Set(Array.isArray(current) ? current : (current ? [current] : []));
      if (target.checked) next.add(target.value);
      else next.delete(target.value);
      s.bossSelections[campaignId][bossToggle] = [...next];
    });
  }
  const specialVisibility = target.dataset.specialVisibility;
  if (specialVisibility) {
    mutate((s) => {
      const campaign = getCampaign();
      const campaignId = campaign.id;
      const fieldConfig = (campaign.specialFields || []).find((field) => field.id === specialVisibility) || { id: specialVisibility };
      const key = getSpecialOverlayToggleKey(fieldConfig);
      s.run.special[campaignId] ||= {};
      s.run.special[campaignId][key] = target.checked;
    });
  }
  const specialField = target.dataset.specialField;
  if (specialField) {
    mutate((s) => {
      const campaignId = getCampaign().id;
      const fieldConfig = getSpecialFieldConfig(campaignId, specialField);
      s.run.special[campaignId] ||= {};
      s.run.special[campaignId][specialField] = fieldConfig?.type === "number"
        ? clampSpecialNumber(target.value, fieldConfig.min, fieldConfig.max)
        : (target.value === "" ? null : target.value);
    });
  }
  const specialEffectToggle = target.dataset.specialEffectToggle;
  if (specialEffectToggle) {
    mutate((s) => {
      const campaignId = getCampaign().id;
      s.run.special[campaignId] ||= {};
      const selected = new Set(asSpecialArray(s.run.special[campaignId][specialEffectToggle]));
      if (target.checked) selected.add(target.value); else selected.delete(target.value);
      s.run.special[campaignId][specialEffectToggle] = [...selected];
    });
  }
  const specialRankedField = target.dataset.specialRankedField;
  if (specialRankedField) {
    mutate((s) => {
      const campaignId = getCampaign().id;
      const parentKey = target.dataset.effectParent;
      s.run.special[campaignId] ||= {};
      const selected = { ...asSpecialObject(s.run.special[campaignId][specialRankedField]) };
      if (target.value) selected[parentKey] = target.value; else delete selected[parentKey];
      s.run.special[campaignId][specialRankedField] = selected;
    });
  }

  const effectStackEntryCount = target.dataset.effectStackEntryCount;
  if (effectStackEntryCount) {
    mutate((s) => {
      const campaignId = getCampaign().id;
      const fieldConfig = getSpecialFieldConfig(campaignId, effectStackEntryCount) || { id: effectStackEntryCount };
      const entries = asEffectStackEntries(s.run.special[campaignId]?.[effectStackEntryCount]);
      const entry = entries[Number(target.dataset.index)];
      if (entry) entry.count = clampCoinCount(target.value);
      s.run.special[campaignId] ||= {};
      s.run.special[campaignId][effectStackEntryCount] = mergeEffectStackEntries(fieldConfig, entries, campaignId);
    });
  }
  const effectStackEntryState = target.dataset.effectStackEntryState;
  if (effectStackEntryState) {
    mutate((s) => {
      const campaignId = getCampaign().id;
      const fieldConfig = getSpecialFieldConfig(campaignId, effectStackEntryState) || { id: effectStackEntryState };
      const entries = asEffectStackEntries(s.run.special[campaignId]?.[effectStackEntryState]);
      const entry = entries[Number(target.dataset.index)];
      if (entry) entry.stateId = normalizeStackState(fieldConfig, target.value, campaignId);
      s.run.special[campaignId] ||= {};
      s.run.special[campaignId][effectStackEntryState] = mergeEffectStackEntries(fieldConfig, entries, campaignId);
    });
  }
  const coinEntryCount = target.dataset.coinEntryCount;
  if (coinEntryCount) {
    mutate((s) => {
      const campaignId = getCampaign().id;
      const entries = asCoinEntries(s.run.special[campaignId]?.[coinEntryCount]);
      const entry = entries[Number(target.dataset.index)];
      if (entry) entry.count = clampCoinCount(target.value);
      s.run.special[campaignId] ||= {};
      s.run.special[campaignId][coinEntryCount] = mergeCoinEntries(entries);
    });
  }
  const coinEntryStatus = target.dataset.coinEntryStatus;
  if (coinEntryStatus) {
    mutate((s) => {
      const campaignId = getCampaign().id;
      const entries = asCoinEntries(s.run.special[campaignId]?.[coinEntryStatus]);
      const entry = entries[Number(target.dataset.index)];
      if (entry) entry.statusId = target.value || null;
      s.run.special[campaignId] ||= {};
      s.run.special[campaignId][coinEntryStatus] = mergeCoinEntries(entries);
    });
  }
  const coinEntryFace = target.dataset.coinEntryFace;
  if (coinEntryFace) {
    mutate((s) => {
      const campaignId = getCampaign().id;
      const entries = asCoinEntries(s.run.special[campaignId]?.[coinEntryFace]);
      const entry = entries[Number(target.dataset.index)];
      if (entry) entry.face = normalizeCoinFace(target.value);
      s.run.special[campaignId] ||= {};
      s.run.special[campaignId][coinEntryFace] = mergeCoinEntries(entries);
    });
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




