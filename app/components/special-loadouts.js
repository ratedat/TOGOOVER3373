import { html } from "../lib/format.js";
import { specialEffectImageSrc } from "../lib/media.js";

export function renderCoinEntryRow(field, entry, index, statusOptions, context) {
  const coin = context.selectableEffectById.get(entry.coinId);
  if (!coin) return "";
  const imageSrc = specialEffectImageSrc(coin);
  return `<div class="coin-entry-row">
    ${imageSrc ? `<img src="${html(imageSrc)}" alt="" loading="lazy" />` : `<span class="coin-entry-fallback">${html(coin.name.slice(0, 1))}</span>`}
    <div class="coin-entry-title"><strong>${html(coin.name)}</strong><span>${html(coin.groupLabel || coin.slotLabel || "通宝")}</span></div>
    <input type="number" min="1" max="99" value="${html(entry.count)}" data-coin-entry-count="${html(field.id)}" data-index="${html(index)}" aria-label="${html(coin.name)}の個数" />
    <select data-coin-entry-status="${html(field.id)}" data-index="${html(index)}" aria-label="${html(coin.name)}の状態">
      ${context.renderSpecialEffectSelectOptions(statusOptions, entry.statusId || "", "状態なし")}
    </select>
    <select data-coin-entry-face="${html(field.id)}" data-index="${html(index)}" aria-label="${html(coin.name)}の表裏">
      ${context.renderCoinFaceOptions(entry.face)}
    </select>
    <button type="button" data-action="remove-coin-entry" data-coin-field="${html(field.id)}" data-index="${html(index)}" aria-label="${html(coin.name)}を削除">×</button>
  </div>`;
}

export function renderCoinLoadoutField(field, campaignId, special, context) {
  const coinOptions = context.getCoinOptions(field, campaignId);
  const statusOptions = context.getCoinStatusOptions(field, campaignId);
  const entries = context.asCoinEntries(special[field.id]).filter((entry) => context.selectableEffectById.has(entry.coinId));
  return `<div class="field-wide special-effect-group coin-loadout-field">
    ${context.renderSpecialEffectGroupHeader(field, special)}
    <div class="coin-loadout-builder" data-coin-builder="${html(field.id)}">
      <select data-coin-input="coin">${context.renderSpecialEffectSelectOptions(coinOptions, "", "通宝を追加")}</select>
      <input type="number" min="1" max="99" value="1" data-coin-input="count" aria-label="追加する通宝の個数" />
      <select data-coin-input="status">${context.renderSpecialEffectSelectOptions(statusOptions, "", "状態なし")}</select>
      <select data-coin-input="face" aria-label="追加する通宝の表裏">${context.renderCoinFaceOptions("front")}</select>
      <button type="button" data-action="add-coin-entry" data-coin-field="${html(field.id)}">追加</button>
    </div>
    <div class="coin-entry-summary">${html(context.formatCoinLoadoutValue(field, entries) || "未選択")}</div>
    <div class="coin-entry-list">
      ${entries.length ? entries.map((entry, index) => renderCoinEntryRow(field, entry, index, statusOptions, context)).join("") : `<div class="empty-state">通宝なし</div>`}
    </div>
  </div>`;
}

export function renderEffectStackStateOptions(field, current, campaignId, context) {
  const selected = context.normalizeStackState(field, current, campaignId);
  return context.getStackStateOptions(field, campaignId).map((option) => `<option value="${html(option.id)}" ${option.id === selected ? "selected" : ""}>${html(option.label)}</option>`).join("");
}

export function renderEffectStackEntryRow(field, entry, index, campaignId, context) {
  const normalized = context.normalizeEffectStackEntry(field, entry, campaignId);
  const item = context.selectableEffectById.get(normalized.effectId);
  if (!item) return "";
  const imageSrc = specialEffectImageSrc(item);
  return `<div class="coin-entry-row effect-stack-entry-row">
    ${imageSrc ? `<img src="${html(imageSrc)}" alt="" loading="lazy" />` : `<span class="coin-entry-fallback">${html(item.name.slice(0, 1))}</span>`}
    <div class="coin-entry-title"><strong>${html(item.name)}</strong><span>${html(item.groupLabel || item.slotLabel || field.label)}</span></div>
    <input type="number" min="1" max="99" value="${html(normalized.count)}" data-effect-stack-entry-count="${html(field.id)}" data-index="${html(index)}" aria-label="${html(item.name)}の個数" />
    <select data-effect-stack-entry-state="${html(field.id)}" data-index="${html(index)}" aria-label="${html(item.name)}の${html(field.stateLabel || "状態")}">
      ${renderEffectStackStateOptions(field, normalized.stateId, campaignId, context)}
    </select>
    <button type="button" data-action="remove-effect-stack-entry" data-effect-stack-field="${html(field.id)}" data-index="${html(index)}" aria-label="${html(item.name)}を削除">×</button>
  </div>`;
}

export function renderEffectStackLoadoutField(field, campaignId, special, context) {
  const options = context.getEffectStackOptions(field, campaignId);
  const defaultState = context.getStackStateOptions(field, campaignId)[0]?.id || context.getStackEmptyStateId(field);
  const entries = context.normalizeEffectStackEntries(field, campaignId, special[field.id]);
  return `<div class="field-wide special-effect-group effect-stack-loadout-field">
    ${context.renderSpecialEffectGroupHeader(field, special)}
    <div class="effect-stack-loadout-builder" data-effect-stack-builder="${html(field.id)}">
      <select data-effect-stack-input="effect">${context.renderSpecialEffectSelectOptions(options, "", `${field.label}を追加`)}</select>
      <input type="number" min="1" max="99" value="1" data-effect-stack-input="count" aria-label="追加する${html(field.label)}の個数" />
      <select data-effect-stack-input="state" aria-label="追加する${html(field.label)}の${html(field.stateLabel || "状態")}">${renderEffectStackStateOptions(field, defaultState, campaignId, context)}</select>
      <button type="button" data-action="add-effect-stack-entry" data-effect-stack-field="${html(field.id)}">追加</button>
    </div>
    <div class="effect-stack-entry-summary">${html(context.formatEffectStackValue(field, entries) || "未選択")}</div>
    <div class="effect-stack-entry-list">
      ${entries.length ? entries.map((entry, index) => renderEffectStackEntryRow(field, entry, index, campaignId, context)).join("") : `<div class="empty-state">${html(field.label)}なし</div>`}
    </div>
  </div>`;
}