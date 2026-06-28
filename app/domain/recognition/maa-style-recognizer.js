import { fingerprintFrame } from "./fingerprint.js";
import { scaleRect } from "./geometry.js";
import { createMetadataRecognizer } from "./placeholder-recognizer.js";
import { applyOcrReplace, normalizeRecognitionText, textMatchesExpected } from "./text-normalize.js";

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

function taskAppliesToProfile(task, profile) {
  const profileIds = asArray(task.profileIds);
  if (!profileIds.length) return true;
  return profileIds.includes(profile?.id);
}

function profileOcrRegionIds(profile = {}) {
  const ids = asArray(profile.ocrRegionIds).filter((id) => typeof id === "string" && id);
  return ids.length ? new Set(ids) : null;
}

function frameTextResults(frame) {
  const results = [];
  if (typeof frame?.ocrText === "string") results.push({ text: frame.ocrText, confidence: frame.confidence ?? 0.5 });
  if (typeof frame?.text === "string") results.push({ text: frame.text, confidence: frame.confidence ?? 0.5 });
  for (const key of ["ocrResults", "textResults", "texts"]) {
    for (const entry of asArray(frame?.[key])) {
      if (typeof entry === "string") results.push({ text: entry, confidence: 0.5 });
      else if (entry && typeof entry === "object" && typeof entry.text === "string") results.push(entry);
    }
  }
  return results;
}

function scaledTaskRect(task, context = {}) {
  const recognition = task.recognition || {};
  const rect = rectFrom(recognition.roi || task.roi);
  if (!rect) return null;
  return context.scale ? scaleRect(rect, context.scale) : rect;
}

function matchRecognitionTask(task, frame, context = {}) {
  const recognition = task.recognition || {};
  const normalizers = recognition.normalize || task.normalize || [];
  const expected = asArray(recognition.expected ?? recognition.text ?? task.expected);
  const fullMatch = Boolean(recognition.fullMatch);
  const match = recognition.match || task.match || "any";
  const taskRoi = scaledTaskRect(task, context);
  const hits = [];
  const scopedResults = frameTextResults(frame).filter((result) => rectsOverlap(taskRoi, rectFrom(result.roi)));

  const replacements = recognition.ocrReplace || task.ocrReplace || [];
  for (const result of scopedResults) {
    const rawText = String(result.text ?? "");
    const replacedText = applyOcrReplace(rawText, replacements);
    const normalizedText = normalizeRecognitionText(replacedText, normalizers);
    const normalizedExpected = expected.map((value) => normalizeRecognitionText(applyOcrReplace(value, replacements), normalizers));
    if (!textMatchesExpected(normalizedText, normalizedExpected, { fullMatch, match })) continue;
    hits.push({
      rawText,
      replacedText,
      normalizedText,
      confidence: result.confidence ?? 0.6,
      roi: result.roi || taskRoi || null,
    });
  }

  if (!hits.length && expected.length > 1 && scopedResults.length > 1) {
    const rawText = scopedResults.map((result) => result.text).join(" ");
    const replacedText = applyOcrReplace(rawText, replacements);
    const normalizedText = normalizeRecognitionText(replacedText, normalizers);
    const normalizedExpected = expected.map((value) => normalizeRecognitionText(applyOcrReplace(value, replacements), normalizers));
    if (textMatchesExpected(normalizedText, normalizedExpected, { fullMatch, match })) {
      hits.push({
        rawText,
        replacedText,
        normalizedText,
        confidence: Math.max(...scopedResults.map((result) => Number(result.confidence || 0.6))),
        roi: taskRoi,
      });
    }
  }

  return hits;
}

function candidateFromTask(task, hit) {
  const template = task.candidate || {};
  const value = template.valueFrom === "normalizedText" ? hit.normalizedText
    : template.valueFrom === "replacedText" ? hit.replacedText
      : template.valueFrom === "rawText" ? hit.rawText
        : template.value;
  return {
    ...template,
    kind: template.kind || task.kind || task.candidateKind || "unknown",
    value,
    rawText: hit.rawText,
    replacedText: hit.replacedText,
    normalizedText: hit.normalizedText,
    confidence: Math.max(Number(template.confidence || 0), Number(hit.confidence || 0)),
    needsReview: template.needsReview ?? true,
    recognitionTaskId: task.id,
    roi: hit.roi,
  };
}

export function normalizeMaaStyleTasks(raw = {}) {
  return {
    version: raw.version || 1,
    screens: asArray(raw.screens).filter((task) => task?.id),
    candidates: asArray(raw.candidates).filter((task) => task?.id),
    ocrRegions: asArray(raw.ocrRegions).filter((region) => region?.id && region?.roi),
  };
}

