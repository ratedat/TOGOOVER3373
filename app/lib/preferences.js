export const gridColumnOptions = [1, 2, 3, 4, 5, 6];

export function clampGridColumns(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 2;
  return Math.min(6, Math.max(1, Math.trunc(numeric)));
}