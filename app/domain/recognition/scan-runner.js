import { randomUUID } from "node:crypto";
import { computeResolutionScale, randomizeAction, scaleAction, scaleRect, scaleSwipe } from "./geometry.js";
import { fingerprintsEqual } from "./fingerprint.js";
import { createMetadataRecognizer } from "./placeholder-recognizer.js";
import { buildRecognitionSuggestions, dedupeRecognitionCandidates } from "./suggestions.js";

function throwIfAborted(signal) {
  if (signal?.aborted) throw Object.assign(new Error("recognition scan cancelled"), { status: 499 });
}

function logEvent(log, event, details = {}) {
  log.push({ event, at: new Date().toISOString(), ...details });
}

async function wait(adapter, ms, signal) {
  throwIfAborted(signal);
  if (ms <= 0) return;
  if (typeof adapter.wait === "function") return adapter.wait(ms, signal);
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function executeAction(adapter, action, scale, log, signal, random) {
  throwIfAborted(signal);
  const scaled = randomizeAction(scaleAction(action, scale), random);
  if (scaled.type === "tap") {
    logEvent(log, "tap", { point: scaled.point, label: scaled.label || null });
    return adapter.tap(scaled.point, { randomized: true });
  }
  if (scaled.type === "swipe") {
    logEvent(log, "swipe", { start: scaled.start, end: scaled.end, durationMs: scaled.durationMs, label: scaled.label || null });
    return adapter.swipe(scaled, { randomized: true });
  }
  if (scaled.type === "back") {
    logEvent(log, "restore", { method: "back", label: scaled.label || null });
    return adapter.back();
  }
  if (scaled.type === "wait") {
    logEvent(log, "wait", { durationMs: Number(scaled.durationMs || 0), label: scaled.label || null });
    return wait(adapter, Number(scaled.durationMs || 0), signal);
  }
  throw new Error(`unsupported recognition action: ${scaled.type}`);
}

async function executeActions(adapter, actions, scale, log, signal, random) {
  for (const action of actions || []) await executeAction(adapter, action, scale, log, signal, random);
}

export async function runScanProfile({ profile, adapter, recognizer = createMetadataRecognizer(), source = "adb", now = () => new Date(), scanId = randomUUID(), signal, random = Math.random } = {}) {
  if (!profile?.id) throw new Error("scan profile is required");
  if (!adapter) throw new Error("scan adapter is required");
  const startedAt = now();
  const log = [];
  const rawCandidates = [];
  const fingerprints = [];
  let openedTarget = false;
  let status = "completed";
  let reason = null;

  const actualResolution = await adapter.getActualResolution();
  const scale = computeResolutionScale(profile.baseResolution, actualResolution);
  const scanRegion = profile.scanRegion ? scaleRect(profile.scanRegion, scale) : null;
  const scroll = profile.scroll ? scaleSwipe(profile.scroll, scale) : null;

  try {
    throwIfAborted(signal);
    logEvent(log, "capture", { stage: "known-screen" });
    const initialFrame = await adapter.capture({ profileId: profile.id, stage: "known-screen" });
    const classification = await recognizer.classify(initialFrame, { profile, source, actualResolution, scale });
    logEvent(log, "classify", classification);
    if (!classification?.known) {
      status = "aborted";
      reason = "unknown_screen";
      return {
        scanId,
        profileId: profile.id,
        source,
        status,
        reason,
        suggestions: [],
        candidates: [],
        log,
        actualResolution,
        scale,
        startedAt: startedAt.toISOString(),
        finishedAt: now().toISOString(),
      };
    }

    const openSteps = profile.openSteps || [];
    await executeActions(adapter, openSteps, scale, log, signal, random);
    openedTarget = openSteps.length > 0;
    logEvent(log, "open", { profileId: profile.id, actionCount: openSteps.length });

    const maxScrolls = Math.max(0, Number(profile.maxScrolls ?? 16));
    const stableCount = Math.max(1, Number(profile.endFingerprintStableCount ?? 1));
    let stableMatches = 0;

    for (let iteration = 0; iteration <= maxScrolls; iteration += 1) {
      throwIfAborted(signal);
      logEvent(log, "capture", { stage: "scan", iteration });
      const frame = await adapter.capture({ profileId: profile.id, stage: "scan", iteration });
      const fingerprint = await recognizer.fingerprint(frame, { profile, region: scanRegion, iteration, actualResolution, scale });
      logEvent(log, "fingerprint", { iteration, fingerprint });
      if (fingerprints.length && fingerprintsEqual(fingerprints[fingerprints.length - 1], fingerprint)) stableMatches += 1;
      else stableMatches = 0;
      fingerprints.push(fingerprint);

      const candidates = await recognizer.recognize(frame, { profile, region: scanRegion, iteration, actualResolution, scale });
      logEvent(log, "recognize", { iteration, count: Array.isArray(candidates) ? candidates.length : 0 });
      if (Array.isArray(candidates)) rawCandidates.push(...candidates);

      if (stableMatches >= stableCount) {
        logEvent(log, "scroll", { axis: profile.scrollAxis, direction: profile.scrollDirection, status: "end", iteration });
        break;
      }
      if (iteration >= maxScrolls || !scroll) break;
      logEvent(log, "scroll", { axis: profile.scrollAxis, direction: profile.scrollDirection, status: "continue", iteration });
      const randomizedScroll = randomizeAction({ type: "swipe", ...scroll }, random);
      logEvent(log, "swipe", { start: randomizedScroll.start, end: randomizedScroll.end, durationMs: randomizedScroll.durationMs, axis: profile.scrollAxis, direction: profile.scrollDirection });
      await adapter.swipe(randomizedScroll, { randomized: true });
      await wait(adapter, Number(profile.captureDelayMs || 0), signal);
    }
  } finally {
    if (openedTarget) await executeActions(adapter, profile.restoreSteps || [], scale, log, null, random).catch((error) => logEvent(log, "restore", { status: "failed", error: error.message }));
  }

  const candidates = dedupeRecognitionCandidates(rawCandidates);
  const createdAt = now().toISOString();
  const suggestions = buildRecognitionSuggestions(candidates, { scanId, source, profile, createdAt });
  return {
    scanId,
    profileId: profile.id,
    source,
    status,
    reason,
    suggestions,
    candidates,
    log,
    actualResolution,
    scale,
    startedAt: startedAt.toISOString(),
    finishedAt: now().toISOString(),
  };
}