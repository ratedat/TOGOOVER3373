import { normalizeRecognitionText } from "./text-normalize.js";

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function rectFrom(value) {
  if (!value) return null;
  if (Array.isArray(value)) {
    const [x, y, width, height] = value.map(Number);
    return { x, y, width, height };
  }
  const x = Number(value.x);
  const y = Number(value.y);
  const width = Number(value.width);
  const height = Number(value.height);
  if (![x, y, width, height].every(Number.isFinite)) return null;
  return { x, y, width, height };
}

function rectsOverlap(left, right) {
  if (!left || !right) return true;
  return left.x < right.x + right.width
    && left.x + left.width > right.x
    && left.y < right.y + right.height
    && left.y + left.height > right.y;
}

function rectArea(rect) {
  if (!rect) return 0;
  return Math.max(0, rect.width) * Math.max(0, rect.height);
}

function overlapRatio(left, right, axis) {
  if (!left || !right) return 0;
  const start = Math.max(left[axis], right[axis]);
  const size = axis === "x" ? "width" : "height";
  const end = Math.min(left[axis] + left[size], right[axis] + right[size]);
  const overlap = Math.max(0, end - start);
  const base = Math.max(1, Math.min(left[size], right[size]));
  return overlap / base;
}

function frameTextResults(frame = {}, { includeFrameText = true } = {}) {
  const results = [];
  if (includeFrameText && typeof frame.text === "string") results.push({ text: frame.text, confidence: frame.confidence ?? 0.5, roi: frame.roi || null, regionId: frame.regionId || null });
  if (includeFrameText && typeof frame.ocrText === "string") results.push({ text: frame.ocrText, confidence: frame.confidence ?? 0.5, roi: frame.roi || null, regionId: frame.regionId || null });
  for (const key of ["ocrResults", "textResults", "texts"]) {
    for (const entry of asArray(frame[key])) {
      if (typeof entry === "string") results.push({ text: entry, confidence: 0.5, roi: null, regionId: null });
      else if (entry && typeof entry.text === "string") results.push(entry);
    }
  }
  return results.filter((item) => item.text?.trim?.());
}

function operatorImagePath(operator = {}) {
  if (typeof operator.image === "string") return operator.image;
  return operator.image?.localPath || operator.imagePath || null;
}

function hiraganaToKatakana(value) {
  return String(value ?? "").replace(/[\u3041-\u3096]/g, (char) => String.fromCharCode(char.charCodeAt(0) + 0x60));
}

function applyOperatorEquivalenceClasses(value, operatorOcrMap = {}) {
  let text = String(value ?? "");
  const classes = Array.isArray(operatorOcrMap?.equivalenceClasses) ? operatorOcrMap.equivalenceClasses : Array.isArray(operatorOcrMap) ? operatorOcrMap : [];
  for (const group of classes) {
    if (!Array.isArray(group) || group.length < 2) continue;
    const replacement = group.includes("ー") ? "ー" : String(group[0]);
    for (const variant of group) {
      if (!variant || variant === replacement) continue;
      text = text.split(String(variant)).join(replacement);
    }
  }
  return text;
}

export function normalizeOperatorRecognitionText(value, operatorOcrMap = {}) {
  return hiraganaToKatakana(applyOperatorEquivalenceClasses(normalizeRecognitionText(value, ["remove_spaces"]), operatorOcrMap))
    .replace(/[「」『』【】\[\]（）()]/g, "")
    .replace(/[・･]/g, "")
    .replace(/[：:．.,，、。;；]/g, "")
    .replace(/[〜～~]/g, "-")
    .toLowerCase();
}

function escapeRegExpLiteral(value) {
  return String(value).replace(/[\\^$.*+?()[\]{}|]/g, (char) => "\\" + char);
}

function kanaVariant(char) {
  const code = String(char).charCodeAt(0);
  if (code >= 0x3041 && code <= 0x3096) return String.fromCharCode(code + 0x60);
  if (code >= 0x30a1 && code <= 0x30f6) return String.fromCharCode(code - 0x60);
  return null;
}

