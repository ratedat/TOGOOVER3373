import test from "node:test";
import assert from "node:assert/strict";

import { runScanProfile } from "../app/domain/recognition/scan-runner.js";
import { createMetadataRecognizer } from "../app/domain/recognition/placeholder-recognizer.js";

function createAdapter(frames, log = []) {
  const queue = [...frames];
  return {
    async getActualResolution() {
      log.push(["resolution"]);
      return { width: 2560, height: 1440 };
    },
    async capture(meta) {
      log.push(["capture", meta.stage, meta.iteration ?? null]);
      return queue.shift() || { fingerprint: "end", candidates: [] };
    },
    async tap(point) {
      log.push(["tap", point]);
    },
    async swipe(swipe) {
      log.push(["swipe", swipe]);
    },
    async back() {
      log.push(["back"]);
    },
    async wait(ms) {
      log.push(["wait", ms]);
    },
  };
}

function baseProfile(overrides = {}) {
  return {
    id: "testProfile",
    label: "テストスキャン",
    baseResolution: { width: 1280, height: 720 },
    knownScreenIds: ["run-home"],
    openSteps: [{ type: "tap", point: { x: 100, y: 200 }, label: "open" }],
    restoreSteps: [{ type: "back", label: "restore" }],
    scanRegion: { x: 10, y: 20, width: 100, height: 50 },
    scrollAxis: "vertical",
    scrollDirection: "down",
    scroll: { start: { x: 1000, y: 600 }, end: { x: 1000, y: 200 }, durationMs: 300 },
    maxScrolls: 5,
    endFingerprintStableCount: 1,
    captureDelayMs: 0,
    ...overrides,
  };
}

test("scan runner executes open -> scan -> scroll -> restore and dedupes candidates", async () => {
  const adapterLog = [];
  const adapter = createAdapter([
    { knownScreenId: "run-home" },
    { fingerprint: "page-1", candidates: [{ kind: "relic", relicId: "r1", name: "秘宝A", confidence: 0.7 }] },
    { fingerprint: "page-2", candidates: [{ kind: "relic", relicId: "r1", name: "秘宝A", confidence: 0.9 }] },
    { fingerprint: "page-2", candidates: [{ kind: "relic", relicId: "r2", name: "秘宝B", confidence: 0.8 }] },
  ], adapterLog);

  const result = await runScanProfile({ profile: baseProfile(), adapter, recognizer: createMetadataRecognizer(), scanId: "scan-1", now: () => new Date("2026-06-25T00:00:00.000Z"), random: () => 0.5 });

  assert.equal(result.status, "completed");
  assert.equal(result.suggestions.length, 2);
  assert.deepEqual(adapterLog.map((entry) => entry[0]), ["resolution", "capture", "tap", "capture", "swipe", "capture", "swipe", "capture", "back"]);
  assert.deepEqual(adapterLog.find((entry) => entry[0] === "tap")[1], { x: 200, y: 400 });
  assert.equal(result.log.some((entry) => entry.event === "scroll" && entry.status === "end"), true);
});

test("coins profile keeps horizontal/right scroll semantics in operation log", async () => {
  const adapterLog = [];
  const result = await runScanProfile({
    profile: baseProfile({
      id: "is6CoinsFull",
      scrollAxis: "horizontal",
      scrollDirection: "right",
      scroll: { start: { x: 1100, y: 540 }, end: { x: 250, y: 540 }, durationMs: 450 },
      maxScrolls: 1,
    }),
    adapter: createAdapter([
      { knownScreenId: "run-home" },
      { fingerprint: "coins-1", candidates: [] },
      { fingerprint: "coins-2", candidates: [] },
    ], adapterLog),
    recognizer: createMetadataRecognizer(),
    scanId: "scan-coins",
    random: () => 0.5,
  });

  assert.equal(result.status, "completed");
  assert.equal(result.log.some((entry) => entry.event === "scroll" && entry.axis === "horizontal" && entry.direction === "right"), true);
  const swipe = adapterLog.find((entry) => entry[0] === "swipe")[1];
  assert.deepEqual(swipe.start, { x: 2200, y: 1080 });
  assert.deepEqual(swipe.end, { x: 500, y: 1080 });
});

test("scan runner aborts before open when the current screen is unknown", async () => {
  const adapterLog = [];
  const result = await runScanProfile({
    profile: baseProfile(),
    adapter: createAdapter([{ knownScreenId: "unknown" }], adapterLog),
    recognizer: createMetadataRecognizer(),
    scanId: "scan-unknown",
    random: () => 0.5,
  });

  assert.equal(result.status, "aborted");
  assert.equal(result.reason, "unknown_screen");
  assert.equal(result.suggestions.length, 0);
  assert.deepEqual(adapterLog.map((entry) => entry[0]), ["resolution", "capture"]);
});

test("scan runner randomizes tap areas and scroll swipes at execution time", async () => {
  const adapterLog = [];
  const randomValues = [0.25, 0.75, 0, 1, 1, 0];
  const result = await runScanProfile({
    profile: baseProfile({
      openSteps: [{ type: "tap", point: { x: 54, y: 677 }, area: { x: 12, y: 634, width: 84, height: 86 }, label: "open" }],
      maxScrolls: 1,
    }),
    adapter: createAdapter([
      { knownScreenId: "run-home" },
      { fingerprint: "page-1", candidates: [] },
      { fingerprint: "page-2", candidates: [] },
    ], adapterLog),
    recognizer: createMetadataRecognizer(),
    scanId: "scan-randomized",
    random: () => randomValues.shift() ?? 0.5,
  });

  assert.equal(result.status, "completed");
  const tap = adapterLog.find((entry) => entry[0] === "tap")[1];
  assert.notDeepEqual(tap, { x: 108, y: 1354 });
  assert.ok(tap.x >= 24 && tap.x <= 192);
  assert.ok(tap.y >= 1268 && tap.y <= 1440);

  const swipe = adapterLog.find((entry) => entry[0] === "swipe")[1];
  assert.notDeepEqual(swipe.start, { x: 2000, y: 1200 });
  assert.notDeepEqual(swipe.end, { x: 2000, y: 400 });
});
