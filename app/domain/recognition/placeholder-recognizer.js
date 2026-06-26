import { fingerprintFrame } from "./fingerprint.js";

export function createMetadataRecognizer() {
  return {
    async classify(frame, { profile } = {}) {
      const knownScreenId = frame?.knownScreenId || frame?.screenId || null;
      const knownScreenIds = new Set(profile?.knownScreenIds || []);
      return {
        known: Boolean(frame?.known || (knownScreenId && knownScreenIds.has(knownScreenId))),
        screenId: knownScreenId,
        confidence: frame?.known ? 1 : (knownScreenId && knownScreenIds.has(knownScreenId) ? 0.95 : 0),
      };
    },
    async recognize(frame) {
      return Array.isArray(frame?.candidates) ? frame.candidates : [];
    },
    async fingerprint(frame, { region } = {}) {
      return fingerprintFrame(frame, region);
    },
  };
}