function patternVariants(char, lookup) {
  const variants = new Set([char]);
  for (const item of lookup.get(char) || []) variants.add(item);
  for (const item of [...variants]) {
    const kana = kanaVariant(item);
    if (kana) variants.add(kana);
  }
  return variants.size > 1 ? [...variants] : null;
}

function equivalenceLookup(operatorOcrMap = {}) {
  const lookup = new Map();
  const classes = Array.isArray(operatorOcrMap?.equivalenceClasses) ? operatorOcrMap.equivalenceClasses : [];
  for (const group of classes) {
    if (!Array.isArray(group) || group.length < 2) continue;
    const variants = [...new Set(group.map((item) => String(item)).filter(Boolean))];
    for (const variant of variants) lookup.set(variant, variants);
  }
  return lookup;
}

function expandMaaEquivalencePattern(pattern, operatorOcrMap = {}) {
  const lookup = equivalenceLookup(operatorOcrMap);
  let output = "";
  let escaped = false;
  let inClass = false;
  for (const char of String(pattern)) {
    if (escaped) {
      output += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      output += char;
      escaped = true;
      continue;
    }
    if (char === "[" && !inClass) {
      output += char;
      inClass = true;
      continue;
    }
    if (char === "]" && inClass) {
      output += char;
      inClass = false;
      continue;
    }
    const variants = !inClass ? patternVariants(char, lookup) : null;
    output += variants ? "(?:" + variants.map(escapeRegExpLiteral).join("|") + ")" : char;
  }
  return output;
}

function compilePattern(pattern, operatorOcrMap = {}) {
  try {
    return new RegExp(expandMaaEquivalencePattern(pattern, operatorOcrMap));
  } catch {
    return null;
  }
}

function ruleMatchesOperator(rule, operator) {
  if ((rule.localMatches || []).some((match) => match?.id === operator.id)) return true;
  const regex = compilePattern(rule.pattern, { equivalenceClasses: [] });
  return regex ? regex.test(String(operator.name || "")) : false;
}

function maaPatternsForOperator(operator, operatorOcrMap = {}) {
  const rules = Array.isArray(operatorOcrMap.rules) ? operatorOcrMap.rules : [];
  return rules
    .filter((rule) => rule?.pattern && ruleMatchesOperator(rule, operator))
    .map((rule) => ({
      source: "maa",
      pattern: rule.pattern,
      maaReplacement: rule.maaReplacement || null,
      regex: compilePattern(rule.pattern, operatorOcrMap),
      expandedPattern: expandMaaEquivalencePattern(rule.pattern, operatorOcrMap),
    }))
    .filter((rule) => rule.regex);
}

export function buildOperatorRecognitionDb(operators = [], { operatorOcrMap = {} } = {}) {
  return (operators || [])
    .filter((operator) => operator?.id && operator?.name)
    .map((operator) => ({
      operatorId: operator.id,
      name: operator.name,
      rarity: operator.rarity ?? null,
      class: operator.class || null,
      branch: operator.branch || null,
      imagePath: operatorImagePath(operator),
      hiddenByDefault: Boolean(operator.hiddenByDefault),
      normalizedName: normalizeOperatorRecognitionText(operator.name, operatorOcrMap),
      ocrPatterns: maaPatternsForOperator(operator, operatorOcrMap),
    }))
    .filter((entry) => entry.normalizedName.length >= 2 || entry.operatorId === "w");
}

const operatorClassAliases = new Map([
  ["vanguard", "先鋒"],
  ["先锋", "先鋒"],
  ["先鋒", "先鋒"],
  ["guard", "前衛"],
  ["近卫", "前衛"],
  ["前衛", "前衛"],
  ["defender", "重装"],
  ["重装", "重装"],
  ["sniper", "狙撃"],
  ["狙击", "狙撃"],
  ["狙撃", "狙撃"],
  ["caster", "術師"],
  ["术师", "術師"],
  ["術師", "術師"],
  ["medic", "医療"],
  ["医疗", "医療"],
  ["医療", "医療"],
  ["supporter", "補助"],
  ["辅助", "補助"],
  ["補助", "補助"],
  ["specialist", "特殊"],
  ["特种", "特殊"],
  ["特殊", "特殊"],
]);

