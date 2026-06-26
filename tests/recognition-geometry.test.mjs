import test from "node:test";
import assert from "node:assert/strict";

import { computeResolutionScale, scaleAction, scalePoint, scaleRect, scaleSwipe } from "../app/domain/recognition/geometry.js";
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