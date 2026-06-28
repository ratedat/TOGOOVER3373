function compactParts(parts) {
  return parts.map((part) => part == null || part === "" ? "_" : String(part)).join(":");
}

export function recognitionCandidateKey(candidate = {}) {
  const kind = candidate.kind || candidate.type || "unknown";
  if (kind === "runStatus") return compactParts([kind, candidate.field || candidate.name || candidate.rawText, candidate.value]);
  if (kind === "operator") return compactParts([kind, candidate.operatorId || candidate.name || candidate.rawText]);
  if (kind === "relic") return compactParts([kind, candidate.relicId || candidate.name || candidate.rawText]);
  if (kind === "revelation") return compactParts([kind, candidate.campaignId, candidate.fieldId, candidate.slotKind, candidate.effectId || candidate.name, candidate.stateId]);
  if (kind === "thought") return compactParts([kind, candidate.campaignId, candidate.thoughtId || candidate.name, candidate.stateId, candidate.conditionId]);
  if (kind === "age") return compactParts([kind, candidate.campaignId, candidate.ageId || candidate.name]);
  if (kind === "coin") return compactParts([kind, candidate.campaignId, candidate.coinId || candidate.name, candidate.statusId, candidate.face, candidate.count]);
  return compactParts([kind, candidate.id || candidate.name || candidate.rawText || JSON.stringify(candidate)]);
}

export function dedupeRecognitionCandidates(candidates = []) {
  const byKey = new Map();
  for (const candidate of candidates) {
    const key = recognitionCandidateKey(candidate);
    const previous = byKey.get(key);
    if (!previous || Number(candidate.confidence || 0) > Number(previous.confidence || 0)) {
      byKey.set(key, { ...candidate, recognitionKey: key });
    }
  }
  return [...byKey.values()];
}

function suggestionValue(candidate) {
  if (candidate.value) return candidate.value;
  if (candidate.kind === "runStatus") return [candidate.label || candidate.field, candidate.value].filter((part) => part != null && part !== "").join(" ");
  if (candidate.kind === "operator") return candidate.name || candidate.operatorId || candidate.rawText || "";
  if (candidate.kind === "coin") {
    const count = candidate.count == null ? "?" : candidate.count;
    return [candidate.name || candidate.coinId, candidate.statusName || candidate.statusId, candidate.face, `${count}枚`].filter(Boolean).join(" / ");
  }
  if (candidate.kind === "age") return candidate.name || candidate.ageId || candidate.rawText || "";
  return candidate.name || candidate.rawText || candidate.id || "";
}

function suggestionLabel(candidate, profile) {
  const prefix = profile?.label || profile?.id || "ADBスキャン";
  const kindLabels = {
    runStatus: "基本情報候補",
    operator: "オペレーター候補",
    relic: "秘宝候補",
    revelation: "啓示候補",
    thought: "思案候補",
    age: "時代候補",
    coin: "通宝候補",
  };
  return `${prefix}: ${kindLabels[candidate.kind] || "認識候補"}`;
}

export function buildRecognitionSuggestions(candidates = [], scanMeta = {}) {
  const unique = dedupeRecognitionCandidates(candidates);
  return unique.map((candidate) => {
    const key = candidate.recognitionKey || recognitionCandidateKey(candidate);
    return {
      id: `recognition:${scanMeta.scanId || "scan"}:${key}`,
      type: "recognition",
      source: scanMeta.source || "adb",
      profileId: scanMeta.profile?.id || scanMeta.profileId || null,
      target: candidate.kind || candidate.type || "unknown",
      label: suggestionLabel(candidate, scanMeta.profile),
      rawText: candidate.rawText || suggestionValue(candidate),
      value: suggestionValue(candidate),
      confidence: candidate.confidence ?? null,
      needsReview: candidate.needsReview !== false,
      recognitionKey: key,
      candidate,
      createdAt: scanMeta.createdAt || new Date().toISOString(),
    };
  });
}

export function mergePendingRecognitionSuggestions(existing = [], additions = []) {
  const byKey = new Map();
  for (const suggestion of existing) {
    const key = suggestion.recognitionKey || suggestion.id || JSON.stringify(suggestion);
    byKey.set(key, suggestion);
  }
  for (const suggestion of additions) {
    const key = suggestion.recognitionKey || suggestion.id || JSON.stringify(suggestion);
    byKey.set(key, suggestion);
  }
  return [...byKey.values()];
}

export function appendRecognitionSuggestionsToState(state, suggestions = []) {
  const next = structuredClone(state);
  next.pendingSuggestions = mergePendingRecognitionSuggestions(next.pendingSuggestions || [], suggestions);
  return next;
}