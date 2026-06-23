const app = document.querySelector("#app");
const routeParams = new URLSearchParams(location.search);
const view = location.pathname.includes("overlay") || routeParams.get("view") === "overlay" ? "overlay" : "control";
const requestedOverlayLayout = routeParams.get("layout") || "compact";
const overlayLayout = ["compact", "vertical", "horizontal", "full"].includes(requestedOverlayLayout) ? requestedOverlayLayout : "compact";
const requestedOverlaySize = routeParams.get("size") || routeParams.get("scale") || "medium";
const overlaySizeAliases = { s: "small", small: "small", m: "medium", medium: "medium", l: "large", large: "large" };
const overlaySize = overlaySizeAliases[requestedOverlaySize] || "medium";
let overlayAutoScrollFrame = null;
if (view === "overlay") document.documentElement.classList.add("overlay-mode");

const stateUrl = "/api/state";
const masterUrl = "/api/master";
const ui = {
  tab: "run",
  relicSearch: "",
  relicCategory: "all",
  operatorRarity: "all",
  operatorClass: "all",
  operatorBranch: "all",
  operatorRelease: "released",
  bossDraft: "",
  importDraft: "",
  notice: "",
  saveStatus: "未保存",
};

let master = null;
let state = null;
let maps = null;
let saveTimer = null;
let lastStateJson = "";

const html = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

function stableJson(value, ignoredKeys = new Set()) {
  return JSON.stringify(value, (key, item) => {
    if (ignoredKeys.has(key)) return undefined;
    if (!item || typeof item !== "object" || Array.isArray(item)) return item;
    return Object.keys(item).sort().reduce((result, objectKey) => {
      result[objectKey] = item[objectKey];
      return result;
    }, {});
  });
}

function stableOverlayStateJson(value) {
  return stableJson(value, new Set(["updatedAt"]));
}

const normalizeText = (value) => String(value ?? "").toLowerCase().replace(/\s+/g, "");
const assetUrl = (localPath) => localPath ? `/${String(localPath).replaceAll("\\", "/")}` : "";
const stars = (rarity) => "★".repeat(Number(rarity) || 0);
const overlayScrollSpeedDefaults = {
  compactRelicScrollSpeed: 9,
  verticalRelicScrollSpeed: 11,
  verticalOperatorScrollSpeed: 13,
  horizontalRelicScrollSpeed: 14,
  horizontalOperatorScrollSpeed: 16,
};
const overlayScrollSpeedLabels = {
  compactRelicScrollSpeed: "コンパクト 秘宝",
  verticalRelicScrollSpeed: "縦長 秘宝",
  verticalOperatorScrollSpeed: "縦長 オペレーター",
  horizontalRelicScrollSpeed: "横長 秘宝",
  horizontalOperatorScrollSpeed: "横長 オペレーター",
};

function buildMaps() {
  maps = {
    campaign: new Map(master.campaigns.map((item) => [item.id, item])),
    squad: new Map(master.squads.map((item) => [item.id, item])),
    relic: new Map(master.relics.map((item) => [item.id, item])),
    operator: new Map(master.operators.map((item) => [item.id, item])),
    performance: new Map((master.performances || []).map((item) => [item.id, item])),
    variantGroup: new Map((master.relicEffectVariants || []).map((item) => [item.relicId, item])),
  };
}

function getCampaign() {
  return maps.campaign.get(state?.run?.campaignId) || master.campaigns[0];
}

function getCampaignSquads() {
  const campaign = getCampaign();
  return master.squads.filter((item) => item.campaignId === campaign.id);
}

function getCampaignRelics() {
  const campaign = getCampaign();
  return master.relics.filter((item) => item.campaignId === campaign.id);
}

function getCampaignPerformances(campaignId = getCampaign()?.id) {
  return (master.performances || []).filter((item) => item.campaignId === campaignId);
}

function getSelectedPerformance() {
  const id = state?.run?.performanceId;
  return id ? maps.performance.get(id) : null;
}

function performanceGroupLabel(group) {
  if (group === "standard") return "通常";
  if (group === "crimson") return "緋染め";
  return group || "その他";
}

function renderPerformanceSelect(campaignId) {
  const performances = getCampaignPerformances(campaignId);
  const current = state?.run?.performanceId || "";
  if (!performances.length) return `<select data-field="performanceId"><option value="">対象外</option></select>`;
  const grouped = new Map();
  for (const item of performances) {
    const key = item.group || "other";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(item);
  }
  const preferred = ["standard", "crimson"];
  const groupKeys = [...preferred.filter((key) => grouped.has(key)), ...[...grouped.keys()].filter((key) => !preferred.includes(key))];
  return `<select data-field="performanceId">
    <option value="">未選択</option>
    ${groupKeys.map((group) => `<optgroup label="${html(performanceGroupLabel(group))}">${grouped.get(group).map((item) => `<option value="${html(item.id)}" ${item.id === current ? "selected" : ""}>${html(item.name)}</option>`).join("")}</optgroup>`).join("")}
  </select>`;
}

function getSelectedSquad() {
  const id = state?.run?.squadId || (typeof state?.run?.squad === "string" ? state.run.squad : null);
  return id ? maps.squad.get(id) : null;
}

function getSelectedSquadOption(squad = getSelectedSquad()) {
  const options = squad?.randomEffectOptions || [];
  const id = state?.run?.squadRandomEffectOptionId;
  return options.find((item) => item.id === id) || null;
}

function getOwnedRelics() {
  return (state.relics || []).map((id) => maps.relic.get(id)).filter(Boolean);
}

function getRecruitedOperators() {
  const ops = (state.operators || []).map((id) => maps.operator.get(id)).filter(Boolean);
  return sortOperators(ops);
}

function sortOperators(operators) {
  const mode = state.preferences?.operatorSort || "rarity_desc";
  return [...operators].sort((a, b) => {
    if (mode === "rarity_asc") return (a.rarity - b.rarity) || (a.displayOrder - b.displayOrder) || a.name.localeCompare(b.name, "ja");
    if (mode === "name") return a.name.localeCompare(b.name, "ja");
    return (b.rarity - a.rarity) || (a.displayOrder - b.displayOrder) || a.name.localeCompare(b.name, "ja");
  });
}

function getDifficultyGradeConfig(campaignId = state?.run?.campaignId) {
  return master?.difficultyGrades?.[campaignId] || null;
}

function getSelectedDifficultyGrade() {
  const cfg = getDifficultyGradeConfig();
  const raw = state?.run?.difficulty;
  const value = raw === null || raw === undefined || raw === "" ? null : Number(raw);
  if (!cfg || !Number.isFinite(value)) return null;
  return (cfg.grades || []).find((item) => Number(item.grade) === value) || null;
}

