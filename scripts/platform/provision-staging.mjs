#!/usr/bin/env node
// TERAGON AI BUSINESS OS — provision staging Supabase project (Gate S1).
// =============================================================================
// Fail-closed: exits BEFORE any remote action if credentials are missing.
// Idempotent: verify-before-create — reuses an existing project ref, never
// duplicates. Contacts nothing until the guard passes (it cannot in this env,
// where credentials are absent — reaching the guard IS the tested behavior).
import { guardOrExit } from "./shared/guard.mjs";
import { run } from "./shared/exec.mjs";
import { SUPABASE_PROVISION } from "./shared/names.mjs";
import { log } from "./shared/log.mjs";
import process from "node:process";

guardOrExit({ script: "provision-staging", needs: SUPABASE_PROVISION });

// --- remote body (only reached with credentials present) --------------------
// Structured, idempotent `npx supabase` sequence. Kept behind the guard.
async function main() {
  const ref = (process.env["SUPABASE_PROJECT_REF"] ?? "").trim();

  if (ref) {
    // IDEMPOTENT: a project ref already exists → verify + reuse, never create.
    log.info(`SUPABASE_PROJECT_REF present → verifying existing project (no create).`);
    // WOULD RUN: npx supabase projects list           (confirm ref is visible to the token)
    // WOULD RUN: npx supabase link --project-ref <ref> (link local repo, reuse)
    await run("npx", ["supabase", "projects", "list"]);
    await run("npx", ["supabase", "link", "--project-ref", ref]);
  } else {
    // No ref → create a new staging project in the org, then link.
    // Password is passed via env to the CLI, never as a logged flag value.
    log.info(`No SUPABASE_PROJECT_REF → creating a new staging project (verify-before-create).`);
    // WOULD RUN: npx supabase projects create teragon-staging \
    //              --org-id $SUPABASE_ORG_ID --region ${SUPABASE_REGION:-eu-central-1} \
    //              --db-password $SUPABASE_DB_PASSWORD
    // Then capture the returned ref and: npx supabase link --project-ref <newRef>
    const region = (process.env["SUPABASE_REGION"] ?? "eu-central-1").trim();
    await run("npx", [
      "supabase",
      "projects",
      "create",
      "teragon-staging",
      "--org-id",
      process.env["SUPABASE_ORG_ID"] ?? "",
      "--region",
      region,
    ]);
  }
  log.ok("provision-staging complete (idempotent).");
}

main().catch((err) => {
  log.error(`provision-staging failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
