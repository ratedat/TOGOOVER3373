import http from "node:http";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeControlMode } from "./domain/ui-modes.js";
import { mergeImplementationHistory } from "./domain/operator-implementation-history.js";
import { isAppShellPath } from "./lib/view-route.js";
import { normalizeRunStats } from "./domain/run-stats.js";
import { createMetadataRecognizer } from "./domain/recognition/placeholder-recognizer.js";
import { findScanProfile, findScanProfileByTriggerPath, normalizeScanProfiles, profileIdFromScanBody } from "./domain/recognition/profiles.js";
import { runScanProfile } from "./domain/recognition/scan-runner.js";
import { appendRecognitionSuggestionsToState } from "./domain/recognition/suggestions.js";
import { createAdbAdapter } from "./recognition/adapters/adb-adapter.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA = path.join(ROOT, "data");
const APP = path.join(ROOT, "app");
const STATE_DIR = process.env.ARKNIGHTS_STATE_DIR ? path.resolve(process.env.ARKNIGHTS_STATE_DIR) : DATA;
const CURRENT_STATE = path.join(STATE_DIR, "current-state.json");
const EXAMPLE_STATE = path.join(DATA, "overlay-state.example.json");
const SCAN_PROFILES = path.join(DATA, "recognition", "scan-profiles.json");

const argvPort = (() => {
  const index = process.argv.indexOf("--port");
  if (index >= 0 && process.argv[index + 1]) return Number(process.argv[index + 1]);
  return null;
})();
const PORT = Number(process.env.PORT || argvPort || 5173);
const NO_CACHE_HEADERS = {
  "cache-control": "no-store, max-age=0, must-revalidate",
  "pragma": "no-cache",
  "expires": "0",
};

const OVERLAY_SCROLL_SPEED_DEFAULTS = {
  compactRelicScrollSpeed: 9,
  verticalRelicScrollSpeed: 11,
  verticalOperatorScrollSpeed: 13,
  horizontalRelicScrollSpeed: 14,
  horizontalOperatorScrollSpeed: 16,
};

const mime = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".gif", "image/gif"],
  [".svg", "image/svg+xml"],
  [".ico", "image/x-icon"],
]);

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function writeJsonAtomic(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(tmp, file);
}

function initialStateFromExample(example) {
  const state = structuredClone(example);
  state.version = state.version || 1;
  state.theme = state.theme || "obs-compact";
  state.mode = normalizeControlMode("casual");
  state.updatedAt = new Date().toISOString();
  state.run = state.run || {};
  state.run.campaignId = "is5_sarkaz";
  if (!state.run.squadId && typeof state.run.squad === "string") state.run.squadId = state.run.squad;
  state.run.squad = state.run.squad ?? null;
  state.run.squadId = state.run.squadId ?? null;
  state.run.difficulty = state.run.difficulty ?? null;
  state.run.performanceId = state.run.performanceId ?? null;
  state.run.squadRandomEffectOptionId = state.run.squadRandomEffectOptionId ?? null;
  normalizeRunStats(state.run);
  state.relics = Array.isArray(state.relics) ? state.relics : [];
  state.operators = Array.isArray(state.operators) ? state.operators : [];
  state.bossFlags = Array.isArray(state.bossFlags) ? state.bossFlags : [];
  state.bossSelections = state.bossSelections && typeof state.bossSelections === "object" && !Array.isArray(state.bossSelections) ? state.bossSelections : {};
  state.pendingSuggestions = Array.isArray(state.pendingSuggestions) ? state.pendingSuggestions : [];
  state.tournament = state.tournament || { pendingState: null, lastSubmissionAt: null, submittedBy: null };
  state.preferences = {
    showUnreleasedOperators: false,
    operatorSort: "rarity_desc",
    operatorGridColumns: 2,
    relicGridColumns: 2,
    ...OVERLAY_SCROLL_SPEED_DEFAULTS,
    ...(state.preferences || {}),
  };
  state.preferences.operatorGridColumns = clampOperatorGridColumns(state.preferences.operatorGridColumns);
  state.preferences.relicGridColumns = clampOperatorGridColumns(state.preferences.relicGridColumns);
  normalizeOverlayScrollSpeeds(state.preferences);
  return state;
}

function clampOperatorGridColumns(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 2;
  return Math.min(6, Math.max(1, Math.trunc(numeric)));
}

function clampOverlayScrollSpeed(value, fallback = 12) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(30, Math.max(0, Math.round(numeric)));
}

function normalizeOverlayScrollSpeeds(preferences) {
  for (const [key, fallback] of Object.entries(OVERLAY_SCROLL_SPEED_DEFAULTS)) {
    preferences[key] = clampOverlayScrollSpeed(preferences[key], fallback);
  }
}