function renderDifficultySelect(campaignId) {
  const cfg = getDifficultyGradeConfig(campaignId);
  const current = state?.run?.difficulty;
  if (!cfg?.grades?.length) {
    return `<select data-field="difficulty"><option value="">未設定</option></select>`;
  }
  return `<select data-field="difficulty">
    <option value="">未選択</option>
    ${cfg.grades.map((item) => `<option value="${html(item.grade)}" ${Number(current) === Number(item.grade) ? "selected" : ""}>${html(item.label)}</option>`).join("")}
  </select>`;
}

function difficultySummary(grade) {
  return (grade?.fields || [])
    .filter((item) => item.value !== null && item.value !== undefined && item.value !== "")
    .map((item) => `${item.label}: ${item.value}`)
    .join(" / ");
}

function renderDifficultyFields(grade, mode = "control") {
  const fields = (grade?.fields || []).filter((item) => item.value !== null && item.value !== undefined && item.value !== "");
  if (!grade || !fields.length) return "";
  return `<div class="difficulty-summary ${mode === "overlay" ? "overlay-detail" : ""}">
    <div class="difficulty-summary-title">${html(grade.label)}</div>
    <div class="difficulty-field-list">
      ${fields.map((item) => `<div class="difficulty-field"><span>${html(item.label)}</span><strong>${html(item.value)}</strong></div>`).join("")}
    </div>
  </div>`;
}

function operatorReleaseMatches(item) {
  if (ui.operatorRelease === "all") return true;
  if (ui.operatorRelease === "unreleased") return Boolean(item.hiddenByDefault);
  return !item.hiddenByDefault;
}

function uniqueValues(items, key) {
  return [...new Set(items.map((item) => item[key]).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "ja"));
}

function clampOperatorGridColumns(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 2;
  return Math.min(6, Math.max(1, Math.trunc(numeric)));
}

function clampOverlayScrollSpeed(value, fallback = 12) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(30, Math.max(0, Math.round(numeric)));
}

function getOverlayScrollSpeed(key) {
  return clampOverlayScrollSpeed(state?.preferences?.[key], overlayScrollSpeedDefaults[key] ?? 12);
}

function isOverlayScrollSpeedField(field) {
  return Object.prototype.hasOwnProperty.call(overlayScrollSpeedDefaults, field);
}

function renderScrollSpeedControl(key) {
  const value = getOverlayScrollSpeed(key);
  return `<label>${html(overlayScrollSpeedLabels[key] || key)} <span class="range-value">${value}</span>
    <input type="range" min="0" max="30" step="1" value="${value}" data-field="${key}" />
  </label>`;
}

function getOperatorGridColumns() {
  return clampOperatorGridColumns(state?.preferences?.operatorGridColumns ?? 2);
}

function getRelicGridColumns() {
  return clampOperatorGridColumns(state?.preferences?.relicGridColumns ?? 2);
}
function normalizeOperatorFilters() {
  const releaseBase = master.operators.filter(operatorReleaseMatches);
  const rarityValues = new Set(releaseBase.map((item) => String(item.rarity)));
  if (ui.operatorRarity !== "all" && !rarityValues.has(ui.operatorRarity)) ui.operatorRarity = "all";
  const rarityBase = releaseBase.filter((item) => ui.operatorRarity === "all" || String(item.rarity) === ui.operatorRarity);
  const classValues = new Set(rarityBase.map((item) => item.class).filter(Boolean));
  if (ui.operatorClass !== "all" && !classValues.has(ui.operatorClass)) {
    ui.operatorClass = "all";
    ui.operatorBranch = "all";
  }
  const classBase = rarityBase.filter((item) => ui.operatorClass === "all" || item.class === ui.operatorClass);
  const branchValues = new Set(classBase.map((item) => item.branch).filter(Boolean));
  if (ui.operatorBranch !== "all" && !branchValues.has(ui.operatorBranch)) ui.operatorBranch = "all";
}
function deriveDifficultyTier() {
  const campaignId = state?.run?.campaignId;
  const cfg = master?.difficultyTiers?.[campaignId];
  if (!cfg) {
    state.run.difficultyTierId = null;
    return null;
  }
  const raw = state.run.difficulty;
  const value = raw === null || raw === undefined || raw === "" ? null : Number(raw);
  if (!Number.isFinite(value)) {
    state.run.difficultyTierId = null;
    return null;
  }
  const tier = cfg.tiers.find((item) => value >= item.minDifficulty && (item.maxDifficulty === null || value <= item.maxDifficulty));
  state.run.difficultyTierId = tier?.id || cfg.defaultTierId || null;
  return tier || null;
}

function getDifficultyTierLabel() {
  const campaignId = state?.run?.campaignId;
  const tierId = state?.run?.difficultyTierId;
  const cfg = master?.difficultyTiers?.[campaignId];
  if (!cfg || !tierId) return "未解決";
  const tier = cfg.tiers.find((item) => item.id === tierId);
  return tier ? tier.label : tierId;
}

function relicEffectForDisplay(relic) {
  const group = maps.variantGroup.get(relic.id);
  if (!group) return relic.effect || "";
  const tierId = state.run.difficultyTierId || group.fallbackTierId;
  const variant = group.variants.find((item) => item.tierId === tierId) || group.variants.find((item) => item.tierId === group.fallbackTierId);
  return variant?.effect || relic.effect || "";
}

function isPureRecruitmentRelicEffect(text) {
  const recruitmentPattern = /(招集|昇進|臨時加入|編成可能|支援に駆けつける|希望消費)/;
  const combatModifierPattern = /(攻撃力|防御力|最大HP|HP|術耐性|攻撃速度|SP|ブロック|配置コスト|再配置|被ダメージ|与ダメージ|ダメージ|レジスト|迷彩|バリア|シールド|回避|元素損傷|元素ダメージ)/;
  return recruitmentPattern.test(text) && !combatModifierPattern.test(text);
}

function isOperatorCombatRelicEffect(text) {
  if (!text || isPureRecruitmentRelicEffect(text)) return false;
  const targetPattern = /(オペレーター|味方(?:ユニット)?|近距離|遠距離|配置待機エリア|地面マスに遠距離|戦場中のオペレーター|【(?:先鋒|前衛|重装|狙撃|術師|医療|補助|特殊|伺燭客)】|化境マスに(?:配置|いる)|防衛ラインの周囲\d+マスにいるオペレーター)/;
  const modifierPattern = /(攻撃力|防御力|最大HP|HP|術耐性|攻撃速度|SP|ストックSP|ブロック数|配置コスト|再配置|物理・術回避|回避|レジスト|迷彩|バリア|シールド|加護|回復|被ダメージ|与ダメージ|ダメージ|元素損傷|スキル|攻撃範囲|配置後|配置した|配置するたび|コスト)/;
  return targetPattern.test(text) && modifierPattern.test(text);
}

