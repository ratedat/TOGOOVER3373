const normalizeText = (value) => String(value ?? "").toLowerCase().replace(/\s+/g, "");

function addMetric(metrics, target, stat, value, unit = "") {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric === 0) return;
  const key = `${target}|${stat}|${unit}`;
  const current = metrics.get(key) || { target, stat, unit, value: 0 };
  current.value += numeric;
  metrics.set(key, current);
}

function signedValue(value) {
  const rounded = Math.round(value * 100) / 100;
  return `${rounded > 0 ? "+" : ""}${Number.isInteger(rounded) ? rounded : rounded.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}`;
}

function formatMetricValue(metric) {
  return `${metric.stat}${signedValue(metric.value)}${metric.unit || ""}`;
}

function detectOperatorTarget(text) {
  if (/【先鋒】/.test(text)) return "【先鋒】";
  if (/【前衛】/.test(text)) return "【前衛】";
  if (/【重装】/.test(text)) return "【重装】";
  if (/【狙撃】/.test(text)) return "【狙撃】";
  if (/【術師】/.test(text)) return "【術師】";
  if (/【医療】/.test(text)) return "【医療】";
  if (/【補助】/.test(text)) return "【補助】";
  if (/【特殊】/.test(text)) return "【特殊】";
  if (/近距離/.test(text)) return "【近距離】";
  if (/遠距離/.test(text)) return "【遠距離】";
  if (/伺燭客/.test(text)) return "【伺燭客】";
  if (/化境マス/.test(text)) return "【化境マス】";
  if (/配置待機エリア/.test(text)) return "【配置待機】";
  if (/味方全員|全オペレーター|全てのオペレーター|オペレーター全員|味方ユニット|味方/.test(text)) return "【味方全員】";
  if (/オペレーター/.test(text)) return "【オペレーター】";
  return null;
}

function namedEnemyTarget(text) {
  const names = [...new Set((text.match(/＜[^＞]+＞/g) || []).slice(0, 3))];
  if (names.length) return `【${names.join("/")}】`;
  if (/便符/.test(text)) return "【便符】";
  return null;
}

function detectEnemyTarget(text) {
  const named = namedEnemyTarget(text);
  if (named) return named;
  if (/敵【エリート】.*【ボス】|敵【エリート】・【ボス】|全ての敵【エリート】|エリート敵とボス|エリート.*ボス|ボス.*エリート/i.test(text)) return "【敵エリート/ボス】";
  if (/敵【エリート】|【エリート】|エリート敵|エリート/.test(text)) return "【敵エリート】";
  if (/敵【ボス】|【ボス】|ボス|BOSS/i.test(text)) return "【敵ボス】";
  if (/敵全員|全ての敵/.test(text)) return "【敵全員】";
  if (/敵/.test(text)) return "【敵】";
  return null;
}

function metricStatsFromPhrase(phrase, domain) {
  const stats = [];
  const add = (pattern, label) => {
    if (pattern.test(phrase) && !stats.includes(label)) stats.push(label);
  };
  add(/SP自然回復速度/, "SP自然回復");
  add(/ストックSP/, "初期SP");
  add(/スキル発動必要SP/, "必要SP");
  add(/再配置時間/, "再配置");
  add(/配置コスト/, "配置コスト");
  add(/ブロック数?/, "ブロック");
  add(/攻撃速度/, "攻撃速度");
  add(/攻撃力/, "攻撃力");
  add(/防御力/, "防御力");
  add(/術耐性/, "術耐性");
  add(/最大HP|(?<!最大)HP/, "最大HP");
  add(/移動速度/, "移動速度");
  add(/命中率/, "命中率");
  add(/物理・術回避/, "物理・術回避");
  add(/術回避/, "術回避");
  add(/物理回避/, "物理回避");
  if (!/物理・術回避/.test(phrase)) add(/回避/, "回避");
  if (domain === "enemy") {
    const hasCombinedPhysicalArtsDamage = /物理・術ダメージ/.test(phrase);
    if (hasCombinedPhysicalArtsDamage) {
      add(/物理・術ダメージ/, "物理・術被ダメージ");
    } else {
      add(/物理ダメージ/, "物理被ダメージ");
      add(/術ダメージ/, "術被ダメージ");
      add(/被ダメージ|受ける(?:物理|術)?ダメージ|受けるダメージ/, "被ダメージ");
    }
    add(/元素ダメージ|元素損傷/, "元素被ダメージ");
    add(/確定ダメージ/, "確定被ダメージ");
  } else {
    add(/物理ダメージ|術ダメージ|元素ダメージ|確定ダメージ|与ダメージ/, "与ダメージ");
    add(/被ダメージ|受ける.*ダメージ/, "被ダメージ");
    add(/元素損傷/, "元素損傷軽減");
  }
  return stats;
}

