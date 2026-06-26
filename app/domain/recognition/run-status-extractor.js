import { normalizeRecognitionText } from "./text-normalize.js";

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function asTextResults(frame = {}) {
  const results = [];
  if (typeof frame.text === "string") results.push({ text: frame.text });
  if (typeof frame.ocrText === "string") results.push({ text: frame.ocrText });
  for (const key of ["ocrResults", "textResults", "texts"]) {
    const entries = Array.isArray(frame[key]) ? frame[key] : [];
    for (const entry of entries) {
      if (typeof entry === "string") results.push({ text: entry });
      else if (entry && typeof entry.text === "string") results.push(entry);
    }
  }
  return results;
}

function combinedText(frame, normalizers = ["remove_spaces"]) {
  return normalizeRecognitionText(asTextResults(frame).map((item) => item.text).join(" "), normalizers);
}

function digitValue(value, { allowRoman = false } = {}) {
  let text = normalizeRecognitionText(value, ["remove_spaces"])
    .replace(/[０-９]/g, (char) => String(char.charCodeAt(0) - 0xff10))
    .replace(/[Oo]/g, "0")
    .replace(/図/g, "2");
  if (allowRoman && /^[IiLl一丨]+$/.test(text)) return text.length;
  if (allowRoman) text = text.replace(/[IiLl一丨]/g, "1");
  text = text.replace(/[^0-9]/g, "");
  if (!text) return null;
  const valueNumber = Number(text);
  return Number.isFinite(valueNumber) ? valueNumber : null;
}

function numericValuesFromText(text, options = {}) {
  const compact = normalizeRecognitionText(text, ["remove_spaces"]);
  return [...compact.matchAll(/[0-9０-９Oo図IiLl一丨]+/g)]
    .map((match) => digitValue(match[0], options))
    .filter((value) => Number.isFinite(value));
}

function confidenceForField(base, frame, field) {
  const regionBoost = asTextResults(frame).some((item) => String(item.regionId || "").includes(field)) ? 0.05 : 0;
  return Math.min(0.98, base + regionBoost);
}

function findSquadCandidate(text, { campaignId, squads = [] } = {}) {
  const squad = squads
    .filter((item) => item.campaignId === campaignId)
    .find((item) => text.includes(normalizeRecognitionText(item.name, ["remove_spaces"])));
  if (!squad) return null;
  return {
    kind: "runStatus",
    field: "squadId",
    label: "分隊",
    value: squad.id,
    rawText: squad.name,
    confidence: 0.86,
    needsReview: true,
  };
}

function findDifficultyCandidate(text, { campaignId, difficultyGrades = {}, frame = null } = {}) {
  const config = difficultyGrades[campaignId];
  const grades = config?.grades || [];
  const name = normalizeRecognitionText(config?.difficultyName || "", ["remove_spaces"]);
  if (!name || !grades.length) return null;

  const regionGrade = asTextResults(frame || {})
    .filter((item) => String(item.regionId || "").includes("difficulty_grade"))
    .flatMap((item) => numericValuesFromText(item.text))
    .find((value) => grades.some((item) => Number(item.grade) === value));
  const textMatch = text.includes(name) ? text.match(new RegExp(`${escapeRegExp(name)}\\D{0,16}(\\d{1,2})`)) : null;
  const grade = regionGrade ?? Number(textMatch?.[1]);
  const difficulty = grades.find((item) => Number(item.grade) === grade);
  if (!difficulty) return null;
  return {
    kind: "runStatus",
    field: "difficulty",
    label: "等級",
    value: difficulty.grade,
    rawText: difficulty.label,
    confidence: regionGrade == null ? 0.82 : 0.87,
    needsReview: true,
  };
}


function findCommandLevelCandidate(text, frame) {
  const patterns = [
    /指揮(?:Lv|LV|レベル)([0-9０-９IiLl一丨]{1,2})(?!\/)/gi,
  ];
  let value = null;
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const parsed = digitValue(match[1], { allowRoman: true });
      if (parsed >= 1 && parsed <= 99) {
        value = parsed;
        break;
      }
    }
    if (value != null) break;
  }
  if (!Number.isFinite(value)) return null;
  return {
    kind: "runStatus",
    field: "commandLevel",
    label: "指揮Lv",
    value,
    rawText: `指揮Lv ${value}`,
    confidence: confidenceForField(0.68, frame, "status"),
    needsReview: true,
  };
}

