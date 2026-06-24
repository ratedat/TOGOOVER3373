export const html = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

export function stableJson(value, ignoredKeys = new Set()) {
  return JSON.stringify(value, (key, item) => {
    if (ignoredKeys.has(key)) return undefined;
    if (!item || typeof item !== "object" || Array.isArray(item)) return item;
    return Object.keys(item).sort().reduce((result, objectKey) => {
      result[objectKey] = item[objectKey];
      return result;
    }, {});
  });
}

export function stableOverlayStateJson(value) {
  return stableJson(value, new Set(["updatedAt"]));
}

export const normalizeText = (value) => String(value ?? "").toLowerCase().replace(/\s+/g, "");
export const assetUrl = (localPath) => localPath ? `/${String(localPath).replaceAll("\\", "/")}` : "";
export const stars = (rarity) => "★".repeat(Number(rarity) || 0);