import { isAppShellPath } from "../lib/view-route.js";

const localHostnames = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export function isInternalAppUrl(rawUrl, port) {
  const expectedPort = String(Number(port));
  if (!expectedPort || expectedPort === "NaN") return false;
  try {
    const url = new URL(rawUrl);
    const actualPort = url.port || (url.protocol === "http:" ? "80" : "443");
    return url.protocol === "http:"
      && actualPort === expectedPort
      && localHostnames.has(url.hostname.toLowerCase())
      && isAppShellPath(url.pathname);
  } catch {
    return false;
  }
}
