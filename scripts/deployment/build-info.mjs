#!/usr/bin/env node
// TERAGON AI BUSINESS OS — build-metadata computer (Phase 10, W9-D).
// =============================================================================
// Computes the app version + commit and prints them as VITE_* env assignments.
// The client (src/system-health/buildInfo.ts) reads VITE_APP_VERSION and
// VITE_BUILD_COMMIT via import.meta.env and reports them on the System Health /
// Settings screens (until supplied it honestly shows "לא סופק בזמן build").
//
// This script INTENTIONALLY does not mutate vite.config.ts (shared, W9-D may not
// edit it) and never writes secrets. It supports two integration paths:
//
//   A) Netlify [build.environment] — recommended, zero code change:
//      Netlify already exposes COMMIT_REF + the deploy context. Wiring the two
//      VITE_ vars in netlify.toml's [build.environment] (or the Netlify UI) is
//      enough because Vite bundles any VITE_-prefixed process env at build time.
//      This script prints the exact values to paste / inspect.
//
//   B) vite.config.ts `define` — the Integration Lead adds two defines fed by
//      these values (exact diff in docs/integration-requests-w9d.md).
//
// Usage:
//   node scripts/deployment/build-info.mjs            # human-readable summary
//   node scripts/deployment/build-info.mjs --env      # dotenv lines (VITE_*=…)
//   node scripts/deployment/build-info.mjs --json     # JSON
//
// Value sources (first non-empty wins), so it works both on Netlify and locally:
//   version : npm_package_version → package.json "version" → "0.0.0"
//   commit  : COMMIT_REF (Netlify) → git rev-parse --short HEAD → "unknown"
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import process from "node:process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function pkgVersion() {
  if (process.env.npm_package_version) return process.env.npm_package_version;
  try {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    return typeof pkg.version === "string" && pkg.version.trim() !== "" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function gitCommit() {
  // Netlify sets COMMIT_REF (full SHA); prefer a short form of it.
  if (process.env.COMMIT_REF) return process.env.COMMIT_REF.slice(0, 12);
  try {
    return execFileSync("git", ["rev-parse", "--short=12", "HEAD"], {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 10_000,
    }).trim();
  } catch {
    return "unknown";
  }
}

const info = { VITE_APP_VERSION: pkgVersion(), VITE_BUILD_COMMIT: gitCommit() };

const mode = process.argv[2];
if (mode === "--json") {
  process.stdout.write(JSON.stringify(info) + "\n");
} else if (mode === "--env") {
  process.stdout.write(`VITE_APP_VERSION=${info.VITE_APP_VERSION}\n`);
  process.stdout.write(`VITE_BUILD_COMMIT=${info.VITE_BUILD_COMMIT}\n`);
} else {
  console.log("=== build-info (W9-D) ===");
  console.log(`VITE_APP_VERSION = ${info.VITE_APP_VERSION}`);
  console.log(`VITE_BUILD_COMMIT = ${info.VITE_BUILD_COMMIT}`);
  console.log("");
  console.log("Path A (Netlify, no code change): set these in netlify.toml");
  console.log("  [build.environment] or the Netlify UI — Vite bundles VITE_* at build.");
  console.log("Path B (vite define): apply the diff in docs/integration-requests-w9d.md.");
}
