import { assetUrl, html, stars } from "../lib/format.js";

export function renderRelicControlRow(item, active, effectText, meta = {}) {
  const autoOnly = meta.template && !meta.manual;
  const badges = [
    autoOnly ? '<span class="item-badge template">自動</span>' : '',
    meta.manual && meta.template ? '<span class="item-badge template">手動+自動</span>' : '',
  ].filter(Boolean).join("");
  return `
    <div class="item-row relic-choice ${active ? "active" : ""} ${autoOnly ? "template-active" : ""}" data-action="toggle-relic" data-id="${item.id}" role="button" tabindex="0" aria-pressed="${active ? "true" : "false"}">
      <img class="item-thumb" src="${html(assetUrl(item.image?.localPath))}" alt="" loading="lazy" />
      <div>
        <div class="item-title">No.${html(item.number)} ${html(item.name)}</div>
        <div class="item-meta">${html(item.category || "")}</div>
        <div class="item-effect">${html(effectText)}</div>
      </div>
      <div class="item-badges">${badges}</div>
    </div>
  `;
}

export function renderOperatorControlRow(item, active) {
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