function recognitionRegions(tasks, context = {}) {
  const regions = [];
  const allowedProfileRegionIds = profileOcrRegionIds(context.profile);
  const addRegion = (id, roi, scale = 3) => {
    const rect = rectFrom(roi);
    if (!rect) return;
    const scaled = context.scale ? scaleRect(rect, context.scale) : rect;
    const key = `${id}:${scaled.x}:${scaled.y}:${scaled.width}:${scaled.height}`;
    if (regions.some((region) => region.key === key)) return;
    regions.push({ key, id, ...scaled, scale });
  };
  for (const region of tasks.ocrRegions || []) {
    if (!taskAppliesToProfile(region, context.profile)) continue;
    if (allowedProfileRegionIds && !allowedProfileRegionIds.has(region.id)) continue;
    addRegion(region.id, region.roi, region.scale || 3);
  }
  for (const task of [...(tasks.screens || []), ...(tasks.candidates || [])]) {
    if (!taskAppliesToProfile(task, context.profile)) continue;
    const recognition = task.recognition || {};
    if (recognition.roi) addRegion(task.id, recognition.roi, recognition.scale || 3);
  }
  return regions.map(({ key, ...region }) => region);
}


async function inferClassificationFromCandidates(enrichedFrame, context = {}, candidateExtractors = []) {
  for (const extractor of candidateExtractors || []) {
    const extracted = await extractor(enrichedFrame, context);
    if (!Array.isArray(extracted) || !extracted.length) continue;
    const best = extracted.toSorted((a, b) => Number(b.confidence || 0) - Number(a.confidence || 0))[0];
    return {
      known: true,
      screenId: context.profile?.inferredScreenId || "candidate-inferred-screen",
      confidence: Math.max(0.5, Number(best.confidence || 0.5)),
      rawText: best.rawText || best.normalizedText || String(best.value ?? ""),
      normalizedText: best.normalizedText || null,
      recognitionTaskId: "candidate-extractor",
      engine: "candidate-extractor",
    };
  }
  return null;
}

async function enrichFrameWithText(frame, context = {}, textExtractor, tasks) {
  if (!textExtractor || frameTextResults(frame).length) return frame;
  try {
    return await textExtractor.extract(frame, { ...context, regions: recognitionRegions(tasks, context) });
  } catch (error) {
    return { ...frame, ocrError: error instanceof Error ? error.message : String(error) };
  }
}

export function createMaaStyleRecognizer({ tasks = {}, fallback = createMetadataRecognizer(), textExtractor = null, candidateExtractors = [] } = {}) {
  const normalizedTasks = normalizeMaaStyleTasks(tasks);

  return {
    async classify(frame, context = {}) {
      const enrichedFrame = await enrichFrameWithText(frame, context, textExtractor, normalizedTasks);
      const fallbackResult = await fallback.classify(enrichedFrame, context);
      if (fallbackResult?.known) return { ...fallbackResult, engine: "metadata" };

      for (const task of normalizedTasks.screens) {
        if (!taskAppliesToProfile(task, context.profile)) continue;
        const hits = matchRecognitionTask(task, enrichedFrame, context);
        if (!hits.length) continue;
        const best = hits.toSorted((a, b) => Number(b.confidence || 0) - Number(a.confidence || 0))[0];
        return {
          known: true,
          screenId: task.screenId || task.id,
          confidence: best.confidence,
          rawText: best.rawText,
          normalizedText: best.normalizedText,
          recognitionTaskId: task.id,
          engine: "maa-style",
        };
      }

      const candidateClassification = await inferClassificationFromCandidates(enrichedFrame, context, candidateExtractors);
      if (candidateClassification?.known) return candidateClassification;

      return { ...fallbackResult, engine: fallbackResult?.engine || "metadata" };
    },

    async recognize(frame, context = {}) {
      const enrichedFrame = await enrichFrameWithText(frame, context, textExtractor, normalizedTasks);
      const fallbackCandidates = await fallback.recognize(enrichedFrame, context);
      const candidates = Array.isArray(fallbackCandidates) ? [...fallbackCandidates] : [];
      for (const task of normalizedTasks.candidates) {
        if (!taskAppliesToProfile(task, context.profile)) continue;
        for (const hit of matchRecognitionTask(task, enrichedFrame, context)) candidates.push(candidateFromTask(task, hit));
      }
      for (const extractor of candidateExtractors || []) {
        const extracted = await extractor(enrichedFrame, context);
        if (Array.isArray(extracted)) candidates.push(...extracted);
      }
      return candidates;
    },

    async fingerprint(frame, { region } = {}) {
      return fingerprintFrame(frame, region);
    },
  };
}
