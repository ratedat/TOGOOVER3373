import { execFile } from "node:child_process";

function adbArgs(serial, args) {
  return serial ? ["-s", serial, ...args] : args;
}

function serviceError(status, message, details = {}) {
  return Object.assign(new Error(message), { status, details });
}

function normalizeAdbError(error, { adbPath, args } = {}) {
  const message = String(error?.message || "");
  const stderr = String(error?.stderr || "");
  const combined = `${message}\n${stderr}`;
  if (error?.code === "ENOENT") {
    return serviceError(503, `ADB executable was not found: ${adbPath}. Set ARKNIGHTS_ADB_PATH or install Android platform-tools.`, {
      code: "adb_not_found",
      adbPath,
    });
  }
  if (/no devices\/emulators found|device ['\"]?[^'\"]+['\"]? not found/i.test(combined)) {
    return serviceError(503, "ADB device was not found. Start the emulator and confirm adb devices can see it.", {
      code: "adb_no_device",
      adbPath,
    });
  }
  if (/device offline/i.test(combined)) {
    return serviceError(503, "ADB device is offline. Reconnect the emulator or restart ADB, then try again.", {
      code: "adb_device_offline",
      adbPath,
    });
  }
  if (/more than one device\/emulator/i.test(combined)) {
    return serviceError(409, "Multiple ADB devices were found. Set ARKNIGHTS_ADB_SERIAL to choose the emulator.", {
      code: "adb_multiple_devices",
      adbPath,
    });
  }
  return serviceError(502, "ADB command failed before recognition could start.", {
    code: "adb_command_failed",
    adbPath,
    args,
    stderr: stderr.trim() || null,
  });
}

function parseWmSize(output) {
  const match = String(output).match(/(?:Physical size|Override size):\s*(\d+)x(\d+)/i) || String(output).match(/(\d+)x(\d+)/);
  if (!match) throw new Error(`unable to parse adb wm size: ${output}`);
  return { width: Number(match[1]), height: Number(match[2]) };
}

export function createAdbAdapter({ adbPath = process.env.ARKNIGHTS_ADB_PATH || "adb", serial = process.env.ARKNIGHTS_ADB_SERIAL || "" } = {}) {
  function run(args, { encoding = "utf8" } = {}) {
    return new Promise((resolve, reject) => {
      execFile(adbPath, adbArgs(serial, args), { encoding, maxBuffer: 64 * 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
        if (error) {
          error.stderr = stderr;
          reject(normalizeAdbError(error, { adbPath, args }));
          return;
        }
        resolve(stdout);
      });
    });
  }

  return {
    async getActualResolution() {
      return parseWmSize(await run(["shell", "wm", "size"]));
    },
    async capture(meta = {}) {
      const bytes = await run(["exec-out", "screencap", "-p"], { encoding: "buffer" });
      return { bytes, capturedAt: new Date().toISOString(), ...meta };
    },
    async tap(point) {
      await run(["shell", "input", "tap", String(Math.round(point.x)), String(Math.round(point.y))]);
    },
    async swipe(swipe) {
      await run([
        "shell",
        "input",
        "swipe",
        String(Math.round(swipe.start.x)),
        String(Math.round(swipe.start.y)),
        String(Math.round(swipe.end.x)),
        String(Math.round(swipe.end.y)),
        String(Math.round(swipe.durationMs ?? 350)),
      ]);
    },
    async back() {
      await run(["shell", "input", "keyevent", "KEYCODE_BACK"]);
    },
    async wait(ms) {
      await new Promise((resolve) => setTimeout(resolve, ms));
    },
  };
}