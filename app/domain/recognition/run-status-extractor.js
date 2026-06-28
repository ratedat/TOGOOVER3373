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

function normalizeSquadEffectText(value) {
  return normalizeRecognitionText(value, ["remove_spaces"])
    .replace(/[「」『』【】\[\]（）()]/g, "")
    .replace(/[・･：:．.,，、。;；]/g, "")
    .replace(/＋/g, "+")
    .replace(/[−－–—]/g, "-")
    .toLowerCase();
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

function digitText(value, { allowRoman = false } = {}) {
  let text = normalizeRecognitionText(value, ["remove_spaces"])
    .replace(/[０-９]/g, (char) => String(char.charCodeAt(0) - 0xff10))
    .replace(/[Oo]/g, "0")
    .replace(/図/g, "2")
    .replace(/[イィ]/g, "1");
  if (allowRoman && /^[IiLl一丨イィ]+$/.test(text)) return String(text.length);
  if (allowRoman) text = text.replace(/[IiLl一丨イィ]/g, "1");
  return text.replace(/[^0-9]/g, "");
}

function digitValue(value, { allowRoman = false } = {}) {
  const text = digitText(value, { allowRoman });
  if (!text) return null;
  const valueNumber = Number(text);
  return Number.isFinite(valueNumber) ? valueNumber : null;
}

function numericValuesFromText(text, options = {}) {
  const compact = normalizeRecognitionText(text, ["remove_spaces"]);
  return [...compact.matchAll(/[0-9０-９Oo図IiLl一丨イィ]+/g)]
    .map((match) => digitValue(match[0], options))
    .filter((value) => Number.isFinite(value));
}

function looseNumericValuesFromText(text, options = {}) {
  const normalized = normalizeRecognitionText(text);
  return [...normalized.matchAll(/[0-9０-９Oo図IiLl一丨イィ]+/g)]
    .map((match) => digitValue(match[0], options))
    .filter((value) => Number.isFinite(value));
}

function confidenceForField(base, frame, field) {
  const regionBoost = asTextResults(frame).some((item) => String(item.regionId || "").includes(field)) ? 0.05 : 0;
  return Math.min(0.98, base + regionBoost);
}

function findSquadByText(text, { campaignId, squads = [] } = {}) {
  return squads
    .filter((item) => item.campaignId === campaignId)
    .find((item) => text.includes(normalizeRecognitionText(item.name, ["remove_spaces"])));
}

function findSquadCandidate(text, { campaignId, squads = [] } = {}) {
  const squad = findSquadByText(text, { campaignId, squads });
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

function optionEffectPhrases(effect = "") {
  return uniqueValues(String(effect)
    .split(/[。、，,；;]/g)
    .map((part) => normalizeSquadEffectText(part))
    .filter((part) => part.length >= 6));
}

function optionEffectTokens(effect = "") {
  const raw = String(effect);
  const bracketTokens = [...raw.matchAll(/[【「]([^】」]+)[】」]/g)]
    .map((match) => normalizeSquadEffectText(match[1]))
    .filter((part) => part.length >= 2);
  const normalized = normalizeSquadEffectText(raw);
  const numericTokens = [...normalized.matchAll(/[★]?[0-9]+%?|[+-][0-9]+/g)]
    .map((match) => match[0])
    .filter((part) => part.length >= 2);
  return uniqueValues([...bracketTokens, ...numericTokens]);
}

function scoreRandomEffectOption(normalizedText, option = {}) {
  const normalizedEffect = normalizeSquadEffectText(option.effect || "");
  if (!normalizedEffect) return null;
  let score = 0;
  let matches = 0;
  if (normalizedText.includes(normalizedEffect)) {
    score += 120;
    matches += 3;
  }
  for (const phrase of optionEffectPhrases(option.effect)) {
    if (!normalizedText.includes(phrase)) continue;
    score += Math.min(32, Math.max(10, Math.floor(phrase.length / 2)));
    matches += 1;
  }
  for (const token of optionEffectTokens(option.effect)) {
    if (!normalizedText.includes(token)) continue;
    score += token.length >= 4 ? 18 : 8;
    matches += 1;
  }
  if (!matches || score < 20) return null;
  return { option, score, matches };
}

function findRandomEffectOption(normalizedText, options = []) {
  const scored = options
    .map((option) => scoreRandomEffectOption(normalizedText, option))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || b.matches - a.matches);
  if (!scored.length) return null;
  if (scored[1] && scored[0].score === scored[1].score && scored[0].matches === scored[1].matches) return null;
  return scored[0];
}

function findSquadRandomEffectCandidate(text, { campaignId, squads = [] } = {}) {
  const squad = findSquadByText(text, { campaignId, squads });
  if (!squad || !normalizeRecognitionText(squad.name, ["remove_spaces"]).includes("奇想天外分隊")) return null;
  const options = Array.isArray(squad.randomEffectOptions) ? squad.randomEffectOptions : [];
  if (!options.length) return null;
  const match = findRandomEffectOption(normalizeSquadEffectText(text), options);
  if (!match?.option?.id) return null;
  return {
    kind: "runStatus",
    field: "squadRandomEffectOptionId",
    label: "ランダム分隊効果",
    value: match.option.id,
    rawText: match.option.effect || match.option.label || match.option.id,
    confidence: Math.min(0.93, 0.68 + (match.score / 500)),
    needsReview: true,
  };
}

function findDifficultyCandidate(text, { campaignId, difficultyGrades = {}, frame = null } = {}) {
  const config = difficultyGrades[campaignId];
  const grades = config?.grades || [];
  const name = normalizeRecognitionText(config?.difficultyName || "", ["remove_spaces"]);
  if (!name || !grades.length) return null;

  const validGrade = (value) => grades.some((item) => Number(item.grade) === value);
  const difficultyBlockText = normalizeRecognitionText(asTextResults(frame || {})
    .filter((item) => String(item.regionId || "").includes("difficulty_block"))
    .map((item) => item.text)
    .join(" "), ["remove_spaces"]);
  const textSources = difficultyBlockText ? [difficultyBlockText] : [text];
  const textGrade = textSources
    .map((sourceText) => sourceText.includes(name) ? sourceText.match(new RegExp(`${escapeRegExp(name)}[^0-9０-９Oo図イィA-Za-z]{0,16}([0-9０-９Oo図イィ]{1,2})`)) : null)
    .map((match) => digitValue(match?.[1]))
    .find((value) => Number.isFinite(value) && validGrade(value));
  const regionGrade = asTextResults(frame || {})
    .filter((item) => String(item.regionId || "").includes("difficulty_grade"))
    .flatMap((item) => numericValuesFromText(item.text))
    .find(validGrade);
  const grade = textGrade ?? regionGrade;
  const difficulty = grades.find((item) => Number(item.grade) === grade);
  if (!difficulty) return null;
  return {
    kind: "runStatus",
    field: "difficulty",
    label: "等級",
    value: difficulty.grade,
    rawText: difficulty.label,
    confidence: textGrade == null && regionGrade != null ? 0.87 : 0.84,
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

function findBestRegionNumberCandidate(frame, { field, label, regionIdPart, regionIdPattern = null, min = 0, max = 999, confidence = 0.7, prefer = "last", allowRoman = false }) {
  const candidates = asTextResults(frame)
    .filter((item) => {
      const regionId = String(item.regionId || "");
      return regionIdPattern ? regionIdPattern.test(regionId) : regionId.includes(regionIdPart);
    })
    .map((item) => {
      const values = numericValuesFromText(item.text, { allowRoman }).filter((value) => value >= min && value <= max);
      if (!values.length) return null;
      const value = prefer === "first" ? values[0] : values.at(-1);
      return { item, value, confidence: Number(item.confidence ?? confidence) };
    })
    .filter(Boolean)
    .toSorted((a, b) => b.confidence - a.confidence);
  const best = candidates[0];
  if (!best) return null;
  return {
    kind: "runStatus",
    field,
    label,
    value: best.value,
    rawText: `${label} ${best.value}`,
    confidence: Math.min(0.98, Math.max(confidence, best.confidence)),
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

function splitCompactHopeDigits(digits) {
  if (!digits || digits.length < 3 || digits.length > 4) return null;
  const splitAt = digits.length <= 3 ? 1 : 2;
  const current = Number(digits.slice(0, splitAt));
  const max = Number(digits.slice(splitAt));
  if (!Number.isFinite(current) || !Number.isFinite(max)) return null;
  if (max < current) return null;
  return [current, max];
}

function hopePairFromText(text) {
  const compact = normalizeRecognitionText(text, ["remove_spaces"]);
  const matches = [...compact.matchAll(/[0-9０-９Oo図IiLl一丨イィ]+/g)];
  const values = matches
    .map((match) => digitValue(match[0]))
    .filter((value) => Number.isFinite(value));
  if (values.length >= 2) return [values[0], values[1]];
  if (matches.length !== 1) return null;
  return splitCompactHopeDigits(digitText(matches[0][0]));
}

function isValidHopePair(pair) {
  if (!Array.isArray(pair) || pair.length < 2) return false;
  const [current, max] = pair;
  return Number.isFinite(current) && Number.isFinite(max) && current >= 0 && max >= current;
}

function hopeCandidatesFromPair(pair) {
  if (!isValidHopePair(pair)) return [];
  const [current, max] = pair;
  return [
    candidateFromNumber({ field: "hope", label: "希望", value: current, confidence: 0.75 }),
    candidateFromNumber({ field: "maxHope", label: "希望上限", value: max, confidence: 0.72 }),
  ].filter(Boolean);
}

function splitCompactResourceDigits(digits) {
  if (!digits || digits.length < 3 || digits.length > 8) return null;
  const candidates = [];
  for (let hopeLength = 1; hopeLength <= 2; hopeLength += 1) {
    for (let maxLength = 1; maxLength <= 2; maxLength += 1) {
      const ingotLength = digits.length - hopeLength - maxLength;
      if (ingotLength < 1 || ingotLength > 4) continue;
      const hope = Number(digits.slice(0, hopeLength));
      const maxHope = Number(digits.slice(hopeLength, hopeLength + maxLength));
      const ingot = Number(digits.slice(hopeLength + maxLength));
      if (!isValidHopePair([hope, maxHope])) continue;
      if (maxHope < 3 || maxHope > 50 || ingot > 9999) continue;
      candidates.push({ hope, maxHope, ingot, score: (maxLength * 10) - ingotLength });
    }
  }
  const best = candidates.toSorted((a, b) => b.score - a.score || b.maxHope - a.maxHope)[0];
  return best ? [best.hope, best.maxHope, best.ingot] : null;
}

function resourceTripleFromText(text) {
  const values = looseNumericValuesFromText(text).filter((value) => value >= 0 && value <= 9999);
  if (values.length >= 3) {
    for (let index = values.length - 3; index >= 0; index -= 1) {
      const [hope, maxHope, ingot] = values.slice(index, index + 3);
      if (!isValidHopePair([hope, maxHope])) continue;
      if (maxHope > 99 || ingot > 9999) continue;
      return [hope, maxHope, ingot];
    }
  }
  const compactDigits = digitText(text);
  return splitCompactResourceDigits(compactDigits);
}

function resourceCandidatesFromTriple(triple) {
  if (!Array.isArray(triple) || triple.length < 3) return [];
  const [hope, maxHope, ingot] = triple;
  return [
    candidateFromNumber({ field: "hope", label: "希望", value: hope, confidence: 0.82 }),
    candidateFromNumber({ field: "maxHope", label: "希望上限", value: maxHope, confidence: 0.8 }),
    candidateFromNumber({ field: "ingot", label: "源石錐", value: ingot, confidence: 0.84 }),
  ].filter(Boolean);
}

function findResourceNumberCandidates(frame) {
  for (const entry of asTextResults(frame).filter((item) => String(item.regionId || "").includes("resource_numbers"))) {
    const triple = resourceTripleFromText(entry.text);
    const candidates = resourceCandidatesFromTriple(triple);
    if (candidates.length === 3) return candidates;
  }
  return [];
}

function isWholeHopeEntry(entry) {
  const regionId = String(entry?.regionId || "");
  return regionId.includes("hope") && !/hope[._-](current|max)/.test(regionId);
}

function firstNumericValue(entry) {
  return numericValuesFromText(entry?.text).find((value) => Number.isFinite(value));
}

function firstNumericValueInRange(entry, { min = 0, max = 999 } = {}) {
  return numericValuesFromText(entry?.text).find((value) => Number.isFinite(value) && value >= min && value <= max);
}

function hopePairFromTopRightStatus(frame) {
  for (const entry of asTextResults(frame).filter((item) => String(item.regionId || "").includes("top_right_status"))) {
    const values = looseNumericValuesFromText(entry.text).filter((value) => value >= 0 && value <= 9999);
    if (values.length < 2) continue;
    for (let index = values.length - 1; index >= 1; index -= 1) {
      const max = values[index];
      const current = values[index - 1];
      if (max < 10 || max > 99) continue;
      if (current > 9) continue;
      if (isValidHopePair([current, max])) return [current, max];
    }
  }
  return null;
}

function findTopLayoutNumberCandidate(frame, { field, label, regionIdPattern, max = 9999 }) {
  return findBestRegionNumberCandidate(frame, {
    field,
    label,
    regionIdPattern,
    min: 0,
    max,
    confidence: 0.86,
    prefer: "first",
  });
}

function findTopResourceLayout(frame) {
  const compact = {
    ingot: findTopLayoutNumberCandidate(frame, { field: "ingot", label: "源石錐", regionIdPattern: /^run\.top_ingot$/ }),
    hope: findTopLayoutNumberCandidate(frame, { field: "hope", label: "希望", regionIdPattern: /^run\.top_hope$/, max: 999 }),
  };
  if (compact.ingot && compact.hope) return compact;

  const wide = {
    ingot: findTopLayoutNumberCandidate(frame, { field: "ingot", label: "源石錐", regionIdPattern: /^run\.top_ingot\.wide$/ }),
    hope: findTopLayoutNumberCandidate(frame, { field: "hope", label: "希望", regionIdPattern: /^run\.top_hope\.wide$/, max: 999 }),
  };
  if (wide.ingot && wide.hope) return wide;

  return {
    ingot: compact.ingot || wide.ingot,
    hope: compact.hope || wide.hope,
  };
}

function findTopHopeCandidate(frame) {
  return findTopResourceLayout(frame).hope;
}

function findHopeCandidates(frame) {
  const entries = asTextResults(frame).filter((item) => String(item.regionId || "").includes("hope"));
  if (!entries.length) return [];
  const topHope = findTopHopeCandidate(frame);

  const wholeEntries = entries.filter(isWholeHopeEntry);
  const currentEntry = entries.find((item) => /hope[._-]current/.test(String(item.regionId || "")));
  const maxEntry = entries.find((item) => /hope[._-]max/.test(String(item.regionId || "")));
  const current = firstNumericValueInRange(currentEntry, { min: 0, max: 99 });
  const max = firstNumericValueInRange(maxEntry, { min: 0, max: 50 });
  if (isValidHopePair([current, max])) return hopeCandidatesFromPair([current, max]);

  const topRightPair = hopePairFromTopRightStatus(frame);
  if (isValidHopePair(topRightPair)) return hopeCandidatesFromPair(topRightPair);

  for (const entry of wholeEntries) {
    const pair = hopePairFromText(entry.text);
    if (isValidHopePair(pair)) return hopeCandidatesFromPair(pair);
  }

  const combinedWholePair = hopePairFromText(wholeEntries.map((entry) => entry.text).join(" "));
  if (isValidHopePair(combinedWholePair)) return hopeCandidatesFromPair(combinedWholePair);

  if (topHope) return [topHope];

  return [findRegionNumberCandidate(frame, { field: "hope", label: "希望", regionIdPart: "hope", min: 0, max: 999, prefer: "first" })].filter(Boolean);
}

function findTopIngotCandidate(frame) {
  return findTopResourceLayout(frame).ingot;
}

function findIngotCandidate(frame) {
  const topIngot = findTopIngotCandidate(frame);
  if (topIngot) return topIngot;
  return findRegionNumberCandidate(frame, { field: "ingot", label: "源石錐", regionIdPart: "ingot", min: 0, max: 9999, prefer: "first" });
}

function findIdeaCandidate(frame, { campaignId } = {}) {
  if (campaignId !== "is5_sarkaz") return null;
  return findBestRegionNumberCandidate(frame, { field: "idea", label: "構想", regionIdPattern: /^run\.idea$/, min: 0, max: 999, prefer: "first" });
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
  const hasTopResourceCandidate = Boolean(findTopHopeCandidate(frame) || findTopIngotCandidate(frame));
  const resourceCandidates = hasTopResourceCandidate ? [] : findResourceNumberCandidates(frame);
  const runResourceCandidates = resourceCandidates.length === 3
    ? resourceCandidates
    : [...findHopeCandidates(frame), findIngotCandidate(frame)].filter(Boolean);
  const candidates = [
    findSquadCandidate(numericText, { campaignId, squads }),
    findSquadRandomEffectCandidate(compactText, { campaignId, squads }),
    findDifficultyCandidate(compactText, { campaignId, difficultyGrades, frame }),
    commandLevel,
    ...runResourceCandidates,
    findIdeaCandidate(frame, { campaignId }),
    findLifePointsCandidate(frame),
    findRegionNumberCandidate(frame, { field: "shield", label: "シールド", regionIdPart: "shield", min: 0, prefer: "first" }),
  ].filter(Boolean);
  return candidates;
}
