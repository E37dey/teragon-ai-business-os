#!/usr/bin/env node
// TERAGON AI BUSINESS OS — Gate S9.2-A1d2a-1B1: fail-closed live customer runner
// (`npm run test:domains:live`). Pure, injectable preflight + dry-run; thin
// entrypoint that runs the DEDICATED Playwright config once and enforces the
// safe report. The live suite (e2e/live-domains/*.live.ts) is NOT discoverable
// by the default vitest/playwright commands (non-spec suffix + dedicated config).
import process from "node:process";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

export const STAGING_REF = "bjvirkmagwpqroakazjj";
export const LIVE_CONFIG = "e2e/live-domains.config.ts";
export const REPORT_PATH = "e2e/live-domains/_report.json";
export const REQUIRED_ENV = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "TERAGON_ADMIN_EMAIL",
  "TERAGON_ADMIN_PASSWORD",
  "ACCEPTANCE_BASE_URL",
];
/** Any ONE of these satisfies the browser publishable/anon-key requirement. */
export const PUBLISHABLE_NAMES = ["SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY"];

export function refFromUrl(url) {
  const m = /https:\/\/([a-z0-9]+)\.supabase\.co/i.exec(String(url ?? ""));
  return m ? m[1] : "";
}
export function maskRef(ref) {
  return !ref ? "-" : ref.length <= 8 ? ref : `${ref.slice(0, 4)}…${ref.slice(-4)}`;
}

/** The fixture + cleanup plan the run will execute (documented, no values). */
export function fixturePlan(env) {
  return {
    fixture: [
      "provision: Admin API createUser (second-org NON-admin) + profile + membership + N customers, all accrun-<runId>-prefixed",
      "browser: admin login + second-org user login (publishable key only)",
    ],
    cleanup: ["always delete customers → membership → profile → user; verify absent; cleanup failure fails the run"],
    fixtureUser: env.TERAGON_ADMIN_EMAIL ? "second-org fixture (email in env, value not shown)" : "(pending env)",
  };
}

/** Fail-closed gate evaluation — pure. `deps` inject provider/commit/adapter. */
export function preflight(env, deps = {}) {
  const problems = [];
  if (env.STAGING_DOMAINS_LIVE !== "1") problems.push("STAGING_DOMAINS_LIVE=1 required (this harness never skips)");
  for (const name of REQUIRED_ENV) if (!env[name]) problems.push(`missing required env name: ${name}`);
  if (!PUBLISHABLE_NAMES.some((n) => env[n])) problems.push(`missing publishable/anon key (one of ${PUBLISHABLE_NAMES.join(" | ")})`);

  const provider = deps.provider ?? "SUPABASE";
  if (provider !== "SUPABASE") problems.push(`provider must be SUPABASE (got ${provider})`);

  const ref = refFromUrl(env.SUPABASE_URL);
  if (ref !== STAGING_REF) problems.push(`project ref must be ${maskRef(STAGING_REF)} (got ${maskRef(ref)})`);

  const commit = deps.commit ?? env.INTENDED_COMMIT ?? "";
  if (!commit) problems.push("commit/provenance unavailable (INTENDED_COMMIT)");

  const leaked = Object.keys(env).filter((k) => /^VITE_/.test(k) && /(SERVICE_ROLE|SECRET)/i.test(k));
  if (leaked.length) problems.push(`service_role must not be VITE_-exposed: ${leaked.join(",")}`);

  if (deps.adapter && (typeof deps.adapter.deleteUser !== "function" || typeof deps.adapter.deleteCustomer !== "function"))
    problems.push("cleanup support unavailable (adapter missing delete methods)");

  return { ok: problems.length === 0, problems, provider, maskedRef: maskRef(ref), commit };
}

/**
 * Dry-run: validate env NAMES (never values), the project/provider/commit
 * contract, and the fixture + cleanup plans. Performs ZERO network, ZERO
 * createUser, ZERO db writes/deletes. Returns a safe report.
 */