function addMetricValueFromContext(text, matchIndex, matchText, value, unit, operatorMetrics, enemyMetrics, lastValueEnd = 0) {
  const before = text.slice(0, matchIndex);
  const sentenceStart = Math.max(before.lastIndexOf("。") + 1, before.lastIndexOf("；") + 1, 0);
  const phraseStart = Math.max(sentenceStart, lastValueEnd);
  const context = text.slice(sentenceStart, matchIndex);
  const phrase = text.slice(phraseStart, matchIndex);
  const operatorTarget = detectOperatorTarget(phrase) || detectOperatorTarget(context);
  const enemyTarget = detectEnemyTarget(phrase) || detectEnemyTarget(context);
  const operatorStats = operatorTarget ? metricStatsFromPhrase(phrase, "operator") : [];
  const enemyStats = enemyTarget ? metricStatsFromPhrase(phrase, "enemy") : [];
  for (const stat of operatorStats) addMetric(operatorMetrics, operatorTarget, stat, value, unit);
  for (const stat of enemyStats) addMetric(enemyMetrics, enemyTarget, stat, value, unit);
  return matchIndex + matchText.length;
}

function addTextMetrics(text, operatorMetrics, enemyMetrics) {
  const valuePattern = /([+-]\d+(?:\.\d+)?)(%|sp\/s)?/g;
  let lastValueEnd = 0;
  for (const match of text.matchAll(valuePattern)) {
    lastValueEnd = addMetricValueFromContext(text, match.index, match[0], Number(match[1]), match[2] || "", operatorMetrics, enemyMetrics, lastValueEnd);
  }

  for (const match of text.matchAll(/(\d+(?:\.\d+)?)(%|sp\/s)?(?:低下|減少)/g)) {
    addMetricValueFromContext(text, match.index, match[0], -Number(match[1]), match[2] || "", operatorMetrics, enemyMetrics);
  }

  for (const match of text.matchAll(/HP(?:が|を)?(?:1秒(?:ごと|につき)|毎秒)(?:最大HPの)?(\d+(?:\.\d+)?)(%)?の?HP?を?回復/g)) {
    const context = text.slice(Math.max(0, match.index - 40), match.index + match[0].length);
    const target = detectOperatorTarget(context) || "【味方全員】";
    addMetric(operatorMetrics, target, "HP回復", Number(match[1]), match[2] ? "%/秒" : "/秒");
  }
}

function addRecruitmentHope(recruitmentValues, text) {
  const allRarities = [1, 2, 3, 4, 5, 6];
  const addToRarities = (value, rarities) => {
    for (const rarity of rarities) recruitmentValues[rarity] += value;
  };
  const patterns = [
    /((?:★([1-6])(?:以上)?(?:の)?)|(?:全ての|全|次回)?)(?:オペレーター)(?:を)?[招召]集(?:もしくは昇進させる際に消費する希望|する際に消費する希望|時の希望消費)([+-]\d+)/g,
    /((?:★([1-6])(?:以上)?(?:の)?)|(?:全ての|全)?)(?:オペレーター)(?:の)?[招召]集に必要な希望([+-]\d+)/g,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const prefix = match[1] || "";
      const rarity = Number(match[2]);
      const value = Number(match[3]);
      const rarities = rarity
        ? (prefix.includes("以上") ? allRarities.filter((item) => item >= rarity) : [rarity])
        : allRarities;
      addToRarities(value, rarities);
    }
  }
}

