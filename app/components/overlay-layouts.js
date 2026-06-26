import { assetUrl, html, stars } from "../lib/format.js";

export function renderOverlayCompact({ campaign, squad, option, performance, activeEffects, relics, operators, specialFields, special, difficultyGrade, run }, context) {
  const specialTags = context.getSpecialTags(specialFields, special, { overlay: true });
  const runStats = context.runStatDisplayItems(run);
  const specialItems = context.getOverlaySpecialEffects(campaign.id, specialFields, special);
  const flags = context.getBossFlagEntries(campaign.id);
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
        <span class="tag">Tier ${html(context.getDifficultyTierLabel())}</span>
        ${specialTags.map((item) => `<span class="tag info">${html(item.label)} ${html(item.value)}</span>`).join("")}
        ${runStats.map((item) => `<span class="tag">${html(item.label)} ${html(item.value)}</span>`).join("")}
      </div>
      ${context.renderSpecialOverlayBlock(specialItems, "compact", "compactRelicScrollSpeed")}
      ${activeEffects.length ? `<section class="compact-section compact-effects-section">
        <div class="compact-section-head"><span>Effects</span><span>${activeEffects.length}</span></div>
        <div class="stream-scroll compact-effect-scroll" data-autoscroll data-scroll-speed="${context.getOverlayScrollSpeed("compactRelicScrollSpeed")}">
          ${context.renderEffectList(activeEffects, "compact-effect-list", "発動効果なし")}
        </div>
      </section>` : ""}
      <section class="compact-section">
        <div class="compact-section-head"><span>Relics</span><span>${relics.length}</span></div>
        <div class="stream-scroll compact-relic-scroll" data-autoscroll data-scroll-speed="${context.getOverlayScrollSpeed("compactRelicScrollSpeed")}">
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
      ${flags.length ? `<section class="compact-section"><div class="compact-section-head"><span>Boss</span><span>${flags.length}</span></div><div class="compact-boss-list">${flags.slice(0, 4).map((flag) => context.renderBossChip(flag)).join("")}${flags.length > 4 ? `<span class="compact-more">+${flags.length - 4}</span>` : ""}</div></section>` : ""}
    </section>
  `;
}

export function renderOverlayDense({ campaign, squad, option, performance, activeEffects, relics, operators, specialFields, special, difficultyGrade, run, orientation }, context) {
  const specialTags = context.getSpecialTags(specialFields, special, { overlay: true });
  const runStats = context.runStatDisplayItems(run);
  const specialItems = context.getOverlaySpecialEffects(campaign.id, specialFields, special);
  const flags = context.getBossFlagEntries(campaign.id);
  return `
    <section class="stream-overlay-shell stream-${orientation}">
      <header class="stream-head">
        <div>
          <div class="stream-kicker">IS#${html(campaign.number)} / ${html(context.mode || "manual")}</div>
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
          <span class="tag">Tier ${html(context.getDifficultyTierLabel())}</span>
          ${specialTags.map((item) => `<span class="tag info">${html(item.label)} ${html(item.value)}</span>`).join("")}
          ${runStats.map((item) => `<span class="tag">${html(item.label)} ${html(item.value)}</span>`).join("")}
          ${flags.map((flag) => context.renderBossChip(flag)).join("")}
        </div>
        ${context.renderSpecialOverlayBlock(specialItems, "stream", orientation + "RelicScrollSpeed")}
        ${activeEffects.length ? `<div class="stream-scroll stream-effect-scroll" data-autoscroll data-scroll-speed="${context.getOverlayScrollSpeed(`${orientation}RelicScrollSpeed`)}">
          ${context.renderEffectList(activeEffects, "stream-effect-list", "発動効果なし")}
        </div>` : ""}
      </section>
      <section class="stream-panel stream-relic-panel">
        <div class="stream-section-head"><span>Relics</span><strong>${relics.length}</strong></div>
        <div class="stream-scroll stream-relic-scroll" data-autoscroll data-scroll-speed="${context.getOverlayScrollSpeed(`${orientation}RelicScrollSpeed`)}">
          <div class="stream-relic-grid">
            ${relics.length ? relics.map((item) => `<div class="stream-relic-tile" title="${html(context.relicEffectForDisplay(item))}"><img src="${html(assetUrl(item.image?.localPath))}" alt="" /><strong>${html(item.name)}</strong></div>`).join("") : `<div class="stream-empty">秘宝なし</div>`}
          </div>
        </div>
      </section>
      <section class="stream-panel stream-operator-panel">
        <div class="stream-section-head"><span>Operators</span><strong>${operators.length}</strong></div>
        <div class="stream-scroll stream-operator-scroll" data-autoscroll data-scroll-speed="${context.getOverlayScrollSpeed(`${orientation}OperatorScrollSpeed`)}">
          <div class="stream-operator-grid">
            ${operators.length ? operators.map((item) => `<div class="stream-operator-tile"><img src="${html(assetUrl(item.image?.localPath))}" alt="" /><div><strong>${html(item.name)}</strong><span>${stars(item.rarity)} / ${html(item.class || "-")}</span></div></div>`).join("") : `<div class="stream-empty">未招集</div>`}
          </div>
        </div>
      </section>
    </section>
  `;
}
export function renderOverlayDefault({ campaign, squad, option, performance, activeEffects, relics, operators, specialFields, special, difficultyGrade, run, mode, runDifficulty, updatedAt, bossFlagCount }, context) {
  const bossEntries = context.getBossFlagEntries();
  const runStats = context.runStatDisplayItems(run);
  return `
    <header class="overlay-top">
      <section class="overlay-card">
        <div class="overlay-card-header"><span>Campaign</span><span>IS#${campaign.number}</span></div>
        <div class="overlay-card-body">
          <div class="campaign-title">${html(campaign.title)}</div>
          <div class="campaign-sub">${html(campaign.fullTitle)}</div>
        </div>
      </section>
      <section class="overlay-card">
        <div class="overlay-card-header"><span>Run</span><span>${html(mode || "manual")}</span></div>
        <div class="overlay-card-body overlay-kpis">
          <div class="kpi"><div class="kpi-label">等級</div><div class="kpi-value">${html(difficultyGrade?.label || (runDifficulty ?? "-"))}</div></div>
          <div class="kpi"><div class="kpi-label">Tier</div><div class="kpi-value">${html(context.getDifficultyTierLabel())}</div></div>
          ${runStats.map((item) => `<div class="kpi"><div class="kpi-label">${html(item.label)}</div><div class="kpi-value">${html(item.value)}</div></div>`).join("")}
          ${context.getSpecialTags(specialFields, special, { overlay: true }).map((item) => `<div class="kpi"><div class="kpi-label">${html(item.label)}</div><div class="kpi-value">${html(item.value || "-")}</div></div>`).join("")}
          ${difficultyGrade ? context.renderDifficultyFields(difficultyGrade, "overlay") : ""}
        </div>
      </section>
      <section class="overlay-card">
        <div class="overlay-card-header"><span>Count</span><span>${html(new Date(updatedAt || Date.now()).toLocaleTimeString("ja-JP"))}</span></div>
        <div class="overlay-card-body overlay-kpis">
          <div class="kpi"><div class="kpi-label">秘宝</div><div class="kpi-value">${relics.length}</div></div>
          <div class="kpi"><div class="kpi-label">招集</div><div class="kpi-value">${operators.length}</div></div>
          <div class="kpi"><div class="kpi-label">Flag</div><div class="kpi-value">${bossFlagCount}</div></div>
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
          <div class="overlay-card-body overlay-effect-scroll stream-scroll" data-autoscroll data-scroll-speed="${context.getOverlayScrollSpeed("verticalRelicScrollSpeed")}">
            ${context.renderEffectList(activeEffects, "overlay-effect-list", "発動効果なし")}
          </div>
        </section>
        <section class="overlay-card">
          <div class="overlay-card-header"><span>Relics</span><span>${relics.length}</span></div>
          <div class="overlay-card-body relic-grid">
            ${relics.length ? relics.map((item) => `<div class="relic-tile" title="${html(context.relicEffectForDisplay(item))}"><img src="${html(assetUrl(item.image?.localPath))}" alt="" /><div>${html(item.name)}</div></div>`).join("") : `<div class="empty-state">秘宝なし</div>`}
          </div>
        </section>
      </div>
      <aside class="overlay-right">
        <section class="overlay-card">
          <div class="overlay-card-header"><span>Boss</span><span>${bossEntries.length}</span></div>
          <div class="overlay-card-body boss-list">
            ${bossEntries.length ? bossEntries.map((flag) => context.renderBossCard(flag, "compact")).join("") : `<span class="panel-subtitle">未設定</span>`}
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
}
