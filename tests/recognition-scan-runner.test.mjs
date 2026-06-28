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


test("scan runner can sweep a scrollable overlay down and then back up", async () => {
  const adapterLog = [];
  const result = await runScanProfile({
    profile: baseProfile({
      id: "relicsFull",
      scrollPasses: [
        {
          axis: "vertical",
          direction: "down",
          scroll: { start: { x: 24, y: 610 }, end: { x: 24, y: 150 }, durationMs: 620 },
          maxScrolls: 1,
        },
        {
          axis: "vertical",
          direction: "up",
          scroll: { start: { x: 24, y: 150 }, end: { x: 24, y: 610 }, durationMs: 620 },
          maxScrolls: 1,
        },
      ],
    }),
    adapter: createAdapter([
      { knownScreenId: "run-home" },
      { fingerprint: "top", candidates: [{ kind: "relic", relicId: "r-top", name: "上", confidence: 0.8 }] },
      { fingerprint: "bottom", candidates: [{ kind: "relic", relicId: "r-bottom", name: "下", confidence: 0.8 }] },
      { fingerprint: "bottom", candidates: [{ kind: "relic", relicId: "r-bottom", name: "下", confidence: 0.8 }] },
      { fingerprint: "top", candidates: [{ kind: "relic", relicId: "r-top", name: "上", confidence: 0.8 }] },
    ], adapterLog),
    recognizer: createMetadataRecognizer(),
    scanId: "scan-two-pass",
    random: () => 0.5,
  });

  assert.equal(result.status, "completed");
  assert.equal(result.suggestions.length, 2);
  assert.deepEqual(adapterLog.filter((entry) => entry[0] === "swipe").map((entry) => entry[1].start), [
    { x: 48, y: 1220 },
    { x: 48, y: 300 },
  ]);
  assert.equal(result.log.some((entry) => entry.event === "scroll" && entry.direction === "down" && entry.passIndex === 0), true);
  assert.equal(result.log.some((entry) => entry.event === "scroll" && entry.direction === "up" && entry.passIndex === 1), true);
});

