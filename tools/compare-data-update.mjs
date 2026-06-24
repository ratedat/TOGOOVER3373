#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      result[key] = true;
    } else {
      result[key] = next;
      i += 1;
    }
  }
  return result;
}

const args = parseArgs(process.argv.slice(2));
const beforeDir = path.resolve(projectRoot, args.before || "data");
const afterDir = path.resolve(projectRoot, args.after || "data");
const outDir = path.resolve(projectRoot, args.out || path.join("review", "update-runs", "manual-compare"));

function readJson(baseDir, file) {
  const filePath = path.join(baseDir, file);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function getValue(object, dottedPath) {
  if (!object) return undefined;
  let cursor = object;
  for (const part of dottedPath.split(".")) {
    if (cursor === null || cursor === undefined) return undefined;
    cursor = cursor[part];
  }
  return cursor;
}

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortObject(value[key])]));
}

function stableJson(value) {
  if (value === undefined) return "";
  return JSON.stringify(sortObject(value));
}

function displayValue(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(sortObject(value));
}

function compact(value, max = 220) {
  const text = displayValue(value).replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function csvEscape(value) {
  const text = displayValue(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function makeMap(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!key) continue;
    map.set(String(key), item);
  }
  return map;
}

function listFromPath(doc, listPath) {
  if (!doc) return [];
  if (typeof listPath === "function") return listPath(doc);
  const value = getValue(doc, listPath);
  return Array.isArray(value) ? value : [];
}

function compareDataset(definition, beforeDoc, afterDoc) {
  const beforeItems = listFromPath(beforeDoc, definition.listPath);
  const afterItems = listFromPath(afterDoc, definition.listPath);
  const beforeMap = makeMap(beforeItems, definition.key);
  const afterMap = makeMap(afterItems, definition.key);
  const changes = [];
  const allKeys = [...new Set([...beforeMap.keys(), ...afterMap.keys()])].sort((a, b) => a.localeCompare(b, "ja"));

  for (const key of allKeys) {
    const before = beforeMap.get(key);
    const after = afterMap.get(key);
    const base = {
      dataset: definition.name,
      file: definition.file,
      key,
      campaignId: definition.campaignId(after || before) || "",
      label: definition.label(after || before) || key,
    };

    if (!before && after) {
      changes.push({ ...base, type: "added", fields: [], before: null, after: definition.summary(after) });
      continue;
    }
    if (before && !after) {
      changes.push({ ...base, type: "removed", fields: [], before: definition.summary(before), after: null });
      continue;
    }

    const fieldChanges = [];
    for (const field of definition.fields) {
      const beforeValue = getValue(before, field);
      const afterValue = getValue(after, field);
      if (stableJson(beforeValue) !== stableJson(afterValue)) {
        fieldChanges.push({ field, before: beforeValue ?? null, after: afterValue ?? null });
      }
    }
    if (fieldChanges.length > 0) {
      changes.push({
        ...base,
        type: "changed",
        fields: fieldChanges.map((entry) => entry.field),
        fieldChanges,
        before: definition.summary(before),
        after: definition.summary(after),
      });
    }
  }

  return {
    dataset: definition.name,
    file: definition.file,
    beforeCount: beforeItems.length,
    afterCount: afterItems.length,
    added: changes.filter((change) => change.type === "added").length,
    removed: changes.filter((change) => change.type === "removed").length,
    changed: changes.filter((change) => change.type === "changed").length,
    changes,
  };
}

function flattenDifficultyGrades(doc) {
  const groups = doc?.campaignDifficultyGrades || {};
  const rows = [];
  for (const [campaignId, group] of Object.entries(groups)) {
    for (const grade of group.grades || []) {
      rows.push({ difficultyName: group.difficultyName || "", ...grade, campaignId: grade.campaignId || campaignId });
    }
  }
  return rows;
}

function flattenDifficultyTiers(doc) {
  const groups = doc?.campaignDifficultyTiers || {};
  const rows = [];
  for (const [campaignId, group] of Object.entries(groups)) {
    for (const tier of group.tiers || []) {
      rows.push({
        campaignId,
        inputField: group.inputField || "",
        derivedField: group.derivedField || "",
        defaultTierId: group.defaultTierId || "",
        appliesTo: group.appliesTo || "",
        sourceCategory: group.sourceCategory || "",
        resolution: group.resolution || "",
        ...tier,
      });
    }
  }
  return rows;
}

function topLevelArray(doc) {
  return Array.isArray(doc) ? doc : [];
}

function singletonConfig(id) {
  return (doc) => (doc ? [{ id, ...doc }] : []);
}

function flattenSelectableEffectSources(doc) {
  if (!doc) return [];
  const rows = [];
  for (const source of doc.sources || []) {
    for (const section of source.sections || []) {
      rows.push({
        campaignId: source.campaignId,
        page: source.page,
        sourceUrl: source.sourceUrl,
        ...section,
      });
    }
  }
  return rows;
}

const simpleSummary = (fields) => (item) => Object.fromEntries(fields.map((field) => [field, getValue(item, field) ?? null]));

const datasets = [
  {
    name: "campaigns",
    file: "campaigns.json",
    listPath: topLevelArray,
    key: (item) => item.id,
    label: (item) => item.fullTitle || item.title || item.id,
    campaignId: (item) => item.id,
    fields: ["number", "title", "fullTitle", "sourceUrl", "specialFields", "bossFlags"],
    summary: simpleSummary(["id", "number", "title", "fullTitle"]),
  },
  {
    name: "wikiCampaignSources",
    file: "wikiru-campaign-sources.json",
    listPath: "campaigns",
    key: (item) => item.id,
    label: (item) => item.title || item.page || item.id,
    campaignId: (item) => item.id,
    fields: ["number", "title", "page"],
    summary: simpleSummary(["id", "number", "title", "page"]),
  },
  {
    name: "wikiOperatorSource",
    file: "wikiru-operator-sources.json",
    listPath: singletonConfig("wikiru-operator-sources"),
    key: (item) => item.id,
    label: () => "Operator source config",
    campaignId: () => "",
    fields: ["sourcePage", "sourceUrl", "tablePagePattern", "fallbackTables"],
    summary: simpleSummary(["sourcePage", "sourceUrl", "tablePagePattern", "fallbackTables"]),
  },
  {
    name: "performanceSources",
    file: "performance-sources.json",
    listPath: "sources",
    key: (item) => item.campaignId,
    label: (item) => item.sectionTitle || item.page || item.campaignId,
    campaignId: (item) => item.campaignId,
    fields: ["page", "sectionAnchor", "sectionTitle", "sourceUrl"],
    summary: simpleSummary(["campaignId", "page", "sectionAnchor", "sectionTitle"]),
  },
  {
    name: "selectableEffectSources",
    file: "selectable-effect-sources.json",
    listPath: flattenSelectableEffectSources,
    key: (item) => `${item.campaignId}|${item.slot}|${item.sectionAnchor}`,
    label: (item) => item.slotLabel || item.sectionTitle,
    campaignId: (item) => item.campaignId,
    fields: ["page", "sourceUrl", "slot", "slotLabel", "selectionMode", "rowMode", "sectionTitle", "sectionAnchor", "sectionLevel", "defaultGroup", "defaultGroupLabel", "groupTransitions", "lowerVariantLabel", "upperVariantLabel", "phaseVariants"],
    summary: simpleSummary(["campaignId", "slot", "slotLabel", "selectionMode", "rowMode", "sectionAnchor"]),
  },
  {
    name: "specialItemSources",
    file: "special-item-sources.json",
    listPath: "sources",
    key: (item) => `${item.campaignId}|${item.parser}`,
    label: (item) => item.parser || item.page,
    campaignId: (item) => item.campaignId,
    fields: ["page", "sourceUrl", "parser"],
    summary: simpleSummary(["campaignId", "page", "parser"]),
  },
  {
    name: "difficultyVariantSources",
    file: "difficulty-variant-sources.json",
    listPath: "sources",
    key: (item) => item.campaignId,
    label: (item) => item.page || item.campaignId,
    campaignId: (item) => item.campaignId,
    fields: ["enabled", "page", "sourceCategory", "relicRange", "defaultTierId", "tiers"],
    summary: simpleSummary(["campaignId", "enabled", "page", "sourceCategory", "relicRange"]),
  },
  {
    name: "difficultyGradeSources",
    file: "difficulty-grade-sources.json",
    listPath: "campaigns",
    key: (item) => item.id,
    label: (item) => item.difficultyName || item.id,
    campaignId: (item) => item.id,
    fields: ["difficultyName", "minSelectableGrade", "maxSelectableGrade", "tableStyle", "fields"],
    summary: simpleSummary(["id", "difficultyName", "minSelectableGrade", "maxSelectableGrade", "tableStyle"]),
  },
  {
    name: "relics",
    file: "relics.json",
    listPath: "relics",
    key: (item) => item.id,
    label: (item) => item.name,
    campaignId: (item) => item.campaignId,
    fields: ["campaignId", "number", "name", "category", "price", "exchange", "effect", "flavorText", "sourceAnchor", "image.sourcePath", "image.localPath"],
    summary: simpleSummary(["campaignId", "number", "name", "category", "effect", "image.localPath"]),
  },
  {
    name: "squads",
    file: "squads.json",
    listPath: "squads",
    key: (item) => item.id,
    label: (item) => item.name,
    campaignId: (item) => item.campaignId,
    fields: ["campaignId", "name", "effect", "upgrades", "randomEffectOptions"],
    summary: simpleSummary(["campaignId", "name", "effect"]),
  },
  {
    name: "performances",
    file: "performances.json",
    listPath: "performances",
    key: (item) => item.id,
    label: (item) => item.name || item.title,
    campaignId: (item) => item.campaignId,
    fields: ["campaignId", "order", "group", "title", "subtitle", "name", "effect", "flavorText", "sourcePage", "sourceAnchor", "image.sourcePath", "image.sourceUrl", "image.localPath"],
    summary: simpleSummary(["campaignId", "order", "group", "name", "effect"]),
  },
  {
    name: "selectableEffects",
    file: "selectable-effects.json",
    listPath: "selectableEffects",
    key: (item) => item.id,
    label: (item) => item.name,
    campaignId: (item) => item.campaignId,
    fields: ["campaignId", "order", "slot", "slotLabel", "selectionMode", "group", "groupLabel", "parentKey", "parentName", "variantRank", "variantLabel", "name", "effect", "flavorText", "sourcePage", "sourceAnchor", "image.sourcePath", "image.sourceUrl", "image.localPath"],
    summary: simpleSummary(["campaignId", "slot", "parentName", "variantLabel", "name", "effect"]),
  },
  {
    name: "operators",
    file: "operators.json",
    listPath: "operators",
    key: (item) => item.id,
    label: (item) => item.name,
    campaignId: () => "",
    fields: ["name", "rarity", "class", "branch", "obtainMethods", "recruitmentTags", "wikiPage", "sourceTable", "sourceSection", "isJapanUnreleased", "hiddenByDefault", "displayOrder", "image.sourcePath", "image.localPath"],
    summary: simpleSummary(["name", "rarity", "class", "branch", "isJapanUnreleased", "image.localPath"]),
  },
  {
    name: "difficultyGrades",
    file: "difficulty-grades.json",
    listPath: flattenDifficultyGrades,
    key: (item) => item.id || `${item.campaignId}|${item.grade}`,
    label: (item) => item.label || String(item.grade),
    campaignId: (item) => item.campaignId,
    fields: ["campaignId", "difficultyName", "grade", "label", "condition", "scoreMultiplier", "enemyStrength", "rhetoricRate", "ageProgress", "thoughtLoad", "suiTime", "stateChangeRate", "fields"],
    summary: simpleSummary(["campaignId", "grade", "label", "condition", "scoreMultiplier"]),
  },
  {
    name: "difficultyTiers",
    file: "difficulty-tiers.json",
    listPath: flattenDifficultyTiers,
    key: (item) => `${item.campaignId}|${item.tierId}`,
    label: (item) => item.label || item.tierId,
    campaignId: (item) => item.campaignId,
    fields: ["inputField", "derivedField", "defaultTierId", "appliesTo", "sourceCategory", "resolution", "tierId", "label", "minDifficulty", "maxDifficulty", "match", "values"],
    summary: simpleSummary(["campaignId", "tierId", "label", "minDifficulty", "maxDifficulty"]),
  },
  {
    name: "relicEffectVariants",
    file: "relic-effect-variants.json",
    listPath: "variantGroups",
    key: (item) => item.variantKey || `${item.campaignId}|${item.relicId}`,
    label: (item) => item.name,
    campaignId: (item) => item.campaignId,
    fields: ["relicId", "campaignId", "number", "name", "sourceAnchor", "variantKey", "tierSource", "fallbackTierId", "variants"],
    summary: simpleSummary(["campaignId", "number", "name", "variantKey", "variants"]),
  },
  {
    name: "relicImages",
    file: "relic-images.json",
    listPath: "images",
    key: (item) => item.relicId,
    label: (item) => item.relicId,
    campaignId: (item) => item.campaignId,
    fields: ["campaignId", "sourceAnchor", "sourcePath", "sourceUrl", "localPath"],
    summary: simpleSummary(["campaignId", "sourceAnchor", "sourcePath", "localPath"]),
  },
  {
    name: "relicImageMissing",
    file: "relic-images.json",
    listPath: "missing",
    key: (item) => item.relicId || `${item.campaignId}|${item.sourceAnchor}|${item.name}`,
    label: (item) => item.name || item.relicId,
    campaignId: (item) => item.campaignId,
    fields: ["campaignId", "sourceAnchor", "name"],
    summary: simpleSummary(["campaignId", "sourceAnchor", "name"]),
  },
  {
    name: "relicImageFailed",
    file: "relic-images.json",
    listPath: "failed",
    key: (item) => item.relicId || `${item.campaignId}|${item.sourcePath}`,
    label: (item) => item.name || item.relicId,
    campaignId: (item) => item.campaignId,
    fields: ["campaignId", "sourceAnchor", "name", "sourcePath", "error"],
    summary: simpleSummary(["campaignId", "sourceAnchor", "name", "sourcePath", "error"]),
  },
  {
    name: "operatorImages",
    file: "operator-images.json",
    listPath: "images",
    key: (item) => item.operatorId,
    label: (item) => item.name,
    campaignId: () => "",
    fields: ["name", "rarity", "sourceTable", "sourceSection", "isJapanUnreleased", "sourcePath", "sourceUrl", "localPath"],
    summary: simpleSummary(["name", "rarity", "isJapanUnreleased", "sourcePath", "localPath"]),
  },
  {
    name: "operatorImageFailed",
    file: "operator-images.json",
    listPath: "failed",
    key: (item) => item.operatorId || `${item.name}|${item.sourcePath}`,
    label: (item) => item.name || item.operatorId,
    campaignId: () => "",
    fields: ["name", "sourcePath", "error"],
    summary: simpleSummary(["name", "sourcePath", "error"]),
  },
];

const docCache = new Map();
function loadDoc(baseDir, file) {
  const cacheKey = `${baseDir}\0${file}`;
  if (!docCache.has(cacheKey)) docCache.set(cacheKey, readJson(baseDir, file));
  return docCache.get(cacheKey);
}

ensureDir(outDir);
const datasetReports = datasets.map((definition) => compareDataset(definition, loadDoc(beforeDir, definition.file), loadDoc(afterDir, definition.file)));
const changes = datasetReports.flatMap((report) => report.changes);
const generatedAt = new Date().toISOString();

const summary = {
  version: 1,
  generatedAt,
  beforeDir,
  afterDir,
  totals: {
    datasets: datasetReports.length,
    added: datasetReports.reduce((sum, report) => sum + report.added, 0),
    removed: datasetReports.reduce((sum, report) => sum + report.removed, 0),
    changed: datasetReports.reduce((sum, report) => sum + report.changed, 0),
  },
  datasets: datasetReports.map(({ changes: _changes, ...report }) => report),
  changes,
};

fs.writeFileSync(path.join(outDir, "changes.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");

const csvRows = [["dataset", "type", "key", "campaignId", "label", "fields", "before", "after"]];
for (const change of changes) {
  csvRows.push([
    change.dataset,
    change.type,
    change.key,
    change.campaignId,
    change.label,
    (change.fields || []).join("; "),
    compact(change.before, 500),
    compact(change.after, 500),
  ]);
}
const csv = csvRows.map((row) => row.map(csvEscape).join(",")).join("\r\n") + "\r\n";
fs.writeFileSync(path.join(outDir, "changes.csv"), `\uFEFF${csv}`, "utf8");

const md = [];
md.push("# Data Update Diff");
md.push("");
md.push(`Generated: ${generatedAt}`);
md.push("");
md.push(`Before: \`${path.relative(projectRoot, beforeDir).replace(/\\/g, "/")}\``);
md.push(`After: \`${path.relative(projectRoot, afterDir).replace(/\\/g, "/")}\``);
md.push("");
md.push("## Summary");
md.push("");
md.push("| Dataset | Before | After | Added | Removed | Changed |");
md.push("|---|---:|---:|---:|---:|---:|");
for (const report of datasetReports) {
  md.push(`| ${report.dataset} | ${report.beforeCount} | ${report.afterCount} | ${report.added} | ${report.removed} | ${report.changed} |`);
}
md.push("");
md.push(`Total changes: added ${summary.totals.added}, removed ${summary.totals.removed}, changed ${summary.totals.changed}.`);
md.push("");
md.push("## Review Checklist");
md.push("");
md.push("- Confirm added/removed campaign/source config, relics, squads, operators, grade rows, and variant groups are expected.");
md.push("- Check `changes.csv` for changed effect text and image path changes.");
md.push("- Open regenerated review HTML files under `review/` when image or relic text changes are present.");
md.push("- Commit data and asset updates only after manual verification.");
md.push("");
md.push("## Changed Items");
md.push("");
if (changes.length === 0) {
  md.push("No data changes detected.");
} else {
  for (const report of datasetReports.filter((entry) => entry.changes.length > 0)) {
    md.push(`### ${report.dataset}`);
    md.push("");
    md.push("| Type | Key | Campaign | Label | Fields |");
    md.push("|---|---|---|---|---|");
    for (const change of report.changes) {
      md.push(`| ${change.type} | \`${change.key}\` | ${change.campaignId || "-"} | ${String(change.label || "").replace(/\|/g, "\\|")} | ${(change.fields || []).join(", ") || "-"} |`);
    }
    md.push("");
  }
}
fs.writeFileSync(path.join(outDir, "summary.md"), `${md.join("\n")}\n`, "utf8");

console.log(`Data diff written to ${path.relative(projectRoot, outDir).replace(/\\/g, "/")}`);
console.log(`Added ${summary.totals.added}, removed ${summary.totals.removed}, changed ${summary.totals.changed}.`);