function findRegionNumberCandidate(frame, { field, label, regionIdPart, min = 0, max = 999, confidence = 0.7, prefer = "last", allowRoman = false }) {
  const entry = asTextResults(frame)
    .filter((item) => String(item.regionId || "").includes(regionIdPart))
    .map((item) => ({ item, values: numericValuesFromText(item.text, { allowRoman }) }))
    .find((candidate) => candidate.values.some((value) => value >= min && value <= max));
  if (!entry) return null;
  const valid = entry.values.filter((candidateValue) => candidateValue >= min && candidateValue <= max);
  const value = prefer === "first" ? valid[0] : valid.at(-1);
  return {
    kind: "runStatus",
    field,
    label,
    value,
    rawText: `${label} ${value}`,
    confidence: Math.min(0.98, confidence + 0.05),
    needsReview: true,
  };
}

function candidateFromNumber({ field, label, value, confidence = 0.75 }) {
  if (!Number.isFinite(value)) return null;
  return {
    kind: "runStatus",
    field,
    label,
    value,
    rawText: `${label} ${value}`,
    confidence,
    needsReview: true,
  };
}

function findHopeCandidate(frame) {
  return findRegionNumberCandidate(frame, { field: "hope", label: "希望", regionIdPart: "hope", min: 0, max: 999, prefer: "first" });
}

function findIngotCandidate(frame) {
  return findRegionNumberCandidate(frame, { field: "ingot", label: "源石錐", regionIdPart: "ingot", min: 0, max: 9999, prefer: "first" });
}

function findLifePointsCandidate(frame) {
  const direct = findRegionNumberCandidate(frame, { field: "lifePoints", label: "耐久値", regionIdPart: "life_points", min: 0, prefer: "first" });
  if (direct) return direct;
  for (const item of asTextResults(frame).filter((entry) => String(entry.regionId || "").includes("status_band"))) {
    const match = normalizeRecognitionText(item.text, ["remove_spaces"]).match(/([0-9０-９Oo図]+)\/([0-9０-９Oo図]+)/);
    if (!match) continue;
    const current = digitValue(match[1]);
    const max = digitValue(match[2]);
    if (!Number.isFinite(current) || !Number.isFinite(max)) continue;
    if (current === 0 && max === 10) continue;
    return candidateFromNumber({ field: "lifePoints", label: "耐久値", value: current, confidence: 0.73 });
  }
  return null;
}

function findCommandLevelFromStatusRoi(frame) {
  const rows = asTextResults(frame).filter((item) => {
    const regionId = String(item.regionId || "");
    return regionId.includes("status_top") || regionId.includes("status_band");
  });
  const labelRows = rows.filter((item) => normalizeRecognitionText(item.text, ["remove_spaces"]).includes("指揮Lv"));
  const labelX = Math.min(...labelRows.map((item) => Number(item.roi?.x)).filter(Number.isFinite));
  if (!Number.isFinite(labelX)) return null;
  const numericRows = rows
    .map((item) => ({ item, value: digitValue(item.text, { allowRoman: true }) }))
    .filter(({ item, value }) => Number.isFinite(value)
      && value >= 1
      && value <= 99
      && !String(item.text || "").includes("/")
      && Number.isFinite(Number(item.roi?.x))
      && Number(item.roi.x) < labelX
      && Number(item.roi.x) > labelX - 220);
  const row = numericRows.toSorted((a, b) => Number(b.item.roi.x) - Number(a.item.roi.x))[0];
  return row ? candidateFromNumber({ field: "commandLevel", label: "指揮Lv", value: row.value, confidence: 0.75 }) : null;
}

export function extractRunStatusCandidates(frame, { campaignId, squads = [], difficultyGrades = {} } = {}) {
  if (!campaignId) return [];
  const compactText = combinedText(frame, ["remove_spaces"]);
  const numericText = normalizeRecognitionText(compactText, ["jp_numeric"]);
  const commandLevel = findRegionNumberCandidate(frame, { field: "commandLevel", label: "指揮Lv", regionIdPart: "command_level", min: 1, max: 99, confidence: 0.75, prefer: "first", allowRoman: true })
    || findCommandLevelFromStatusRoi(frame)
    || findCommandLevelCandidate(compactText, frame);
  const candidates = [
    findSquadCandidate(numericText, { campaignId, squads }),
    findDifficultyCandidate(compactText, { campaignId, difficultyGrades, frame }),
    commandLevel,
    findHopeCandidate(frame),
    findIngotCandidate(frame),
    findLifePointsCandidate(frame),
    findRegionNumberCandidate(frame, { field: "shield", label: "シールド", regionIdPart: "shield", min: 0, prefer: "first" }),
  ].filter(Boolean);
  return candidates;
}