function isEnemyCombatRelicEffect(text) {
  if (!text) return false;
  const targetPattern = /(敵|BOSS|ボス|エリート|【化物】|彫像器鬼)/i;
  const modifierPattern = /(HP|最大HP|防御力|術耐性|攻撃力|攻撃速度|移動速度|命中率|被ダメージ|受ける(?:物理・術|元素|術|確定)?ダメージ|与えるダメージ|ダメージ(?:[-+]|を|が)|スタン|寒冷|凍結|恐怖|バインド|浮遊|反重力|ステルス|無効|ブロック|元素ダメージ|元素損傷|状態|出現後)/;
  const nonTargetPattern = /(敵出現地点|新たな敵が出現|敵に触れられた際|敵が撃破された際.*味方|戦場に残っている.*耐久値|さらに手強くなる|探索を違う方向)/;
  return targetPattern.test(text) && modifierPattern.test(text) && !nonTargetPattern.test(text);
}

function summarizeRelicCombatEffects() {
  const buckets = { both: [], operator: [], enemy: [] };
  for (const relic of getOwnedRelics()) {
    const effect = relicEffectForDisplay(relic);
    const affectsOperator = isOperatorCombatRelicEffect(effect);
    const affectsEnemy = isEnemyCombatRelicEffect(effect);
    if (!affectsOperator && !affectsEnemy) continue;
    const entry = { name: relic.name, effect };
    if (affectsOperator && affectsEnemy) buckets.both.push(entry);
    else if (affectsOperator) buckets.operator.push(entry);
    else buckets.enemy.push(entry);
  }

  const summaries = [];
  const pushBucket = (title, items) => {
    if (!items.length) return;
    summaries.push({
      type: "秘宝",
      title: `${title} ${items.length}件`,
      effect: items.map((item) => `${item.name}: ${item.effect}`).join(" / "),
      items,
    });
  };
  pushBucket("オペレーター/敵作用", buckets.both);
  pushBucket("オペレーター作用", buckets.operator);
  pushBucket("敵作用", buckets.enemy);
  return summaries;
}

function getActiveEffects({ includeRelics = true } = {}) {
  const effects = [];
  const pushEffect = (type, title, effect) => {
    if (!effect) return;
    effects.push({ type, title: title || type, effect });
  };
  const squad = getSelectedSquad();
  const option = getSelectedSquadOption(squad);
  const performance = getSelectedPerformance();
  pushEffect("分隊", squad?.name, squad?.effect);
  pushEffect("分隊追加", option?.label || "ランダム効果", option?.effect);
  pushEffect("演目", performance?.name || performance?.title, performance?.effect);
  if (includeRelics) effects.push(...summarizeRelicCombatEffects());
  return effects;
}

function renderEffectText(item) {
  if (Array.isArray(item.items) && item.items.length) {
    return `<span class="effect-text effect-text-list">${item.items.map((source) => `<span class="effect-source"><span class="effect-source-name">${html(source.name)}</span>: ${html(source.effect)}</span>`).join("")}</span>`;
  }
  return `<span class="effect-text">${html(item.effect)}</span>`;
}

function renderEffectList(effects, className = "", emptyText = "発動効果はありません。") {
  if (!effects.length) return `<div class="empty-state effect-empty">${html(emptyText)}</div>`;
  return `<div class="effect-list ${className}">
    ${effects.map((item) => `<div class="effect-row"><span class="effect-type">${html(item.type)}</span><strong class="effect-title">${html(item.title)}</strong>${renderEffectText(item)}</div>`).join("")}
  </div>`;
}

function ensureStateShape() {
  state.run ||= {};
  state.run.campaignId ||= "is5_sarkaz";
  state.run.performanceId ??= null;
  state.run.special ||= {};
  for (const campaign of master.campaigns) state.run.special[campaign.id] ||= {};
  if (state.run.performanceId && !getCampaignPerformances(state.run.campaignId).some((item) => item.id === state.run.performanceId)) state.run.performanceId = null;
  state.relics = Array.isArray(state.relics) ? state.relics : [];
  state.operators = Array.isArray(state.operators) ? state.operators : [];
  state.bossFlags = Array.isArray(state.bossFlags) ? state.bossFlags : [];
  state.pendingSuggestions = Array.isArray(state.pendingSuggestions) ? state.pendingSuggestions : [];
  state.preferences ||= {};
  state.preferences.showUnreleasedOperators ??= false;
  state.preferences.operatorSort ||= "rarity_desc";
  state.preferences.operatorGridColumns = clampOperatorGridColumns(state.preferences.operatorGridColumns ?? 2);
  state.preferences.relicGridColumns = clampOperatorGridColumns(state.preferences.relicGridColumns ?? 2);
  for (const [key, fallback] of Object.entries(overlayScrollSpeedDefaults)) {
    state.preferences[key] = clampOverlayScrollSpeed(state.preferences[key], fallback);
  }
  state.tournament ||= { pendingState: null, lastSubmissionAt: null, submittedBy: null };
  deriveDifficultyTier();
}

async function apiJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

function setNotice(text) {
  ui.notice = text;
  if (view === "control") renderControl();
}

function scheduleSave() {
  ui.saveStatus = "保存中";
  renderControlHeaderStatus();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveState, 220);
}

async function saveState() {
  try {
    deriveDifficultyTier();
    state = await apiJson(stateUrl, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(state),
    });
    ensureStateShape();
    lastStateJson = stableOverlayStateJson(state);
    ui.saveStatus = "保存済み";
  } catch (error) {
    ui.saveStatus = "保存失敗";
    console.error(error);
  }
  renderControlHeaderStatus();
}

function captureListScroll() {
  if (view !== "control") return null;
  const list = document.querySelector(".list-area");
  if (!list) return null;
  return {
    tab: ui.tab,
    scrollTop: list.scrollTop,
    scrollLeft: list.scrollLeft,
  };
}

function restoreListScroll(snapshot) {
  if (!snapshot || view !== "control" || snapshot.tab !== ui.tab) return;
  requestAnimationFrame(() => {
    const list = document.querySelector(".list-area");
    if (!list) return;
    list.scrollTop = snapshot.scrollTop;
    list.scrollLeft = snapshot.scrollLeft;
  });
}

function mutate(fn, options = {}) {
  const { render = true } = options;
  const scrollSnapshot = render ? captureListScroll() : null;
  fn(state);
  ensureStateShape();
  if (view === "control" && render) {
    renderControl();
    restoreListScroll(scrollSnapshot);
  }
  scheduleSave();
}

function setChoicePressed(element, active) {
  if (!element) return;
  element.classList.toggle("active", active);
  element.setAttribute("aria-pressed", active ? "true" : "false");
}

function refreshChoiceCountLabels() {
  const subtitle = document.querySelector(".panel-header .panel-subtitle");
  if (!subtitle) return;
  if (ui.tab === "relics") {
    subtitle.textContent = subtitle.textContent.replace(/所持\d+件/, `所持${state.relics.length}件`);
  } else if (ui.tab === "operators") {
    subtitle.textContent = subtitle.textContent.replace(/招集\d+名/, `招集${state.operators.length}名`);
  }
}

function toggleChoiceElement(element, type, id) {
  mutate((s) => {
    if (type === "relic") s.relics = toggleId(s.relics, id);
    else s.operators = toggleId(s.operators, id);
  }, { render: false });
  const active = type === "relic" ? state.relics.includes(id) : state.operators.includes(id);
  setChoicePressed(element, active);
  refreshChoiceCountLabels();
}