function normalizeOperatorClass(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  return operatorClassAliases.get(raw.toLowerCase()) || operatorClassAliases.get(raw) || raw;
}

function operatorClassSetFromContext(context = {}) {
  const values = [
    context.operatorClass,
    context.operatorClasses,
    context.allowedOperatorClass,
    context.allowedOperatorClasses,
    context.allowedClasses,
    context.expectedOperatorClass,
    context.expectedOperatorClasses,
    context.profile?.operatorClass,
    context.profile?.operatorClasses,
    context.profile?.allowedOperatorClass,
    context.profile?.allowedOperatorClasses,
    context.profile?.allowedClasses,
    context.profile?.expectedOperatorClass,
    context.profile?.expectedOperatorClasses,
  ].flatMap(asArray);
  const classes = new Set(values.map(normalizeOperatorClass).filter(Boolean));
  return classes.size ? classes : null;
}

function filterDbByOperatorClass(db, classSet) {
  if (!classSet?.size) return db;
  return db.filter((operator) => classSet.has(normalizeOperatorClass(operator.class)));
}

function isOperatorRowOcrResult(row, scanRegion) {
  const regionId = String(row.regionId || "");
  if (regionId && !regionId.includes("operator")) return false;
  const rowRect = rectFrom(row.roi);
  if (!rowRect) return regionId.includes("operator");
  if (!rectsOverlap(scanRegion, rowRect)) return false;
  if (!scanRegion) return true;
  const scanArea = rectArea(scanRegion);
  const rowArea = rectArea(rowRect);
  if (scanArea > 0 && rowArea / scanArea > 0.24) return false;
  if (rowRect.height > scanRegion.height * 0.2) return false;
  return true;
}

function stripOperatorLineNoise(normalizedText) {
  return String(normalizedText || "")
    .replace(/^[ー\-]+/g, "")
    .replace(/^[^0-9A-Za-zぁ-んァ-ヶー一-龠]+/g, "")
    .replace(/^(?:(?:code|coce|c0de|core|coche)[-_ー一]?(?:name|n[a-z]*me|nurme)|edge[-_ー一]?name|orig[-_ー一]?(?:code[-_ー一]?name|name))[:：_\-ー一]*/i, "")
    .replace(/^[ー\-]+/g, "")
    .replace(/[^0-9A-Za-zぁ-んァ-ヶー一-龠]+$/g, "");
}

function maaRuleCanUseText(pattern, text) {
  if (pattern?.pattern === "^ユー(?:$|[^ネ])") return text === "ユー";
  if (String(pattern?.pattern || "").startsWith("^シー(?:") && /^シー[ゴコ]$/i.test(text)) return false;
  if (pattern?.pattern === "^シュウ" && /^シ[ュユ]ウ[アァ]?ルツ$/i.test(text)) return false;
  return true;
}

function maaRuleHitsForRow(row, db, operatorOcrMap) {
  const compactText = hiraganaToKatakana(applyOperatorEquivalenceClasses(normalizeRecognitionText(row.text, ["remove_spaces"]), operatorOcrMap));
  const compactVariants = [...new Set([compactText, stripOperatorLineNoise(compactText)])].filter(Boolean);
  if (!compactVariants.length) return [];
  return db
    .flatMap((operator) => operator.ocrPatterns
      .filter((pattern) => compactVariants.some((text) => maaRuleCanUseText(pattern, text) && pattern.regex.test(text)))
      .map((pattern) => ({
        operator,
        rawText: row.text,
        normalizedText: compactVariants[0],
        confidence: Math.min(0.92, Number(row.confidence || 0.5) + 0.06),
        source: "maa-ocr-rule",
        matchedPattern: pattern.pattern,
        maaReplacement: pattern.maaReplacement,
      })))
    .filter(Boolean);
}

