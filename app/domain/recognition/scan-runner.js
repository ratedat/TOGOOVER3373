import { randomUUID } from "node:crypto";
import { computeResolutionScale, randomizeAction, scaleAction, scaleRect, scaleSwipe } from "./geometry.js";
import { fingerprintsEqual } from "./fingerprint.js";
import { createMetadataRecognizer } from "./placeholder-recognizer.js";
import { buildRecognitionSuggestions, dedupeRecognitionCandidates, recognitionCandidateKey } from "./suggestions.js";

function throwIfAborted(signal) {
  if (signal?.aborted) throw Object.assign(new Error("recognition scan cancelled"), { status: 499 });
}

function logEvent(log, event, details = {}, onLog = null) {
  const entry = { event, at: new Date().toISOString(), ...details };
  log.push(entry);
  if (typeof onLog === "function") onLog(entry);
  return entry;
}

function arrayFrom(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function targetScreenIdsForProfile(profile = {}) {
  return new Set([...arrayFrom(profile.targetScreenIds), profile.inferredScreenId].filter(Boolean));
}

async function wait(adapter, ms, signal) {
  throwIfAborted(signal);
  if (ms <= 0) return;
  if (typeof adapter.wait === "function") return adapter.wait(ms, signal);
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function executeAction(adapter, action, scale, log, signal, random, onLog) {
  throwIfAborted(signal);
  const scaled = randomizeAction(scaleAction(action, scale), random);
  if (scaled.type === "tap") {
    logEvent(log, "tap", { point: scaled.point, label: scaled.label || null }, onLog);
    return adapter.tap(scaled.point, { randomized: true });
  }
  if (scaled.type === "swipe") {
    logEvent(log, "swipe", { start: scaled.start, end: scaled.end, durationMs: scaled.durationMs, label: scaled.label || null }, onLog);
    return adapter.swipe(scaled, { randomized: true });
  }
  if (scaled.type === "back") {
    logEvent(log, "restore", { method: "back", label: scaled.label || null }, onLog);
    return adapter.back();
  }
  if (scaled.type === "wait") {
    logEvent(log, "wait", { durationMs: Number(scaled.durationMs || 0), label: scaled.label || null }, onLog);
    return wait(adapter, Number(scaled.durationMs || 0), signal);
  }
  throw new Error(`unsupported recognition action: ${scaled.type}`);
}

async function executeActions(adapter, actions, scale, log, signal, random, onLog) {
  for (const action of actions || []) await executeAction(adapter, action, scale, log, signal, random, onLog);
}

function candidateSetSignature(candidates) {
  if (!Array.isArray(candidates) || !candidates.length) return null;
  const keys = [...new Set(candidates.map((candidate) => recognitionCandidateKey(candidate)).filter(Boolean))].sort();
  return keys.length ? keys.join("|") : null;
}

function scrollGuardForPass(profile, pass) {
  const guard = pass.scrollGuard || profile.scrollGuard;
  return guard && typeof guard === "object" ? guard : null;
}

function candidatesForScrollGuard(candidates, profile, guard) {
  const kinds = arrayFrom(guard.candidateKind || profile.candidateKind).filter(Boolean);
  const filtered = kinds.length ? (candidates || []).filter((candidate) => kinds.includes(candidate.kind)) : candidates;
  return dedupeRecognitionCandidates(filtered || []);
}

function initialCandidateScrollGuardResult({ profile, pass, iteration, candidates }) {
  const guard = scrollGuardForPass(profile, pass);
  if (!guard || guard.type !== "initialCandidateCountAtMost" || iteration !== 0) return null;
  if (guard.firstPassOnly !== false && pass.passIndex !== 0) return null;
  const maxCandidates = Number(guard.maxCandidates);
  if (!Number.isFinite(maxCandidates) || maxCandidates < 0) return null;
  const candidateCount = candidatesForScrollGuard(candidates, profile, guard).length;
  if (candidateCount > maxCandidates) return null;
  return {
    candidateCount,
    maxCandidates,
    reason: guard.reason || "initial_candidate_count_at_most",
    skipRemainingPasses: guard.skipRemainingPasses !== false,
  };
}

function scanPassesForProfile(profile, scale) {
  const rawPasses = Array.isArray(profile.scrollPasses) && profile.scrollPasses.length
    ? profile.scrollPasses
    : [{
        axis: profile.scrollAxis,
        direction: profile.scrollDirection,
        scroll: profile.scroll,
        maxScrolls: profile.maxScrolls,
        endFingerprintStableCount: profile.endFingerprintStableCount,
        captureDelayMs: profile.captureDelayMs,
      }];

  return rawPasses.map((pass, passIndex) => {
    const stableCount = Math.max(1, Number(pass.endFingerprintStableCount ?? profile.endFingerprintStableCount ?? 1));
    const rawCandidateStableCount = pass.candidateStableEndCount ?? profile.candidateStableEndCount;
    const candidateStableCount = rawCandidateStableCount === 0
      ? 0
      : Math.max(1, Number(rawCandidateStableCount ?? Math.max(2, stableCount)));
    return {
      passIndex,
      axis: pass.axis || pass.scrollAxis || profile.scrollAxis || "none",
      direction: pass.direction || pass.scrollDirection || profile.scrollDirection || "none",
      label: pass.label || null,
      scroll: pass.scroll ? scaleSwipe(pass.scroll, scale) : null,
      maxScrolls: Math.max(0, Number(pass.maxScrolls ?? profile.maxScrolls ?? 16)),
      minScrolls: Math.max(0, Number(pass.minScrolls ?? pass.minimumScrolls ?? 0)),
      mirrorPreviousPassScrolls: Boolean(pass.mirrorPreviousPassScrolls),
      stableCount,
      candidateStableCount,
      captureDelayMs: Number(pass.captureDelayMs ?? profile.captureDelayMs ?? 0),
    };
  });
}

export async function runScanProfile({ profile, adapter, recognizer = createMetadataRecognizer(), source = "adb", now = () => new Date(), scanId = randomUUID(), signal, random = Math.random, onLog = null } = {}) {
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

  try {
    throwIfAborted(signal);
    logEvent(log, "capture", { stage: "known-screen" }, onLog);
    const initialFrame = await adapter.capture({ profileId: profile.id, stage: "known-screen" });
    const classification = await recognizer.classify(initialFrame, { profile, source, actualResolution, scale });
    logEvent(log, "classify", classification, onLog);
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

    const targetScreenIds = targetScreenIdsForProfile(profile);
    const alreadyAtTarget = targetScreenIds.has(classification.screenId);
    const openSteps = alreadyAtTarget ? [] : (profile.openSteps || []);
    if (alreadyAtTarget) {
      logEvent(log, "open", { profileId: profile.id, actionCount: 0, status: "skipped", reason: "already_at_target", screenId: classification.screenId }, onLog);
    } else {
      await executeActions(adapter, openSteps, scale, log, signal, random, onLog);
      logEvent(log, "open", { profileId: profile.id, actionCount: openSteps.length }, onLog);
    }
    openedTarget = !alreadyAtTarget && openSteps.length > 0;

    let previousPassScrolls = 0;
    let skipRemainingPasses = false;
    for (const pass of scanPassesForProfile(profile, scale)) {
      if (skipRemainingPasses) break;
      const passFingerprints = [];
      const requiredScrolls = pass.mirrorPreviousPassScrolls ? Math.max(pass.minScrolls, previousPassScrolls) : pass.minScrolls;
      const maxScrolls = Math.max(pass.maxScrolls, requiredScrolls);
      let passScrolls = 0;
      let stableMatches = 0;
      let candidateStableMatches = 0;
      let previousCandidateSignature = null;

      for (let iteration = 0; iteration <= maxScrolls; iteration += 1) {
        throwIfAborted(signal);
        logEvent(log, "capture", { stage: "scan", iteration, passIndex: pass.passIndex, passLabel: pass.label }, onLog);
        const frame = await adapter.capture({ profileId: profile.id, stage: "scan", iteration, passIndex: pass.passIndex });
        const fingerprint = await recognizer.fingerprint(frame, { profile, region: scanRegion, iteration, passIndex: pass.passIndex, actualResolution, scale });
        logEvent(log, "fingerprint", { iteration, passIndex: pass.passIndex, fingerprint }, onLog);
        if (passFingerprints.length && fingerprintsEqual(passFingerprints[passFingerprints.length - 1], fingerprint)) stableMatches += 1;
        else stableMatches = 0;
        passFingerprints.push(fingerprint);
        fingerprints.push(fingerprint);

        const candidates = await recognizer.recognize(frame, { profile, region: scanRegion, iteration, passIndex: pass.passIndex, actualResolution, scale });
        logEvent(log, "recognize", { iteration, passIndex: pass.passIndex, count: Array.isArray(candidates) ? candidates.length : 0 }, onLog);
        if (Array.isArray(candidates)) rawCandidates.push(...candidates);

        const guardResult = initialCandidateScrollGuardResult({ profile, pass, iteration, candidates });
        if (guardResult) {
          logEvent(log, "scroll", {
            axis: pass.axis,
            direction: pass.direction,
            status: "skipped",
            reason: guardResult.reason,
            candidateCount: guardResult.candidateCount,
            maxCandidates: guardResult.maxCandidates,
            iteration,
            passIndex: pass.passIndex,
          }, onLog);
          if (guardResult.skipRemainingPasses) skipRemainingPasses = true;
          break;
        }

        const currentCandidateSignature = candidateSetSignature(candidates);
        if (currentCandidateSignature && currentCandidateSignature === previousCandidateSignature) candidateStableMatches += 1;
        else candidateStableMatches = 0;
        previousCandidateSignature = currentCandidateSignature;

        const canEndPass = iteration >= requiredScrolls;
        const fingerprintStable = stableMatches >= pass.stableCount;
        const candidateStable = pass.candidateStableCount > 0 && candidateStableMatches >= pass.candidateStableCount;
        if (canEndPass && (fingerprintStable || candidateStable)) {
          logEvent(log, "scroll", {
            axis: pass.axis,
            direction: pass.direction,
            status: "end",
            reason: candidateStable ? "candidate_stable" : "fingerprint_stable",
            iteration,
            passIndex: pass.passIndex,
          }, onLog);
          break;
        }
        if (iteration >= maxScrolls || !pass.scroll) break;
        logEvent(log, "scroll", { axis: pass.axis, direction: pass.direction, status: "continue", iteration, passIndex: pass.passIndex }, onLog);
        const randomizedScroll = randomizeAction({ type: "swipe", ...pass.scroll }, random);
        logEvent(log, "swipe", { start: randomizedScroll.start, end: randomizedScroll.end, durationMs: randomizedScroll.durationMs, axis: pass.axis, direction: pass.direction, passIndex: pass.passIndex }, onLog);
        await adapter.swipe(randomizedScroll, { randomized: true });
        passScrolls += 1;
        await wait(adapter, pass.captureDelayMs, signal);
      }
      previousPassScrolls = passScrolls;
    }
  } finally {
    if (openedTarget) await executeActions(adapter, profile.restoreSteps || [], scale, log, null, random, onLog).catch((error) => logEvent(log, "restore", { status: "failed", error: error.message }, onLog));
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