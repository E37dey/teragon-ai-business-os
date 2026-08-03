// TERAGON AI BUSINESS OS — Gate S9.2-A1d2a-1B1: fail-closed live customer runner
// (`npm run test:domains:live`). Pure, injectable preflight + dry-run; thin
// entrypoint that runs the DEDICATED Playwright config once and enforces the
// safe report. The live suite (e2e/live-domains/*.live.ts) is NOT discoverable
// by the default vitest/playwright commands (non-spec suffix + dedicated config).
import process from "node:process";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createLiveCustomerAdmin } from "../platform/shared/adapters/live-customer-admin.mjs";
import { withCustomerFixtures } from "../platform/live-customer-fixtures.mjs";

export const STAGING_REF = "bjvirkmagwpqroakazjj";
export const LIVE_CONFIG = "e2e/live-domains.config.ts";
export const REPORT_PATH = "e2e/live-domains/_report.json";
export const PW_JSON_PATH = "e2e/live-domains/_pw.json";
export const IDB_PATH = "e2e/live-domains/_idb.json";
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

/**
 * Normalize a NON-PASSWORD credential by stripping ALL whitespace. URLs and
 * Supabase keys (JWT / sb_*) never contain legitimate whitespace, so this safely
 * repairs newline/CR/space contamination introduced when a secret is pasted into
 * the GitHub UI. NEVER applied to the admin password (which may contain spaces
 * and must not be altered).
 */
