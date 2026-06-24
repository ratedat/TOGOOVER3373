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
export function getOperatorFilterView(operators, filters = {}) {
  const normalized = {
    operatorRelease: filters.operatorRelease || "released",
    operatorRarity: filters.operatorRarity || "all",
    operatorClass: filters.operatorClass || "all",
    operatorBranch: filters.operatorBranch || "all",
  };
  const releaseBase = (operators || []).filter((item) => operatorReleaseMatches(item, normalized.operatorRelease));
  const rarityOptions = [6, 5, 4, 3, 2, 1].filter((rarity) => releaseBase.some((item) => Number(item.rarity) === rarity));
  const rarityValues = new Set(rarityOptions.map(String));
  if (normalized.operatorRarity !== "all" && !rarityValues.has(normalized.operatorRarity)) normalized.operatorRarity = "all";

  const rarityBase = releaseBase.filter((item) => normalized.operatorRarity === "all" || String(item.rarity) === normalized.operatorRarity);
  const classOptions = uniqueValues(rarityBase, "class");
  if (normalized.operatorClass !== "all" && !classOptions.includes(normalized.operatorClass)) {
    normalized.operatorClass = "all";
    normalized.operatorBranch = "all";
  }

  const classBase = rarityBase.filter((item) => normalized.operatorClass === "all" || item.class === normalized.operatorClass);
  const branchOptions = uniqueValues(classBase, "branch");
  if (normalized.operatorBranch !== "all" && !branchOptions.includes(normalized.operatorBranch)) normalized.operatorBranch = "all";

  const filteredOperators = classBase.filter((item) => normalized.operatorBranch === "all" || item.branch === normalized.operatorBranch);
  return { filters: normalized, releaseBase, rarityOptions, rarityBase, classOptions, classBase, branchOptions, operators: filteredOperators };
}
