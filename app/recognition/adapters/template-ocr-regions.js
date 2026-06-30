import path from "node:path";

function rectFrom(value) {
  if (!value) return null;
  if (Array.isArray(value)) {
    const [x, y, width, height] = value.map(Number);
    if (![x, y, width, height].every(Number.isFinite)) return null;
    return { x, y, width, height };
  }
  const x = Number(value.x);
  const y = Number(value.y);
  const width = Number(value.width);
  const height = Number(value.height);
  if (![x, y, width, height].every(Number.isFinite)) return null;
  return { x, y, width, height };
}

function scaleRect(rect, scaleX, scaleY) {
  return {
    x: Math.round(rect.x * scaleX),
    y: Math.round(rect.y * scaleY),
    width: Math.round(rect.width * scaleX),
    height: Math.round(rect.height * scaleY),
  };
}

function resolveTemplatePath(templatePath, cwd = process.cwd()) {
  if (!templatePath) return null;
  return path.isAbsolute(templatePath) ? templatePath : path.join(cwd, templatePath);
}

export function resolveTemplateOcrRegions(context = {}, cwd = process.cwd()) {
  const configs = Array.isArray(context.profile?.templateOcrRegions) ? context.profile.templateOcrRegions : [];
  if (!configs.length) return [];
  const scaleX = Number(context.scale?.scaleX ?? context.scale?.x ?? 1) || 1;
  const scaleY = Number(context.scale?.scaleY ?? context.scale?.y ?? 1) || 1;
  return configs
    .map((config) => {
      const searchRoi = rectFrom(config.searchRoi || config.roi);
      const ocrOffset = rectFrom(config.ocrOffset || config.rectMove);
      const templatePath = resolveTemplatePath(config.templatePath, cwd);
      if (!searchRoi || !ocrOffset || !templatePath) return null;
      return {
        idPrefix: config.idPrefix || "template.region",
        templatePath,
        searchRoi: scaleRect(searchRoi, scaleX, scaleY),
        ocrOffset: scaleRect(ocrOffset, scaleX, scaleY),
        templateScaleX: scaleX,
        templateScaleY: scaleY,
        threshold: Number(config.threshold ?? config.templThreshold ?? 0.9),
        maxMatches: Math.max(1, Number(config.maxMatches ?? 8)),
        step: Math.max(1, Number(config.step ?? 2)),
        sampleStride: Math.max(1, Number(config.sampleStride ?? 4)),
        scale: Math.max(1, Number(config.scale ?? 3)),
        numericFallback: Boolean(config.numericFallback),
        numericStartYRatio: Number(config.numericStartYRatio ?? 0.25),
        suppressStaticRegionIdPattern: config.suppressStaticRegionIdPattern || "",
      };
    })
    .filter(Boolean);
}