function normalizeState(state) {
  if (!state || typeof state !== "object") throw new Error("state must be an object");
  const next = structuredClone(state);
  next.version = next.version || 1;
  next.mode = normalizeControlMode(next.mode);
  next.updatedAt = new Date().toISOString();
  next.run = next.run || {};
  next.run.campaignId = next.run.campaignId || "is5_sarkaz";
  if (!next.run.squadId && typeof next.run.squad === "string") next.run.squadId = next.run.squad;
  next.run.squadId = next.run.squadId || null;
  next.run.squad = next.run.squad ?? null;
  next.run.difficulty = next.run.difficulty === "" ? null : next.run.difficulty;
  next.run.performanceId = next.run.performanceId || null;
  next.run.squadRandomEffectOptionId = next.run.squadRandomEffectOptionId || null;
  normalizeRunStats(next.run);
  next.relics = Array.isArray(next.relics) ? [...new Set(next.relics.filter(Boolean))] : [];
  next.operators = Array.isArray(next.operators) ? [...new Set(next.operators.filter(Boolean))] : [];
  next.bossFlags = Array.isArray(next.bossFlags) ? next.bossFlags.filter(Boolean) : [];
  next.bossSelections = next.bossSelections && typeof next.bossSelections === "object" && !Array.isArray(next.bossSelections) ? next.bossSelections : {};
  next.pendingSuggestions = Array.isArray(next.pendingSuggestions) ? next.pendingSuggestions : [];
  next.tournament = next.tournament || { pendingState: null, lastSubmissionAt: null, submittedBy: null };
  next.preferences = {
    showUnreleasedOperators: false,
    operatorSort: "rarity_desc",
    operatorGridColumns: 2,
    relicGridColumns: 2,
    ...OVERLAY_SCROLL_SPEED_DEFAULTS,
    ...(next.preferences || {}),
  };
  next.preferences.operatorGridColumns = clampOperatorGridColumns(next.preferences.operatorGridColumns);
  next.preferences.relicGridColumns = clampOperatorGridColumns(next.preferences.relicGridColumns);
  normalizeOverlayScrollSpeeds(next.preferences);
  return next;
}

async function ensureState() {
  try {
    return normalizeState(await readJson(CURRENT_STATE));
  } catch {
    const example = await readJson(EXAMPLE_STATE);
    const state = initialStateFromExample(example);
    await writeJsonAtomic(CURRENT_STATE, state);
    return state;
  }
}

async function recognitionProfiles() {
  return normalizeScanProfiles(await readJson(SCAN_PROFILES).catch(() => ({ profiles: [] })));
}

function httpError(status, message, details = {}) {
  return Object.assign(new Error(message), { status, details });
}

async function defaultRecognitionRunner({ profile, source = "adb", signal } = {}) {
  if (source !== "adb") throw httpError(400, `unsupported recognition source: ${source}`);
  return runScanProfile({
    profile,
    adapter: createAdbAdapter(),
    recognizer: createMetadataRecognizer(),
    source,
    signal,
  });
}

function responseStatusForScanResult(result) {
  if (result?.status === "aborted") return 409;
  return 200;
}

async function masterData() {
  const [campaigns, squadsRaw, relicsRaw, operatorsRaw, performancesRaw, selectableEffectsRaw, tiersRaw, gradesRaw, variantsRaw, effectRulesRaw, startTemplatesRaw, operatorHistoryRaw] = await Promise.all([
    readJson(path.join(DATA, "campaigns.json")),
    readJson(path.join(DATA, "squads.json")),
    readJson(path.join(DATA, "relics.json")),
    readJson(path.join(DATA, "operators.json")),
    readJson(path.join(DATA, "performances.json")).catch(() => ({ performances: [] })),
    readJson(path.join(DATA, "selectable-effects.json")).catch(() => ({ selectableEffects: [] })),
    readJson(path.join(DATA, "difficulty-tiers.json")),
    readJson(path.join(DATA, "difficulty-grades.json")).catch(() => ({ campaignDifficultyGrades: {} })),
    readJson(path.join(DATA, "relic-effect-variants.json")).catch(() => ({ variants: [] })),
    readJson(path.join(DATA, "relic-effect-rules.json")).catch(() => ({ rules: [], tagGroups: {} })),
    readJson(path.join(DATA, "start-templates.json")).catch(() => ({ templates: [] })),
    readJson(path.join(DATA, "operator-implementation-history.json")).catch(() => ({ history: [] })),
  ]);
  return {
    campaigns,
    squads: squadsRaw.squads || [],
    relics: relicsRaw.relics || [],
    operators: mergeImplementationHistory(operatorsRaw.operators || [], operatorHistoryRaw.history || []).operators,
    performances: performancesRaw.performances || [],
    selectableEffects: selectableEffectsRaw.selectableEffects || [],
    difficultyTiers: tiersRaw.campaignDifficultyTiers || {},
    difficultyGrades: gradesRaw.campaignDifficultyGrades || {},
    relicEffectVariants: variantsRaw.variantGroups || variantsRaw.variants || variantsRaw.relicEffectVariants || [],
    relicEffectRules: {
      version: effectRulesRaw.version || 1,
      tagGroups: effectRulesRaw.tagGroups || {},
      rules: effectRulesRaw.rules || [],
    },
    startTemplates: startTemplatesRaw.templates || [],
  };
}

