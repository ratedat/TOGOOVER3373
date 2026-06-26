import { html } from "../lib/format.js";
import { coinFaceLabels } from "../domain/special-values.js";
import { specialEffectImageSrc } from "../lib/media.js";

export function renderCoinEntryRow(field, entry, index, statusOptions, context) {
  const coin = context.selectableEffectById.get(entry.coinId);
  if (!coin) return "";
  const status = statusOptions.find((option) => option.id === entry.statusId);
  const imageSrc = specialEffectImageSrc(coin);
  const meta = [coin.groupLabel || coin.slotLabel || "通宝", status?.name ? `状態:${status.name}` : "状態なし", `面:${coinFaceLabels[entry.face] || entry.face}`].filter(Boolean).join(" / ");
  return `<div class="coin-entry-row">
    ${imageSrc ? `<img src="${html(imageSrc)}" alt="" loading="lazy" />` : `<span class="coin-entry-fallback">${html(coin.name.slice(0, 1))}</span>`}
    <div class="coin-entry-title"><strong>${html(coin.name)}</strong><span>${html(meta)}</span></div>
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
function renderRevelationBoardSelect(field, kind, label, currentId, options) {
  return `<label class="revelation-board-slot revelation-board-${html(kind)}">${html(label)}
    <select data-revelation-board-select="${html(field.id)}" data-kind="${html(kind)}">
      <option value="">未選択</option>
      ${options.map((item) => `<option value="${html(item.id)}" ${item.id === currentId ? "selected" : ""}>${html(item.name)}</option>`).join("")}
    </select>
  </label>`;
}

function renderRevelationBoardEffectPreview(item, emptyText) {
  if (!item) return `<div class="revelation-board-preview muted">${html(emptyText)}</div>`;
  const imageSrc = specialEffectImageSrc(item);
  return `<div class="revelation-board-preview">
    ${imageSrc ? `<img src="${html(imageSrc)}" alt="" loading="lazy" />` : `<span class="coin-entry-fallback">${html(item.name.slice(0, 1))}</span>`}
    <div><strong>${html(item.name)}</strong><span>${html(item.effect || "効果文なし")}</span></div>
  </div>`;
}

export function renderRevelationBoardRhetoricRow(field, entry, index, context) {
  const item = context.selectableEffectById.get(entry.effectId);
  if (!item) return "";
  const imageSrc = specialEffectImageSrc(item);
  return `<div class="revelation-rhetoric-row">
    ${imageSrc ? `<img src="${html(imageSrc)}" alt="" loading="lazy" />` : `<span class="coin-entry-fallback">${html(item.name.slice(0, 1))}</span>`}
    <div class="coin-entry-title"><strong>${html(item.name)}</strong><span>${html(item.effect || "効果文なし")}</span></div>
    <input type="number" min="1" max="99" value="${html(entry.count)}" data-revelation-board-rhetoric-count="${html(field.id)}" data-index="${html(index)}" aria-label="${html(item.name)}の重複数" />
    <button type="button" data-action="remove-revelation-board-rhetoric" data-revelation-board-field="${html(field.id)}" data-index="${html(index)}" aria-label="${html(item.name)}を削除">×</button>
  </div>`;
}

function renderRevelationBoardRhetoricCandidate(field, item) {
  const imageSrc = specialEffectImageSrc(item);
  return `<article class="revelation-rhetoric-candidate">
    ${imageSrc ? `<img src="${html(imageSrc)}" alt="" loading="lazy" />` : `<span class="coin-entry-fallback">${html(item.name.slice(0, 1))}</span>`}
    <div class="coin-entry-title"><strong>${html(item.name)}</strong><span>${html(item.effect || "効果文なし")}</span></div>
    <button type="button" data-action="add-revelation-board-rhetoric" data-revelation-board-field="${html(field.id)}" data-rhetoric-id="${html(item.id)}">追加</button>
  </article>`;
}

export function renderRevelationBoardLoadoutField(field, campaignId, special, context) {
  const board = context.normalizeRevelationBoardValue(field, campaignId, special[field.id]);
  const causeOptions = context.getRevelationBoardOptions(field, campaignId, "cause");
  const structureOptions = context.getRevelationBoardOptions(field, campaignId, "structure");
  const rhetoricOptions = context.getRevelationBoardOptions(field, campaignId, "rhetoric");
  const cause = context.selectableEffectById.get(board.causeId);
  const structure = context.selectableEffectById.get(board.structureId);
  return `<div class="field-wide special-effect-group revelation-board-loadout-field">
    ${context.renderSpecialEffectGroupHeader(field, special)}
    <div class="revelation-board-slots">
      ${renderRevelationBoardSelect(field, "cause", field.causeLabel || "本因", board.causeId, causeOptions)}
      ${renderRevelationBoardSelect(field, "structure", field.structureLabel || "構成", board.structureId, structureOptions)}
    </div>
    <div class="revelation-board-previews">
      ${renderRevelationBoardEffectPreview(cause, "本因未選択")}
      ${renderRevelationBoardEffectPreview(structure, "構成未選択")}
    </div>
    <div class="effect-stack-entry-summary">${html(context.formatRevelationBoardValue(field, board) || "未選択")}</div>
    <div class="revelation-rhetoric-section">
      <div class="special-effect-group-title">修辞候補（効果込みで追加）</div>
      <div class="revelation-rhetoric-candidates">
        ${rhetoricOptions.length ? rhetoricOptions.map((item) => renderRevelationBoardRhetoricCandidate(field, item)).join("") : `<div class="empty-state">修辞候補なし</div>`}
      </div>
    </div>
    <div class="revelation-rhetoric-section">
      <div class="special-effect-group-title">選択中の修辞</div>
      <div class="revelation-rhetoric-list">
        ${board.rhetorics.length ? board.rhetorics.map((entry, index) => renderRevelationBoardRhetoricRow(field, entry, index, context)).join("") : `<div class="empty-state">修辞なし</div>`}
      </div>
    </div>
  </div>`;
}