function renderControlHeaderStatus() {
  const el = document.querySelector(".save-status");
  if (el) el.textContent = ui.saveStatus;
}

function navButton(id, label, icon) {
  return `<button class="nav-button ${ui.tab === id ? "active" : ""}" data-action="tab" data-tab="${id}"><span class="nav-icon">${icon}</span><span>${label}</span></button>`;
}

function renderControl() {
  app.dataset.loading = "false";
  document.body.className = "";
  app.className = "control-app";
  app.innerHTML = `
    <header class="control-topbar">
      <div class="brand">
        <div class="brand-mark">IS</div>
        <div>
          <h1>Arknights Rogue OBS Tool</h1>
          <p>${html(getCampaign()?.fullTitle)} / ${html(state.mode || "manual")}</p>
        </div>
      </div>
      <div class="topbar-actions">
        <a href="/overlay" target="_blank">Overlay</a>
        <a href="/control" target="_self">Control</a>
        <span class="save-status">${html(ui.saveStatus)}</span>
        <button class="ghost" data-action="reset-state">リセット</button>
      </div>
    </header>
    <div class="control-layout">
      <nav class="control-nav">
        ${navButton("run", "ラン状態", "R")}
        ${navButton("relics", "秘宝", "T")}
        ${navButton("operators", "招集", "O")}
        ${navButton("flags", "ボス/大会", "F")}
        ${navButton("json", "入出力", "J")}
      </nav>
      <main class="control-main">
        ${ui.notice ? `<div class="panel" style="margin-bottom:14px"><div class="panel-body">${html(ui.notice)}</div></div>` : ""}
        ${renderCurrentTab()}
      </main>
    </div>
  `;
}

function renderCurrentTab() {
  if (ui.tab === "relics") return renderRelicsTab();
  if (ui.tab === "operators") return renderOperatorsTab();
  if (ui.tab === "flags") return renderFlagsTab();
  if (ui.tab === "json") return renderJsonTab();
  return renderRunTab();
}

