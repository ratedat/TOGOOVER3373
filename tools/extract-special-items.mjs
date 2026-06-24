import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA = path.join(ROOT, "data");
const CONFIG_PATH = path.join(DATA, "special-item-sources.json");
const OUTPUT_PATH = path.join(DATA, "selectable-effects.json");
const ASSET_ROOT = path.join(ROOT, "assets", "selectable-effects");
const generatedAt = new Date().toISOString().slice(0, 10);

const managedSlots = new Set([
  "is4_sami|revelationBoard",
  "is5_sarkaz|thought",
  "is5_sarkaz|idea",
  "is6_sui|coin",
  "is6_sui|coinStatus",
]);

function htmlDecode(value) {
  return String(value ?? "").replace(/&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|#39|nbsp|ensp|thinsp);/gi, (match, entity) => {
    const lower = entity.toLowerCase();
    if (lower.startsWith("#x")) return String.fromCodePoint(Number.parseInt(lower.slice(2), 16));
    if (lower.startsWith("#")) return String.fromCodePoint(Number.parseInt(lower.slice(1), 10));
    const named = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " ", ensp: " ", thinsp: " " };
    return named[lower] ?? match;
  });
}

function cleanWikiText(value) {
  let text = htmlDecode(value);
  text = text.replace(/^BGCOLOR\([^)]*\):/i, "");
  text = text.replace(/^(?:CENTER|LEFT|RIGHT):/i, "");
  text = text.replace(/^~/, "");
  for (let i = 0; i < 30; i++) {
    const next = text
      .replace(/&nobold\{([^{}]*)\};/g, "$1")
      .replace(/&color\([^)]*\)\{([^{}]*)\};/g, "$1")
      .replace(/&size\([^)]*\)\{([^{}]*)\};/g, "$1");
    if (next === text) break;
    text = next;
  }
  text = text.replace(/&br\s*\/?;/gi, " ");
  text = text.replace(/&ensp;|&thinsp;|&nbsp;/gi, " ");
  text = text.replace(/\[\[([^\]>]+)>[^\]]+\]\]/g, "$1");
  text = text.replace(/\[\[([^\]]+)\]\]/g, "$1");
  text = text.replace(/&tooltip\(([^)]*)\)(?:\{[^{}]*\})?;/g, "$1");
  text = text.replace(/&(?:attachref|ref)\([^;]*\);/g, "");
  text = text.replace(/''/g, "");
  text = text.replace(/'/g, "");
  text = text.replace(/~/g, "");
  text = text.replace(/<([^<>]*[\u3040-\u30ff\u3400-\u9fff][^<>]*)>/g, "＜$1＞");
  text = text.replace(/<[^>]+>/g, "");
  text = text.replace(/\(\([^)]*\)\)/g, "");
  text = text.replace(/\s+/g, " ");
  return text.trim();
}

function splitWikiRow(line) {
  const trimmed = String(line ?? "").trim();
  if (!trimmed.startsWith("|")) return [];
  const parts = trimmed.split("|");
  if (parts.length <= 2) return [];
  return parts.slice(1, -1);
}

function normalizeSourcePath(sourcePath, page = null) {
  const raw = String(sourcePath ?? "").replaceAll("\\", "/");
  if (page && raw.startsWith("./")) return `${page}/${raw.slice(2)}`;
  return raw.replace(/^\.\//, "");
}

function sourcePathFromText(value, page = null) {
  const match = String(value ?? "").match(/&(?:attachref|ref)\((?<path>[^,);\s]+)[^;]*\);/);
  return match?.groups?.path ? normalizeSourcePath(match.groups.path, page) : null;
}

function sourcePathToImageUrl(sourcePath) {
  const normalized = normalizeSourcePath(sourcePath);
  const encoded = normalized
    .split("/")
    .map((part) => Buffer.from(part, "utf8").toString("hex").toUpperCase())
    .join("_");
  const ext = path.posix.extname(normalized) || ".png";
  return `https://arknights.wikiru.jp/attach2/${encoded}${ext}`;
}

function localAssetPath(campaignId, slot, sourcePath) {
  const fileName = path.posix.basename(normalizeSourcePath(sourcePath));
  return path.posix.join("assets", "selectable-effects", campaignId, slot, fileName);
}

function slugFromSourcePath(sourcePath) {
  const base = path.posix.basename(normalizeSourcePath(sourcePath), path.posix.extname(sourcePath)).toLowerCase();
  return base.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "item";
}

