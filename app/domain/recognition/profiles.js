export const scanProfileIds = new Set(["runStatusFull", "operatorsFull", "relicsFull", "is4RevelationFull", "is5ThoughtFull", "is6CoinsFull"]);

function requireProfileId(value) {
  const id = String(value || "").trim();
  if (!id) throw Object.assign(new Error("recognition profile is required"), { status: 400 });
  return id;
}

function normalizeProfile(profile) {
  const id = requireProfileId(profile.id);
  return {
    maxScrolls: 16,
    endFingerprintStableCount: 1,
    captureDelayMs: 120,
    openSteps: [],
    restoreSteps: [{ type: "back" }],
    knownScreenIds: [],
    ...profile,
    id,
  };
}

export function normalizeScanProfiles(raw) {
  const profiles = Array.isArray(raw?.profiles) ? raw.profiles : [];
  return profiles.map(normalizeProfile);
}

export function findScanProfile(profiles, id) {
  const profileId = requireProfileId(id);
  const profile = normalizeScanProfiles({ profiles }).find((item) => item.id === profileId);
  if (!profile) throw Object.assign(new Error(`unknown recognition profile: ${profileId}`), { status: 404 });
  return profile;
}

export function findScanProfileByTriggerPath(profiles, pathname) {
  const path = String(pathname || "");
  const profile = normalizeScanProfiles({ profiles }).find((item) => item.triggerPath === path);
  if (!profile) throw Object.assign(new Error(`unknown recognition trigger: ${path}`), { status: 404 });
  return profile;
}

export function profileIdFromScanBody(body = {}) {
  return requireProfileId(body.profile || body.profileId);
}