import {
  appUrl,
  DEFAULT_PORT,
  hasFlag,
  normalizePort,
  normalizeView,
  openExternalUrl,
  readArg,
  startLocalServer,
  stopLocalServer,
  waitForReady,
} from "./runtime/local-server.mjs";

const port = normalizePort(readArg(process.argv, "--port", process.env.PORT || DEFAULT_PORT));
const view = normalizeView(readArg(process.argv, "--view", "control"));
const noOpen = hasFlag(process.argv, "--no-open") || process.env.ARKNIGHTS_APP_NO_OPEN === "1";
const exitAfterReady = hasFlag(process.argv, "--exit-after-ready");
const targetUrl = appUrl(port, view);
const server = startLocalServer({ port });

server.stdout.on("data", (chunk) => process.stdout.write(chunk));
server.stderr.on("data", (chunk) => process.stderr.write(chunk));

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  stopLocalServer(server);
  setTimeout(() => process.exit(code), 150).unref();
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
server.on("exit", (code) => {
  if (!shuttingDown) process.exit(code ?? 1);
});

try {
  await waitForReady(targetUrl);
  console.log(`App: ${targetUrl}`);
  if (!noOpen) openExternalUrl(targetUrl);
  if (exitAfterReady) shutdown(0);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  shutdown(1);
}