function japaneseCountToNumber(value) {
  const counts = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };
  if (Object.prototype.hasOwnProperty.call(counts, value)) return counts[value];
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function hasPerCountCondition(text, index) {
  return /につき|ごとに|度に/.test(text.slice(Math.max(0, index - 28), index));
}

function addEffectNote(metrics, title, effect) {
  if (!effect) return;
  const key = `${title}|${effect}`;
  if (metrics.effectNotes.some((item) => item.key === key)) return;
  metrics.effectNotes.push({ key, title, effect });
}

function addBattleVictoryMetrics(metrics, rawText) {
  const text = String(rawText || "").replaceAll("戦戦闘", "戦闘");
  const isLimitedOnly = /でのみ有効/.test(text);
  for (const match of text.matchAll(/戦闘勝利報酬の源石錐獲得量([+-]\d+(?:\.\d+)?)%/g)) {
    if (!isLimitedOnly && !hasPerCountCondition(text, match.index)) addMetric(metrics.battleVictoryMetrics, "戦闘勝利時", "源石錐獲得量", Number(match[1]), "%");
  }
  for (const match of text.matchAll(/戦闘勝利時の指揮経験値の獲得量([+-]\d+(?:\.\d+)?)%/g)) {
    if (!isLimitedOnly && !hasPerCountCondition(text, match.index)) addMetric(metrics.battleVictoryMetrics, "戦闘勝利時", "指揮経験値", Number(match[1]), "%");
  }
  for (const match of text.matchAll(/(?:戦闘勝利後|戦闘終了後)[、に\s]*(?:獲得できる)?(招集券|報酬|秘宝)の選択肢が([一二三四五六\d]+)つ増える/g)) {
    const stat = match[1] === "招集券" ? "招集券選択肢" : `${match[1]}選択肢`;
    addMetric(metrics.battleVictoryMetrics, "戦闘勝利時", stat, japaneseCountToNumber(match[2]));
  }
  for (const match of text.matchAll(/行商人の店で購入、あるいは戦闘(?:勝利報酬として出現する|でドロップする)招集券(【[^】]+】)が上級人員派遣書になる/g)) {
    addEffectNote(metrics, "【戦闘勝利時/商店】", `${match[1]}招集券が上級人員派遣書`);
  }
}

function addShopMetrics(metrics, rawText) {
  const text = String(rawText || "");
  for (const match of text.matchAll(/行商人の店の商品の値段([+-]\d+(?:\.\d+)?)%/g)) {
    addMetric(metrics.shopMetrics, "商店", "商品価格", Number(match[1]), "%");
  }
  for (const match of text.matchAll(/(?:怪しい旅商人|行商人)[^。]*?消費する源石錐([+-]\d+(?:\.\d+)?)%/g)) {
    addMetric(metrics.shopMetrics, "商店", "源石錐消費", Number(match[1]), "%");
  }
}

function formatRecruitmentHope(recruitmentValues) {
  const parts = [];
  for (let rarity = 1; rarity <= 6; rarity++) {
    const value = recruitmentValues[rarity];
    if (!value) continue;
    let end = rarity;
    while (end + 1 <= 6 && recruitmentValues[end + 1] === value) end++;
    const label = rarity === end ? `★${rarity}` : `★${rarity}-${end}`;
    parts.push(`${label} ${signedValue(value)}`);
    rarity = end;
  }
  return parts.join(" / ");
}

function formatMetricSummary(metrics) {
  const grouped = new Map();
  for (const metric of metrics.values()) {
    if (!metric.value) continue;
    if (!grouped.has(metric.target)) grouped.set(metric.target, []);
    grouped.get(metric.target).push(metric);
  }
  return [...grouped.entries()].map(([target, items]) => `${target} ${items.map(formatMetricValue).join(" / ")}`).join(" / ");
}

function createEffectMetricSet() {
  return {
    runMetrics: new Map(),
    battleVictoryMetrics: new Map(),
    shopMetrics: new Map(),
    operatorMetrics: new Map(),
    enemyMetrics: new Map(),
    recruitmentValues: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
    effectNotes: [],
    uniqueEffectKeys: new Set(),
  };
}

