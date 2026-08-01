#!/usr/bin/env node
// TERAGON AI BUSINESS OS — read-only live API-key classification probe (S7.0.2).
// =============================================================================
// A tightly-controlled, READ-ONLY probe against an EXISTING staging project. It
// authenticates via the CLI session and calls the hardened, non-logging adapter
// to (1) verify the project identity and (2) retrieve + classify the project's
// API keys. It performs ZERO mutations: no create/link/migrate/netlify/deploy,
// and it NEVER sets APPLY_STAGING.
//
// It prints ONLY the safe fields below — no keys, no key prefixes, no JWT
// payloads, no raw JSON, no stdout/stderr from the key command, no config-
// revealing names (ref/org/region values are compared, never printed):
//   • project identity verified: YES|NO
//   • returned record count
//   • browser classification source: PUBLISHABLE|ANON_LEGACY
//   • server classification source:  SECRET|SERVICE_ROLE_LEGACY
//   • classification result: PASS|FAIL
//   • remote mutations: ZERO
//
// Usage: node scripts/platform/probe-keys.mjs [--ref <ref>]
// The ref defaults to SUPABASE_PROJECT_REF from the credential provider.
import process from "node:process";
import { createCredentialProvider } from "./shared/credentials.mjs";
import { createSupabaseAdapter } from "./shared/adapters/supabase.mjs";
import { classifyProjectKeys } from "./shared/keys.mjs";

const EXPECTED_NAME = "teragon-staging";
const EXPECTED_ORG = "vthlolcsedczobrxiacs";
const EXPECTED_REGION = "eu-central-1";

function argRef() {
  const i = process.argv.indexOf("--ref");
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const credentials = createCredentialProvider();
  const ref = argRef() ?? credentials.get("SUPABASE_PROJECT_REF") ?? "bjvirkmagwpqroakazjj";
  const supabase = createSupabaseAdapter({ credentials: credentials.get });

  // 1. identity verification (read-only) — compare, never print, the values.
  let identityVerified = false;
  try {
    const health = await supabase.getProjectHealth(ref);
    const p = health.project ?? {};
    identityVerified =
      health.found &&
      String(p.name ?? "") === EXPECTED_NAME &&
      String(p.organization_id ?? p.orgId ?? "") === EXPECTED_ORG &&
      String(p.region ?? "") === EXPECTED_REGION;
  } catch {
    identityVerified = false;
  }

  // 2. retrieve + classify (read-only). Raw response stays private.
  let recordCount = 0;
  let browserSource = "n/a";
  let serverSource = "n/a";
  let pass = false;
  try {
    const apiKeys = await supabase.getProjectApiKeys(ref);
    recordCount = Array.isArray(apiKeys) ? apiKeys.length : 0;
    const classified = classifyProjectKeys(apiKeys);
    browserSource = classified.browser.source;
    serverSource = classified.server.source;
    pass = true;
  } catch {
    pass = false;
  }

  // SAFE output ONLY.
  process.stdout.write(
    [
      `project identity verified: ${identityVerified ? "YES" : "NO"}`,
      `returned record count: ${recordCount}`,
      `browser classification source: ${browserSource}`,
      `server classification source: ${serverSource}`,
      `classification result: ${pass ? "PASS" : "FAIL"}`,
      `remote mutations: ZERO`,
      "",
    ].join("\n"),
  );
  // Clear any runtime material and exit.
  credentials.clearRuntime();
  process.exit(pass && identityVerified ? 0 : 1);
}

main().catch(() => {
  // Never leak — emit only a safe failure line.
  process.stdout.write("classification result: FAIL\nremote mutations: ZERO\n");
  process.exit(1);
});
