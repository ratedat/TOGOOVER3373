import { normalizeRecognitionText } from "./text-normalize.js";

const MIN_AGGREGATE_FALLBACK_ROW_HITS = 3;

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

function frameTextResults(frame = {}, { includeFrameText = true } = {}) {
  const results = [];
  if (includeFrameText && typeof frame.text === "string") results.push({ text: frame.text, confidence: frame.confidence ?? 0.5, roi: frame.roi || null });
  if (includeFrameText && typeof frame.ocrText === "string") results.push({ text: frame.ocrText, confidence: frame.confidence ?? 0.5, roi: frame.roi || null });
  for (const key of ["ocrResults", "textResults", "texts"]) {
    for (const entry of asArray(frame[key])) {
      if (typeof entry === "string") results.push({ text: entry, confidence: 0.5, roi: null });
      else if (entry && typeof entry.text === "string") results.push(entry);
    }
  }
  return results.filter((item) => item.text?.trim?.());
}

function rectArea(rect) {
  if (!rect) return 0;
  return Math.max(0, rect.width) * Math.max(0, rect.height);
}

function isRelicRowOcrResult(row, scanRegion) {
  const rowRect = rectFrom(row.roi);
  if (!rowRect) return false;
  if (!rectsOverlap(scanRegion, rowRect)) return false;
  if (!scanRegion) return true;
  const scanArea = rectArea(scanRegion);
  const rowArea = rectArea(rowRect);
  if (scanArea > 0 && rowArea / scanArea > 0.22) return false;
  if (rowRect.height > scanRegion.height * 0.22) return false;
  return true;
}

export function normalizeRelicRecognitionText(value) {
  return normalizeRecognitionText(value, ["remove_spaces"])
    .replace(/[「」『』【】\[\]（）()]/g, "")
    .replace(/[・･]/g, "")
    .replace(/[：:．.,，、。;；]/g, "")
    .replace(/[〜～~]/g, "-")
    .toLowerCase();
}

function relicImagePath(relic = {}) {
  if (typeof relic.image === "string") return relic.image;
  return relic.image?.localPath || relic.imagePath || null;
}

function relicAliases(relic = {}) {
  const aliases = [relic.name];
  if (Number.isFinite(Number(relic.number))) {
    aliases.push(`No.${Number(relic.number)}`);
    aliases.push(`No.${String(relic.number).padStart(3, "0")}`);
  }
  return [...new Set(aliases.filter(Boolean).map(normalizeRelicRecognitionText).filter(Boolean))];
}

export function buildRelicRecognitionDb(relics = [], { campaignId = null } = {}) {
  return (relics || [])
    .filter((relic) => relic?.id && relic?.name)
    .filter((relic) => !campaignId || relic.campaignId === campaignId)
    .map((relic) => ({
      relicId: relic.id,
      campaignId: relic.campaignId || null,
      number: relic.number ?? null,
      name: relic.name,
      category: relic.category || null,
      imagePath: relicImagePath(relic),
      aliases: relicAliases(relic),
      normalizedName: normalizeRelicRecognitionText(relic.name),
    }))
    .filter((entry) => entry.normalizedName.length >= 2);
}

function bestRowHitForRelic(relic, textRows) {
  let best = null;
  for (const row of textRows) {
    const normalizedText = normalizeRelicRecognitionText(row.text);
    if (!normalizedText) continue;
    const nameIndex = normalizedText.indexOf(relic.normalizedName);
    const matchedByName = nameIndex >= 0 && nameIndex <= 10;
    const matchedByAlias = !matchedByName && relic.aliases.some((alias) => alias.length >= 4 && normalizedText.includes(alias));
    if (!matchedByName && !matchedByAlias) continue;
    const confidence = Math.min(0.98, Number(row.confidence || 0.5) + (matchedByName ? 0.04 : 0));
    if (!best || confidence > best.confidence) {
      best = { rawText: row.text, normalizedText, confidence, roi: row.roi || null, source: "ocr-row" };
    }
  }
  return best;
}

function bestAggregateHitForRelic(relic, textRows) {
  let best = null;
  for (const row of textRows) {
    const normalizedText = normalizeRelicRecognitionText(row.text);
    if (!normalizedText || !normalizedText.includes(relic.normalizedName)) continue;
    const confidence = Math.min(0.72, Number(row.confidence || 0.5) + 0.04);
    if (!best || confidence > best.confidence) {
      best = { rawText: row.text, normalizedText, confidence, roi: row.roi || null, source: "ocr-aggregate" };
    }
  }
  return best;
}

function aggregateFallbackRows(frame, scanRegion) {
  return frameTextResults(frame, { includeFrameText: true })
    .filter((row) => !isRelicRowOcrResult(row, scanRegion))
    .filter((row) => normalizeRelicRecognitionText(row.text).length >= 8);
}

export function createRelicCandidateExtractor({ relics = [], campaignId = null } = {}) {
  const db = buildRelicRecognitionDb(relics);
  return async function extractRelicCandidates(frame, context = {}) {
    if (context.profile?.id !== "relicsFull") return [];
    const activeCampaignId = context.campaignId || campaignId || null;
    const scanRegion = rectFrom(context.region);
    const textRows = frameTextResults(frame, { includeFrameText: false })
      .filter((row) => isRelicRowOcrResult(row, scanRegion));
    if (!textRows.length) return [];

    const activeDb = db.filter((relic) => !activeCampaignId || relic.campaignId === activeCampaignId);
    const rowHits = new Map();
    for (const relic of activeDb) {
      const hit = bestRowHitForRelic(relic, textRows);
      if (hit) rowHits.set(relic.relicId, hit);
    }
    const aggregateRows = rowHits.size >= MIN_AGGREGATE_FALLBACK_ROW_HITS ? aggregateFallbackRows(frame, scanRegion) : [];

    return activeDb
      .map((relic) => {
        const hit = rowHits.get(relic.relicId) || bestAggregateHitForRelic(relic, aggregateRows);
        if (!hit) return null;
        return {
          kind: "relic",
          relicId: relic.relicId,
          campaignId: relic.campaignId,
          number: relic.number,
          name: relic.name,
          category: relic.category,
          imagePath: relic.imagePath,
          rawText: hit.rawText,
          normalizedText: hit.normalizedText,
          confidence: hit.confidence,
          needsReview: true,
          roi: hit.roi,
          source: hit.source,
        };
      })
      .filter(Boolean);
  };
}
