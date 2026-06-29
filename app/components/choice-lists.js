export function renderRelicListContent({ shown, filtered, owned, excluded = new Set() }, renderRelicControlRow) {
  return `
    ${shown.map((item) => renderRelicControlRow(item, owned.has(item.id), excluded.has(item.id))).join("")}
    ${shown.length === 0 ? `<div class="empty-state field-wide">条件に合う秘宝はありません。</div>` : ""}
    ${shown.length < filtered.length ? `<div class="empty-state field-wide">表示を絞り込んでください。残り${filtered.length - shown.length}件があります。</div>` : ""}
  `;
}

export function renderRelicListArea(viewData, renderRelicListContent) {
  return `<div class="list-area relic-pick-grid" style="--relic-grid-columns: ${viewData.gridColumns}">
    ${renderRelicListContent(viewData)}
  </div>`;
}

export function renderOperatorListContent({ shown, operators, selected, excluded = new Set() }, renderOperatorControlRow) {
  return `
    ${shown.map((item) => renderOperatorControlRow(item, selected.has(item.id), excluded.has(item.id))).join("")}
    ${shown.length === 0 ? `<div class="empty-state field-wide">条件に合うオペレーターはありません。</div>` : ""}
    ${shown.length < operators.length ? `<div class="empty-state field-wide">表示を絞り込んでください。残り${operators.length - shown.length}件があります。</div>` : ""}
  `;
}

export function renderOperatorListArea(viewData, renderOperatorControlRow) {
  return `<div class="list-area operator-pick-grid" style="--operator-grid-columns: ${viewData.gridColumns}">
    ${renderOperatorListContent(viewData, renderOperatorControlRow)}
  </div>`;
}
