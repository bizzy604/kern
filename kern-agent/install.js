#!/usr/bin/env node
/**
 * kern postinstall
 *
 * Strategy (in order):
 *  1. Download the pre-built binary for this platform from GitHub Releases.
 *     → No Go required on the target machine.
 *  2. If download fails (offline, CI, unsupported arch) AND Go ≥1.21 is
 *     available, compile from source as a fallback.
 *  3. Otherwise exit with a helpful error message.
 */

"use strict";

const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawnSync } = require("child_process");

// ── Config ──────────────────────────────────────────────────────────────────
const PKG = JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"), "utf8"));
const VERSION = PKG.version;
const REPO = "bizzy604/kern";
const ROOT = __dirname;
const BIN_DIR = path.join(ROOT, "bin");
const IS_WIN = os.platform() === "win32";
// Native binary is saved as kern-native / kern-native.exe so that bin/kern
// (the committed JS shim) is never overwritten and stays clean in git.
const NATIVE_BIN = path.join(BIN_DIR, IS_WIN ? "kern-native.exe" : "kern-native");
const SKIP_VAR = process.env["KERN_SKIP_POSTINSTALL"];
const BUILD_ONLY = process.argv.includes("--build-only");

// ── Helpers ──────────────────────────────────────────────────────────────────
function log(msg) { process.stdout.write(`  [kern] ${msg}\n`); }
function warn(msg) { process.stderr.write(`  [kern] ⚠  ${msg}\n`); }
function fail(msg) { process.stderr.write(`  [kern] ✗  ${msg}\n`); process.exit(1); }

function platformAsset() {
  const plat = os.platform();
  const arch = os.arch();

  const map = {
    "linux-x64":     "kern-linux-x64",
    "linux-arm64":   "kern-linux-arm64",
    "darwin-x64":    "kern-darwin-x64",
    "darwin-arm64":  "kern-darwin-arm64",
    "win32-x64":     "kern-windows-x64.exe",
    "win32-arm64":   "kern-windows-arm64.exe",
  };

  const key = `${plat}-${arch}`;
  return map[key] || null;
}

function downloadFile(url, destPath, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error("Too many redirects"));

    const protocol = url.startsWith("https") ? https : http;
    const req = protocol.get(url, { headers: { "User-Agent": `kern-install/${VERSION}` } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
        return resolve(downloadFile(res.headers.location, destPath, redirects + 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }

      const tmp = destPath + ".tmp";
      const out = fs.createWriteStream(tmp);
      res.pipe(out);
      out.on("finish", () => {
        out.close(() => {
          fs.renameSync(tmp, destPath);
          resolve();
        });
      });
      out.on("error", (err) => {
        fs.unlink(tmp, () => {});
        reject(err);
      });
      res.on("error", reject);
    });

    req.on("error", reject);
    req.setTimeout(30000, () => {
      req.destroy(new Error("Download timed out after 30s"));
    });
  });
}

// On Windows the JS shim (bin/kern) already calls kern-native.exe — nothing
// extra needed. This is a no-op kept for symmetry.
function writeWindowsShim() {
  // bin/kern (JS shim) handles Windows by calling kern-native.exe
}

// ── Go source build fallback ──────────────────────────────────────────────────
function findGo() {
  const candidates = ["go", "/usr/local/go/bin/go", "/usr/bin/go", path.join(os.homedir(), "go", "bin", "go")];
  for (const cmd of candidates) {
    try {
      const r = spawnSync(cmd, ["version"], { encoding: "utf8" });
      if (r.status === 0) return cmd;
    } catch (_) {}
  }
  return null;
}

function buildFromSource(goCmd) {
  log("Compiling kern from source (this may take ~30s)…");
  const ldflags = `-s -w -X main.version=${VERSION}`;
  const result = spawnSync(goCmd, ["build", `-ldflags=${ldflags}`, "-o", NATIVE_BIN, "."], {
    cwd: ROOT,
    stdio: "inherit",
    encoding: "utf8",
  });
  if (result.status !== 0) {
    fail("Source compilation failed. See output above.");
  }
  try { fs.chmodSync(NATIVE_BIN, 0o755); } catch (_) {}
  log(`✓ kern compiled from source → ${NATIVE_BIN}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  fs.mkdirSync(BIN_DIR, { recursive: true });

  if (SKIP_VAR) {
    log("KERN_SKIP_POSTINSTALL set — skipping install.");
    return;
  }

  // Already installed?
  if (!BUILD_ONLY && fs.existsSync(NATIVE_BIN)) {
    try {
      const stat = fs.statSync(NATIVE_BIN);
      if (stat.size > 1024) {
        log(`Binary already installed at ${NATIVE_BIN}`);
        return;
      }
    } catch (_) {}
  }

  const asset = platformAsset();

  // ── Step 1: Try pre-built binary download ──────────────────────────────────
  if (!BUILD_ONLY && asset) {
    const url = `https://github.com/${REPO}/releases/download/v${VERSION}/${asset}`;
    log(`Downloading kern ${VERSION} for ${os.platform()}/${os.arch()}…`);
    log(`  from ${url}`);

    try {
      await downloadFile(url, NATIVE_BIN);
      try { fs.chmodSync(NATIVE_BIN, 0o755); } catch (_) {}
      if (IS_WIN) writeWindowsShim();
      const stat = fs.statSync(NATIVE_BIN);
      if (stat.size < 1024) throw new Error("Downloaded file is too small — likely a 404 page");
      log(`✓ kern ${VERSION} installed (${Math.round(stat.size / 1024)} KB)`);
      log("");
      log("  kern init        — set up shell hooks + open dashboard");
      log("  kern dashboard   — open your KERN dashboard");
      log("  kern status      — check your local buffer");
      return;
    } catch (err) {
      warn(`Pre-built download failed: ${err.message}`);
      warn("Falling back to source compilation…");
    }
  } else if (!asset) {
    warn(`No pre-built binary for ${os.platform()}/${os.arch()} — will try source build.`);
  }

  // ── Step 2: Build from source ──────────────────────────────────────────────
  const goCmd = findGo();
  if (!goCmd) {
    fail(
      `Could not install kern:\n` +
      `  • Pre-built binary download failed or not available for this platform.\n` +
      `  • Go 1.21+ is not installed (required for source build).\n\n` +
      `  Install Go from https://go.dev/dl/ and re-run:  npm install\n` +
      `  Or set KERN_SKIP_POSTINSTALL=1 to skip and install manually.`
    );
  }

  try {
    const vOut = spawnSync(goCmd, ["version"], { encoding: "utf8" }).stdout.trim();
    log(`Found ${vOut} — building from source`);
  } catch (_) {}

  log("Downloading Go module dependencies…");
  spawnSync(goCmd, ["mod", "download"], { cwd: ROOT, stdio: "pipe" });

  buildFromSource(goCmd);
  if (IS_WIN) writeWindowsShim();
}

main().catch((err) => {
  warn(`Unexpected error during install: ${err.message}`);
  process.exit(1);
});
