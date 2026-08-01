#!/usr/bin/env node
// TERAGON AI BUSINESS OS — bootstrap the first admin (Gate S7.0).
// =============================================================================
// The direct-SQL path is GONE. There is no `auth.users` INSERT anywhere in this
// file. The ONLY sanctioned path:
//   1. Supabase Admin API `createUser({email, password, email_confirm:true})`
//      via a SERVICE-ROLE client (server-only key, never VITE_-prefixed), and
//   2. the canonical SERVICE-ROLE-ONLY `bootstrap_admin` RPC, which creates the
//      org + crole-sysadmin profile + membership (idempotent, ON CONFLICT DO
//      NOTHING). The browser never selects role/org/status — it cannot call it.
//
// Hard rules enforced here:
//   • email ONLY from TERAGON_ADMIN_EMAIL (never hardcoded / invented)
//   • password ONLY from the secure credential provider (never logged/argv)
//   • idempotent: verify-existing rather than duplicate
//   • verifies active profile + org membership + canonical role after the RPC
//   • refuses in S7.0 because the email is UNCONFIRMED — the confirmation gate
//     TERAGON_ADMIN_EMAIL_CONFIRMED=true is NOT set (validation.ok is false).
//     The full code path below is complete and unit-tested with a fake adapter.
import process from "node:process";
import { log } from "./shared/log.mjs";
import { createCredentialProvider, enforceOrExit, describeValidation } from "./shared/credentials.mjs";
import { createSupabaseAdapter } from "./shared/adapters/supabase.mjs";
import { createStageTracker } from "./shared/stage.mjs";
import { resolveMode, assertApplyAllowed, isEntrypoint } from "./shared/runtime.mjs";

export const CANONICAL_ADMIN_ROLE = "crole-sysadmin";
const DEFAULT_ORG_ID = "org-teragon";
const DEFAULT_ORG_NAME = "Teragon";

/** Domain-only email mask so logs never carry the full identifier. */
export function maskEmail(email) {
  if (typeof email !== "string" || !email.includes("@")) return "(admin)";
  return `***@${email.split("@")[1]}`;
}

/**
 * Core admin-bootstrap routine with an injected Supabase Admin adapter. Pure of
 * process.exit and of any direct SQL. Idempotent + self-verifying.
 * @param {Object} deps
 * @param {'plan'|'apply'} deps.mode
 * @param {ReturnType<import('./shared/credentials.mjs').createCredentialProvider>} deps.credentials
 * @param {ReturnType<import('./shared/adapters/supabase.mjs').createSupabaseAdapter>} deps.supabase
 * @param {ReturnType<import('./shared/stage.mjs').createStageTracker>} deps.stage
 * @param {import('./shared/credentials.mjs').CredentialValidation} deps.validation
 */