test("relic scan skips scroll when the opened panel fits within three rows", async () => {
  const adapterLog = [];
  const result = await runScanProfile({
    profile: baseProfile({
      id: "relicsFull",
      candidateKind: "relic",
      scrollGuard: {
        type: "initialCandidateCountAtMost",
        candidateKind: "relic",
        maxCandidates: 9,
        reason: "relic_panel_not_scrollable",
        skipRemainingPasses: true,
      },
      scrollPasses: [
        {
          axis: "vertical",
          direction: "down",
          scroll: { start: { x: 24, y: 610 }, end: { x: 24, y: 150 }, durationMs: 620 },
          maxScrolls: 1,
        },
        {
          axis: "vertical",
          direction: "up",
          scroll: { start: { x: 24, y: 150 }, end: { x: 24, y: 610 }, durationMs: 620 },
          maxScrolls: 1,
        },
      ],
    }),
    adapter: createAdapter([
      { knownScreenId: "run-home" },
      {
        fingerprint: "short-panel",
        candidates: [
          { kind: "relic", relicId: "r1", name: "秘宝1", confidence: 0.8 },
          { kind: "relic", relicId: "r2", name: "秘宝2", confidence: 0.8 },
          { kind: "relic", relicId: "r3", name: "秘宝3", confidence: 0.8 },
        ],
      },
      { fingerprint: "would-only-appear-after-bad-scroll", candidates: [] },
    ], adapterLog),
    recognizer: createMetadataRecognizer(),
    scanId: "scan-short-relic-panel",
    random: () => 0.5,
  });

  assert.equal(result.status, "completed");
  assert.equal(result.suggestions.length, 3);
  assert.equal(adapterLog.some((entry) => entry[0] === "swipe"), false);
  assert.equal(result.log.some((entry) => entry.event === "scroll" && entry.status === "skipped" && entry.reason === "relic_panel_not_scrollable"), true);
});
test("relic scan still scrolls when initial candidates exceed three rows", async () => {
  const adapterLog = [];
  const initialCandidates = Array.from({ length: 10 }, (_, index) => ({
    kind: "relic",
    relicId: `r${index + 1}`,
    name: `秘宝${index + 1}`,
    confidence: 0.8,
  }));
  const result = await runScanProfile({
    profile: baseProfile({
      id: "relicsFull",
      candidateKind: "relic",
      scrollGuard: {
        type: "initialCandidateCountAtMost",
        candidateKind: "relic",
        maxCandidates: 9,
        reason: "relic_panel_not_scrollable",
        skipRemainingPasses: true,
      },
      scrollPasses: [
        {
          axis: "vertical",
          direction: "down",
          scroll: { start: { x: 24, y: 610 }, end: { x: 24, y: 150 }, durationMs: 620 },
          maxScrolls: 1,
        },
      ],
    }),
    adapter: createAdapter([
      { knownScreenId: "run-home" },
      { fingerprint: "tall-panel-top", candidates: initialCandidates },
      { fingerprint: "tall-panel-bottom", candidates: [{ kind: "relic", relicId: "r11", name: "秘宝11", confidence: 0.8 }] },
    ], adapterLog),
    recognizer: createMetadataRecognizer(),
    scanId: "scan-tall-relic-panel",
    random: () => 0.5,
  });

  assert.equal(result.status, "completed");
  assert.equal(adapterLog.some((entry) => entry[0] === "swipe"), true);
  assert.equal(result.log.some((entry) => entry.event === "scroll" && entry.status === "skipped"), false);
});
test("scan runner stops a pass when recognized candidate sets stop changing", async () => {
  const adapterLog = [];
  const result = await runScanProfile({
    profile: baseProfile({
      maxScrolls: 5,
      endFingerprintStableCount: 2,
    }),
    adapter: createAdapter([
      { knownScreenId: "run-home" },
      { fingerprint: "animated-1", candidates: [{ kind: "relic", relicId: "r1", name: "秘宝A", confidence: 0.8 }] },
      { fingerprint: "animated-2", candidates: [{ kind: "relic", relicId: "r1", name: "秘宝A", confidence: 0.8 }] },
      { fingerprint: "animated-3", candidates: [{ kind: "relic", relicId: "r1", name: "秘宝A", confidence: 0.8 }] },
      { fingerprint: "would-not-be-read", candidates: [] },
    ], adapterLog),
    recognizer: createMetadataRecognizer(),
    scanId: "scan-candidate-stable",
    random: () => 0.5,
  });

  assert.equal(result.status, "completed");
  assert.equal(adapterLog.filter((entry) => entry[0] === "swipe").length, 2);
  assert.equal(result.log.some((entry) => entry.event === "scroll" && entry.status === "end" && entry.reason === "candidate_stable"), true);
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


test("scan runner emits live log entries through onLog", async () => {
  const liveLog = [];
  const result = await runScanProfile({
    profile: baseProfile({ maxScrolls: 0, restoreSteps: [] }),
    adapter: createAdapter([
      { knownScreenId: "run-home" },
      { fingerprint: "page-1", candidates: [{ kind: "runStatus", field: "difficulty", value: 18, confidence: 0.8 }] },
    ]),
    recognizer: createMetadataRecognizer(),
    scanId: "scan-live-log",
    random: () => 0.5,
    onLog: (entry) => liveLog.push(entry),
  });

  assert.equal(result.status, "completed");
  assert.equal(liveLog.length, result.log.length);
  assert.equal(liveLog.some((entry) => entry.event === "capture" && entry.stage === "scan"), true);
  assert.equal(liveLog.some((entry) => entry.event === "recognize" && entry.count === 1), true);
});

test("scan runner can persist captured frames through a debug hook", async () => {
  const savedFrames = [];
  const liveLog = [];
  const result = await runScanProfile({
    profile: baseProfile({ id: "relicsFull", maxScrolls: 0, restoreSteps: [] }),
    adapter: createAdapter([
      { knownScreenId: "run-home", bytes: Buffer.from("known"), capturedAt: "2026-06-28T00:00:00.000Z" },
      { fingerprint: "page-1", candidates: [], bytes: Buffer.from("scan"), capturedAt: "2026-06-28T00:00:01.000Z" },
    ]),
    recognizer: createMetadataRecognizer(),
    scanId: "debug-scan",
    now: () => new Date("2026-06-28T00:00:00.000Z"),
    random: () => 0.5,
    onLog: (entry) => liveLog.push(entry),
    onCaptureFrame: async (frame, meta) => {
      savedFrames.push({ frame, meta });
      return { path: `D:/Debug/${meta.scanId}/${meta.stage}.png`, bytes: frame.bytes.length, capturedAt: frame.capturedAt };
    },
  });

  assert.equal(result.status, "completed");
  assert.deepEqual(savedFrames.map((item) => [item.meta.scanId, item.meta.profile.id, item.meta.stage]), [
    ["debug-scan", "relicsFull", "known-screen"],
    ["debug-scan", "relicsFull", "scan"],
  ]);
  assert.deepEqual(savedFrames.map((item) => item.meta.scanStartedAt), [
    "2026-06-28T00:00:00.000Z",
    "2026-06-28T00:00:00.000Z",
  ]);
  assert.equal(result.log.some((entry) => entry.event === "screenshot" && entry.path.endsWith("known-screen.png")), true);
  assert.equal(liveLog.some((entry) => entry.event === "screenshot" && entry.path.endsWith("scan.png")), true);
});


test("scan runner skips open and restore when the target panel is already open", async () => {
  const adapterLog = [];
  const recognizer = {
    async classify() {
      return { known: true, screenId: "run-squad-info-panel", confidence: 0.9 };
    },
    async fingerprint(frame) {
      return frame.fingerprint || "target-page";
    },
    async recognize() {
      return [{ kind: "runStatus", field: "squadId", value: "is5_sarkaz_squad_03", confidence: 0.86 }];
    },
  };

  const result = await runScanProfile({
    profile: baseProfile({
      id: "runStatusFull",
      targetScreenIds: ["run-squad-info-panel"],
      inferredScreenId: "run-squad-info-panel",
      maxScrolls: 0,
    }),
    adapter: createAdapter([
      { bytes: Buffer.from("known") },
      { bytes: Buffer.from("scan"), fingerprint: "target-page" },
    ], adapterLog),
    recognizer,
    scanId: "scan-target-open",
    random: () => 0.5,
  });

  assert.equal(result.status, "completed");
  assert.deepEqual(adapterLog.map((entry) => entry[0]), ["resolution", "capture", "capture"]);
  assert.equal(result.log.some((entry) => entry.event === "open" && entry.status === "skipped" && entry.reason === "already_at_target"), true);
  assert.equal(result.suggestions[0].candidate.field, "squadId");
});

test("scan runner can force return passes to mirror the previous pass scroll count", async () => {
  const adapterLog = [];
  const sameCandidate = [{ kind: "operator", operatorId: "blaze", name: "ブレイズ", confidence: 0.8 }];
  const result = await runScanProfile({
    profile: baseProfile({
      id: "operatorsFull",
      scrollPasses: [
        {
          axis: "horizontal",
          direction: "right",
          scroll: { start: { x: 1100, y: 360 }, end: { x: 420, y: 360 }, durationMs: 500 },
          maxScrolls: 3,
          endFingerprintStableCount: 1,
          candidateStableEndCount: 1,
        },
        {
          axis: "horizontal",
          direction: "left",
          scroll: { start: { x: 420, y: 360 }, end: { x: 1100, y: 360 }, durationMs: 500 },
          maxScrolls: 3,
          endFingerprintStableCount: 1,
          candidateStableEndCount: 1,
          mirrorPreviousPassScrolls: true,
        },
      ],
    }),
    adapter: createAdapter([
      { knownScreenId: "run-home" },
      { fingerprint: "right-0", candidates: [{ kind: "operator", operatorId: "op0", confidence: 0.8 }] },
      { fingerprint: "right-1", candidates: [{ kind: "operator", operatorId: "op1", confidence: 0.8 }] },
      { fingerprint: "right-2", candidates: [{ kind: "operator", operatorId: "op2", confidence: 0.8 }] },
      { fingerprint: "right-3", candidates: [{ kind: "operator", operatorId: "op3", confidence: 0.8 }] },
      { fingerprint: "left-0", candidates: sameCandidate },
      { fingerprint: "left-1", candidates: sameCandidate },
      { fingerprint: "left-2", candidates: sameCandidate },
      { fingerprint: "left-3", candidates: sameCandidate },
    ], adapterLog),
    recognizer: createMetadataRecognizer(),
    scanId: "scan-mirror-return",
    random: () => 0.5,
  });

  assert.equal(result.status, "completed");
  assert.equal(adapterLog.filter((entry) => entry[0] === "swipe").length, 6);
  assert.equal(adapterLog.filter((entry) => entry[0] === "swipe" && entry[1].start.x < entry[1].end.x).length, 3);
  assert.equal(result.log.some((entry) => entry.event === "scroll" && entry.direction === "left" && entry.status === "end" && entry.iteration === 3), true);
});