function renderRunTab() {
  const campaign = getCampaign();
  const squads = getCampaignSquads();
  const selectedSquad = getSelectedSquad();
  const randomOptions = selectedSquad?.randomEffectOptions || [];
  const performances = getCampaignPerformances(campaign.id);
  const selectedPerformance = getSelectedPerformance();
  const activeEffects = getActiveEffects();
  const specialFields = campaign.specialFields || [];
  const special = state.run.special?.[campaign.id] || {};
  const tierCfg = master.difficultyTiers?.[campaign.id];
  const difficultyGrade = getSelectedDifficultyGrade();
  return `
    <section class="panel-grid">
      <div class="panel half">
        <div class="panel-header"><h2 class="panel-title">ラン基本情報</h2><span class="panel-subtitle">OBS表示の主状態</span></div>
        <div class="panel-body form-grid two">
          <label>統合戦略
            <select data-field="campaignId">
              ${master.campaigns.map((item) => `<option value="${item.id}" ${item.id === campaign.id ? "selected" : ""}>IS#${item.number} ${html(item.title)}</option>`).join("")}
            </select>
          </label>
          <label>等級 / 難易度
            ${renderDifficultySelect(campaign.id)}
          </label>
          <label class="field-wide">分隊
            <select data-field="squadId">
              <option value="">未選択</option>
              ${squads.map((item) => `<option value="${item.id}" ${item.id === state.run.squadId ? "selected" : ""}>${html(item.name)}</option>`).join("")}
            </select>
          </label>
          ${randomOptions.length ? `<label class="field-wide">ランダム分隊効果
            <select data-field="squadRandomEffectOptionId">
              <option value="">未選択</option>
              ${randomOptions.map((item) => `<option value="${item.id}" ${item.id === state.run.squadRandomEffectOptionId ? "selected" : ""}>${html(item.label || item.id)}</option>`).join("")}
            </select>
          </label>` : ""}
          ${performances.length ? `<label class="field-wide">演目
            ${renderPerformanceSelect(campaign.id)}
          </label>` : ""}
        </div>
      </div>
      <div class="panel half">
        <div class="panel-header"><h2 class="panel-title">特殊表示</h2><span class="panel-subtitle">シリーズ固有値</span></div>
        <div class="panel-body form-grid two">
          ${specialFields.length ? specialFields.map((field) => `<label>${html(field.label)}
            <input type="${field.type === "number" ? "number" : "text"}" value="${html(special[field.id] ?? "")}" data-special-field="${field.id}" />
          </label>`).join("") : `<div class="empty-state field-wide">この統合戦略に特殊表示はありません。</div>`}
        </div>
      </div>
      <div class="panel">
        <div class="panel-header"><h2 class="panel-title">OBSスクロール速度</h2><span class="panel-subtitle">0で停止 / 30が最速</span></div>
        <div class="panel-body form-grid">
          ${Object.keys(overlayScrollSpeedDefaults).map((key) => renderScrollSpeedControl(key)).join("")}
        </div>
      </div>
      <div class="panel">
        <div class="panel-header"><h2 class="panel-title">現在の表示サマリー</h2><span class="panel-subtitle">保存するとOverlayへ反映</span></div>
        <div class="panel-body">
          <div class="tag-list">
            <span class="tag accent">秘宝 ${state.relics.length}</span>
            <span class="tag info">招集 ${state.operators.length}</span>
            <span class="tag">ボスフラグ ${state.bossFlags.length}</span>
            <span class="tag">等級 ${html(difficultyGrade?.label || "未選択")}</span>
            <span class="tag">難易度ティア ${html(tierCfg ? getDifficultyTierLabel() : "対象外")}</span>
            ${performances.length ? `<span class="tag">演目 ${html(selectedPerformance?.title || "未選択")}</span>` : ""}
          </div>
          ${selectedSquad ? `<p><strong>${html(selectedSquad.name)}</strong><br><span class="panel-subtitle">${html(selectedSquad.effect)}</span></p>` : `<p class="panel-subtitle">分隊は未選択です。</p>`}
          ${selectedPerformance ? `<p><strong>${html(selectedPerformance.name)}</strong><br><span class="panel-subtitle">${html(selectedPerformance.effect)}</span></p>` : ""}
          ${difficultyGrade ? renderDifficultyFields(difficultyGrade) : `<p class="panel-subtitle">等級は未選択です。</p>`}
          <div class="effect-block">
            <div class="effect-block-title">発動効果</div>
            ${renderEffectList(activeEffects, "control-effect-list", "分隊・演目・秘宝の発動効果は未設定です。")}
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderRelicsTab() {
  const relics = getCampaignRelics();
  const categories = [...new Set(relics.map((item) => item.category || "未分類"))];
  const q = normalizeText(ui.relicSearch);
  const filtered = relics.filter((item) => {
    if (ui.relicCategory !== "all" && (item.category || "未分類") !== ui.relicCategory) return false;
    if (!q) return true;
    return normalizeText(`${item.number} ${item.name} ${item.category} ${item.effect}`).includes(q);
  });
  const shown = filtered.slice(0, 500);
  const owned = new Set(state.relics);
  const gridColumns = getRelicGridColumns();
  return `
    <section class="panel-grid">
      <div class="panel">
        <div class="panel-header"><h2 class="panel-title">秘宝所持</h2><span class="panel-subtitle">${filtered.length}件 / 所持${owned.size}件</span></div>
        <div class="panel-body">
          <div class="search-strip relic-filter-strip">
            <label>検索<input value="${html(ui.relicSearch)}" data-ui="relicSearch" placeholder="秘宝名、番号、効果" /></label>
            <label>カテゴリ<select data-ui="relicCategory"><option value="all">すべて</option>${categories.map((cat) => `<option value="${html(cat)}" ${cat === ui.relicCategory ? "selected" : ""}>${html(cat)}</option>`).join("")}</select></label>
            <label>表示列<select data-field="relicGridColumns">${[1, 2, 3, 4, 5, 6].map((count) => `<option value="${count}" ${count === gridColumns ? "selected" : ""}>${count}列</option>`).join("")}</select></label>
            <button data-action="clear-relics">秘宝を全解除</button>
          </div>
          <div class="list-area relic-pick-grid" style="--relic-grid-columns: ${gridColumns}">
            ${shown.map((item) => renderRelicControlRow(item, owned.has(item.id))).join("")}
            ${shown.length < filtered.length ? `<div class="empty-state field-wide">表示を絞り込んでください。残り${filtered.length - shown.length}件があります。</div>` : ""}
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderRelicControlRow(item, active) {
  return `
    <div class="item-row relic-choice ${active ? "active" : ""}" data-action="toggle-relic" data-id="${item.id}" role="button" tabindex="0" aria-pressed="${active ? "true" : "false"}">
      <img class="item-thumb" src="${html(assetUrl(item.image?.localPath))}" alt="" loading="lazy" />
      <div>
        <div class="item-title">No.${html(item.number)} ${html(item.name)}</div>
        <div class="item-meta">${html(item.category || "")}</div>
        <div class="item-effect">${html(relicEffectForDisplay(item))}</div>
      </div>
    </div>
  `;
}

function renderOperatorsTab() {
  normalizeOperatorFilters();
  const releaseBase = master.operators.filter(operatorReleaseMatches);
  const rarityOptions = [6, 5, 4, 3, 2, 1].filter((rarity) => releaseBase.some((item) => Number(item.rarity) === rarity));
  const rarityBase = releaseBase.filter((item) => ui.operatorRarity === "all" || String(item.rarity) === ui.operatorRarity);
  const classOptions = uniqueValues(rarityBase, "class");
  const classBase = rarityBase.filter((item) => ui.operatorClass === "all" || item.class === ui.operatorClass);
  const branchOptions = uniqueValues(classBase, "branch");
  const operators = classBase.filter((item) => ui.operatorBranch === "all" || item.branch === ui.operatorBranch);
  const shown = sortOperators(operators).slice(0, 500);
  const selected = new Set(state.operators);
  const gridColumns = getOperatorGridColumns();
  return `
    <section class="panel-grid">
      <div class="panel">
        <div class="panel-header"><h2 class="panel-title">招集オペレーター</h2><span class="panel-subtitle">${operators.length}件 / 招集${selected.size}名</span></div>
        <div class="panel-body">
          <div class="search-strip operator-filter-strip">
            <label>実装状態<select data-ui="operatorRelease"><option value="released" ${ui.operatorRelease === "released" ? "selected" : ""}>日本実装のみ</option><option value="all" ${ui.operatorRelease === "all" ? "selected" : ""}>すべて</option><option value="unreleased" ${ui.operatorRelease === "unreleased" ? "selected" : ""}>日本未実装のみ</option></select></label>
            <label>レア度<select data-ui="operatorRarity"><option value="all">すべて</option>${rarityOptions.map((rarity) => `<option value="${rarity}" ${String(rarity) === ui.operatorRarity ? "selected" : ""}>★${rarity}</option>`).join("")}</select></label>
            <label>職業<select data-ui="operatorClass"><option value="all">すべて</option>${classOptions.map((value) => `<option value="${html(value)}" ${value === ui.operatorClass ? "selected" : ""}>${html(value)}</option>`).join("")}</select></label>
            <label>職分<select data-ui="operatorBranch"><option value="all">すべて</option>${branchOptions.map((value) => `<option value="${html(value)}" ${value === ui.operatorBranch ? "selected" : ""}>${html(value)}</option>`).join("")}</select></label>
            <label>並び順<select data-field="operatorSort"><option value="rarity_desc" ${state.preferences.operatorSort === "rarity_desc" ? "selected" : ""}>レア度 高い順</option><option value="rarity_asc" ${state.preferences.operatorSort === "rarity_asc" ? "selected" : ""}>レア度 低い順</option><option value="name" ${state.preferences.operatorSort === "name" ? "selected" : ""}>名前順</option></select></label>
            <label>表示列<select data-field="operatorGridColumns">${[1, 2, 3, 4, 5, 6].map((count) => `<option value="${count}" ${count === gridColumns ? "selected" : ""}>${count}列</option>`).join("")}</select></label>
          </div>
          <div class="list-area operator-pick-grid" style="--operator-grid-columns: ${gridColumns}">
            ${shown.map((item) => renderOperatorControlRow(item, selected.has(item.id))).join("")}
            ${shown.length < operators.length ? `<div class="empty-state field-wide">表示を絞り込んでください。残り${operators.length - shown.length}件があります。</div>` : ""}
          </div>
        </div>
      </div>
    </section>
  `;
}
function renderOperatorControlRow(item, active) {
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

function renderFlagsTab() {
  const pending = state.tournament?.pendingState;
  return `
    <section class="panel-grid">
      <div class="panel half">
        <div class="panel-header"><h2 class="panel-title">ボスフラグ</h2><span class="panel-subtitle">秘宝連動は後続実装、MVPは手動</span></div>
        <div class="panel-body form-grid one">
          <label>追加するフラグ<input value="${html(ui.bossDraft)}" data-ui="bossDraft" placeholder="例: 飛行ユニット系ボス条件" /></label>
          <button class="primary" data-action="add-boss-flag">追加</button>
          <div class="tag-list">
            ${(state.bossFlags || []).map((flag, index) => `<span class="tag accent">${html(flag)} <button class="icon ghost" data-action="remove-boss-flag" data-index="${index}" title="削除">x</button></span>`).join("") || `<span class="panel-subtitle">未設定</span>`}
          </div>
        </div>
      </div>
      <div class="panel half">
        <div class="panel-header"><h2 class="panel-title">大会入力</h2><span class="panel-subtitle">レビューしてから反映</span></div>
        <div class="panel-body">
          ${pending ? `<p>保留中の提出があります。</p><div class="inline-row"><button class="primary" data-action="approve-tournament">反映</button><button data-action="reject-tournament">破棄</button></div>` : `<div class="empty-state">保留中の大会入力はありません。JSON入出力タブから提出できます。</div>`}
        </div>
      </div>
      <div class="panel">
        <div class="panel-header"><h2 class="panel-title">OCR候補</h2><span class="panel-subtitle">今後ADB/OCRからここへ入る</span></div>
        <div class="panel-body">
          ${(state.pendingSuggestions || []).length ? state.pendingSuggestions.map((item, index) => `<div class="item-row compact"><div><div class="item-title">${html(item.label || item.type || "候補")}</div><div class="item-meta">${html(item.rawText || item.value || "")}</div></div><button data-action="dismiss-suggestion" data-index="${index}">削除</button></div>`).join("") : `<div class="empty-state">候補はありません。</div>`}
        </div>
      </div>
    </section>
  `;
}

function renderJsonTab() {
  const exportJson = JSON.stringify(state, null, 2);
  return `
    <section class="panel-grid">
      <div class="panel half">
        <div class="panel-header"><h2 class="panel-title">現在状態をエクスポート</h2><span class="panel-subtitle">大会共有・バックアップ用</span></div>
        <div class="panel-body form-grid one">
          <textarea readonly>${html(exportJson)}</textarea>
          <button data-action="copy-state-json">コピー</button>
        </div>
      </div>
      <div class="panel half">
        <div class="panel-header"><h2 class="panel-title">JSONインポート</h2><span class="panel-subtitle">直接反映または大会提出</span></div>
        <div class="panel-body form-grid one">
          <textarea data-ui="importDraft" placeholder="状態JSONを貼り付け">${html(ui.importDraft)}</textarea>
          <div class="inline-row"><button class="primary" data-action="import-state-now">直接反映</button><button data-action="submit-tournament-state">大会入力として保留</button></div>
        </div>
      </div>
    </section>
  `;
}

function renderOverlayCompact({ campaign, squad, option, performance, activeEffects, relics, operators, specialFields, special, difficultyGrade }) {
  const specialTags = specialFields
    .map((field) => ({ label: field.label, value: special[field.id] }))
    .filter((item) => item.value !== null && item.value !== undefined && item.value !== "");
  const flags = state.bossFlags || [];
  return `
    <section class="compact-overlay-shell">
      <header class="compact-head">
        <div class="compact-title-block">
          <div class="compact-kicker">IS#${html(campaign.number)}</div>
          <div class="compact-title">${html(campaign.title)}</div>
        </div>
        <div class="compact-counts">
          <span>秘宝 ${relics.length}</span><span>招集 ${operators.length}</span><span>Flag ${flags.length}</span>
        </div>
      </header>
      <div class="compact-row"><span>分隊</span><strong>${html(squad?.name || "未選択")}</strong></div>
      ${option?.label ? `<div class="compact-row compact-muted"><span>効果</span><strong>${html(option.label)}</strong></div>` : ""}
      ${performance ? `<div class="compact-row compact-muted"><span>演目</span><strong>${html(performance.title || performance.name)}</strong></div>` : ""}
      <div class="compact-chip-row">
        <span class="tag accent">${html(difficultyGrade?.label || "等級未選択")}</span>
        <span class="tag">Tier ${html(getDifficultyTierLabel())}</span>
        ${specialTags.map((item) => `<span class="tag info">${html(item.label)} ${html(item.value)}</span>`).join("")}
      </div>
      ${activeEffects.length ? `<section class="compact-section compact-effects-section">
        <div class="compact-section-head"><span>Effects</span><span>${activeEffects.length}</span></div>
        <div class="stream-scroll compact-effect-scroll" data-autoscroll data-scroll-speed="${getOverlayScrollSpeed("compactRelicScrollSpeed")}">
          ${renderEffectList(activeEffects, "compact-effect-list", "発動効果なし")}
        </div>
      </section>` : ""}
      <section class="compact-section">
        <div class="compact-section-head"><span>Relics</span><span>${relics.length}</span></div>
        <div class="stream-scroll compact-relic-scroll" data-autoscroll data-scroll-speed="${getOverlayScrollSpeed("compactRelicScrollSpeed")}">
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
      ${flags.length ? `<section class="compact-section"><div class="compact-section-head"><span>Boss flags</span><span>${flags.length}</span></div><div class="compact-chip-row">${flags.slice(0, 4).map((flag) => `<span class="tag accent">${html(flag)}</span>`).join("")}${flags.length > 4 ? `<span class="compact-more">+${flags.length - 4}</span>` : ""}</div></section>` : ""}
    </section>
  `;
}

function renderOverlayDense({ campaign, squad, option, performance, activeEffects, relics, operators, specialFields, special, difficultyGrade, orientation }) {
  const specialTags = specialFields
    .map((field) => ({ label: field.label, value: special[field.id] }))
    .filter((item) => item.value !== null && item.value !== undefined && item.value !== "");
  const flags = state.bossFlags || [];
  return `
    <section class="stream-overlay-shell stream-${orientation}">
      <header class="stream-head">
        <div>
          <div class="stream-kicker">IS#${html(campaign.number)} / ${html(state.mode || "manual")}</div>
          <div class="stream-title">${html(campaign.title)}</div>
        </div>
        <div class="stream-counts">
          <span>秘宝 ${relics.length}</span><span>招集 ${operators.length}</span><span>Flag ${flags.length}</span>
        </div>
      </header>
      <section class="stream-run">
        <div class="stream-line"><span>分隊</span><strong>${html(squad?.name || "未選択")}</strong></div>
        ${option?.label || option?.effect ? `<div class="stream-note">${html(option?.label || option?.effect)}</div>` : ""}
        ${performance ? `<div class="stream-note"><strong>演目</strong> ${html(performance.title || performance.name)}</div>` : ""}
        <div class="stream-chip-row">
          <span class="tag accent">${html(difficultyGrade?.label || "等級未選択")}</span>
          <span class="tag">Tier ${html(getDifficultyTierLabel())}</span>
          ${specialTags.map((item) => `<span class="tag info">${html(item.label)} ${html(item.value)}</span>`).join("")}
          ${flags.map((flag) => `<span class="tag accent">${html(flag)}</span>`).join("")}
        </div>
        ${activeEffects.length ? `<div class="stream-scroll stream-effect-scroll" data-autoscroll data-scroll-speed="${getOverlayScrollSpeed(`${orientation}RelicScrollSpeed`)}">
          ${renderEffectList(activeEffects, "stream-effect-list", "発動効果なし")}
        </div>` : ""}
      </section>
      <section class="stream-panel stream-relic-panel">
        <div class="stream-section-head"><span>Relics</span><strong>${relics.length}</strong></div>
        <div class="stream-scroll stream-relic-scroll" data-autoscroll data-scroll-speed="${getOverlayScrollSpeed(`${orientation}RelicScrollSpeed`)}">
          <div class="stream-relic-grid">
            ${relics.length ? relics.map((item) => `<div class="stream-relic-tile" title="${html(relicEffectForDisplay(item))}"><img src="${html(assetUrl(item.image?.localPath))}" alt="" /><strong>${html(item.name)}</strong></div>`).join("") : `<div class="stream-empty">秘宝なし</div>`}
          </div>
        </div>
      </section>
      <section class="stream-panel stream-operator-panel">
        <div class="stream-section-head"><span>Operators</span><strong>${operators.length}</strong></div>
        <div class="stream-scroll stream-operator-scroll" data-autoscroll data-scroll-speed="${getOverlayScrollSpeed(`${orientation}OperatorScrollSpeed`)}">
          <div class="stream-operator-grid">
            ${operators.length ? operators.map((item) => `<div class="stream-operator-tile"><img src="${html(assetUrl(item.image?.localPath))}" alt="" /><div><strong>${html(item.name)}</strong><span>${stars(item.rarity)} / ${html(item.class || "-")}</span></div></div>`).join("") : `<div class="stream-empty">未招集</div>`}
          </div>
        </div>
      </section>
    </section>
  `;
}
function cancelOverlayAutoScroll() {
  if (overlayAutoScrollFrame !== null) {
    clearInterval(overlayAutoScrollFrame);
    overlayAutoScrollFrame = null;
  }
}

function setupOverlayAutoScroll() {
  cancelOverlayAutoScroll();
  const scrollers = [...app.querySelectorAll("[data-autoscroll]")];
  if (!scrollers.length) return;
  const entries = scrollers.map((element, index) => {
    const content = element.firstElementChild;
    if (content) content.style.transform = "translateY(0px)";
    return {
      element,
      content,
      offset: 0,
      direction: 1,
      last: performance.now(),
      pauseUntil: performance.now() + 900 + index * 700,
      speed: Number.isFinite(Number(element.dataset.scrollSpeed)) ? Number(element.dataset.scrollSpeed) : 14,
    };
  }).filter((entry) => entry.content);
  if (!entries.length) return;
  overlayAutoScrollFrame = setInterval(() => {
    const now = performance.now();
    for (const entry of entries) {
      const max = Math.max(0, entry.content.scrollHeight - entry.element.clientHeight);
      if (max <= 1) {
        entry.offset = 0;
        entry.content.style.transform = "translateY(0px)";
        entry.last = now;
        continue;
      }
      const delta = Math.min(120, now - entry.last);
      entry.last = now;
      if (now < entry.pauseUntil) continue;
      entry.offset += entry.direction * entry.speed * delta / 1000;
      if (entry.offset >= max) {
        entry.offset = max;
        entry.direction = -1;
        entry.pauseUntil = now + 1600;
      } else if (entry.offset <= 0) {
        entry.offset = 0;
        entry.direction = 1;
        entry.pauseUntil = now + 1200;
      }
      entry.content.style.transform = `translateY(${-entry.offset}px)`;
    }
  }, 80);
}
function renderOverlay() {
  cancelOverlayAutoScroll();
  app.dataset.loading = "false";
  app.className = `overlay-app overlay-${overlayLayout} overlay-size-${overlaySize}`;
  document.body.className = "overlay-body";
  const campaign = getCampaign();
  const squad = getSelectedSquad();
  const option = getSelectedSquadOption(squad);
  const relics = getOwnedRelics();
  const operators = getRecruitedOperators();
  const specialFields = campaign.specialFields || [];
  const special = state.run.special?.[campaign.id] || {};
  const difficultyGrade = getSelectedDifficultyGrade();
  const performance = getSelectedPerformance();
  const activeEffects = getActiveEffects();
  if (overlayLayout === "compact") {
    app.innerHTML = renderOverlayCompact({ campaign, squad, option, performance, activeEffects, relics, operators, specialFields, special, difficultyGrade });
    setupOverlayAutoScroll();
    return;
  }
  if (overlayLayout === "vertical" || overlayLayout === "horizontal") {
    app.innerHTML = renderOverlayDense({ campaign, squad, option, performance, activeEffects, relics, operators, specialFields, special, difficultyGrade, orientation: overlayLayout });
    setupOverlayAutoScroll();
    return;
  }
  app.innerHTML = `
    <header class="overlay-top">
      <section class="overlay-card">
        <div class="overlay-card-header"><span>Campaign</span><span>IS#${campaign.number}</span></div>
        <div class="overlay-card-body">
          <div class="campaign-title">${html(campaign.title)}</div>
          <div class="campaign-sub">${html(campaign.fullTitle)}</div>
        </div>
      </section>
      <section class="overlay-card">
        <div class="overlay-card-header"><span>Run</span><span>${html(state.mode || "manual")}</span></div>
        <div class="overlay-card-body overlay-kpis">
          <div class="kpi"><div class="kpi-label">等級</div><div class="kpi-value">${html(difficultyGrade?.label || (state.run.difficulty ?? "-"))}</div></div>
          <div class="kpi"><div class="kpi-label">Tier</div><div class="kpi-value">${html(getDifficultyTierLabel())}</div></div>
          ${specialFields.map((field) => `<div class="kpi"><div class="kpi-label">${html(field.label)}</div><div class="kpi-value">${html(special[field.id] ?? "-")}</div></div>`).join("")}
          ${difficultyGrade ? renderDifficultyFields(difficultyGrade, "overlay") : ""}
        </div>
      </section>
      <section class="overlay-card">
        <div class="overlay-card-header"><span>Count</span><span>${html(new Date(state.updatedAt || Date.now()).toLocaleTimeString("ja-JP"))}</span></div>
        <div class="overlay-card-body overlay-kpis">
          <div class="kpi"><div class="kpi-label">秘宝</div><div class="kpi-value">${relics.length}</div></div>
          <div class="kpi"><div class="kpi-label">招集</div><div class="kpi-value">${operators.length}</div></div>
          <div class="kpi"><div class="kpi-label">Flag</div><div class="kpi-value">${state.bossFlags.length}</div></div>
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
          <div class="overlay-card-body overlay-effect-scroll stream-scroll" data-autoscroll data-scroll-speed="${getOverlayScrollSpeed("verticalRelicScrollSpeed")}">
            ${renderEffectList(activeEffects, "overlay-effect-list", "発動効果なし")}
          </div>
        </section>
        <section class="overlay-card">
          <div class="overlay-card-header"><span>Relics</span><span>${relics.length}</span></div>
          <div class="overlay-card-body relic-grid">
            ${relics.length ? relics.map((item) => `<div class="relic-tile" title="${html(relicEffectForDisplay(item))}"><img src="${html(assetUrl(item.image?.localPath))}" alt="" /><div>${html(item.name)}</div></div>`).join("") : `<div class="empty-state">秘宝なし</div>`}
          </div>
        </section>
      </div>
      <aside class="overlay-right">
        <section class="overlay-card">
          <div class="overlay-card-header"><span>Boss flags</span><span>${state.bossFlags.length}</span></div>
          <div class="overlay-card-body boss-list">
            ${state.bossFlags.length ? state.bossFlags.map((flag) => `<span class="tag accent">${html(flag)}</span>`).join("") : `<span class="panel-subtitle">未設定</span>`}
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
  setupOverlayAutoScroll();
}

function toggleId(list, id) {
  const set = new Set(list || []);
  if (set.has(id)) set.delete(id); else set.add(id);
  return [...set];
}

function parseImportDraft() {
  if (!ui.importDraft.trim()) throw new Error("JSONが空です");
  const parsed = JSON.parse(ui.importDraft);
  if (!parsed || typeof parsed !== "object") throw new Error("状態JSONではありません");
  return parsed;
}

app.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button || view !== "control") return;
  const action = button.dataset.action;
  const id = button.dataset.id;
  if (action === "tab") { ui.tab = button.dataset.tab; renderControl(); return; }
  if (action === "toggle-relic") { toggleChoiceElement(button, "relic", id); return; }
  if (action === "toggle-operator") { toggleChoiceElement(button, "operator", id); return; }
  if (action === "clear-relics") mutate((s) => { s.relics = []; });
  if (action === "reset-state") {
    if (confirm("状態を初期化しますか？")) {
      state = await apiJson("/api/state/reset", { method: "POST" });
      ensureStateShape();
      renderControl();
      setNotice("状態を初期化しました。");
    }
  }
  if (action === "add-boss-flag") {
    const text = ui.bossDraft.trim();
    if (text) mutate((s) => { s.bossFlags = [...(s.bossFlags || []), text]; ui.bossDraft = ""; });
  }
  if (action === "remove-boss-flag") mutate((s) => { s.bossFlags.splice(Number(button.dataset.index), 1); });
  if (action === "dismiss-suggestion") mutate((s) => { s.pendingSuggestions.splice(Number(button.dataset.index), 1); });
  if (action === "copy-state-json") {
    await navigator.clipboard.writeText(JSON.stringify(state, null, 2));
    setNotice("状態JSONをコピーしました。");
  }
  if (action === "import-state-now") {
    try {
      state = parseImportDraft();
      ensureStateShape();
      renderControl();
      scheduleSave();
      setNotice("JSONを直接反映しました。");
    } catch (error) { setNotice(error.message); }
  }
  if (action === "submit-tournament-state") {
    try {
      const pending = parseImportDraft();
      mutate((s) => { s.tournament = { pendingState: pending, lastSubmissionAt: new Date().toISOString(), submittedBy: "external-json" }; });
      setNotice("大会入力として保留しました。ボス/大会タブで反映できます。");
    } catch (error) { setNotice(error.message); }
  }
  if (action === "approve-tournament") {
    const pending = state.tournament?.pendingState;
    if (pending) {
      state = pending;
      ensureStateShape();
      state.tournament = { pendingState: null, lastSubmissionAt: null, submittedBy: null };
      renderControl();
      scheduleSave();
      setNotice("大会入力を反映しました。");
    }
  }
  if (action === "reject-tournament") mutate((s) => { s.tournament = { pendingState: null, lastSubmissionAt: null, submittedBy: null }; });
});

