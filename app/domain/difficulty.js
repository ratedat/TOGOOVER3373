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