export const stateUrl = "/api/state";
export const masterUrl = "/api/master";
export const resetStateUrl = "/api/state/reset";
export const recognitionScanUrl = "/api/recognition/scan";
export const recognitionScanCancelUrl = "/api/recognition/scan/cancel";
export const recognitionScanStatusUrl = "/api/recognition/scan/status";
export const adbDetectUrl = "/api/adb/detect";
export const adbTestUrl = "/api/adb/test";
export const adbSelectPathUrl = "/api/adb/select-path";

export async function apiJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}