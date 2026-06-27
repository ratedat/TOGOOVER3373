import test from "node:test";
import assert from "node:assert/strict";

import { computeResolutionScale, randomizeAction, scaleAction, scalePoint, scaleRect, scaleSwipe } from "../app/domain/recognition/geometry.js";
import { hasReachedScrollEnd } from "../app/domain/recognition/fingerprint.js";

test("MAA-style baseResolution scaling doubles 1280x720 coordinates at 2560x1440", () => {
  const scale = computeResolutionScale({ width: 1280, height: 720 }, { width: 2560, height: 1440 });

  assert.deepEqual(scale, { scaleX: 2, scaleY: 2 });
  assert.deepEqual(scalePoint({ x: 100, y: 50 }, scale), { x: 200, y: 100 });
  assert.deepEqual(scaleRect({ x: 10, y: 20, width: 300, height: 120 }, scale), { x: 20, y: 40, width: 600, height: 240 });
  assert.deepEqual(scaleSwipe({ start: { x: 1100, y: 540 }, end: { x: 250, y: 540 }, durationMs: 450 }, scale), {
    start: { x: 2200, y: 1080 },
    end: { x: 500, y: 1080 },
    durationMs: 450,
  });
});

test("tap and swipe actions scale through the same resolution helper", () => {
  const scale = computeResolutionScale({ width: 1280, height: 720 }, { width: 1920, height: 1080 });

  assert.deepEqual(scaleAction({ type: "tap", point: { x: 100, y: 200 } }, scale), { type: "tap", point: { x: 150, y: 300 } });
  assert.deepEqual(scaleAction({ type: "swipe", start: { x: 100, y: 600 }, end: { x: 100, y: 200 }, durationMs: 300 }, scale), {
    type: "swipe",
    start: { x: 150, y: 900 },
    end: { x: 150, y: 300 },
    durationMs: 300,
  });
});

test("scroll-end fingerprint detection works for vertical and horizontal scans", () => {
  assert.equal(hasReachedScrollEnd(["a", "b", "b"], 1), true);
  assert.equal(hasReachedScrollEnd(["a", "b", "c"], 1), false);
  assert.equal(hasReachedScrollEnd(["a", "b", "b", "b"], 2), true);
  assert.equal(hasReachedScrollEnd(["a", "b", "b", "c"], 2), false);
});

test("scaleAction keeps tap and swipe randomization areas in the active resolution", () => {
  const scale = computeResolutionScale({ width: 1280, height: 720 }, { width: 2560, height: 1440 });

  assert.deepEqual(scaleAction({ type: "tap", point: { x: 54, y: 677 }, area: { x: 12, y: 634, width: 84, height: 86 } }, scale), {
    type: "tap",
    point: { x: 108, y: 1354 },
    area: { x: 24, y: 1268, width: 168, height: 172 },
  });
  assert.deepEqual(scaleAction({
    type: "swipe",
    start: { x: 1000, y: 600 },
    end: { x: 1000, y: 200 },
    startArea: { x: 980, y: 590, width: 40, height: 20 },
    endArea: { x: 980, y: 190, width: 40, height: 20 },
    durationMs: 300,
  }, scale), {
    type: "swipe",
    start: { x: 2000, y: 1200 },
    end: { x: 2000, y: 400 },
    startArea: { x: 1960, y: 1180, width: 80, height: 40 },
    endArea: { x: 1960, y: 380, width: 80, height: 40 },
    durationMs: 300,
  });
});

test("randomizeAction picks tap points inside the provided tap area", () => {
  const action = { type: "tap", point: { x: 108, y: 1354 }, area: { x: 24, y: 1268, width: 168, height: 172 } };
  const randomized = randomizeAction(action, () => 0.25);

  assert.notDeepEqual(randomized.point, action.point);
  assert.ok(randomized.point.x >= 24 && randomized.point.x <= 192);
  assert.ok(randomized.point.y >= 1268 && randomized.point.y <= 1440);
});

test("randomizeAction jitters point-only swipe start and end coordinates", () => {
  const values = [0, 1, 0, 1];
  const action = { type: "swipe", start: { x: 2000, y: 1200 }, end: { x: 2000, y: 400 }, durationMs: 450 };
  const randomized = randomizeAction(action, () => values.shift() ?? 0.5);

  assert.notDeepEqual(randomized.start, action.start);
  assert.notDeepEqual(randomized.end, action.end);
  assert.deepEqual(randomized.start, { x: 1988, y: 1212 });
  assert.deepEqual(randomized.end, { x: 1988, y: 412 });
});