function makeEffectId(campaignId, slot, sourcePath, order) {
  return `${campaignId}_selectable_${slot}_${slugFromSourcePath(sourcePath) || `item_${String(order).padStart(2, "0")}`}`;
}

function imageObject(campaignId, slot, sourcePath) {
  const normalized = normalizeSourcePath(sourcePath);
  return {
    source: "arknights.wikiru.jp",
    sourcePath: normalized,
    sourceUrl: sourcePathToImageUrl(normalized),
    localPath: localAssetPath(campaignId, slot, normalized),
  };
}

function wikiSourceUrl(page) {
  return `https://arknights.wikiru.jp/?cmd=source&page=${encodeURIComponent(page)}`;
}

async function getWikiSource(page) {
  const response = await fetch(wikiSourceUrl(page));
  if (!response.ok) throw new Error(`Failed to fetch ${page}: ${response.status}`);
  const html = await response.text();
  const match = html.match(/<pre id="source">(?<source>[\s\S]*?)<\/pre>/);
  if (!match?.groups?.source) throw new Error(`Could not find source pre for ${page}`);
  return htmlDecode(match.groups.source);
}

function getBlock(lines, startIndex, maxLines = 90) {
  const block = [];
  for (let index = startIndex; index < lines.length && index < startIndex + maxLines; index++) {
    if (index > startIndex && /^#aname\(/.test(lines[index])) break;
    block.push(lines[index]);
  }
  return block;
}

function firstHeading3(block) {
  for (const line of block) {
    const match = line.match(/^#shadowheader\(3,(?<name>[^)]+)\)/);
    if (match?.groups?.name) return cleanWikiText(match.groups.name);
  }
  return "";
}

function firstCategoryFromHeader(block) {
  const line = block.find((item) => item.includes("~効果") && !item.includes("&ref("));
  if (!line) return "";
  for (const cell of splitWikiRow(line)) {
    const value = cleanWikiText(cell);
    if (value && value !== ">" && value !== "効果" && value !== "レア度" && value !== "価格") return value;
  }
  return "";
}

function firstImageEffectRow(block) {
  for (const line of block) {
    if (line.includes("&ref(") && line.includes("BGCOLOR(#EEF5FF)")) return line;
  }
  return "";
}

function lastCleanCell(cells) {
  for (let index = cells.length - 1; index >= 0; index--) {
    const value = cleanWikiText(cells[index]);
    if (value && value !== ">") return value;
  }
  return "";
}

function flavorAfter(block, imageLine) {
  const start = block.indexOf(imageLine);
  if (start < 0) return null;
  for (const line of block.slice(start + 1, start + 5)) {
    if (!line.trim().startsWith("|~")) continue;
    const value = lastCleanCell(splitWikiRow(line));
    if (value && value !== "~") return value;
  }
  return null;
}

function parseRarityAndPrice(block, imageLine) {
  const result = {};
  const imageCells = splitWikiRow(imageLine);
  if (imageCells.length >= 3) {
    const middle = cleanWikiText(imageCells[1]);
    if (middle && middle !== ">") result.rarity = middle;
    const price = cleanWikiText(imageCells[2]);
    if (/^-?\d+$/.test(price)) result.price = Number(price);
  }
  for (const line of block) {
    const cells = splitWikiRow(line);
    if (!cells.length) continue;
    const first = cleanWikiText(cells[0]);
    if (first === "レア度" && cells[1]) result.rarity = cleanWikiText(cells[1]);
    if (first === "価格" && cells[1]) {
      const value = cleanWikiText(cells[1]);
      result.price = /^-?\d+$/.test(value) ? Number(value) : value;
    }
    if (line.includes("✦") && line.includes("▲")) {
      result.thoughtRank = cleanWikiText(cells[0]);
      result.thoughtLoad = cleanWikiText(cells[1]);
    }
  }
  return result;
}

function effectFromDetailBlock({ campaignId, page, slot, slotLabel, selectionMode, group, groupLabel, order, anchor, block, extra = {} }) {
  const name = firstHeading3(block);
  const imageLine = firstImageEffectRow(block);
  const sourcePath = sourcePathFromText(imageLine);
  const cells = splitWikiRow(imageLine);
  const effect = lastCleanCell(cells);
  if (!name || !sourcePath || !effect) return null;
  const category = firstCategoryFromHeader(block);
  return {
    id: makeEffectId(campaignId, slot, sourcePath, order),
    campaignId,
    order,
    slot,
    slotLabel,
    selectionMode,
    group,
    groupLabel,
    name,
    effect,
    flavorText: flavorAfter(block, imageLine),
    sourcePage: page,
    sourceAnchor: anchor,
    ...(category ? { category } : {}),
    ...parseRarityAndPrice(block, imageLine),
    ...extra,
    image: imageObject(campaignId, slot, sourcePath),
  };
}

function parseFoldartal(lines, sourceConfig) {
  const effects = [];
  let order = 0;
  for (let index = 0; index < lines.length; index++) {
    const anchorMatch = lines[index].match(/^#aname\((?<anchor>(?:aestar|kvama)\d+)\)/);
    if (!anchorMatch?.groups?.anchor) continue;
    const anchor = anchorMatch.groups.anchor;
    const isFormation = anchor.startsWith("aestar");
    const effect = effectFromDetailBlock({
      campaignId: sourceConfig.campaignId,
      page: sourceConfig.page,
      slot: "revelationBoard",
      slotLabel: "啓示板",
      selectionMode: "multi",
      group: isFormation ? "formation" : "cause",
      groupLabel: isFormation ? "構成" : "本因",
      order: ++order,
      anchor,
      block: getBlock(lines, index),
      extra: { itemKind: isFormation ? "構成" : "本因" },
    });
    if (effect) effects.push(effect);
  }

  const rhetoricStart = lines.findIndex((line) => /^#aname\(rhetoric\)/.test(line));
  if (rhetoricStart >= 0) {
    const block = getBlock(lines, rhetoricStart, 30);
    for (const line of block) {
      if (!line.includes("IS4_Rhetoric")) continue;
      const cells = splitWikiRow(line);
      const sourcePath = sourcePathFromText(cells[0]);
      const name = cleanWikiText(cells[1]);
      const effect = cleanWikiText(cells[2]);
      if (!sourcePath || !name || !effect) continue;
      effects.push({
        id: makeEffectId(sourceConfig.campaignId, "revelationBoard", sourcePath, ++order),
        campaignId: sourceConfig.campaignId,
        order,
        slot: "revelationBoard",
        slotLabel: "啓示板",
        selectionMode: "multi",
        group: "rhetoric",
        groupLabel: "修辞",
        name,
        effect,
        flavorText: null,
        sourcePage: sourceConfig.page,
        sourceAnchor: "rhetoric",
        itemKind: "修辞",
        image: imageObject(sourceConfig.campaignId, "revelationBoard", sourcePath),
      });
    }
  }
  return effects;
}

function parseSarkazThought(lines, sourceConfig) {
  const effects = [];
  const orderBySlot = { thought: 0, idea: 0 };
  let currentGroup = "";
  let currentGroupLabel = "";
  for (let index = 0; index < lines.length; index++) {
    const h2 = lines[index].match(/^#shadowheader\(2,(?<name>[^)]+)\)/);
    if (h2?.groups?.name) {
      currentGroupLabel = cleanWikiText(h2.groups.name);
      currentGroup = currentGroupLabel === "妙想" ? "inspiration" : currentGroupLabel === "宿願" ? "legacy" : currentGroupLabel === "構想" ? "idea" : currentGroup;
    }
    const anchorMatch = lines[index].match(/^#aname\((?<anchor>(?:Inspiration|Legacy|Idea)\d+)\)/);
    if (!anchorMatch?.groups?.anchor) continue;
    const anchor = anchorMatch.groups.anchor;
    const slot = anchor.startsWith("Idea") ? "idea" : "thought";
    const slotLabel = slot === "idea" ? "構想" : "思案";
    const effect = effectFromDetailBlock({
      campaignId: sourceConfig.campaignId,
      page: sourceConfig.page,
      slot,
      slotLabel,
      selectionMode: "multi",
      group: slot === "idea" ? "idea" : currentGroup,
      groupLabel: slot === "idea" ? "構想" : currentGroupLabel,
      order: ++orderBySlot[slot],
      anchor,
      block: getBlock(lines, index),
    });
    if (effect) effects.push(effect);
  }
  return effects;
}

function coinGroupFromAnchor(anchor, currentGroupLabel) {
  if (anchor.startsWith("copper_b")) return ["gift", currentGroupLabel || "匣中の贈銭"];
  if (anchor.startsWith("copper_f") || anchor.startsWith("copper_p")) return ["battle", currentGroupLabel || "武備の兵銭"];
  if (anchor.startsWith("copper_r")) return ["resource", currentGroupLabel || "招福の商銭"];
  if (anchor.startsWith("copper_u")) return ["unsound", currentGroupLabel || "未鋳の子銭"];
  if (anchor.startsWith("copper_s")) return ["treasure", currentGroupLabel || "天師の奇銭"];
  return ["coin", currentGroupLabel || "通宝"];
}

function parseCoinStatuses(lines, sourceConfig) {
  const effects = [];
  let order = 0;
  for (const line of lines) {
    if (!line.includes("is6_gild")) continue;
    const cells = splitWikiRow(line);
    if (cells.length < 3) continue;
    const sourcePath = sourcePathFromText(cells[0], sourceConfig.page);
    const name = cleanWikiText(cells[1]);
    const effect = cleanWikiText(cells[2]);
    if (!sourcePath || !name || !effect) continue;
    effects.push({
      id: makeEffectId(sourceConfig.campaignId, "coinStatus", sourcePath, ++order),
      campaignId: sourceConfig.campaignId,
      order,
      slot: "coinStatus",
      slotLabel: "銭状態",
      selectionMode: "multi",
      group: "status",
      groupLabel: "状態",
      name,
      effect,
      flavorText: null,
      sourcePage: sourceConfig.page,
      sourceAnchor: "copper-status",
      image: imageObject(sourceConfig.campaignId, "coinStatus", sourcePath),
    });
  }
  return effects;
}

function parseSuiCoin(lines, sourceConfig) {
  const effects = parseCoinStatuses(lines, sourceConfig);
  let order = 0;
  let currentGroupLabel = "";
  for (let index = 0; index < lines.length; index++) {
    const h2 = lines[index].match(/^#shadowheader\(2,(?<name>[^)]+)\)/);
    if (h2?.groups?.name) currentGroupLabel = cleanWikiText(h2.groups.name);
    const anchorMatch = lines[index].match(/^#aname\((?<anchor>copper_[a-z0-9]+)\)/);
    if (!anchorMatch?.groups?.anchor) continue;
    const anchor = anchorMatch.groups.anchor;
    const [group, groupLabel] = coinGroupFromAnchor(anchor, currentGroupLabel);
    const effect = effectFromDetailBlock({
      campaignId: sourceConfig.campaignId,
      page: sourceConfig.page,
      slot: "coin",
      slotLabel: "銭",
      selectionMode: "multi",
      group,
      groupLabel,
      order: ++order,
      anchor,
      block: getBlock(lines, index),
    });
    if (effect) effects.push(effect);
  }
  return effects;
}

async function downloadImages(effects) {
  const unique = new Map();
  for (const effect of effects) {
    if (effect.image?.sourceUrl && effect.image?.localPath) unique.set(effect.image.localPath, effect.image.sourceUrl);
  }
  let downloaded = 0;
  for (const [localPath, sourceUrl] of unique.entries()) {
    const absolute = path.join(ROOT, localPath);
    try {
      await fs.access(absolute);
      continue;
    } catch {
      // download below
    }
    const response = await fetch(sourceUrl);
    if (!response.ok) throw new Error(`Failed to download ${sourceUrl}: ${response.status}`);
    await fs.mkdir(path.dirname(absolute), { recursive: true });
    await fs.writeFile(absolute, Buffer.from(await response.arrayBuffer()));
    downloaded++;
  }
  return downloaded;
}

function parserFor(name) {
  if (name === "foldartal") return parseFoldartal;
  if (name === "sarkazThought") return parseSarkazThought;
  if (name === "suiCoin") return parseSuiCoin;
  throw new Error(`Unknown special item parser: ${name}`);
}

async function main() {
  const config = JSON.parse(await fs.readFile(CONFIG_PATH, "utf8"));
  const doc = JSON.parse(await fs.readFile(OUTPUT_PATH, "utf8"));
  const newEffects = [];
  for (const sourceConfig of config.sources || []) {
    const source = await getWikiSource(sourceConfig.page);
    const lines = source.split(/\r?\n/);
    newEffects.push(...parserFor(sourceConfig.parser)(lines, sourceConfig));
  }
  const kept = (doc.selectableEffects || []).filter((effect) => !managedSlots.has(`${effect.campaignId}|${effect.slot}`));
  const selectableEffects = [...kept, ...newEffects];
  const nextDoc = {
    ...doc,
    meta: {
      ...(doc.meta || {}),
      specialItemsGeneratedAt: generatedAt,
      specialItemSources: "data/special-item-sources.json",
    },
    selectableEffects,
  };
  await downloadImages(newEffects);
  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(nextDoc, null, 2)}\n`, "utf8");
  console.log(`Wrote ${newEffects.length} special items into ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
