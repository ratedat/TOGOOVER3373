import { clampOverlayScrollSpeed, overlayScrollSpeedDefaults } from "./overlay-config.js";
import { normalizeChoiceFilterIds } from "../domain/choice-filters.js";

export const gridColumnOptions = [1, 2, 3, 4, 5, 6];

export const ocrEngineOptions = Object.freeze([
  { id: "profile", label: "プロファイル既定" },
  { id: "windows", label: "Windows OCR" },
  { id: "windows-paddle", label: "Windows + PaddleOCR" },
  { id: "hybrid", label: "MAA ONNX + PaddleOCR" },
  { id: "windows-glm", label: "Windows + GLM-OCR 検証" },
  { id: "glm-ocr", label: "GLM-OCR 検証" },
]);

const validOcrEngines = new Set(ocrEngineOptions.map((item) => item.id));
const booleanPreferenceFields = [
  "operatorShowSelectedFirst",
  "operatorHideExcluded",
  "operatorSelectedOnly",
  "relicShowSelectedFirst",
  "relicHideExcluded",
  "relicSelectedOnly",
];

export function clampGridColumns(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 2;
  return Math.min(6, Math.max(1, Math.trunc(numeric)));
}

export function normalizeOcrEngine(value) {
  const normalized = String(value || "profile").toLowerCase();
  return validOcrEngines.has(normalized) ? normalized : "profile";
}

function normalizeBoolean(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

export function normalizePreferences(value) {
  const preferences = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  preferences.showUnreleasedOperators = normalizeBoolean(preferences.showUnreleasedOperators);
  preferences.ocrEngine = normalizeOcrEngine(preferences.ocrEngine);
  preferences.operatorSort ||= "rarity_desc";
  preferences.operatorGridColumns = clampGridColumns(preferences.operatorGridColumns ?? 2);
  preferences.relicGridColumns = clampGridColumns(preferences.relicGridColumns ?? 2);
  for (const field of booleanPreferenceFields) preferences[field] = normalizeBoolean(preferences[field]);
  preferences.operatorExcludedIds = normalizeChoiceFilterIds(preferences.operatorExcludedIds);
  preferences.relicExcludedIds = normalizeChoiceFilterIds(preferences.relicExcludedIds);
  for (const [key, fallback] of Object.entries(overlayScrollSpeedDefaults)) {
    preferences[key] = clampOverlayScrollSpeed(preferences[key], fallback);
  }
  return preferences;
}
