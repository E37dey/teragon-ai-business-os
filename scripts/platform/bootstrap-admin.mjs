#!/usr/bin/env node
// TERAGON AI BUSINESS OS — bootstrap the first admin user (Gate S1).
// =============================================================================
// Fail-closed on credentials. Idempotent: verify-before-create — the admin is
// created ONLY if a user with TERAGON_ADMIN_EMAIL does not already exist; a
// second run is a no-op. Passwords are consumed from env, never logged.
import { guardOrExit } from "./shared/guard.mjs";
import { run } from "./shared/exec.mjs";
import { ADMIN_BOOTSTRAP } from "./shared/names.mjs";
import { log } from "./shared/log.mjs";
import process from "node:process";

guardOrExit({ script: "bootstrap-admin", needs: ADMIN_BOOTSTRAP });

// --- remote body (only reached with credentials present) --------------------
async function main() {
  // IDEMPOTENT: the seeding SQL/RPC below is written as
  //   INSERT ... ON CONFLICT (email) DO NOTHING
  // so re-runs never duplicate the admin and never overwrite a rotated password.
  //
  // Preferred path: a committed, parameterised seed applied against the linked
  // project. Email/password are passed as env-sourced parameters, never inlined.
  //
  // WOULD RUN: npx supabase db execute --linked --file supabase/seed/admin.sql
  //   where admin.sql references :email / :password bound from
  //   TERAGON_ADMIN_EMAIL / TERAGON_ADMIN_PASSWORD (verify-before-create).
  log.info(`Ensuring admin ${maskEmail(process.env["TERAGON_ADMIN_EMAIL"])} exists (create-if-absent).`);
  await run("npx", ["supabase", "db", "execute", "--linked", "--file", "supabase/seed/admin.sql"]);
  log.ok("bootstrap-admin complete (idempotent create-if-absent).");
}

// Show only the domain part so the plan/logs never carry the full identifier.
function maskEmail(email) {
  if (typeof email !== "string" || !email.includes("@")) return "(admin)";
  return `***@${email.split("@")[1]}`;
}

main().catch((err) => {
  log.error(`bootstrap-admin failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