function sendJson(res, status, value) {
  const body = JSON.stringify(value, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    ...NO_CACHE_HEADERS,
  });
  res.end(body);
}

function sendText(res, status, text) {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8", ...NO_CACHE_HEADERS });
  res.end(text);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function safeStaticPath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const normalized = path.normalize(decoded).replace(/^([/\\])+/, "");
  const file = path.resolve(ROOT, normalized);
  if (!file.startsWith(ROOT)) return null;
  return file;
}

async function serveFile(res, file) {
  try {
    const stat = await fs.stat(file);
    if (stat.isDirectory()) return false;
    const ext = path.extname(file).toLowerCase();
    const noCache = [".html", ".js", ".mjs", ".css", ".json"].includes(ext);
    res.writeHead(200, {
      "content-type": mime.get(ext) || "application/octet-stream",
      ...(noCache ? NO_CACHE_HEADERS : { "cache-control": "public, max-age=600" }),
      ...(ext === ".html" ? { "clear-site-data": '"cache"' } : {}),
    });
    createReadStream(file).pipe(res);
    return true;
  } catch {
    return false;
  }
}

export function createAppServer({ recognitionRunner = defaultRecognitionRunner } = {}) {
  let activeScanController = null;

  async function runRecognitionRequest({ profile, source = "adb" }) {
    if (activeScanController) throw httpError(409, "recognition scan already running");
    const controller = new AbortController();
    activeScanController = controller;
    try {
      const result = await recognitionRunner({ profile, source, signal: controller.signal });
      const state = await ensureState();
      if (result?.status === "completed" && Array.isArray(result.suggestions) && result.suggestions.length) {
        const nextState = normalizeState(appendRecognitionSuggestionsToState(state, result.suggestions));
        await writeJsonAtomic(CURRENT_STATE, nextState);
        return { result, state: nextState };
      }
      return { result, state };
    } finally {
      activeScanController = null;
    }
  }

  return http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (req.method === "GET" && url.pathname === "/api/master") {
      return sendJson(res, 200, await masterData());
    }

    if (req.method === "GET" && url.pathname === "/api/state") {
      return sendJson(res, 200, await ensureState());
    }

    if (req.method === "PUT" && url.pathname === "/api/state") {
      const state = normalizeState(JSON.parse(await readBody(req)));
      await writeJsonAtomic(CURRENT_STATE, state);
      return sendJson(res, 200, state);
    }

    if (req.method === "POST" && url.pathname === "/api/state/reset") {
      const state = initialStateFromExample(await readJson(EXAMPLE_STATE));
      await writeJsonAtomic(CURRENT_STATE, state);
      return sendJson(res, 200, state);
    }

    if (req.method === "POST" && url.pathname === "/api/recognition/scan") {
      const bodyText = await readBody(req);
      const body = bodyText ? JSON.parse(bodyText) : {};
      const profiles = await recognitionProfiles();
      const profile = findScanProfile(profiles, profileIdFromScanBody(body));
      const payload = await runRecognitionRequest({ profile, source: body.source || "adb" });
      return sendJson(res, responseStatusForScanResult(payload.result), payload);
    }

    if (req.method === "POST" && url.pathname === "/api/recognition/scan/cancel") {
      if (activeScanController) {
        activeScanController.abort();
        return sendJson(res, 202, { cancelled: true });
      }
      return sendJson(res, 200, { cancelled: false });
    }

    if (req.method === "GET" && url.pathname.startsWith("/trigger/scan/")) {
      const profiles = await recognitionProfiles();
      const profile = findScanProfileByTriggerPath(profiles, url.pathname);
      const payload = await runRecognitionRequest({ profile, source: "adb" });
      return sendJson(res, responseStatusForScanResult(payload.result), payload);
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      return sendText(res, 405, "Method not allowed");
    }

    if (url.pathname === "/") {
      res.writeHead(302, { location: "/control" });
      return res.end();
    }

    if (isAppShellPath(url.pathname)) {
      return serveFile(res, path.join(APP, "index.html"));
    }

    const file = safeStaticPath(url.pathname);
    if (file && (await serveFile(res, file))) return;
    sendText(res, 404, "Not found");
  } catch (error) {
    const status = Number(error?.status) || 500;
    sendJson(res, status, {
      error: error instanceof Error ? error.message : String(error),
      ...(error?.details ? { details: error.details } : {}),
    });
  }
  });
}

export function startServer({ port = PORT, host = "127.0.0.1", recognitionRunner } = {}) {
  const server = createAppServer({ recognitionRunner });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      const address = server.address();
      const actualPort = typeof address === "object" && address ? address.port : port;
      console.log(`RHODES OBS COMMANDER3373`);
      console.log(`Control: http://${host}:${actualPort}/control`);
      console.log(`Overlay: http://${host}:${actualPort}/overlay`);
      resolve({ server, port: actualPort, host });
    });
  });
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  startServer().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}