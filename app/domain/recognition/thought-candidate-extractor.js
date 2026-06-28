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

function isThoughtRowOcrResult(row, scanRegion) {
  const rowRect = rectFrom(row.roi);
  if (!rowRect) return false;
  if (!rectsOverlap(scanRegion, rowRect)) return false;
  if (!scanRegion) return true;
  const scanArea = rectArea(scanRegion);
  const rowArea = rectArea(rowRect);
  if (scanArea > 0 && rowArea / scanArea > 0.24) return false;
  if (rowRect.height > scanRegion.height * 0.22) return false;
  return true;
}

export function normalizeThoughtRecognitionText(value) {
  return normalizeRecognitionText(value, ["remove_spaces"])
    .replace(/[「」『』【】\[\]（）()]/g, "")
    .replace(/[・･]/g, "")
    .replace(/[：:．.,，、。;；]/g, "")
    .replace(/[〜～~]/g, "-")
    .toLowerCase();
}

function effectImagePath(effect = {}) {
  if (typeof effect.image === "string") return effect.image;
  return effect.image?.localPath || effect.imagePath || null;
}

function thoughtAliases(effect = {}) {
  return [...new Set([effect.name, effect.groupLabel].filter(Boolean).map(normalizeThoughtRecognitionText).filter(Boolean))];
}

export function buildThoughtRecognitionDb(selectableEffects = [], { campaignId = "is5_sarkaz" } = {}) {
  return (selectableEffects || [])
    .filter((effect) => effect?.id && effect?.name)
    .filter((effect) => effect.slot === "thought")
    .filter((effect) => !campaignId || effect.campaignId === campaignId)
    .map((effect) => ({
      thoughtId: effect.id,
      campaignId: effect.campaignId || null,
      name: effect.name,
      groupLabel: effect.groupLabel || null,
      thoughtRank: effect.thoughtRank || null,
      thoughtLoad: effect.thoughtLoad || null,
      effect: effect.effect || null,
      imagePath: effectImagePath(effect),
      normalizedName: normalizeThoughtRecognitionText(effect.name),
      aliases: thoughtAliases(effect),
    }))
    .filter((entry) => entry.normalizedName.length >= 2);
}

function rowMatchesThought(thought, row) {
  const normalizedText = normalizeThoughtRecognitionText(row.text);
  if (!normalizedText) return null;
  const name = thought.normalizedName;
  let matched = false;
  if (name.length <= 2) {
    matched = normalizedText === name || normalizedText.startsWith(name);
  } else {
    const index = normalizedText.indexOf(name);
    matched = index >= 0 && index <= 12;
  }
  if (!matched) return null;
  return {
    rawText: row.text,
    normalizedText,
    confidence: Math.min(0.94, Number(row.confidence || 0.5) + (name.length >= 3 ? 0.04 : 0)),
    roi: row.roi || null,
    source: "ocr-row",
  };
}

export function createThoughtCandidateExtractor({ selectableEffects = [], campaignId = "is5_sarkaz" } = {}) {
  const db = buildThoughtRecognitionDb(selectableEffects, { campaignId });
  return async function extractThoughtCandidates(frame, context = {}) {
    if (context.profile?.id !== "is5ThoughtFull") return [];
    const activeCampaignId = context.campaignId || campaignId || "is5_sarkaz";
    const scanRegion = rectFrom(context.region);
    const rows = frameTextResults(frame, { includeFrameText: false })
      .filter((row) => isThoughtRowOcrResult(row, scanRegion));
    if (!rows.length) return [];

    const activeDb = db.filter((thought) => !activeCampaignId || thought.campaignId === activeCampaignId);
    const candidates = [];
    for (const row of rows) {
      for (const thought of activeDb) {
        const hit = rowMatchesThought(thought, row);
        if (!hit) continue;
        const candidate = {
          kind: "thought",
          thoughtId: thought.thoughtId,
          campaignId: thought.campaignId,
          name: thought.name,
          groupLabel: thought.groupLabel,
          thoughtRank: thought.thoughtRank,
          thoughtLoad: thought.thoughtLoad,
          effect: thought.effect,
          imagePath: thought.imagePath,
          rawText: hit.rawText,
          normalizedText: hit.normalizedText,
          confidence: hit.confidence,
          needsReview: true,
          roi: hit.roi,
          instanceId: hit.roi ? `roi:${Math.round(hit.roi.x || 0)},${Math.round(hit.roi.y || 0)}` : null,
          source: hit.source,
        };
        candidates.push(candidate);
      }
    }
    return candidates.sort((a, b) => {
      const ar = rectFrom(a.roi);
      const br = rectFrom(b.roi);
      if (ar && br) return (ar.y - br.y) || (ar.x - br.x);
      if (ar) return -1;
      if (br) return 1;
      return Number(b.confidence || 0) - Number(a.confidence || 0);
    });
  };
}
