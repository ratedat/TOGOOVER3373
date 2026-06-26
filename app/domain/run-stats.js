export const RUN_STAT_FIELDS = Object.freeze([
  { id: "hope", label: "希望", min: 0, max: 999 },
  { id: "lifePoints", label: "耐久値", min: 0, max: 999 },
  { id: "shield", label: "シールド", min: 0, max: 999 },
  { id: "commandLevel", label: "指揮Lv", min: 1, max: 99 },
]);

export const RUN_STAT_FIELD_IDS = new Set(RUN_STAT_FIELDS.map((field) => field.id));

function getRunStatField(fieldId) {
  return RUN_STAT_FIELDS.find((field) => field.id === fieldId) || null;
}

export function normalizeRunStatValue(fieldId, value) {
  const field = getRunStatField(fieldId);
  if (!field) return null;
  if (value === "" || value === null || value === undefined) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.min(field.max, Math.max(field.min, Math.trunc(numeric)));
}

export function normalizeRunStats(run) {
  if (!run || typeof run !== "object") return run;
  for (const field of RUN_STAT_FIELDS) {
    run[field.id] = normalizeRunStatValue(field.id, run[field.id]);
  }
  return run;
}

export function formatRunStatValue(run, fieldId) {
  const value = normalizeRunStatValue(fieldId, run?.[fieldId]);
  return value === null ? "-" : String(value);
}

export function runStatDisplayItems(run) {
  return RUN_STAT_FIELDS.map((field) => ({
    ...field,
    value: formatRunStatValue(run, field.id),
  }));
}