function finiteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function dateSortKey(value) {
  const timestamp = Date.parse(String(value || ""));
  return Number.isFinite(timestamp) ? timestamp : null;
}

function implementationSortValue(item) {
  return finiteNumber(item?.implementationOrder)
    ?? finiteNumber(item?.releaseOrder)
    ?? dateSortKey(item?.implementationDate)
    ?? dateSortKey(item?.releaseDate)
    ?? dateSortKey(item?.jpReleaseDate);
}

function sourceOrderSortKey(item) {
  return finiteNumber(item?.displayOrder) ?? Number.MAX_SAFE_INTEGER;
}

export const OPERATOR_CLASS_ORDER = ["先鋒", "前衛", "重装", "狙撃", "術師", "医療", "補助", "特殊"];
export const OPERATOR_BRANCH_ORDER_BY_CLASS = [
  ["先鋒", ["先駆兵", "突撃兵", "戦術家", "旗手", "偵察兵", "策士"]],
  ["前衛", ["強襲者", "闘士", "術戦士", "教官", "領主", "剣豪", "武者", "勇士", "鎌撃士", "解放者", "重剣士", "槌撃士", "本源戦士", "傭兵"]],
  ["重装", ["重盾衛士", "庇護衛士", "破壊者", "術技衛士", "決闘者", "堅城砲手", "哨戒衛士", "本源衛士"]],
  ["狙撃", ["速射手", "精密射手", "榴弾射手", "戦術射手", "散弾射手", "破城射手", "投擲手", "狩人", "旋輪射手", "翔空射手"]],
  ["術師", ["中堅術師", "拡散術師", "操機術師", "法陣術師", "秘術師", "連鎖術師", "爆撃術師", "本源術師", "創霊術師"]],
  ["医療", ["医師", "群癒師", "療養師", "放浪医", "呪癒師", "連鎖癒師", "守望者"]],
  ["補助", ["緩速師", "呪詛師", "吟遊者", "祈祷師", "召喚師", "工匠", "祭儀師"]],
  ["特殊", ["執行者", "推撃手", "潜伏者", "鉤縄師", "鬼才", "行商人", "罠師", "傀儡師", "錬金士", "巡空者"]],
];
const OPERATOR_CLASS_ALIASES = new Map([["術士", "術師"]]);
const OPERATOR_CLASS_RANKS = new Map(OPERATOR_CLASS_ORDER.map((name, index) => [name, index]));
const OPERATOR_BRANCH_RANKS = new Map(
  OPERATOR_BRANCH_ORDER_BY_CLASS.flatMap(([className, branches]) => branches.map((branch, index) => [
    branch,
    { classRank: OPERATOR_CLASS_RANKS.get(className) ?? Number.MAX_SAFE_INTEGER, branchRank: index },
  ])),
);
function normalizeOperatorClass(value) {
  const text = String(value || "");
  return OPERATOR_CLASS_ALIASES.get(text) || text;
}

function operatorClassSortKey(value) {
  const rank = OPERATOR_CLASS_RANKS.get(normalizeOperatorClass(value));
  return rank ?? Number.MAX_SAFE_INTEGER;
}

function compareOperatorClassValue(a, b) {
  return (operatorClassSortKey(a) - operatorClassSortKey(b)) || String(a).localeCompare(String(b), "ja");
}

function operatorBranchSortKey(value, fallbackClass) {
  const text = String(value || "");
  return OPERATOR_BRANCH_RANKS.get(text) || {
    classRank: operatorClassSortKey(fallbackClass),
    branchRank: Number.MAX_SAFE_INTEGER,
  };
}

function compareOperatorBranchValue(a, b, branchClasses = new Map()) {
  const aKey = operatorBranchSortKey(a, branchClasses.get(a));
  const bKey = operatorBranchSortKey(b, branchClasses.get(b));
  return (aKey.classRank - bKey.classRank)
    || (aKey.branchRank - bKey.branchRank)
    || String(a).localeCompare(String(b), "ja");
}

function compareOperatorBranchOrder(a, b) {
  return compareOperatorBranchValue(a.branch, b.branch, new Map([
    [a.branch, a.class],
    [b.branch, b.class],
  ]));
}

function compareOperatorClassOrder(a, b) {
  return compareOperatorClassValue(a.class, b.class)
    || compareOperatorBranchOrder(a, b)
    || ((finiteNumber(b.rarity) ?? 0) - (finiteNumber(a.rarity) ?? 0))
    || (sourceOrderSortKey(a) - sourceOrderSortKey(b))
    || a.name.localeCompare(b.name, "ja");
}
function compareImplementationOrder(a, b, direction) {
  const aValue = implementationSortValue(a);
  const bValue = implementationSortValue(b);
  if (aValue != null && bValue != null) return direction * (aValue - bValue) || a.name.localeCompare(b.name, "ja");
  if (aValue != null) return -1;
  if (bValue != null) return 1;
  return (sourceOrderSortKey(a) - sourceOrderSortKey(b)) || a.name.localeCompare(b.name, "ja");
}

export function sortOperators(operators, mode = "rarity_desc") {
  return [...operators].sort((a, b) => {
    if (mode === "implementation_asc") return compareImplementationOrder(a, b, 1);
    if (mode === "implementation_desc") return compareImplementationOrder(a, b, -1);
    if (mode === "rarity_asc") return (a.rarity - b.rarity) || (a.displayOrder - b.displayOrder) || a.name.localeCompare(b.name, "ja");
    if (mode === "class") return compareOperatorClassOrder(a, b);
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
  const values = [...new Set(items.map((item) => item[key]).filter(Boolean))];
  if (key === "class") return values.sort(compareOperatorClassValue);
  if (key === "branch") {
    const branchClasses = new Map();
    for (const item of items) {
      if (item?.branch && !branchClasses.has(item.branch)) branchClasses.set(item.branch, item.class);
    }
    return values.sort((a, b) => compareOperatorBranchValue(a, b, branchClasses));
  }
  return values.sort((a, b) => String(a).localeCompare(String(b), "ja"));
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
