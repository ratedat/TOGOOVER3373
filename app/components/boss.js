import { bossFloorLabel, bossImages } from "../domain/boss-flags.js";
import { html } from "../lib/format.js";
import { mediaUrl } from "../lib/media.js";

function renderBossImages(entry) {
  const images = bossImages(entry);
  if (!images.length) return `<div class="boss-card-fallback">${html(String(entry.floor || "F").slice(0, 2))}</div>`;
  return `<div class="boss-icon-stack">${images.map((image) => `<img src="${html(mediaUrl(image))}" alt="" />`).join("")}</div>`;
}

export function bossDisplayTitle(entry) {
  if (entry.primaryDisplay === "stage" && entry.stageName) return entry.stageName;
  return entry.bossName || entry.title || entry.stageName || "未設定";
}

export function bossDisplaySubline(entry, title = bossDisplayTitle(entry)) {
  const subline = entry.primaryDisplay === "stage" ? (entry.bossName || entry.title || "") : (entry.stageName || "");
  return subline && subline !== title ? subline : "";
}

export function renderBossCard(entry, className = "") {
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

export function renderBossChip(entry) {
  const title = bossDisplayTitle(entry);
  const subline = bossDisplaySubline(entry, title);
  const img = bossImages(entry)[0];
  return `<span class="boss-chip" title="${html(subline || entry.stageName || title)}">${img ? `<img src="${html(mediaUrl(img))}" alt="" />` : ""}<span>${html(bossFloorLabel(entry))}</span><strong>${html(title)}</strong></span>`;
}