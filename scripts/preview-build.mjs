#!/usr/bin/env node
// Gate S7.3B-PREP — deterministic Preview-context build.
//
// Reads the SINGLE SOURCE of the public Preview contract (netlify.toml
// [context.deploy-preview.environment]) and builds with exactly those VITE_*
// values baked in — the same public contract Netlify's Deploy Preview resolves.
// It does NOT duplicate public values into other files. Records SAFE provenance
// (commit / node / npm / build-cmd / dist checksum / provider / masked ref) to
// ci-artifacts/preview-build.json. NEVER prints the anon/publishable key value.
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function parsePreviewEnv() {
  const text = readFileSync("netlify.toml", "utf8");
  const sec = /\[context\.deploy-preview\.environment\]([\s\S]*?)(\n\[|$)/.exec(text);
  const env = {};
  if (sec) {
    for (const line of sec[1].split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*"(.*)"\s*$/.exec(line);
      if (m) env[m[1]] = m[2];
    }
  }
  return env;
}

const previewEnv = parsePreviewEnv();
const required = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "VITE_SUPABASE_ORG",
  "VITE_PERSISTENCE_PROVIDER",
];
const missing = required.filter((k) => !previewEnv[k]);
if (missing.length) {
  console.error(`[preview-build] netlify.toml deploy-preview env missing: ${missing.join(", ")}`);
  process.exit(1);
}
if (previewEnv.VITE_PERSISTENCE_PROVIDER !== "SUPABASE") {
  console.error("[preview-build] Preview contract must set VITE_PERSISTENCE_PROVIDER=SUPABASE.");
  process.exit(1);
}
if (previewEnv.VITE_SUPABASE_ORG !== "org-teragon") {
  console.error("[preview-build] Preview contract must set VITE_SUPABASE_ORG=org-teragon.");
  process.exit(1);
}

const commit = execSync("git rev-parse --short=12 HEAD").toString().trim();
const node = process.version;
const npm = execSync("npm -v").toString().trim();
const buildCmd = "npm run build";

const buildEnv = { ...process.env, ...previewEnv, VITE_BUILD_COMMIT: commit };
console.log(`[preview-build] building commit ${commit} (provider=SUPABASE, org=org-teragon)…`);
execSync(buildCmd, { stdio: "inherit", env: buildEnv });

// Deterministic checksum over all dist files (sorted).
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out.sort();
}
const hash = createHash("sha256");
for (const f of walk("dist")) hash.update(f.replace(/\\/g, "/")).update(readFileSync(f));
const distChecksum = hash.digest("hex");

const refMatch = /https:\/\/([a-z0-9]+)\.supabase\.co/i.exec(previewEnv.VITE_SUPABASE_URL);
const ref = refMatch ? refMatch[1] : "";
const maskedRef = ref.length <= 8 ? ref : `${ref.slice(0, 4)}…${ref.slice(-4)}`;

mkdirSync("ci-artifacts", { recursive: true });
const provenance = {
  commit,
  node,
  npm,
  buildCmd,
  provider: previewEnv.VITE_PERSISTENCE_PROVIDER,
  org: previewEnv.VITE_SUPABASE_ORG,
  maskedRef,
  projectRef: ref, // public project ref (not a secret)
  distChecksum,
  builtAt: new Date().toISOString(),
};
writeFileSync("ci-artifacts/preview-build.json", JSON.stringify(provenance, null, 2));
console.log(
  `[preview-build] OK commit=${commit} provider=SUPABASE ref=${maskedRef} dist-sha256=${distChecksum.slice(0, 16)}…`,
);
