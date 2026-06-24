export const stateUrl = "/api/state";
export const masterUrl = "/api/master";
export const resetStateUrl = "/api/state/reset";

export async function apiJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}