export function dryRun(env, deps = {}) {
  const pf = preflight(env, deps);
  const plan = fixturePlan(env);
  return {
    mode: "dry-run",
    ok: pf.ok,
    problems: pf.problems,
    provider: pf.provider,
    maskedRef: pf.maskedRef,
    commit: pf.commit,
    envPresent: Object.fromEntries([...REQUIRED_ENV].map((n) => [n, Boolean(env[n])])),
    publishablePresent: PUBLISHABLE_NAMES.some((n) => Boolean(env[n])),
    fixturePlan: plan.fixture,
    cleanupPlan: plan.cleanup,
    mutations: { createUser: 0, dbWrites: 0, deletes: 0, staging: 0 },
  };
}

/** Read the safe report the live suite wrote (never contains secrets). */
export function readReport(deps = {}) {
  const path = deps.reportPath ?? REPORT_PATH;
  const exists = deps.existsSync ?? existsSync;
  const read = deps.readFileSync ?? readFileSync;
  if (!exists(path)) return null;
  try {
    return JSON.parse(read(path, "utf8"));
  } catch {
    return null;
  }
}

/** Fail-hard evaluation of a finished run's report. */
export function evaluateReport(rep) {
  if (!rep) return { ok: false, reason: "no report written (suite did not run / crashed)" };
  if (rep.executed === 0) return { ok: false, reason: "zero tests executed" };
  if (rep.skipped > 0) return { ok: false, reason: `${rep.skipped} skipped (skips are forbidden)` };
  if (rep.failed > 0) return { ok: false, reason: `${rep.failed} failed` };
  if (rep.cleanup !== "ok") return { ok: false, reason: `cleanup=${rep.cleanup}` };
  return { ok: true, reason: "all required live customer checks passed" };
}

// --- thin entrypoint ---------------------------------------------------------
function line(o) {
  return `[domains:live] mode=${o.mode ?? "live"} ok=${o.ok} ref=${o.maskedRef} commit=${(o.commit || "").slice(0, 12)} problems=${(o.problems ?? []).length}`;
}

async function main() {
  const env = process.env;
  if (env.STAGING_DOMAINS_DRY_RUN === "1") {
    const rep = dryRun(env);
    console.log(line(rep));
    console.log(`[domains:live] dry-run mutations createUser=${rep.mutations.createUser} dbWrites=${rep.mutations.dbWrites} deletes=${rep.mutations.deletes}`);
    for (const p of rep.problems) console.error(`  - ${p}`);
    process.exit(rep.ok ? 0 : 2);
  }

  const pf = preflight(env, { commit: env.INTENDED_COMMIT });
  if (!pf.ok) {
    console.error(line({ ...pf, mode: "preflight" }));
    for (const p of pf.problems) console.error(`  - ${p}`);
    process.exit(2); // fail BEFORE any mutation
  }

  const run = spawnSync("npx", ["playwright", "test", "-c", LIVE_CONFIG], { stdio: "inherit", shell: true, env: process.env });
  const rep = readReport();
  const verdict = evaluateReport(rep);
  if (rep) {
    console.log(
      `[domains:live] files=${rep.files} executed=${rep.executed} passed=${rep.passed} failed=${rep.failed} skipped=${rep.skipped} cleanup=${rep.cleanup} idb(open/read/write)=${rep.idbOpen}/${rep.idbRead}/${rep.idbWrite} ref=${rep.maskedRef} commit=${rep.observedCommit}`,
    );
  }
  if (run.status !== 0 || !verdict.ok) {
    console.error(`[domains:live] FAIL — ${verdict.reason}`);
    process.exit(1);
  }
  console.log(`[domains:live] PASS — ${verdict.reason}`);
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("run-domains-live.mjs")) {
  main().catch((err) => {
    console.error(`[domains:live] runner error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
