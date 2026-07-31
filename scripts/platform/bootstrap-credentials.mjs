#!/usr/bin/env node
// TERAGON AI BUSINESS OS — S6.1 automated secure staging credential bootstrap.
// =============================================================================
// `npm run platform:credentials`
//
// Prepares the STAGING credential set with the least possible manual work and
// WITHOUT ever printing a secret value. It:
//   1. resolves NETLIFY_SITE_ID from the existing Netlify link (never creates a
//      second site);
//   2. ensures a Supabase authorization exists — an env token OR an already
//      authenticated CLI session (runs the one-time interactive login only when
//      a TTY is available and neither is present);
//   3. selects the Supabase organization (auto when exactly one is accessible);
//   4. generates independent, cryptographically-strong DB + admin passwords;
//   5. resolves the admin email (env / existing file / confirmed account
//      default / TTY prompt) — never invents one;
//   6. writes everything to the gitignored .env.staging.local with owner-only
//      permissions; and
//   7. prints a NAMES-only PRESENT/MISSING readiness report.
//
// Idempotent: an existing .env.staging.local is loaded and only MISSING values
// are filled — a password already tied to a provisioned project is never
// rotated out from under it. Re-running is safe.
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, chmodSync, statSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import readline from "node:readline";
import { log, registerSecretNames } from "./shared/log.mjs";
import { REPO_ROOT, netlifyStatePresent } from "./shared/context.mjs";
import { resolveSupabaseAuth, supabaseSessionPresent } from "./shared/supabase-auth.mjs";

const STAGING_FILE = join(REPO_ROOT, ".env.staging.local");
// Strict enough to reject trailing junk like a possessive "…com's": the TLD is
// letters only, so extraction stops at the real domain boundary.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,63}$/u;
const isTTY = Boolean(process.stdin.isTTY && process.stdout.isTTY);

function needsShell(command) {
  return process.platform === "win32" && /^(npm|npx|netlify|supabase)$/i.test(command);
}

/** Read-only exec returning trimmed stdout, or null on any failure. */
function exec(command, args, timeout = 25000) {
  return new Promise((resolve) => {
    execFile(command, args, { cwd: REPO_ROOT, timeout, windowsHide: true, shell: needsShell(command) }, (err, out) =>
      resolve(err ? null : String(out).trim()),
    );
  });
}

/** Interactive line prompt (only ever called when isTTY). Never echoes secrets. */
function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a.trim()); }));
}

// --- .env.staging.local (idempotent load / merge / write) -------------------