function addEffectTextToMetrics(metrics, text) {
  if (!text) return;
  for (const match of text.matchAll(/編成上限\s*([+-]\d+)/g)) addMetric(metrics.runMetrics, "ラン", "編成上限", Number(match[1]));
  for (const match of text.matchAll(/(?:同時)?配置可能人数\s*([+-]\d+)/g)) addMetric(metrics.runMetrics, "ラン", "配置数", Number(match[1]));
  addRecruitmentHope(metrics.recruitmentValues, text);
  addBattleVictoryMetrics(metrics, text);
  addShopMetrics(metrics, text);
  addTextMetrics(text, metrics.operatorMetrics, metrics.enemyMetrics);
}

export function isActiveManualRule(rule) {
  const status = normalizeText(rule?.status);
  return ["approved", "implemented", "verified", "実装済み", "承認済み", "検証済み"].includes(status);
}

function getManualRelicRules(rulesByRelic, relicId) {
  return rulesByRelic?.get?.(relicId) || [];
}

function ownedRelicTagCount(tagGroups, tagKey, ownedRelics) {
  const group = tagGroups?.[tagKey];
  const ids = new Set(group?.relicIds || []);
  if (!ids.size) return 0;
  return ownedRelics.filter((item) => ids.has(item.id)).length;
}

function ownedRelicCount(targetIds, ownedRelics) {
  const ids = new Set((Array.isArray(targetIds) ? targetIds : [targetIds]).filter(Boolean));
  if (!ids.size) return 0;
  return ownedRelics.filter((item) => ids.has(item.id)).length;
}

function manualRuleConditionCount(rule, ownedRelics, tagGroups) {
  const condition = rule?.condition || null;
  if (!condition?.kind) return 1;
  if (condition.kind === "owned_relic_tag_count") return ownedRelicTagCount(tagGroups, condition.target, ownedRelics);
  if (condition.kind === "owned_relic_count") return ownedRelicCount(condition.relicIds || condition.target, ownedRelics);
  return 0;
}

function manualRuleMultiplier(rule, effect, ownedRelics, tagGroups) {
  const count = manualRuleConditionCount(rule, ownedRelics, tagGroups);
  if (effect?.stackMode === "per_count" || rule?.condition?.countMode === "per_owned_count" || rule?.type === "owned_count") return count;
  return count > 0 ? 1 : 0;
}

function manualRecruitmentRarities(effect) {
  const all = [1, 2, 3, 4, 5, 6];
  if (Array.isArray(effect?.rarities) && effect.rarities.length) return effect.rarities.map(Number).filter((item) => all.includes(item));
  const rarity = Number(effect?.rarity);
  if (all.includes(rarity)) return [rarity];
  const min = Number(effect?.minRarity);
  const max = Number(effect?.maxRarity);
  return all.filter((item) => (!Number.isFinite(min) || item >= min) && (!Number.isFinite(max) || item <= max));
}

function normalizeManualStat(stat) {
  if (stat === "同時配置可能人数") return "配置数";
  if (["召集希望", "召集の希望", "招集の希望"].includes(stat)) return "招集希望";
  return stat;
}

function addManualRecruitmentMetric(metrics, effect, value) {
  for (const rarity of manualRecruitmentRarities(effect)) metrics.recruitmentValues[rarity] += value;
}

