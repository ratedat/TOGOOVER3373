import { assetUrl, html, stars } from "../lib/format.js";

export const overlayPartOptions = [
  { id: "status", title: "Status", label: "ラン状態", hint: "上部バー / 1200x120" },
  { id: "relics", title: "Relics", label: "秘宝", hint: "横帯または下帯 / 1200x170" },
  { id: "operators", title: "Operators", label: "招集", hint: "右サイド / 420x620" },
  { id: "effects", title: "Effects", label: "効果", hint: "左サイド / 520x360" },
  { id: "bosses", title: "Boss Flags", label: "ボス", hint: "フラグ枠 / 520x220" },
  { id: "special", title: "Special", label: "特殊値", hint: "啓示・思案など / 520x180" },
];


function section(part, title, count, body) {
  return `<section class="overlay-part-shell overlay-part-${part}">
    <header class="overlay-part-head"><span>${html(title)}</span><strong>${html(count)}</strong></header>
    <div class="overlay-part-body">${body}</div>
  </section>`;
}

function empty(text) {
  return `<div class="overlay-part-empty">${html(text)}</div>`;
}

function renderStatusPart(args, context) {
  const specialTags = context.getSpecialTags(args.specialFields, args.special, { overlay: true });
  const runStats = context.runStatDisplayItems(args.run);
  const bossEntries = context.getBossFlagEntries(args.campaign.id);
  const updated = new Date(args.updatedAt || Date.now()).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
  return `<section class="overlay-part-shell overlay-part-status">
    <div class="overlay-part-status-grid">
      <div class="overlay-part-status-main">
        <span>IS#${html(args.campaign.number)} / ${html(context.mode || "通常")}</span>
        <strong>${html(args.campaign.title)}</strong>
      </div>
      <div class="overlay-part-status-cell"><span>等級</span><strong>${html(args.difficultyGrade?.label || args.runDifficulty || "-")}</strong></div>
      <div class="overlay-part-status-cell"><span>分隊</span><strong>${html(args.squad?.name || "未選択")}</strong></div>
      <div class="overlay-part-status-cell"><span>秘宝</span><strong>${args.relics.length}</strong></div>
      <div class="overlay-part-status-cell"><span>招集</span><strong>${args.operators.length}</strong></div>
      <div class="overlay-part-status-cell"><span>Boss</span><strong>${bossEntries.length}</strong></div>
      ${runStats.map((item) => `<div class="overlay-part-status-cell"><span>${html(item.label)}</span><strong>${html(item.value)}</strong></div>`).join("")}
      <div class="overlay-part-status-cell"><span>更新</span><strong>${html(updated)}</strong></div>
    </div>
    <div class="overlay-part-chip-row">
      <span class="tag accent">Tier ${html(context.getDifficultyTierLabel())}</span>
      ${args.performance ? `<span class="tag info">${html(args.performance.title || args.performance.name)}</span>` : ""}
      ${args.option?.label ? `<span class="tag info">${html(args.option.label)}</span>` : ""}
      ${specialTags.map((item) => `<span class="tag info">${html(item.label)} ${html(item.value)}</span>`).join("")}
    </div>
  </section>`;
}

function renderRelicsPart(args, context) {
  const body = args.relics.length ? `<div class="stream-scroll overlay-part-scroll overlay-part-relic-scroll" data-autoscroll data-scroll-speed="${context.getOverlayScrollSpeed("horizontalRelicScrollSpeed")}">
    <div class="overlay-part-relic-grid">
      ${args.relics.map((item) => `<div class="overlay-part-relic" title="${html(context.relicEffectForDisplay(item))}"><img src="${html(assetUrl(item.image?.localPath))}" alt="" /><span>${html(item.name)}</span></div>`).join("")}
    </div>
  </div>` : empty("秘宝なし");
  return section("relics", "Relics", args.relics.length, body);
}

function renderOperatorsPart(args, context) {
  const grouped = [6, 5, 4, 3, 2, 1]
    .map((rarity) => ({ rarity, items: args.operators.filter((item) => Number(item.rarity) === rarity) }))
    .filter((group) => group.items.length);
  const body = grouped.length ? `<div class="stream-scroll overlay-part-scroll overlay-part-operator-scroll" data-autoscroll data-scroll-speed="${context.getOverlayScrollSpeed("horizontalOperatorScrollSpeed")}">
    <div class="overlay-part-operator-groups">
      ${grouped.map((group) => `<section class="overlay-part-operator-group"><h3>${stars(group.rarity)} <span>${group.items.length}</span></h3><div class="overlay-part-operator-grid">${group.items.map((item) => `<div class="overlay-part-operator"><img src="${html(assetUrl(item.image?.localPath))}" alt="" /><div><strong>${html(item.name)}</strong><span>${html(item.class || "-")} / ${html(item.branch || "-")}</span></div></div>`).join("")}</div></section>`).join("")}
    </div>
  </div>` : empty("未招集");
  return section("operators", "Operators", args.operators.length, body);
}

function renderEffectsPart(args, context) {
  const body = `<div class="stream-scroll overlay-part-scroll overlay-part-effect-scroll" data-autoscroll data-scroll-speed="${context.getOverlayScrollSpeed("verticalRelicScrollSpeed")}">
    ${context.renderEffectList(args.activeEffects, "overlay-part-effect-list", "発動効果なし")}
  </div>`;
  return section("effects", "Effects", args.activeEffects.length, body);
}

function renderBossesPart(args, context) {
  const entries = context.getBossFlagEntries(args.campaign.id);
  const body = entries.length ? `<div class="stream-scroll overlay-part-scroll overlay-part-boss-scroll" data-autoscroll data-scroll-speed="${context.getOverlayScrollSpeed("verticalRelicScrollSpeed")}"><div class="overlay-part-boss-grid">${entries.map((entry) => context.renderBossCard(entry, "compact")).join("")}</div></div>` : empty("ボスフラグなし");
  return section("bosses", "Boss Flags", entries.length, body);
}

function renderSpecialPart(args, context) {
  const specialItems = context.getOverlaySpecialEffects(args.campaign.id, args.specialFields, args.special);
  const body = specialItems.length ? context.renderSpecialOverlayBlock(specialItems, "part", "verticalRelicScrollSpeed") : empty("表示対象の特殊値なし");
  return section("special", "Special", specialItems.length, body);
}

export function renderOverlayPart(part, args, context) {
  if (part === "status") return renderStatusPart(args, context);
  if (part === "relics") return renderRelicsPart(args, context);
  if (part === "operators") return renderOperatorsPart(args, context);
  if (part === "effects") return renderEffectsPart(args, context);
  if (part === "bosses") return renderBossesPart(args, context);
  if (part === "special") return renderSpecialPart(args, context);
  return renderStatusPart(args, context);
}