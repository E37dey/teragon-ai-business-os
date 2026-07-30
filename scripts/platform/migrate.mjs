#!/usr/bin/env node
// TERAGON AI BUSINESS OS — apply migrations to the LINKED remote DB (Gate S1).
// =============================================================================
// Fail-closed on credentials. Idempotent: `db push` only applies migrations not
// yet present remotely. It NEVER runs `supabase db reset` against a linked/
// remote project (that would drop data) — reset is local-only and lives in
// validate-local.mjs behind a Docker check.
import { guardOrExit } from "./shared/guard.mjs";
import { run } from "./shared/exec.mjs";
import { SUPABASE_MIGRATE } from "./shared/names.mjs";
import { migrationsPresent } from "./shared/context.mjs";
import { log } from "./shared/log.mjs";
import process from "node:process";

guardOrExit({ script: "migrate", needs: SUPABASE_MIGRATE });

// --- remote body (only reached with credentials present) --------------------
async function main() {
  const mig = migrationsPresent();
  if (!mig.present) {
    // Nothing to do is a SUCCESS here — honest no-op, not a fake apply.
    log.ok("no migrations in supabase/migrations/ — nothing to push (no-op).");
    return;
  }
  log.info(`${mig.count} migration file(s) present → pushing to LINKED remote DB.`);
  // IDEMPOTENT: db push applies only unapplied migrations; safe to re-run.
  // WOULD RUN: npx supabase db push --linked
  // NOTE: DB password consumed from SUPABASE_DB_PASSWORD env by the CLI.
  await run("npx", ["supabase", "db", "push", "--linked"]);
  log.ok("migrate complete (idempotent db push).");
}

main().catch((err) => {
  log.error(`migrate failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