export async function bootstrapAdmin({ mode, credentials, supabase, stage, validation }) {
  const email = credentials.get("TERAGON_ADMIN_EMAIL");
  const password = credentials.get("TERAGON_ADMIN_PASSWORD"); // NEVER logged
  const orgId = credentials.get("TERAGON_ADMIN_ORG_ID") ?? DEFAULT_ORG_ID;
  const orgName = credentials.get("TERAGON_ADMIN_ORG_NAME") ?? DEFAULT_ORG_NAME;
  const plan = mode !== "apply";

  if (plan) {
    return {
      ok: true,
      mutated: false,
      action: "plan",
      held: !validation.ok,
      intended: [
        "Admin API createUser({email: TERAGON_ADMIN_EMAIL, password: ***, email_confirm:true}) via service-role client",
        `canonical bootstrap_admin RPC → org ${orgId} + ${CANONICAL_ADMIN_ROLE} profile + membership (idempotent)`,
        "verify active profile + membership + canonical role; never log password/token",
        "HELD until TERAGON_ADMIN_EMAIL_CONFIRMED=true (email is unconfirmed in S7.0)",
      ],
    };
  }

  // apply — only reached when validation.ok (which REQUIRES the confirmation gate).
  if (!validation.ok) return { ok: false, mutated: false, reason: "credentials/confirmation not ready — refusing" };
  if (!email) return { ok: false, mutated: false, reason: "TERAGON_ADMIN_EMAIL absent — refusing (never invent an admin email)" };
  if (!password) return { ok: false, mutated: false, reason: "TERAGON_ADMIN_PASSWORD absent — refusing" };

  stage.enter("ADMIN_BOOTSTRAPPED", "resolving admin identity (verify-before-create)");

  // 1. idempotent: reuse an existing auth user rather than duplicating.
  let mutated = false;
  const existing = await supabase.findUserByEmail(email);
  let userId = existing?.userId ?? null;
  if (!userId) {
    const created = await supabase.createUser({ email, password });
    userId = created.userId;
    mutated = true;
    log.ok(`created admin auth user ${maskEmail(email)} (password never logged).`);
  } else {
    log.ok(`admin auth user ${maskEmail(email)} already exists — reusing (no duplicate).`);
  }

  // 2. canonical RPC (idempotent create-if-absent).
  await supabase.bootstrapAdminRpc({ userId, orgId, orgName, name: "Teragon Admin", email });

  // 3. verify active profile + canonical role + membership.
  const profile = await supabase.getProfile(userId);
  const membership = await supabase.getMembership(userId, orgId);
  const problems = [];
  if (!profile) problems.push("profile missing after bootstrap");
  else {
    if (profile.active !== true) problems.push("profile not active");
    if (profile.role_id !== CANONICAL_ADMIN_ROLE) problems.push(`role is ${profile.role_id}, expected ${CANONICAL_ADMIN_ROLE}`);
    if (profile.organization_id !== orgId) problems.push(`profile org ${profile.organization_id} != ${orgId}`);
  }
  if (!membership || membership.active !== true) problems.push("active membership missing");

  if (problems.length) {
    stage.fail(`admin verification failed: ${problems.join("; ")}`);
    return { ok: false, mutated, reason: problems.join("; ") };
  }

  stage.markComplete("ADMIN_BOOTSTRAPPED", { admin: { emailDomain: email.split("@")[1] ?? null, bootstrapped: true } }, mutated ? "created" : "reused");
  return { ok: true, mutated, userIdKnown: true, role: CANONICAL_ADMIN_ROLE };
}

// --- thin entrypoint ---------------------------------------------------------
async function main() {
  const mode = resolveMode();
  const gate = assertApplyAllowed(mode);
  const credentials = createCredentialProvider();
  const validation = await credentials.validate("bootstrap-admin");

  log.step(`bootstrap-admin — mode=${mode}`);
  if (mode === "apply" && !gate.allowed) {
    log.error(`refused: ${gate.reason}. No remote action taken.`);
    process.exit(3);
  }
  if (mode === "apply") {
    // This will refuse in S7.0: TERAGON_ADMIN_EMAIL_CONFIRMED is not set.
    enforceOrExit(validation);
  } else {
    for (const line of describeValidation(validation)) log.plain(`  ${line}`);
  }

  const supabase = createSupabaseAdapter({ credentials: credentials.get });
  const stage = createStageTracker();
  const result = await bootstrapAdmin({ mode, credentials, supabase, stage, validation });

  if (result.action === "plan") {
    if (result.held) log.warn("bootstrap-admin is HELD: email unconfirmed (TERAGON_ADMIN_EMAIL_CONFIRMED != true).");
    for (const line of result.intended) log.plain(`  would: ${line}`);
    log.step("bootstrap-admin PLAN — nothing created or contacted.");
    process.exit(0);
  }
  if (!result.ok) {
    log.error(`bootstrap-admin refused/failed: ${result.reason}`);
    process.exit(2);
  }
  log.ok(`bootstrap-admin complete (${result.mutated ? "created" : "reused"}, role ${result.role}).`);
  process.exit(0);
}

if (isEntrypoint(import.meta.url)) {
  main().catch((err) => {
    log.error(`bootstrap-admin failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
