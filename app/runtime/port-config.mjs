import { DEFAULT_PORT, normalizePort, readArg } from "./local-server.mjs";

export const DESKTOP_SETTINGS_FILE = "desktop-settings.json";

export function explicitPortValue(args = [], env = {}) {
  return readArg(args, "--port", env.PORT || null);
}

export function shouldPromptForPort(args = [], env = {}, { smokeTest = false } = {}) {
  if (smokeTest) return false;
  return explicitPortValue(args, env) == null;
}

export function parseDesktopSettings(text) {
  try {
    const parsed = JSON.parse(text);
    return { port: parsed?.port ?? null };
  } catch {
    return { port: null };
  }
}

export function serializeDesktopSettings({ port }) {
  return `${JSON.stringify({ port: normalizePort(port) }, null, 2)}\n`;
}

export function resolveStartupPort({ args = [], env = {}, savedPort = null, defaultPort = DEFAULT_PORT } = {}) {
  return normalizePort(explicitPortValue(args, env) ?? savedPort ?? defaultPort);
}
