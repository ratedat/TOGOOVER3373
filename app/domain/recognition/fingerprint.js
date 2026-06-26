import { createHash } from "node:crypto";

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

export function fingerprintFrame(frame, region = null) {
  if (frame && typeof frame === "object" && frame.fingerprint) return String(frame.fingerprint);
  const hash = createHash("sha256");
  if (Buffer.isBuffer(frame)) hash.update(frame);
  else if (frame && Buffer.isBuffer(frame.bytes)) hash.update(frame.bytes);
  else if (typeof frame === "string") hash.update(frame);
  else hash.update(stableStringify(frame ?? ""));
  if (region) hash.update(stableStringify(region));
  return hash.digest("hex");
}

export function fingerprintsEqual(left, right) {
  return Boolean(left) && Boolean(right) && String(left) === String(right);
}

export function hasReachedScrollEnd(fingerprints, stableCount = 1) {
  if (!Array.isArray(fingerprints) || fingerprints.length < stableCount + 1) return false;
  const tail = fingerprints.slice(-(stableCount + 1));
  return tail.every((value) => fingerprintsEqual(value, tail[0]));
}