export function getDifficultyGradeConfig(master, campaignId) {
  return master?.difficultyGrades?.[campaignId] || null;
}

export function getSelectedDifficultyGrade(master, run) {
  const cfg = getDifficultyGradeConfig(master, run?.campaignId);
  const raw = run?.difficulty;
  const value = raw === null || raw === undefined || raw === "" ? null : Number(raw);
  if (!cfg || !Number.isFinite(value)) return null;
  return (cfg.grades || []).find((item) => Number(item.grade) === value) || null;
}

export function difficultySummary(grade) {
  return (grade?.fields || [])
    .filter((item) => item.value !== null && item.value !== undefined && item.value !== "")
    .map((item) => `${item.label}: ${item.value}`)
    .join(" / ");
}

export function difficultyEffectTexts(grade) {
  const condition = grade?.condition || (grade?.fields || []).find((item) => item.key === "condition")?.value;
  return condition ? [String(condition)] : [];
}
export function resolveDifficultyTier(master, run) {
  const campaignId = run?.campaignId;
  const cfg = master?.difficultyTiers?.[campaignId];
  if (!cfg) return { tier: null, tierId: null };
  const raw = run?.difficulty;
  const value = raw === null || raw === undefined || raw === "" ? null : Number(raw);
  if (!Number.isFinite(value)) return { tier: null, tierId: null };
  const tier = cfg.tiers.find((item) => value >= item.minDifficulty && (item.maxDifficulty === null || value <= item.maxDifficulty)) || null;
  return { tier, tierId: tier?.id || cfg.defaultTierId || null };
}

export function applyDifficultyTier(master, run) {
  const { tier, tierId } = resolveDifficultyTier(master, run);
  if (run) run.difficultyTierId = tierId;
  return tier;
}

export function getDifficultyTierLabel(master, run) {
  const campaignId = run?.campaignId;
  const tierId = run?.difficultyTierId;
  const cfg = master?.difficultyTiers?.[campaignId];
  if (!cfg || !tierId) return "未解決";
  const tier = cfg.tiers.find((item) => item.id === tierId);
  return tier ? tier.label : tierId;
}