function localNameFallbackHitsForRow(row, db, operatorOcrMap) {
  const normalizedText = normalizeOperatorRecognitionText(row.text, operatorOcrMap);
  const lineText = stripOperatorLineNoise(normalizedText);
  if (!lineText) return [];
  return db
    .filter((operator) => operator.ocrPatterns.length === 0 && lineText === operator.normalizedName)
    .map((operator) => ({
      operator,
      rawText: row.text,
      normalizedText,
      confidence: Math.min(0.82, Number(row.confidence || 0.5) + 0.03),
      source: "local-name-fallback",
      matchedPattern: null,
      maaReplacement: null,
    }));
}

const operatorOcrDriftAliases = [
  { operatorId: "bluepoison", pattern: /^アスリウス$/i, matchedPattern: "アスリウス" },
  { operatorId: "wisadel", pattern: /^ウイシ[ヤャ][テデ]ル$/i, matchedPattern: "ウイシャデル" },
  { operatorId: "pozyomka", pattern: /^ゼオンカ$/i, matchedPattern: "ゼオンカ" },
  { operatorId: "schwarz", pattern: /^シ[ュユ]ウ[アァ]?ルツ$/i, matchedPattern: "シュウアルツ" },
  { operatorId: "executor", pattern: /^イクセキ[ュユ]ター$/i, matchedPattern: "イクセキュター" },
  { operatorId: "jessica", pattern: /^シ[ェエ]シカ$/i, matchedPattern: "シェシカ" },
  { operatorId: "insider", pattern: /^インサイター$/i, matchedPattern: "インサイター" },
  { operatorId: "provence", pattern: /^フロ[ウヴ]アンス$/i, matchedPattern: "フロウアンス" },
  { operatorId: "ray", pattern: /^(?:o|0)?ー?レイ$/i, matchedPattern: "Oーレイ" },
  { operatorId: "rangers", pattern: /^レンシ[ヤャ]ー$/i, matchedPattern: "レンシャー" },
  { operatorId: "brigid", pattern: /^[フブプ]リキ[ツッ]ド$/i, matchedPattern: "ブリキッド" },
  { operatorId: "jieyun", pattern: /^(?:シエ|シェ|ジエ|ジェ|エ)ユン$/i, matchedPattern: "シェユン" },
  { operatorId: "shirayuki", pattern: /^シ[ヨョ]ラ(?:キ|ユキ)$/i, matchedPattern: "ショラキ" },
  { operatorId: "rosesalt", pattern: /^ロース[ソン]ルト$/i, matchedPattern: "ロースソルト" },
  { operatorId: "reserve_sniper", pattern: /^(?:予)?備隊員[-ー]?狙[撃擊]$/i, matchedPattern: "予備隊員-狙擊" },
  { operatorId: "terraresearchcommission", pattern: /^テラ大[陸陆]調査団$/i, matchedPattern: "テラ大陆調査団" },
  { operatorId: "siege", pattern: /^シー[ゴコ]$/i, matchedPattern: "シーゴ" },
  { operatorId: "zima", pattern: /^スイマー$/i, matchedPattern: "スイマー" },
  { operatorId: "fang2", pattern: /^歴陣[鋭銳].*フ[ェエ]ン$/i, matchedPattern: "歴陣銳槍フェン" },
  { operatorId: "leizi", pattern: /^レイス$/i, matchedPattern: "レイス" },
  { operatorId: "leizi2", pattern: /^司霆レイス$/i, matchedPattern: "司霆レイス" },
  { operatorId: "leizi2", pattern: /^pmey$/i, matchedPattern: "PMEY" },
  { operatorId: "gummy", pattern: /^ク(?:ム|で|ン)$/i, matchedPattern: "クム" },
  { operatorId: "sussurro", pattern: /^スス[ー一]?ヨロ$/i, matchedPattern: "ススーヨロ" },
  { operatorId: "whisperain", pattern: /^ウ[ィイ]ス[パハバ][ー一]?レイン$/i, matchedPattern: "ウィスパレイン" },
  { operatorId: "whisperain", pattern: /^ス[パハバ][ー一]?レイン$/i, matchedPattern: "スパレイン" },
];

