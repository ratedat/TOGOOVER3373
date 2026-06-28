export function shouldQuitOnAllWindowsClosed({ platform, startupInProgress }) {
  return platform !== "darwin" && !startupInProgress;
}
