function assertResolution(resolution, label) {
  const width = Number(resolution?.width);
  const height = Number(resolution?.height);
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    throw new Error(`${label} resolution must include positive width and height`);
  }
  return { width, height };
}

export function computeResolutionScale(baseResolution, actualResolution) {
  const base = assertResolution(baseResolution, "base");
  const actual = assertResolution(actualResolution, "actual");
  return {
    scaleX: actual.width / base.width,
    scaleY: actual.height / base.height,
  };
}

export function scaleNumber(value, scale) {
  return Math.round(Number(value) * Number(scale));
}

export function scalePoint(point, scale) {
  return {
    x: scaleNumber(point.x, scale.scaleX),
    y: scaleNumber(point.y, scale.scaleY),
  };
}

export function scaleRect(rect, scale) {
  return {
    x: scaleNumber(rect.x, scale.scaleX),
    y: scaleNumber(rect.y, scale.scaleY),
    width: scaleNumber(rect.width, scale.scaleX),
    height: scaleNumber(rect.height, scale.scaleY),
  };
}

export function scaleSwipe(swipe, scale) {
  return {
    start: scalePoint(swipe.start, scale),
    end: scalePoint(swipe.end, scale),
    durationMs: Math.max(0, Math.round(Number(swipe.durationMs ?? 350))),
  };
}

export function scaleAction(action, scale) {
  if (!action || typeof action !== "object") return action;
  if (action.type === "tap") return { ...action, point: scalePoint(action.point, scale) };
  if (action.type === "swipe") return { ...action, ...scaleSwipe(action, scale) };
  return { ...action };
}