/** Parse KEY=VALUE lines into a plain object (values never logged). */
function loadStaging() {
  if (!existsSync(STAGING_FILE)) return {};
  const out = {};
  for (const raw of readFileSync(STAGING_FILE, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const k = line.slice(0, eq).trim();
    const v = line.slice(eq + 1).trim();
    if (k) out[k] = v;
  }
  return out;
}

function present(v) {
  return typeof v === "string" && v.trim() !== "";
}

/** Write the staging file and restrict permissions to the owner where supported. */
function writeStaging(values) {
  const header =
    "# TERAGON AI BUSINESS OS — STAGING credentials (S6.1 bootstrap output).\n" +
    "# AUTO-GENERATED. NEVER commit (gitignored). Values are secret — move the\n" +
    "# generated passwords into a trusted password manager before production.\n" +
    "# Supabase Management-API auth is provided by the authenticated CLI session\n" +
    "# (no SUPABASE_ACCESS_TOKEN copied here) unless you set one explicitly.\n\n";
  const order = ["SUPABASE_ORG_ID", "SUPABASE_DB_PASSWORD", "TERAGON_ADMIN_EMAIL", "TERAGON_ADMIN_PASSWORD", "NETLIFY_SITE_ID"];
  const body = order.filter((k) => present(values[k])).map((k) => `${k}=${values[k]}`).join("\n");
  writeFileSync(STAGING_FILE, header + body + "\n", { encoding: "utf8", mode: 0o600 });
  try {
    chmodSync(STAGING_FILE, 0o600);
  } catch {
    /* best-effort on filesystems without POSIX perms (e.g. some Windows) */
  }
}

// --- step 1: Netlify site id -------------------------------------------------

async function resolveNetlifySiteId(existing) {
  if (present(existing)) {
    log.ok("NETLIFY_SITE_ID already set in .env.staging.local — reusing (no new site).");
    return existing;
  }
  const state = netlifyStatePresent();
  let siteId = null;
  if (state.present) {
    try {
      const parsed = JSON.parse(readFileSync(join(REPO_ROOT, ".netlify", "state.json"), "utf8"));
      siteId = parsed.siteId ?? parsed.site_id ?? null;
    } catch {
      siteId = null;
    }
  }
  if (!siteId) {
    // Fall back to the CLI's own view of the linked site.
    const statusJson = await exec("netlify", ["status", "--json"]);
    if (statusJson) {
      try {
        const s = JSON.parse(statusJson);
        siteId = s?.siteData?.id ?? s?.siteId ?? null;
      } catch {
        siteId = null;
      }
    }
  }
  if (!siteId) {
    log.warn("could not resolve a linked Netlify site. Run `netlify link` to the EXISTING Teragon site, then re-run.");
    return "";
  }
  // Verify ownership/identity best-effort (name shown, id is not a secret).
  const statusJson = await exec("netlify", ["status", "--json"]);
  if (statusJson) {
    try {
      const s = JSON.parse(statusJson);
      const name = s?.siteData?.name ?? "(unknown)";
      log.ok(`resolved existing Netlify site "${name}" (id ${String(siteId).slice(0, 8)}…) — reusing, no new site created.`);
    } catch {
      log.ok(`resolved Netlify site id ${String(siteId).slice(0, 8)}… from local link.`);
    }
  } else {
    log.ok(`resolved Netlify site id ${String(siteId).slice(0, 8)}… from .netlify/state.json.`);
  }
  return String(siteId);
}

// --- step 2: Supabase authorization -----------------------------------------

async function ensureSupabaseAuth() {
  const auth = await resolveSupabaseAuth();
  if (auth.ready) {
    log.ok(`Supabase authorization present via ${auth.via} (token never read or printed).`);
    return true;
  }
  if (isTTY) {
    log.step("Supabase login required — launching the supported interactive browser flow.");
    const code = await new Promise((resolve) => {
      const child = execFile("supabase", ["login"], { shell: needsShell("supabase"), windowsHide: true });
      child.stdout?.pipe(process.stdout);
      child.stderr?.pipe(process.stderr);
      process.stdin.pipe(child.stdin ?? process.stdin);
      child.on("close", (c) => resolve(c ?? 1));
      child.on("error", () => resolve(1));
    });
    if (code === 0 && (await supabaseSessionPresent())) {
      log.ok("Supabase CLI session established.");
      return true;
    }
    log.error("Supabase login did not complete.");
    return false;
  }
  log.warn("no Supabase authorization (no env token, no CLI session) and no TTY to log in.");
  log.info("run `supabase login` once in your terminal (or set SUPABASE_ACCESS_TOKEN), then re-run this command.");
  return false;
}

// --- step 3: Supabase organization ------------------------------------------

async function resolveOrg(existing) {
  if (present(existing)) {
    log.ok("SUPABASE_ORG_ID already set in .env.staging.local — reusing.");
    return existing;
  }
  const json = await exec("supabase", ["orgs", "list", "--output", "json"]);
  let orgs = [];
  if (json) {
    try {
      orgs = JSON.parse(json);
    } catch {
      orgs = [];
    }
  }
  if (!Array.isArray(orgs) || orgs.length === 0) {
    log.warn("could not list Supabase organizations (auth/API issue). Re-run after `supabase login`.");
    return "";
  }
  if (orgs.length === 1) {
    const o = orgs[0];
    log.ok(`exactly one Supabase organization accessible — auto-selected "${o.name}" (${o.id}).`);
    return String(o.id);
  }
  // Multiple orgs — names + safe ids only; require one selection.
  log.step("multiple Supabase organizations accessible — choose one:");
  orgs.forEach((o, i) => log.plain(`    [${i + 1}] ${o.name}  (${o.id})`));
  if (!isTTY) {
    log.warn("no TTY to select. Re-run in a terminal, or set SUPABASE_ORG_ID to one of the ids above.");
    return "";
  }
  const pick = await ask("  select organization number: ");
  const idx = Number.parseInt(pick, 10) - 1;
  if (Number.isNaN(idx) || idx < 0 || idx >= orgs.length) {
    log.error("invalid selection.");
    return "";
  }
  return String(orgs[idx].id);
}

// --- step 4: password generation --------------------------------------------

/** Cryptographically-strong, url-safe, >=32 chars, no predictable template. */
function generatePassword() {
  return crypto.randomBytes(33).toString("base64url"); // 33 bytes -> 44 url-safe chars
}

function ensurePasswords(values) {
  if (!present(values.SUPABASE_DB_PASSWORD)) {
    values.SUPABASE_DB_PASSWORD = generatePassword();
    log.ok("generated SUPABASE_DB_PASSWORD (44 chars, CSPRNG — never printed).");
  } else {
    log.ok("SUPABASE_DB_PASSWORD already present — kept (not rotated).");
  }
  if (!present(values.TERAGON_ADMIN_PASSWORD)) {
    do {
      values.TERAGON_ADMIN_PASSWORD = generatePassword();
    } while (values.TERAGON_ADMIN_PASSWORD === values.SUPABASE_DB_PASSWORD);
    log.ok("generated TERAGON_ADMIN_PASSWORD (44 chars, CSPRNG, distinct — never printed).");
  } else {
    log.ok("TERAGON_ADMIN_PASSWORD already present — kept (not rotated).");
  }
}

// --- step 5: admin email -----------------------------------------------------

/** Best-effort, SAFE resolution of the account email (shown for confirmation). */
async function resolveAccountEmail() {
  const json = await exec("supabase", ["projects", "list", "--output", "json"]);
  if (!json) return null;
  try {
    const projects = JSON.parse(json);
    for (const p of Array.isArray(projects) ? projects : []) {
      // Letters-only TLD so a possessive "…com's Project" yields "…com", not "…com's".
      const m = String(p?.name ?? "").match(/([^\s@]+@[^\s@]+\.[A-Za-z]{2,63})/u);
      if (m) return m[1];
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function resolveAdminEmail(values) {
  const fromEnv = process.env.TERAGON_ADMIN_EMAIL;
  if (present(fromEnv) && EMAIL_RE.test(fromEnv)) {
    values.TERAGON_ADMIN_EMAIL = fromEnv.trim();
    log.ok(`admin email taken from TERAGON_ADMIN_EMAIL env: ${values.TERAGON_ADMIN_EMAIL}`);
    return;
  }
  if (present(values.TERAGON_ADMIN_EMAIL) && EMAIL_RE.test(values.TERAGON_ADMIN_EMAIL)) {
    log.ok(`admin email already set in .env.staging.local: ${values.TERAGON_ADMIN_EMAIL}`);
    return;
  }
  const accountDefault = await resolveAccountEmail();
  if (isTTY) {
    const suffix = accountDefault ? ` [${accountDefault}]` : "";
    const answer = await ask(`  administrator email${suffix}: `);
    const chosen = present(answer) ? answer : accountDefault ?? "";
    if (present(chosen) && EMAIL_RE.test(chosen)) {
      values.TERAGON_ADMIN_EMAIL = chosen;
      log.ok(`admin email set: ${chosen}`);
    } else {
      log.error("invalid or empty email — TERAGON_ADMIN_EMAIL left unset.");
    }
    return;
  }
  // Non-interactive: use the safely-resolved account email (shown), never invent.
  if (accountDefault && EMAIL_RE.test(accountDefault)) {
    values.TERAGON_ADMIN_EMAIL = accountDefault;
    log.ok(`admin email resolved from authenticated Supabase account (confirm): ${accountDefault}`);
    log.info("override by setting TERAGON_ADMIN_EMAIL and re-running, or edit .env.staging.local.");
    return;
  }
  log.warn("admin email not resolvable non-interactively. Set TERAGON_ADMIN_EMAIL or run in a terminal to be prompted.");
}

// --- step 8: readiness report (NAMES only) ----------------------------------

async function readinessReport(values) {
  log.step("credential readiness (NAMES only — no values, no lengths)");
  const auth = await resolveSupabaseAuth();
  const rows = [
    ["Supabase authorization (env token OR CLI session)", auth.ready],
    ["SUPABASE_ORG_ID", present(values.SUPABASE_ORG_ID)],
    ["SUPABASE_DB_PASSWORD", present(values.SUPABASE_DB_PASSWORD)],
    ["TERAGON_ADMIN_EMAIL", present(values.TERAGON_ADMIN_EMAIL)],
    ["TERAGON_ADMIN_PASSWORD", present(values.TERAGON_ADMIN_PASSWORD)],
    ["NETLIFY_AUTH_TOKEN", present(process.env.NETLIFY_AUTH_TOKEN)],
    ["NETLIFY_SITE_ID", present(values.NETLIFY_SITE_ID)],
  ];
  let allReady = true;
  for (const [name, ok] of rows) {
    if (ok) log.ok(`${name}: PRESENT`);
    else {
      log.error(`${name}: MISSING`);
      allReady = false;
    }
  }
  return allReady;
}

// --- main --------------------------------------------------------------------

async function main() {
  log.step("S6.1 — automated secure staging credential bootstrap");
  const values = loadStaging();

  values.NETLIFY_SITE_ID = await resolveNetlifySiteId(values.NETLIFY_SITE_ID);
  const authOk = await ensureSupabaseAuth();
  if (authOk) values.SUPABASE_ORG_ID = await resolveOrg(values.SUPABASE_ORG_ID);
  ensurePasswords(values);
  await resolveAdminEmail(values);

  // Register the newly-generated/loaded secret values for redaction so nothing
  // below can accidentally echo them, then persist.
  registerSecretNames(["SUPABASE_DB_PASSWORD", "TERAGON_ADMIN_PASSWORD"]);
  writeStaging(values);
  let perm = "";
  try {
    perm = (statSync(STAGING_FILE).mode & 0o777).toString(8);
  } catch {
    perm = "?";
  }
  const ownerOnly = perm === "600";
  log.ok(
    `wrote .env.staging.local (mode ${perm}) — gitignored, values never printed.` +
      (ownerOnly
        ? " Permissions restricted to owner."
        : " NOTE: POSIX chmod is a no-op on this filesystem (Windows/NTFS); the file lives under your ACL-protected user profile — still keep it out of shared locations."),
  );

  log.step("SAFE RECOVERY");
  log.info("No custom encryption is invented. .env.staging.local is the local store (owner-only).");
  log.info("Move the generated DB + admin passwords into a trusted password manager before production.");
  log.info("Staging may proceed now: if lost, both passwords can be reset (DB via Supabase, admin via re-bootstrap).");

  const ready = await readinessReport(values);
  log.step(ready ? "S6.1 COMPLETE — credential readiness is COMPLETE." : "S6.1 PARTIAL — some names still MISSING (see above).");
  process.exit(ready ? 0 : 0); // never a hard failure: this is a preparation step, report-only.
}

main().catch((err) => {
  log.error(`bootstrap-credentials failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
