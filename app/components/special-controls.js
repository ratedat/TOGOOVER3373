import { html } from "../lib/format.js";
import { specialEffectImageSrc } from "../lib/media.js";
import { coinFaceLabels } from "../domain/special-values.js";

export function renderSpecialOverlayToggle(field, special, getSpecialOverlayToggleKey) {
  if (!field.overlayToggle) return "";
  const key = getSpecialOverlayToggleKey(field);
  return `<label class="special-overlay-toggle"><input type="checkbox" data-special-visibility="${html(field.id)}" ${special[key] ? "checked" : ""} />${html(field.overlayToggleLabel || "OBS表示")}</label>`;
}

export function renderSpecialEffectGroupHeader(field, special, getSpecialOverlayToggleKey) {
  return `<div class="special-effect-group-head"><div class="special-effect-group-title">${html(field.label)}</div>${renderSpecialOverlayToggle(field, special, getSpecialOverlayToggleKey)}</div>`;
}

export function renderSpecialEffectOption(field, item, selected) {
  const groupPrefix = item.groupLabel && item.groupLabel !== item.slotLabel ? `${item.groupLabel} / ` : "";
  const imageSrc = specialEffectImageSrc(item);
  return `<label class="special-effect-option" title="${html(item.effect)}">
    <input type="checkbox" value="${html(item.id)}" data-special-effect-toggle="${html(field.id)}" ${selected.has(item.id) ? "checked" : ""} />
    ${imageSrc ? `<img src="${html(imageSrc)}" alt="" loading="lazy" />` : ""}
    <span>${html(groupPrefix + item.name)}</span>
  </label>`;
}

export function renderRankedSpecialEffectRow(field, group, selectedId) {
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

function getSelectOptionLabel(item, duplicateNames) {
  if (!duplicateNames.has(item.name)) return item.name;
  const prefix = item.groupLabel || item.slotLabel || "その他";
  return `${prefix} / ${item.name}`;
}

export function renderSpecialEffectSelectOptions(options, current = "", placeholder = "未選択", excludedIds = new Set()) {
  const grouped = new Map();
  const visibleOptions = [];
  for (const item of options) {
    if (excludedIds.has(item.id) && item.id !== current) continue;
    visibleOptions.push(item);
    const key = item.groupLabel || item.slotLabel || "その他";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(item);
  }
  const nameCounts = visibleOptions.reduce((counts, item) => counts.set(item.name, (counts.get(item.name) || 0) + 1), new Map());
  const duplicateNames = new Set([...nameCounts.entries()].filter(([, count]) => count > 1).map(([name]) => name));
  return `<option value="">${html(placeholder)}</option>${[...grouped.entries()].map(([group, items]) => `<optgroup label="${html(group)}">${items.map((item) => `<option value="${html(item.id)}" ${item.id === current ? "selected" : ""}>${html(getSelectOptionLabel(item, duplicateNames))}</option>`).join("")}</optgroup>`).join("")}`;
}

export function renderSpecialSelectedChip(field, item) {
  const imageSrc = specialEffectImageSrc(item);
  const groupPrefix = item.groupLabel && item.groupLabel !== item.slotLabel ? `${item.groupLabel} / ` : "";
  return `<button type="button" class="special-selected-chip" data-action="remove-special-effect" data-special-picker-field="${html(field.id)}" data-id="${html(item.id)}" title="${html(item.effect)}">
    ${imageSrc ? `<img src="${html(imageSrc)}" alt="" loading="lazy" />` : ""}
    <span>${html(groupPrefix + item.name)}</span>
    <b>×</b>
  </button>`;
}

export function renderCoinFaceOptions(current) {
  return Object.entries(coinFaceLabels).map(([value, label]) => `<option value="${html(value)}" ${value === current ? "selected" : ""}>${html(label)}</option>`).join("");
}