import { html } from "../lib/format.js";

export function renderCompactSpecialPicker(field, campaignId, special, context) {
  const options = context.getSelectableEffectsForField(field, campaignId);
  const selectedIds = context.asSpecialArray(special[field.id]);
  const selected = new Set(selectedIds);
  const selectedItems = selectedIds.map((id) => context.selectableEffectById.get(id)).filter(Boolean);
  return `<div class="field-wide special-effect-group compact-special-picker" data-special-picker="${html(field.id)}">
    ${context.renderSpecialEffectGroupHeader(field, special)}
    <div class="special-picker-row">
      <select data-special-picker-select="${html(field.id)}">
        ${context.renderSpecialEffectSelectOptions(options, "", `${field.label}を追加`, selected)}
      </select>
      <button type="button" data-action="add-special-effect" data-special-picker-field="${html(field.id)}">追加</button>
    </div>
    <div class="special-selected-list">
      ${selectedItems.length ? selectedItems.map((item) => context.renderSpecialSelectedChip(field, item)).join("") : `<div class="empty-state">未選択</div>`}
    </div>
  </div>`;
}

export function renderSpecialField(field, campaignId, special, context) {
  if (field.type === "effectSelect") {
    const options = context.getSelectableEffectsForField(field, campaignId);
    const current = special[field.id] || "";
    return `<label>${html(field.label)}
      <select data-special-field="${html(field.id)}">
        ${context.renderSpecialEffectSelectOptions(options, current, "未選択")}
      </select>
    </label>`;
  }
  if (field.type === "effectMultiSelect") {
    if (field.compact) return renderCompactSpecialPicker(field, campaignId, special, context);
    const options = context.getSelectableEffectsForField(field, campaignId);
    const selected = new Set(context.asSpecialArray(special[field.id]));
    return `<div class="field-wide special-effect-group">
      ${context.renderSpecialEffectGroupHeader(field, special)}
      <div class="special-effect-options">
        ${options.length ? options.map((item) => context.renderSpecialEffectOption(field, item, selected)).join("") : `<div class="empty-state">選択肢がありません。</div>`}
      </div>
    </div>`;
  }
  if (field.type === "effectRankedMultiSelect") {
    const groups = context.getRankedEffectGroups(field, campaignId);
    const selected = context.asSpecialObject(special[field.id]);
    return `<div class="field-wide special-effect-group">
      ${context.renderSpecialEffectGroupHeader(field, special)}
      <div class="special-effect-ranked-list">
        ${groups.length ? groups.map((group) => context.renderRankedSpecialEffectRow(field, group, selected[group.key])).join("") : `<div class="empty-state">選択肢がありません。</div>`}
      </div>
    </div>`;
  }
  if (field.type === "effectStackLoadout") return context.renderEffectStackLoadoutField(field, campaignId, special);
  if (field.type === "revelationBoardLoadout") return context.renderRevelationBoardLoadoutField(field, campaignId, special);
  if (field.type === "coinLoadout") return context.renderCoinLoadoutField(field, campaignId, special);
  const minAttr = field.min !== undefined ? ` min="${html(field.min)}"` : "";
  const maxAttr = field.max !== undefined ? ` max="${html(field.max)}"` : "";
  return `<label>${html(field.label)}
    <input type="${field.type === "number" ? "number" : "text"}"${minAttr}${maxAttr} value="${html(special[field.id] ?? "")}" data-special-field="${html(field.id)}" />
  </label>`;
}