app.addEventListener("keydown", (event) => {
  if (view !== "control") return;
  if (event.key !== "Enter" && event.key !== " ") return;
  const target = event.target.closest('.operator-choice[data-action="toggle-operator"], .relic-choice[data-action="toggle-relic"]');
  if (!target) return;
  event.preventDefault();
  const id = target.dataset.id;
  if (target.dataset.action === "toggle-relic") {
    toggleChoiceElement(target, "relic", id);
  } else {
    toggleChoiceElement(target, "operator", id);
  }
});
app.addEventListener("input", (event) => {
  if (view !== "control") return;
  const target = event.target;
  if (!target.matches("[data-ui]")) return;
  ui[target.dataset.ui] = target.value;
  if (["relicSearch", "relicCategory"].includes(target.dataset.ui)) renderControl();
});

app.addEventListener("change", (event) => {
  if (view !== "control") return;
  const target = event.target;
  if (target.matches("[data-ui]")) {
    ui[target.dataset.ui] = target.value;
    renderControl();
    return;
  }
  const field = target.dataset.field;
  if (field) {
    mutate((s) => {
      if (field === "campaignId") {
        s.run.campaignId = target.value;
        s.run.squadId = null;
        s.run.squad = null;
        s.run.squadRandomEffectOptionId = null;
        s.run.performanceId = null;
        s.run.difficulty = null;
        s.run.difficultyTierId = null;
        s.relics = [];
        s.bossFlags = [];
      } else if (field === "difficulty") {
        s.run.difficulty = target.value === "" ? null : Number(target.value);
      } else if (field === "squadId") {
        s.run.squadId = target.value || null;
        s.run.squad = null;
        s.run.squadRandomEffectOptionId = null;
      } else if (field === "squadRandomEffectOptionId") {
        s.run.squadRandomEffectOptionId = target.value || null;
      } else if (field === "performanceId") {
        s.run.performanceId = target.value || null;
      } else if (field === "operatorSort") {
        s.preferences.operatorSort = target.value;
      } else if (field === "operatorGridColumns") {
        s.preferences.operatorGridColumns = clampOperatorGridColumns(target.value);
      } else if (field === "relicGridColumns") {
        s.preferences.relicGridColumns = clampOperatorGridColumns(target.value);
      } else if (isOverlayScrollSpeedField(field)) {
        s.preferences[field] = clampOverlayScrollSpeed(target.value, overlayScrollSpeedDefaults[field]);
      } else if (field === "showUnreleasedOperators") {
        s.preferences.showUnreleasedOperators = target.checked;
      }
    });
  }
  const specialField = target.dataset.specialField;
  if (specialField) {
    mutate((s) => {
      const campaignId = getCampaign().id;
      s.run.special[campaignId] ||= {};
      s.run.special[campaignId][specialField] = target.value === "" ? null : target.value;
    });
  }
});

async function pollOverlay() {
  try {
    const next = await apiJson(stateUrl);
    state = next;
    ensureStateShape();
    const json = stableOverlayStateJson(state);
    if (json !== lastStateJson) {
      lastStateJson = json;
      renderOverlay();
    }
  } catch (error) {
    console.error(error);
  } finally {
    setTimeout(pollOverlay, 1000);
  }
}

async function boot() {
  try {
    const [masterData, initialState] = await Promise.all([apiJson(masterUrl), apiJson(stateUrl)]);
    master = masterData;
    state = initialState;
    buildMaps();
    ensureStateShape();
    lastStateJson = stableOverlayStateJson(state);
    if (view === "overlay") {
      renderOverlay();
      pollOverlay();
    } else {
      ui.saveStatus = "保存済み";
      renderControl();
    }
  } catch (error) {
    app.dataset.loading = "false";
    app.innerHTML = `<div class="empty-state">起動に失敗しました: ${html(error.message)}</div>`;
    console.error(error);
  }
}

boot();