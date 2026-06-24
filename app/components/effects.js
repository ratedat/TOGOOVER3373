import { html } from "../lib/format.js";

function renderEffectText(item) {
  return `<span class="effect-text">${html(item.effect)}</span>`;
}

export function renderEffectList(effects, className = "", emptyText = "発動効果はありません。") {
  if (!effects.length) return `<div class="empty-state effect-empty">${html(emptyText)}</div>`;
  return `<div class="effect-list ${className}">
    ${effects.map((item) => `<div class="effect-row"><span class="effect-type">${html(item.type)}</span><strong class="effect-title">${html(item.title)}</strong>${renderEffectText(item)}</div>`).join("")}
  </div>`;
}