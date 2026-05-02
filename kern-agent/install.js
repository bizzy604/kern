#!/usr/bin/env node
/**
 * kern-agent postinstall script
 *
 * Compiles the Go source into a native binary and places it at ./bin/kern.
 * Requires Go 1.21+ to be installed on the target machine.
 */

const { execSync, spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

const ROOT = __dirname;
const BIN_DIR = path.join(ROOT, "bin");
const BINARY = path.join(BIN_DIR, os.platform() === "win32" ? "kern.exe" : "kern");
const BUILD_ONLY = process.argv.includes("--build-only");

function log(msg) {
  process.stdout.write(`  [kern] ${msg}\n`);
}

function warn(msg) {
  process.stderr.write(`  [kern] ⚠ ${msg}\n`);
}

function error(msg) {
  process.stderr.write(`  [kern] ✗ ${msg}\n`);
}

// Ensure bin/ exists
fs.mkdirSync(BIN_DIR, { recursive: true });

// Check if already built
if (fs.existsSync(BINARY) && !BUILD_ONLY) {
  log(`Binary already exists at ${BINARY}`);
  process.exit(0);
}

// Check for Go
function findGo() {
  const candidates = ["go", "/usr/local/go/bin/go", "/usr/bin/go"];
  const homeGo = path.join(os.homedir(), "go", "bin", "go");
  candidates.push(homeGo);

  for (const candidate of candidates) {
    try {
      const result = spawnSync(candidate, ["version"], { encoding: "utf8" });
      if (result.status === 0) {
        return candidate;
      }
    } catch (_) {}
  }
  return null;
}

const goCmd = findGo();

if (!goCmd) {
  error("Go is not installed or not in PATH.");
  error("Install Go 1.21+ from https://go.dev/dl/ then re-run: npm install");
  process.exit(1);
}

// Check Go version
try {
  const versionOut = execSync(`${goCmd} version`, { encoding: "utf8" }).trim();
  log(`Found ${versionOut}`);
} catch (e) {
  error(`Failed to run go version: ${e.message}`);
  process.exit(1);
}

// Download dependencies
log("Downloading Go dependencies...");
try {
  execSync(`${goCmd} mod download`, {
    cwd: ROOT,
    stdio: "pipe",
    encoding: "utf8",
  });
} catch (e) {
  warn(`go mod download had warnings: ${e.stderr || e.message}`);
}

// Build the binary
log("Compiling kern agent...");
const ldflags = `-s -w -X main.version=1.0.0`;
const buildCmd = `${goCmd} build -ldflags="${ldflags}" -o "${BINARY}" .`;

const result = spawnSync(goCmd, [
  "build",
  `-ldflags=${ldflags}`,
  "-o", BINARY,
  ".",
], {
  cwd: ROOT,
  stdio: "inherit",
  encoding: "utf8",
});

if (result.status !== 0) {
  error("Build failed. See output above.");
  process.exit(1);
}

// Make executable
try {
  fs.chmodSync(BINARY, 0o755);
} catch (_) {}

log(`✓ kern binary compiled to ${BINARY}`);
log(`  Run: kern init   (to set up shell hooks)`);
log(`  Run: kern status (to check your buffer)`);
