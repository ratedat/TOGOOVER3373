import { normalizePort, normalizeView, readArg } from "./local-server.mjs";

export function launchRequestData({ port, view } = {}) {
  return {
    port: normalizePort(port),
    view: normalizeView(view),
  };
}

export function resolveSecondInstanceView(commandLine = [], additionalData = {}, fallback = "control-v2") {
  return normalizeView(additionalData?.view ?? readArg(commandLine, "--view", fallback));
}