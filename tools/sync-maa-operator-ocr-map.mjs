import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const maaResourceRoot = path.join(root, "third_party", "maa", "resource", "global", "YoStarJP", "resource");
const tasksFile = path.join(maaResourceRoot, "tasks", "tasks.json");
const recruitmentFile = path.join(maaResourceRoot, "recruitment.json");
const ocrConfigFile = path.join(maaResourceRoot, "ocr_config.json");
const operatorsFile = path.join(root, "data", "operators.json");
const outputFile = path.join(root, "data", "recognition", "maa-operator-name-ocr.json");

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

function asOperators(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.operators)) return payload.operators;
  return [];
}

function compactName(value) {
  return String(value ?? "").replace(/\s+/g, "");
}

function hiraganaToKatakana(value) {
  return String(value ?? "").replace(/[\u3041-\u3096]/g, (char) => String.fromCharCode(char.charCodeAt(0) + 0x60));
}

function katakanaToHiragana(value) {
  return String(value ?? "").replace(/[\u30a1-\u30f6]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60));
}

function escapeRegExpLiteral(value) {
  return String(value).replace(/[\\^$.*+?()[\]{}|]/g, (char) => "\\" + char);
}

function equivalenceLookup(equivalenceClasses = []) {
  const lookup = new Map();
  for (const group of equivalenceClasses) {
    if (!Array.isArray(group) || group.length < 2) continue;
    const variants = [...new Set(group.map((item) => String(item)).filter(Boolean))];
    for (const variant of variants) lookup.set(variant, variants);
  }
  return lookup;
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

function expandPatternForLocalMatch(pattern, equivalenceClasses = []) {
  const lookup = equivalenceLookup(equivalenceClasses);
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

function buildLocalMatches(pattern, localOperators, equivalenceClasses = []) {
  let regex;
  try {
    regex = new RegExp(expandPatternForLocalMatch(pattern, equivalenceClasses));
  } catch (error) {
    return { validRegex: false, error: error.message, matches: [] };
  }
  const matches = localOperators
    .filter((operator) => {
      const compact = compactName(operator.name);
      const variants = new Set([compact, hiraganaToKatakana(compact), katakanaToHiragana(compact)]);
      return [...variants].some((name) => regex.test(name));
    })
    .map((operator) => ({
      id: operator.id,
      name: operator.name,
      rarity: operator.rarity,
      class: operator.class,
      branch: operator.branch,
      hiddenByDefault: Boolean(operator.hiddenByDefault),
    }));
  return { validRegex: true, matches };
}

const tasks = await readJson(tasksFile);
const recruitment = await readJson(recruitmentFile);
const ocrConfig = await readJson(ocrConfigFile);
const operatorPayload = await readJson(operatorsFile);
const localOperators = asOperators(operatorPayload);
const sourceTask = tasks.CharsNameOcrReplace || {};
const rawRules = Array.isArray(sourceTask.ocrReplace) ? sourceTask.ocrReplace : [];

const rules = rawRules.map(([pattern, maaReplacement], index) => {
  const localMatchResult = buildLocalMatches(pattern, localOperators, ocrConfig.equivalence_classes);
  return {
    index,
    pattern,
    maaReplacement,
    validRegex: localMatchResult.validRegex,
    localMatches: localMatchResult.matches,
    error: localMatchResult.error || null,
  };
});

const publicRecruitmentOperators = asOperators(recruitment).map((operator) => ({
  maaId: operator.id,
  name: operator.name,
  rarity: operator.rarity,
  tags: operator.tags || [],
}));

const matchedOperatorIds = new Set(rules.flatMap((rule) => rule.localMatches.map((operator) => operator.id)));
const payload = {
  version: 1,
  source: {
    project: "MaaAssistantArknights/MaaAssistantArknights",
    branch: "dev-v2",
    license: "AGPL-3.0-only",
    taskPath: "resource/global/YoStarJP/resource/tasks/tasks.json",
    taskId: "CharsNameOcrReplace",
    localTaskPath: path.relative(root, tasksFile).replaceAll("\\", "/"),
    recruitmentPath: "resource/global/YoStarJP/resource/recruitment.json",
    localRecruitmentPath: path.relative(root, recruitmentFile).replaceAll("\\", "/"),
    ocrConfigPath: "resource/global/YoStarJP/resource/ocr_config.json",
    localOcrConfigPath: path.relative(root, ocrConfigFile).replaceAll("\\", "/"),
  },
  note: "MAA Japanese operator-name OCR rules. MAA replacements are internal CN names; localMatches map rules back to RHODES OBS COMMANDER3373 operator IDs where the regex matches the local Japanese name.",
  replaceFull: Boolean(sourceTask.replaceFull),
  doc: sourceTask.Doc || sourceTask.doc || null,
  equivalenceClasses: Array.isArray(ocrConfig.equivalence_classes) ? ocrConfig.equivalence_classes : [],
  rawOcrReplace: rawRules,
  rules,
  publicRecruitmentOperators,
  summary: {
    rawRuleCount: rawRules.length,
    localOperatorCount: localOperators.length,
    rulesWithLocalMatches: rules.filter((rule) => rule.localMatches.length > 0).length,
    uniqueMatchedLocalOperators: matchedOperatorIds.size,
    invalidRegexRules: rules.filter((rule) => !rule.validRegex).length,
    publicRecruitmentOperatorCount: publicRecruitmentOperators.length,
  },
};

await fs.mkdir(path.dirname(outputFile), { recursive: true });
await fs.writeFile(outputFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`wrote ${path.relative(root, outputFile)} rules=${payload.summary.rawRuleCount} matchedRules=${payload.summary.rulesWithLocalMatches} matchedOperators=${payload.summary.uniqueMatchedLocalOperators}`);
