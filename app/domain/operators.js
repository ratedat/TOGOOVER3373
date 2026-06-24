export function sortOperators(operators, mode = "rarity_desc") {
  return [...operators].sort((a, b) => {
    if (mode === "rarity_asc") return (a.rarity - b.rarity) || (a.displayOrder - b.displayOrder) || a.name.localeCompare(b.name, "ja");
    if (mode === "name") return a.name.localeCompare(b.name, "ja");
    return (b.rarity - a.rarity) || (a.displayOrder - b.displayOrder) || a.name.localeCompare(b.name, "ja");
  });
}

export function operatorReleaseMatches(item, releaseFilter = "released") {
  if (releaseFilter === "all") return true;
  if (releaseFilter === "unreleased") return Boolean(item.hiddenByDefault);
  return !item.hiddenByDefault;
}

export function uniqueValues(items, key) {
  return [...new Set(items.map((item) => item[key]).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "ja"));
}