function localOcrDriftHitsForRow(row, db, operatorOcrMap) {
  const normalizedText = normalizeOperatorRecognitionText(row.text, operatorOcrMap);
  const lineText = stripOperatorLineNoise(normalizedText);
  if (!lineText) return [];
  return operatorOcrDriftAliases
    .filter((alias) => alias.pattern.test(lineText))
    .map((alias) => {
      const operator = db.find((entry) => entry.operatorId === alias.operatorId);
      if (!operator) return null;
      return {
        operator,
        rawText: row.text,
        normalizedText,
        confidence: Math.min(0.72, Number(row.confidence || 0.5) + 0.12),
        source: "local-ocr-drift",
        matchedPattern: alias.matchedPattern,
        maaReplacement: null,
      };
    })
    .filter(Boolean);
}

function candidateFromHit(hit, row) {
  return {
    kind: "operator",
    operatorId: hit.operator.operatorId,
    name: hit.operator.name,
    rarity: hit.operator.rarity,
    class: hit.operator.class,
    branch: hit.operator.branch,
    imagePath: hit.operator.imagePath,
    rawText: hit.rawText,
    normalizedText: hit.normalizedText,
    confidence: hit.confidence,
    needsReview: true,
    roi: row.roi || null,
    source: hit.source,
    matchedPattern: hit.matchedPattern || null,
    maaReplacement: hit.maaReplacement || null,
  };
}

function suppressOverlappedSuffixCandidates(candidates, db) {
  const normalizedNames = new Map(db.map((operator) => [operator.operatorId, operator.normalizedName]));
  return candidates.filter((candidate) => {
    const candidateName = normalizedNames.get(candidate.operatorId) || "";
    if (candidateName.length < 3) return true;
    const candidateRect = rectFrom(candidate.roi);
    if (!candidateRect) return true;
    return !candidates.some((other) => {
      if (other === candidate) return false;
      const otherName = normalizedNames.get(other.operatorId) || "";
      if (otherName.length <= candidateName.length || !otherName.endsWith(candidateName)) return false;
      const otherRect = rectFrom(other.roi);
      if (!otherRect) return false;
      return overlapRatio(candidateRect, otherRect, "y") >= 0.55
        && overlapRatio(candidateRect, otherRect, "x") >= 0.15;
    });
  });
}

export function createOperatorCandidateExtractor({ operators = [], operatorOcrMap = {} } = {}) {
  const db = buildOperatorRecognitionDb(operators, { operatorOcrMap });
  return async function extractOperatorCandidates(frame, context = {}) {
    if (context.profile?.id !== "operatorsFull") return [];
    const operatorClassSet = operatorClassSetFromContext(context);
    const scopedDb = filterDbByOperatorClass(db, operatorClassSet);
    if (!scopedDb.length) return [];
    const scanRegion = rectFrom(context.region);
    const rows = frameTextResults(frame, { includeFrameText: false })
      .filter((row) => isOperatorRowOcrResult(row, scanRegion));
    if (!rows.length) return [];

    const byOperator = new Map();
    for (const row of rows) {
      const hits = maaRuleHitsForRow(row, scopedDb, operatorOcrMap);
      const maaIds = new Set(hits.map((hit) => hit.operator.operatorId));
      hits.push(...localNameFallbackHitsForRow(row, scopedDb, operatorOcrMap).filter((hit) => !maaIds.has(hit.operator.operatorId)));
      hits.push(...localOcrDriftHitsForRow(row, scopedDb, operatorOcrMap).filter((hit) => !maaIds.has(hit.operator.operatorId)));
      for (const hit of hits) {
        const candidate = candidateFromHit(hit, row);
        const previous = byOperator.get(candidate.operatorId);
        if (!previous || Number(candidate.confidence || 0) > Number(previous.confidence || 0)) byOperator.set(candidate.operatorId, candidate);
      }
    }
    return suppressOverlappedSuffixCandidates([...byOperator.values()], scopedDb).sort((a, b) => {
      const ar = rectFrom(a.roi);
      const br = rectFrom(b.roi);
      if (ar && br) return (ar.y - br.y) || (ar.x - br.x);
      if (ar) return -1;
      if (br) return 1;
      return Number(b.confidence || 0) - Number(a.confidence || 0);
    });
  };
}