export function normalizeCred(v) {
  return String(v ?? "").replace(/\s+/g, "");
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

/** Redact any key/jwt material from a category string. */
export function safeAuthCategory(err) {
  const status = err?.status ?? err?.code;
  const msg = String(err?.message ?? "").toLowerCase();
  if (msg.includes("invalid") && (msg.includes("credential") || msg.includes("login") || msg.includes("password"))) return "invalid_credentials";
  if (String(status) === "400" || msg.includes("invalid")) return "invalid_credentials";
  if (msg.includes("email not confirmed") || msg.includes("not confirmed")) return "email_not_confirmed";
  if (msg.includes("network") || msg.includes("fetch")) return "network";
  return "auth_error";
}

/**
 * The error's CLASS only — never its message. Stripped to letters so no value,
 * path or token fragment can ride along. Distinguishes a real credential
 * rejection (`AuthApiError`) from a runtime/environment fault (`TypeError`),
 * which `safeAuthCategory` alone flattens into an indistinguishable
 * `auth_error`.
 */
export function safeErrorName(e) {
  const n = String(e?.name ?? e?.constructor?.name ?? "").replace(/[^A-Za-z]/g, "");
  return n ? n.slice(0, 40) : "unknown";
}

/**
 * Server-side admin login preflight — the AUTHORITATIVE credential check BEFORE
 * any browser run. Uses the publishable/anon client only, signs in with the exact
 * workflow env, then immediately signs out. Never logs email/password/session.
 * @returns {Promise<{pass:boolean, category:string}>}
 */
export async function adminPreflight(env, deps = {}) {
  const url = normalizeCred(env.SUPABASE_URL);
  const anonKey = normalizeCred(env.SUPABASE_ANON_KEY ?? env.SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_ANON_KEY);
  if (!url || !anonKey || !env.TERAGON_ADMIN_EMAIL || !env.TERAGON_ADMIN_PASSWORD)
    return { pass: false, category: "missing_env" };
  let client;
  try {
    if (deps.clientFactory) client = deps.clientFactory();
    else {
      const { createClient } = await import("@supabase/supabase-js");
      client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    }
    const { data, error } = await client.auth.signInWithPassword({
      email: String(env.TERAGON_ADMIN_EMAIL).trim(),
      password: env.TERAGON_ADMIN_PASSWORD, // NEVER trimmed/altered
    });
    if (error || !data?.session) return { pass: false, category: safeAuthCategory(error) };
    try { await client.auth.signOut(); } catch { /* discard */ }
    return { pass: true, category: "ok" };
  } catch (e) {
    return { pass: false, category: safeAuthCategory(e) };
  }
}

/**
 * NON-MUTATING full preflight for the GitHub-hosted check: verifies the target,
 * that the service-role Admin API can LOCATE the existing administrator and that
 * the admin is email-confirmed, and that the admin password authenticates via the
 * anon client. Reads only (listUsers) + signIn/signOut — creates NOTHING.
 * @returns {Promise<{targetVerified:boolean, adminFound:boolean, emailConfirmed:boolean, serviceRoleAccess:boolean, passwordAuth:boolean, category:string}>}
 */
export async function fullPreflight(env, deps = {}) {
  const out = { targetVerified: false, adminFound: false, emailConfirmed: false, serviceRoleAccess: false, passwordAuth: false, category: "" };
  out.targetVerified = refFromUrl(normalizeCred(env.SUPABASE_URL)) === STAGING_REF;
  if (!out.targetVerified) { out.category = "ref_mismatch"; return out; }
  const email = String(env.TERAGON_ADMIN_EMAIL ?? "").trim();
  try {
    let svc = deps.serviceFactory ? deps.serviceFactory() : null;
    if (!svc) {
      const { createClient } = await import("@supabase/supabase-js");
      svc = createClient(normalizeCred(env.SUPABASE_URL), normalizeCred(env.SUPABASE_SERVICE_ROLE_KEY), { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    }
    let user = null;
    for (let p = 1; p <= 25; p++) {
      const { data, error } = await svc.auth.admin.listUsers({ page: p, perPage: 200 });
      if (error) throw error;
      out.serviceRoleAccess = true;
      const us = data?.users ?? [];
      const u = us.find((x) => (x.email || "").toLowerCase() === email.toLowerCase());
      if (u) { user = u; break; }
      if (us.length < 200) break;
    }
    out.adminFound = Boolean(user);
    out.emailConfirmed = Boolean(user && (user.email_confirmed_at || user.confirmed_at));
  } catch (e) {
    out.category = safeAuthCategory(e);
  }
  const ap = await adminPreflight(env, deps.anonFactory ? { clientFactory: deps.anonFactory } : {});
  out.passwordAuth = ap.pass;
  if (!ap.pass && !out.category) out.category = ap.category;
  return out;
}

// --- S9.2-A1d2a GitHub-hosted credential forensics (safe: no secret content) --
/** Structural contamination booleans for a raw value — reveals NO content. */
export function structural(raw) {
  const v = raw == null ? "" : String(raw);
  return {
    present: v.length > 0,
    nonEmpty: v.trim().length > 0,
    hasNewline: /\n/.test(v),
    hasCR: /\r/.test(v),
    leadingTrailingWs: v.length !== v.trim().length,
    surroundingQuotes: /^["'][\s\S]*["']$/.test(v),
    looksLikeAssignment: /^[A-Z_][A-Z0-9_]*=/.test(v.trim()),
  };
}

/** Expected-format class for the URL (no content revealed). */
export function classifyUrl(u) {
  const v = (u ?? "").trim();
  if (!/^https:\/\//i.test(v)) return "not_https";
  const m = /^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/i.exec(v);
  if (!m) return "unexpected_host_format";
  return m[1] === STAGING_REF ? "expected_project_host" : "unexpected_project";
}

/** Decode a JWT's UNVERIFIED claims — reports only role/ref-match/expired. */
function jwtClaims(v, nowMs) {
  try {
    const json = JSON.parse(Buffer.from(v.split(".")[1], "base64url").toString("utf8"));
    return { claimedRole: json.role ?? null, refExpected: (json.ref ?? "") === STAGING_REF, expired: typeof json.exp === "number" ? json.exp * 1000 < nowMs : null };
  } catch { return { claimedRole: null, refExpected: null, expired: null }; }
}

/** Key class + safe claims (no value/prefix/length revealed). */
export function classifyKey(k, expectRole, nowMs) {
  const v = (k ?? "").trim();
  if (/^sb_publishable_/.test(v)) return { klass: "publishable_key", roleOk: expectRole === "anon" };
  if (/^sb_secret_/.test(v)) return { klass: "modern_secret_key", roleOk: expectRole === "service_role" };
  if (/^eyJ/.test(v)) {
    const c = jwtClaims(v, nowMs);
    return { klass: expectRole === "anon" ? "legacy_anon_jwt" : "legacy_service_role_jwt", claimedRole: c.claimedRole, refExpected: c.refExpected, expired: c.expired, roleOk: c.claimedRole === expectRole };
  }
  return { klass: "unknown" };
}

/**
 * NON-MUTATING structural + network forensics. Reports only booleans, format
 * classes, and HTTP status/category — never any secret content. Identical code
 * runs locally and in CI so the FIRST divergence is provable.
 */
export async function diagnose(env, deps = {}) {
  const nowMs = deps.nowMs ?? Date.now();
  const url = env.SUPABASE_URL, anon = env.SUPABASE_ANON_KEY ?? env.SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_ANON_KEY;
  const svcKey = env.SUPABASE_SERVICE_ROLE_KEY, email = String(env.TERAGON_ADMIN_EMAIL ?? "");
  const doFetch = deps.fetch ?? (typeof fetch !== "undefined" ? fetch : null);
  const out = {
    structural: {
      SUPABASE_URL: structural(url), SUPABASE_ANON_KEY: structural(anon), SUPABASE_SERVICE_ROLE_KEY: structural(svcKey),
      TERAGON_ADMIN_EMAIL: structural(email), TERAGON_ADMIN_PASSWORD: structural(env.TERAGON_ADMIN_PASSWORD),
    },
    urlClass: classifyUrl(url),
    anonKey: classifyKey(anon, "anon", nowMs),
    serviceKey: classifyKey(svcKey, "service_role", nowMs),
    emailValid: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()),
    // Runtime provenance. @supabase/supabase-js declares engines node>=22 and
    // `npm ci` does NOT enforce engines, so an under-floor runner installs
    // cleanly and only fails at call time — the exact shape that makes a
    // GitHub-vs-local divergence look like a credential problem.
    runtime: { nodeMajor: Number(String(process.versions?.node ?? "0").split(".")[0]) || 0 },
    net: {},
  };
  const cleanUrl = normalizeCred(url);
  // A. DNS
  try { const { lookup } = await import("node:dns/promises"); await lookup(new URL(cleanUrl).host); out.net.dns = "resolved"; } catch { out.net.dns = "dns_fail"; }
  // B/C. TLS + anon key accepted by the auth server (/auth/v1/settings)
  try {
    const r = await doFetch(`${cleanUrl}/auth/v1/settings`, { headers: { apikey: normalizeCred(anon) } });
    out.net.tls = "reached"; out.net.authSettingsStatus = r.status;
  } catch (e) { out.net.tls = "unreachable"; out.net.authSettingsStatus = 0; out.net.tlsCategory = safeAuthCategory(e); }
  // D. service-role listUsers (normalized url + key)
  try {
    const svc = deps.serviceFactory ? deps.serviceFactory() : (await import("@supabase/supabase-js")).createClient(cleanUrl, normalizeCred(svcKey), { auth: { persistSession: false } });
    const { error } = await svc.auth.admin.listUsers({ page: 1, perPage: 1 });
    out.net.serviceRole = error ? `fail:${error.status ?? safeAuthCategory(error)}` : "pass";
    if (error) out.net.serviceRoleErr = safeErrorName(error);
  } catch (e) { out.net.serviceRole = `fail:${safeAuthCategory(e)}`; out.net.serviceRoleErr = safeErrorName(e); }
  // E. admin signInWithPassword (normalized url + anon; password RAW to detect its contamination)
  try {
    const an = deps.anonFactory ? deps.anonFactory() : (await import("@supabase/supabase-js")).createClient(cleanUrl, normalizeCred(anon), { auth: { persistSession: false } });
    const { data, error } = await an.auth.signInWithPassword({ email: email.trim(), password: env.TERAGON_ADMIN_PASSWORD });
    if (!error && data?.session) { out.net.passwordAuth = "pass"; try { await an.auth.signOut(); } catch { /* discard */ } }
    else { out.net.passwordAuth = `fail:${error?.status ?? safeAuthCategory(error)}`; out.net.passwordAuthErr = safeErrorName(error); }
  } catch (e) { out.net.passwordAuth = `fail:${safeAuthCategory(e)}`; out.net.passwordAuthErr = safeErrorName(e); }
  // Diagnostic ONLY (does not alter the real flow): would a whitespace-trimmed
  // password authenticate? A "pass" here proves the password SECRET is merely
  // whitespace-contaminated, so the operator only needs to re-paste it cleanly.
  try {
    const raw = env.TERAGON_ADMIN_PASSWORD ?? "";
    const trimmed = String(raw).trim();
    if (trimmed !== raw && out.net.passwordAuth !== "pass") {
      const an2 = deps.anonFactory ? deps.anonFactory() : (await import("@supabase/supabase-js")).createClient(cleanUrl, normalizeCred(anon), { auth: { persistSession: false } });
      const { data, error } = await an2.auth.signInWithPassword({ email: email.trim(), password: trimmed });
      out.net.passwordAuthTrimmed = !error && data?.session ? "pass" : "fail";
      if (!error && data?.session) { try { await an2.auth.signOut(); } catch { /* discard */ } }
    } else {
      out.net.passwordAuthTrimmed = "n/a";
    }
  } catch { out.net.passwordAuthTrimmed = "error"; }
  return out;
}

/** Parse Playwright's JSON reporter into authoritative totals. */
export function parsePlaywrightTotals(pwJson) {
  const totals = { files: 0, executed: 0, passed: 0, failed: 0, skipped: 0 };
  if (!pwJson || !Array.isArray(pwJson.suites)) return totals;
  const files = new Set();
  const walk = (suite) => {
    if (suite.file) files.add(suite.file);
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        totals.executed++;
        const s = t.status ?? (t.results?.[t.results.length - 1]?.status);
        if (s === "expected" || s === "passed") totals.passed++;
        else if (s === "skipped") totals.skipped++;
        else totals.failed++;
      }
    }
    for (const child of suite.suites ?? []) walk(child);
  };
  for (const s of pwJson.suites) walk(s);
  totals.files = files.size || 1;
  return totals;
}

/** Assemble the AUTHORITATIVE report the runner owns (written AFTER cleanup). */
export function assembleReport({ totals, idb, cleanup, maskedRef, commit, preflight, note }) {
  const t = totals ?? { files: 1, executed: 0, passed: 0, failed: 0, skipped: 0 };
  const i = idb ?? { open: 0, read: 0, write: 0 };
  const rep = {
    files: t.files, executed: t.executed, passed: t.passed, failed: t.failed, skipped: t.skipped,
    cleanup, idbOpen: i.open, idbRead: i.read, idbWrite: i.write,
    observedCommit: commit || "", maskedRef: maskedRef || "-",
    adminPreflight: preflight ?? "not-run", note: note ?? "",
    verdict: "FAIL",
  };
  const ok = evaluateReport(rep).ok && preflight === "pass";
  rep.verdict = ok ? "PASS" : "FAIL";
  return rep;
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

  const write = (rep) => writeFileSync(REPORT_PATH, JSON.stringify(rep, null, 2));

  // GitHub-hosted NON-MUTATING preflight: report the 5 booleans + exit. No users,
  // no records, no Playwright.
  if (env.STAGING_DOMAINS_PREFLIGHT_ONLY === "1") {
    const fp = await fullPreflight(env);
    const diag = await diagnose(env); // safe structural + network forensics (no content)
    const pass = fp.targetVerified && fp.serviceRoleAccess && fp.adminFound && fp.emailConfirmed && fp.passwordAuth;
    const rep = {
      mode: "github-preflight",
      targetProjectVerified: fp.targetVerified ? "yes" : "no",
      adminUserFound: fp.adminFound ? "yes" : "no",
      emailConfirmed: fp.emailConfirmed ? "yes" : "no",
      serviceRoleAdminAccess: fp.serviceRoleAccess ? "pass" : "fail",
      adminPasswordAuth: fp.passwordAuth ? "pass" : "fail",
      maskedRef: pf.maskedRef, observedCommit: pf.commit, note: fp.category, verdict: pass ? "PASS" : "FAIL",
      diagnostics: diag,
    };
    write(rep);
    console.log(`[domains:live] github-preflight target=${rep.targetProjectVerified} adminFound=${rep.adminUserFound} emailConfirmed=${rep.emailConfirmed} serviceRole=${rep.serviceRoleAdminAccess} passwordAuth=${rep.adminPasswordAuth} verdict=${rep.verdict}`);
    console.log(`[domains:live] diag url=${diag.urlClass} anon=${diag.anonKey.klass}/roleOk=${diag.anonKey.roleOk ?? "-"}/refOk=${diag.anonKey.refExpected ?? "-"}/exp=${diag.anonKey.expired ?? "-"} svc=${diag.serviceKey.klass}/roleOk=${diag.serviceKey.roleOk ?? "-"}/refOk=${diag.serviceKey.refExpected ?? "-"}/exp=${diag.serviceKey.expired ?? "-"} emailValid=${diag.emailValid}`);
    console.log(`[domains:live] net dns=${diag.net.dns} tls=${diag.net.tls} authSettings=${diag.net.authSettingsStatus} serviceRole=${diag.net.serviceRole} passwordAuth=${diag.net.passwordAuth}`);
    console.log(`[domains:live] runtime nodeMajor=${diag.runtime.nodeMajor} sdkFloor=22 errClass svc=${diag.net.serviceRoleErr ?? "-"} pw=${diag.net.passwordAuthErr ?? "-"}`);
    const s = diag.structural;
    console.log(`[domains:live] struct newline/CR/ws/quotes URL=${s.SUPABASE_URL.hasNewline}/${s.SUPABASE_URL.hasCR}/${s.SUPABASE_URL.leadingTrailingWs}/${s.SUPABASE_URL.surroundingQuotes} ANON=${s.SUPABASE_ANON_KEY.hasNewline}/${s.SUPABASE_ANON_KEY.hasCR}/${s.SUPABASE_ANON_KEY.leadingTrailingWs}/${s.SUPABASE_ANON_KEY.surroundingQuotes} SVC=${s.SUPABASE_SERVICE_ROLE_KEY.hasNewline}/${s.SUPABASE_SERVICE_ROLE_KEY.hasCR}/${s.SUPABASE_SERVICE_ROLE_KEY.leadingTrailingWs}/${s.SUPABASE_SERVICE_ROLE_KEY.surroundingQuotes}`);
    process.exit(pass ? 0 : 1);
  }
  const readIdb = () => {
    try { return JSON.parse(readFileSync(IDB_PATH, "utf8")); } catch { return { open: 0, read: 0, write: 0 }; }
  };
  const readPwTotals = () => {
    try { return parsePlaywrightTotals(JSON.parse(readFileSync(PW_JSON_PATH, "utf8"))); } catch { return null; }
  };

  // 1. AUTHORITATIVE admin credential check BEFORE any browser run / mutation.
  const admin = await adminPreflight(env);
  if (!admin.pass) {
    // No fixtures were provisioned → nothing to clean. Classify + fail closed;
    // NEVER auto-mutate the password.
    const rep = assembleReport({ totals: { files: 1, executed: 0, passed: 0, failed: 0, skipped: 0 }, cleanup: "ok", maskedRef: pf.maskedRef, commit: pf.commit, preflight: "fail", note: `ADMIN_CREDENTIAL_MISMATCH (${admin.category})` });
    write(rep);
    console.error(`[domains:live] ADMIN_LOGIN_PREFLIGHT_FAIL — ${rep.note}. Playwright NOT started; no fixtures created.`);
    process.exit(1);
  }
  console.log("[domains:live] ADMIN_LOGIN_PREFLIGHT_PASS");

  // 2. Runner OWNS the fixture lifecycle: provision → run Playwright → ALWAYS
  //    clean up + verify (in finally). The report is written AFTER cleanup so it
  //    can never say cleanup=not-run once setup began.
  const adapter = createLiveCustomerAdmin({ env });
  const runId = env.ACC_RUN_ID ?? "";
  let pwStatus = 1;
  const outcome = await withCustomerFixtures(
    { adapter, config: { runId, secondOrgId: env.ACC_SECOND_ORG ?? "org-staging-beta", roleId: env.ACC_FIXTURE_ROLE ?? "crole-sales", customerCount: Number(env.ACC_CUSTOMER_COUNT ?? 3) } },
    async (handle) => {
      const childEnv = { ...process.env, ACC_FIXTURE_EMAIL: handle.email, ACC_FIXTURE_PASSWORD: handle.password };
      // No `--reporter=` here on purpose: a CLI reporter list REPLACES the
      // config's, which silently discarded the json reporter and left the
      // authoritative totals at executed=0. The config owns list+json.
      const run = spawnSync("npx", ["playwright", "test", "-c", LIVE_CONFIG], {
        stdio: "inherit", shell: true, env: childEnv,
      });
      pwStatus = run.status ?? 1;
      return { pwStatus };
    },
  );

  // 3. Cleanup is verified by withCustomerFixtures (ok only if every delete
  //    succeeded). A cleanup failure OVERRIDES any passing test result.
  const cleanup = outcome.cleanup?.ok ? "ok" : "failed";
  const totals = readPwTotals() ?? { files: 1, executed: 0, passed: 0, failed: 0, skipped: 0 };
  const rep = assembleReport({ totals, idb: readIdb(), cleanup, maskedRef: pf.maskedRef, commit: pf.commit, preflight: "pass", note: outcome.reason ?? "" });
  write(rep);
  console.log(
    `[domains:live] preflight=pass files=${rep.files} executed=${rep.executed} passed=${rep.passed} failed=${rep.failed} skipped=${rep.skipped} cleanup=${rep.cleanup} idb=${rep.idbOpen}/${rep.idbRead}/${rep.idbWrite} ref=${rep.maskedRef} commit=${rep.observedCommit}`,
  );
  if (rep.verdict !== "PASS" || pwStatus !== 0) {
    console.error(`[domains:live] FAIL — ${evaluateReport(rep).reason}${cleanup !== "ok" ? " · cleanup failed (overrides test results)" : ""}`);
    process.exit(1);
  }
  console.log("[domains:live] PASS — all required live customer checks passed + cleanup verified");
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("run-domains-live.mjs")) {
  main().catch((err) => {
    console.error(`[domains:live] runner error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
