export function normalizeChoiceFilterIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item || "").trim()).filter(Boolean))];
}

export function applyChoiceListFilters(items = [], options = {}) {
  const selected = new Set(normalizeChoiceFilterIds(options.selectedIds));
  const excluded = new Set(normalizeChoiceFilterIds(options.excludedIds));
  const selectedOnly = Boolean(options.selectedOnly);
  const hideExcluded = Boolean(options.hideExcluded);
  const showSelectedFirst = Boolean(options.showSelectedFirst);

  const filtered = (items || []).filter((item) => {
    const id = item?.id;
    if (!id) return false;
    if (selectedOnly && !selected.has(id)) return false;
    if (hideExcluded && excluded.has(id)) return false;
    return true;
  });

  if (!showSelectedFirst) return filtered;

  return filtered
    .map((item, index) => ({ item, index, priority: selected.has(item.id) ? 0 : 1 }))
    .sort((a, b) => (a.priority - b.priority) || (a.index - b.index))
    .map(({ item }) => item);
}
