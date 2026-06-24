import { normalizeText } from "../lib/format.js";

export function getRelicCategories(relics) {
  return [...new Set((relics || []).map((item) => item.category || "未分類"))];
}

export function getRelicListView(relics, filters = {}, ownedIds = [], gridColumns = 2) {
  const category = filters.relicCategory || "all";
  const query = normalizeText(filters.relicSearch || "");
  const filtered = (relics || []).filter((item) => {
    if (category !== "all" && (item.category || "未分類") !== category) return false;
    if (!query) return true;
    return normalizeText(`${item.number} ${item.name} ${item.category} ${item.effect}`).includes(query);
  });
  return {
    filtered,
    shown: filtered.slice(0, 500),
    owned: new Set(ownedIds || []),
    gridColumns,
  };
}