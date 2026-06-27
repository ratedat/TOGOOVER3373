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

function scaledOptionalRect(rect, scale) {
  return rect ? scaleRect(rect, scale) : undefined;
}

export function scaleAction(action, scale) {
  if (!action || typeof action !== "object") return action;
  if (action.type === "tap") {
    return {
      ...action,
      point: scalePoint(action.point, scale),
      ...(action.area ? { area: scaleRect(action.area, scale) } : {}),
    };
  }
  if (action.type === "swipe") {
    return {
      ...action,
      ...scaleSwipe(action, scale),
      ...(action.startArea ? { startArea: scaledOptionalRect(action.startArea, scale) } : {}),
      ...(action.endArea ? { endArea: scaledOptionalRect(action.endArea, scale) } : {}),
    };
  }
  return { ...action };
}

const DEFAULT_TAP_JITTER = { x: 8, y: 8 };
const DEFAULT_SWIPE_JITTER = { x: 12, y: 12 };

function boundedRandom(random) {
  const value = Number(typeof random === "function" ? random() : Math.random());
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

function pointRectFromJitter(point, jitter) {
  return {
    x: Number(point.x) - Number(jitter.x),
    y: Number(point.y) - Number(jitter.y),
    width: Number(jitter.x) * 2,
    height: Number(jitter.y) * 2,
  };
}

function randomPointInRect(rect, random) {
  const x = Number(rect?.x);
  const y = Number(rect?.y);
  const width = Number(rect?.width);
  const height = Number(rect?.height);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height) || width < 0 || height < 0) return null;
  return {
    x: Math.round(x + width * boundedRandom(random)),
    y: Math.round(y + height * boundedRandom(random)),
  };
}

function randomizePoint(point, area, random, jitter) {
  const rect = area || pointRectFromJitter(point, jitter);
  return randomPointInRect(rect, random) || { ...point };
}

export function randomizeAction(action, random = Math.random) {
  if (!action || typeof action !== "object") return action;
  if (action.type === "tap") {
    return {
      ...action,
      point: randomizePoint(action.point, action.area, random, DEFAULT_TAP_JITTER),
    };
  }
  if (action.type === "swipe") {
    return {
      ...action,
      start: randomizePoint(action.start, action.startArea, random, DEFAULT_SWIPE_JITTER),
      end: randomizePoint(action.end, action.endArea, random, DEFAULT_SWIPE_JITTER),
    };
  }
  return { ...action };
}
