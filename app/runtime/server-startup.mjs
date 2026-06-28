export function isPortInUseError(error) {
  if (!error) return false;
  if (error.code === "EADDRINUSE") return true;
  return /EADDRINUSE|address already in use/i.test(String(error.message || error));
}

export function nextPortCandidate(value, { defaultPort = 5173, maxPort = 65535 } = {}) {
  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port >= maxPort) return defaultPort;
  return port + 1;
}
