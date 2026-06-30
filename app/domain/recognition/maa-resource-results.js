function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function parseJsonObject(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  const text = String(value).trim();
  if (!text) return null;
  const start = text.indexOf("{");
  if (start < 0) return null;
  try {
    return JSON.parse(text.slice(start));
  } catch {
    return null;
  }
}

function rectFromBox(box) {
  if (!box) return null;
  if (Array.isArray(box)) {
    const [x, y, width, height] = box.map(Number);
    return [x, y, width, height].every(Number.isFinite) ? { x, y, width, height } : null;
  }
  const x = Number(box.x ?? box.left ?? box[0]);
  const y = Number(box.y ?? box.top ?? box[1]);
  const width = Number(box.width ?? box.w ?? box[2]);
  const height = Number(box.height ?? box.h ?? box[3]);
  return [x, y, width, height].every(Number.isFinite) ? { x, y, width, height } : null;
}

function detailResults(detail = {}) {
  const all = asArray(detail.all ?? detail.all_results ?? detail.allResults);
  const filtered = asArray(detail.filtered ?? detail.filtered_results ?? detail.filteredResults);
  const best = detail.best ?? detail.best_result ?? detail.bestResult ?? null;
  const primary = filtered.length ? filtered : best ? [best] : all;
  return { all, filtered, best, primary };
}

function resultScore(result = {}) {
  const score = Number(result.score ?? result.confidence ?? result.prob ?? result.similarity);
  return Number.isFinite(score) ? score : null;
}

function sourceIdForTask(entry, pipeline = {}) {
  const node = pipeline?.[entry] || {};
  return node.attach?.id || node.attach?.idPrefix || entry;
}

export function parseMaaRecognitionDetail(value) {
  const detail = parseJsonObject(value);
  return detail && typeof detail === "object" ? detail : {};
}

export function maaTaskResultToRecognitionItems(taskResult = {}, { pipeline = {}, source = "maa-framework" } = {}) {
  const entry = taskResult.entry || taskResult.Entry || taskResult.name || taskResult.Name || "";
  const algorithm = String(taskResult.algorithm || taskResult.Algorithm || "").toLowerCase();
  const detailJson = taskResult.recognitionDetailJson || taskResult.RecognitionDetailJson || taskResult.detailJson || taskResult.DetailJson || taskResult.detail || taskResult.Detail || "";
  const detail = parseMaaRecognitionDetail(detailJson);
  const regionId = sourceIdForTask(entry, pipeline);
  const { primary } = detailResults(detail);
  const isOcr = algorithm.includes("ocr") || primary.some((item) => typeof item?.text === "string");
  const isTemplate = algorithm.includes("template") || primary.some((item) => item?.score != null && item?.text == null);

  const ocrResults = [];
  const templateResults = [];
  for (const item of primary) {
    const roi = rectFromBox(item?.box ?? item?.rect ?? item?.roi);
    const score = resultScore(item);
    if (isOcr && typeof item?.text === "string" && item.text.trim()) {
      ocrResults.push({
        text: item.text,
        rawText: item.text,
        regionId,
        roi,
        confidence: score ?? 0.6,
        source,
        maaEntry: entry,
      });
      continue;
    }
    if (isTemplate || item?.box || item?.score != null) {
      templateResults.push({
        regionId,
        roi,
        score: score ?? 0,
        source,
        maaEntry: entry,
        count: Number.isFinite(Number(item?.count)) ? Number(item.count) : null,
      });
    }
  }
  return { ocrResults, templateResults };
}

export function maaTaskResultsToFrame(taskResults = [], options = {}) {
  const ocrResults = [];
  const templateResults = [];
  for (const taskResult of asArray(taskResults)) {
    const converted = maaTaskResultToRecognitionItems(taskResult, options);
    ocrResults.push(...converted.ocrResults);
    templateResults.push(...converted.templateResults);
  }
  return {
    source: options.source || "maa-framework",
    text: ocrResults.map((item) => item.text).join(" "),
    ocrResults,
    templateResults,
  };
}
