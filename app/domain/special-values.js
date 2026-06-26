export function asSpecialArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value === null || value === undefined || value === "") return [];
  return [value];
}

export function asSpecialObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  return {};
}

export function clampSpecialNumber(value, min = null, max = null) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const hasMin = min !== null && min !== undefined && min !== "";
  const hasMax = max !== null && max !== undefined && max !== "";
  const lower = hasMin && Number.isFinite(Number(min)) ? Number(min) : -Infinity;
  const upper = hasMax && Number.isFinite(Number(max)) ? Number(max) : Infinity;
  return Math.round(Math.max(lower, Math.min(upper, numeric)));
}

export function clampCoinCount(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return Math.max(1, Math.min(99, Math.round(numeric)));
}

export const coinFaceLabels = {
  front: "表",
  back: "裏",
};

export function normalizeCoinFace(value) {
  return value === "back" ? "back" : "front";
}

export function asCoinEntries(value) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    if (typeof entry === "string") return { coinId: entry, count: 1, statusId: null, face: "front" };
    if (!entry || typeof entry !== "object") return null;
    return {
      coinId: entry.coinId || entry.id || null,
      count: clampCoinCount(entry.count),
      statusId: entry.statusId || entry.status || null,
      face: normalizeCoinFace(entry.face),
    };
  }).filter((entry) => entry?.coinId);
}

function coinEntryKey(entry) {
  return `${entry.coinId}\u001f${entry.statusId || ""}\u001f${entry.face}`;
}

export function mergeCoinEntries(entries) {
  const merged = new Map();
  for (const entry of asCoinEntries(entries)) {
    const key = coinEntryKey(entry);
    if (merged.has(key)) {
      const current = merged.get(key);
      current.count = clampCoinCount(current.count + entry.count);
    } else {
      merged.set(key, { ...entry, count: clampCoinCount(entry.count) });
    }
  }
  return [...merged.values()];
}

export function asEffectStackEntries(value) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    if (typeof entry === "string") return { effectId: entry, count: 1, stateId: null };
    if (!entry || typeof entry !== "object") return null;
    return {
      effectId: entry.effectId || entry.id || null,
      count: clampCoinCount(entry.count),
      stateId: entry.stateId || entry.state || entry.statusId || null,
    };
  }).filter((entry) => entry?.effectId);
}

export function asRevelationBoardValue(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { causeId: null, structureId: null, rhetorics: [] };
  }
  return {
    causeId: value.causeId || value.cause || null,
    structureId: value.structureId || value.structure || null,
    rhetorics: asEffectStackEntries(value.rhetorics || value.rhetoricEntries || value.rhetoricIds || []),
  };
}
