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

function isAgeOcrResult(row, scanRegion) {
  const rowRect = rectFrom(row.roi);
  if (!rowRect) return true;
  return rectsOverlap(scanRegion, rowRect);
}

export function normalizeAgeRecognitionText(value) {
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

function phaseFromName(name = "") {
  const match = String(name).match(/[（(]([^）)]+)[）)]/);
  return match?.[1] || null;
}

function effectNumberTokens(effect = "") {
  const normalized = normalizeAgeRecognitionText(effect);
  return [...new Set(normalized.match(/[+-]?\d+%?/g) || [])];
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function gradeAgeProgress(grade = {}) {
  if (grade.ageProgress) return grade.ageProgress;
  return (grade.fields || []).find((field) => field?.key === "ageProgress")?.value || null;
}

function ageProgressForDifficulty(difficulty, difficultyGrades = {}, campaignId = "is5_sarkaz") {
  const gradeValue = numberOrNull(difficulty);
  if (gradeValue === null) return null;
  const cfg = difficultyGrades?.[campaignId] || null;
  const grade = (cfg?.grades || []).find((item) => Number(item.grade) === gradeValue);
  return gradeAgeProgress(grade);
}

export function buildAgeRecognitionDb(selectableEffects = [], { campaignId = "is5_sarkaz" } = {}) {
  return (selectableEffects || [])
    .filter((effect) => effect?.id && effect?.name)
    .filter((effect) => effect.slot === "age")
    .filter((effect) => !campaignId || effect.campaignId === campaignId)
    .map((effect) => {
      const phase = effect.phase || phaseFromName(effect.name);
      const normalizedName = normalizeAgeRecognitionText(effect.name);
      const normalizedGroup = normalizeAgeRecognitionText(effect.groupLabel || "");
      const normalizedPhase = normalizeAgeRecognitionText(phase || "");
      const normalizedEffect = normalizeAgeRecognitionText(effect.effect || "");
      return {
        ageId: effect.id,
        campaignId: effect.campaignId || null,
        name: effect.name,
        groupLabel: effect.groupLabel || null,
        phase,
        effect: effect.effect || null,
        imagePath: effectImagePath(effect),
        normalizedName,
        normalizedGroup,
        normalizedPhase,
        normalizedEffect,
        effectNumbers: effectNumberTokens(effect.effect || ""),
      };
    })
    .filter((entry) => entry.normalizedName.length >= 2 && entry.normalizedGroup && entry.normalizedPhase);
}

function matchAge(age, rows, { preferredPhase = null } = {}) {
  const normalizedText = normalizeAgeRecognitionText(rows.map((row) => row.text).join(" "));
  if (!normalizedText) return null;
  const normalizedPreferredPhase = normalizeAgeRecognitionText(preferredPhase || "");
  if (normalizedPreferredPhase && age.normalizedPhase !== normalizedPreferredPhase) return null;
  const groupMatch = normalizedText.includes(age.normalizedGroup);
  const fullMatch = normalizedText.includes(age.normalizedName);
  const splitMatch = groupMatch && normalizedText.includes(age.normalizedPhase);
  const difficultyPhaseMatch = groupMatch && normalizedPreferredPhase && age.normalizedPhase === normalizedPreferredPhase;
  const effectFullMatch = !normalizedPreferredPhase && groupMatch && age.normalizedEffect && normalizedText.includes(age.normalizedEffect);
  const effectNumberMatch = !normalizedPreferredPhase
    && groupMatch
    && age.effectNumbers.length > 0
    && age.effectNumbers.every((token) => normalizedText.includes(token));
  if (!fullMatch && !splitMatch && !difficultyPhaseMatch && !effectFullMatch && !effectNumberMatch) return null;

  const confidence = Math.max(...rows.map((row) => Number(row.confidence || 0.5)));
  const firstMatchingRow = rows.find((row) => {
    const text = normalizeAgeRecognitionText(row.text);
    return text.includes(age.normalizedName)
      || text.includes(age.normalizedGroup)
      || text.includes(age.normalizedPhase)
      || age.effectNumbers.some((token) => text.includes(token));
  });
  const bonus = fullMatch ? 0.08 : difficultyPhaseMatch ? 0.075 : effectFullMatch ? 0.07 : effectNumberMatch ? 0.06 : 0.05;
  return {
    rawText: rows.map((row) => row.text).join(" / "),
    normalizedText,
    confidence: Math.min(0.96, confidence + bonus),
    roi: firstMatchingRow?.roi || null,
    source: difficultyPhaseMatch ? "difficulty-age-progress" : effectFullMatch || effectNumberMatch ? "ocr-effect-text" : "ocr-region",
  };
}

export function createAgeCandidateExtractor({ selectableEffects = [], campaignId = "is5_sarkaz", difficulty = null, difficultyGrades = {} } = {}) {
  const db = buildAgeRecognitionDb(selectableEffects, { campaignId });
  return async function extractAgeCandidates(frame, context = {}) {
    if (context.profile?.id !== "is5AgeFull") return [];
    const activeCampaignId = context.campaignId || campaignId || "is5_sarkaz";
    const preferredPhase = ageProgressForDifficulty(context.difficulty ?? difficulty, context.difficultyGrades || difficultyGrades, activeCampaignId);
    const scanRegion = rectFrom(context.region);
    const rows = frameTextResults(frame, { includeFrameText: false })
      .filter((row) => isAgeOcrResult(row, scanRegion));
    if (!rows.length) return [];

    const activeDb = db.filter((age) => !activeCampaignId || age.campaignId === activeCampaignId);
    const byAge = new Map();
    for (const age of activeDb) {
      const hit = matchAge(age, rows, { preferredPhase });
      if (!hit) continue;
      byAge.set(age.ageId, {
        kind: "age",
        ageId: age.ageId,
        campaignId: age.campaignId,
        name: age.name,
        groupLabel: age.groupLabel,
        phase: age.phase,
        effect: age.effect,
        imagePath: age.imagePath,
        rawText: hit.rawText,
        normalizedText: hit.normalizedText,
        confidence: hit.confidence,
        needsReview: true,
        roi: hit.roi,
        source: hit.source,
      });
    }
    return [...byAge.values()].sort((a, b) => Number(b.confidence || 0) - Number(a.confidence || 0));
  };
}