function addManualRuleEffect(metrics, effect, multiplier) {
  if (!effect || !multiplier) return;
  const domain = effect.domain || "";
  if (domain === "note") {
    const noteText = effect.text || effect.effect || effect.note || "";
    if (noteText) metrics.effectNotes.push({ title: effect.title || "【特殊】", effect: noteText });
    return;
  }

  const stat = normalizeManualStat(String(effect.stat || ""));
  const value = Number(effect.value) * multiplier;
  if (!stat || !Number.isFinite(value)) return;
  const target = effect.target || "【味方全員】";
  const unit = effect.unit || "";
  const stackMode = effect.stackMode || "add";
  if (["unique", "non_stack", "nonStack", "once"].includes(stackMode)) {
    const stackKey = effect.stackKey || [target, stat, unit, value].join("|");
    if (metrics.uniqueEffectKeys.has(stackKey)) return;
    metrics.uniqueEffectKeys.add(stackKey);
  }

  if (domain === "run" || target === "ラン" || ["編成上限", "配置数"].includes(stat)) {
    addMetric(metrics.runMetrics, "ラン", stat, value, unit);
    return;
  }

  if (domain === "after_battle" || target === "【戦闘勝利時】") {
    addMetric(metrics.battleVictoryMetrics, "戦闘勝利時", stat, value, unit);
    return;
  }

  if (domain === "shop" || target === "【商店】") {
    addMetric(metrics.shopMetrics, "商店", stat, value, unit);
    return;
  }

  if (domain === "recruitment" || stat === "招集希望") {
    addManualRecruitmentMetric(metrics, effect, value);
    return;
  }

  if (domain === "enemy" || /^【敵/.test(target) || /^敵/.test(target)) {
    addMetric(metrics.enemyMetrics, target, stat, value, unit);
    return;
  }

  addMetric(metrics.operatorMetrics, target, stat, value, unit);
}

function addManualRelicRuleMetrics(metrics, relic, ownedRelics, rulesByRelic, tagGroups) {
  const rules = getManualRelicRules(rulesByRelic, relic.id);
  if (!rules.length) return false;
  let suppressAuto = false;
  for (const rule of rules) {
    suppressAuto = suppressAuto || rule.suppressAuto === true;
    for (const effect of rule.effects || []) addManualRuleEffect(metrics, effect, manualRuleMultiplier(rule, effect, ownedRelics, tagGroups));
  }
  return suppressAuto;
}
function summarizeEffectMetrics(sourceType, metrics) {
  const summaries = [];
  const runSummary = formatMetricSummary(metrics.runMetrics).replace(/^ラン\s*/, "");
  const recruitmentSummary = formatRecruitmentHope(metrics.recruitmentValues);
  const battleVictorySummary = formatMetricSummary(metrics.battleVictoryMetrics).replace(/^戦闘勝利時\s*/, "");
  const shopSummary = formatMetricSummary(metrics.shopMetrics).replace(/^商店\s*/, "");
  const operatorSummary = formatMetricSummary(metrics.operatorMetrics);
  const enemySummary = formatMetricSummary(metrics.enemyMetrics);
  if (runSummary) summaries.push({ type: sourceType, title: "【編成/配置】", effect: runSummary });
  if (recruitmentSummary) summaries.push({ type: sourceType, title: "【招集希望】", effect: recruitmentSummary });
  if (battleVictorySummary) summaries.push({ type: sourceType, title: "【戦闘勝利時】", effect: battleVictorySummary });
  if (shopSummary) summaries.push({ type: sourceType, title: "【商店】", effect: shopSummary });
  for (const note of metrics.effectNotes) summaries.push({ type: sourceType, title: note.title, effect: note.effect });
  if (operatorSummary) summaries.push({ type: sourceType, title: "【オペレーター】", effect: operatorSummary });
  if (enemySummary) summaries.push({ type: sourceType, title: "【敵】", effect: enemySummary });
  return summaries;
}

export function summarizeTextEffects(sourceType, texts = []) {
  const metrics = createEffectMetricSet();
  for (const text of texts) addEffectTextToMetrics(metrics, text);
  return summarizeEffectMetrics(sourceType, metrics);
}

export function summarizeRelicEffects({ ownedRelics = [], rulesByRelic = new Map(), tagGroups = {}, effectTextForRelic = (relic) => relic?.effect || "" } = {}) {
  const metrics = createEffectMetricSet();
  for (const relic of ownedRelics) {
    const suppressAuto = addManualRelicRuleMetrics(metrics, relic, ownedRelics, rulesByRelic, tagGroups);
    if (!suppressAuto) addEffectTextToMetrics(metrics, effectTextForRelic(relic));
  }
  return summarizeEffectMetrics("秘宝", metrics);
}
