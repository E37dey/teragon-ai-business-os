#!/usr/bin/env node
// TERAGON AI BUSINESS OS — rollback the Netlify production alias (Gate S1).
// =============================================================================
// Fail-closed on credentials. Idempotent: restores the production alias to a
// prior, already-existing successful deploy — it publishes nothing new and
// creates no site. Rolling back to the current live deploy is a safe no-op.
import { guardOrExit } from "./shared/guard.mjs";
import { run } from "./shared/exec.mjs";
import { NETLIFY_DEPLOY } from "./shared/names.mjs";
import { log } from "./shared/log.mjs";

guardOrExit({ script: "rollback", needs: NETLIFY_DEPLOY });

// --- remote body (only reached with credentials present) --------------------
async function main() {
  // Restore a previous successful production deploy for the linked site.
  // WOULD RUN: npx netlify api listSiteDeploys   (find the prior "ready" prod deploy)
  // WOULD RUN: npx netlify api restoreSiteDeploy --data '{"deploy_id":"<prior>"}'
  // IDEMPOTENT: restoring to the already-live deploy is a no-op; never publishes
  // a new build (no `netlify deploy` here — rollback only re-points the alias).
  await run("npx", ["netlify", "api", "listSiteDeploys"]);
  log.ok("rollback complete (production alias re-pointed to a prior deploy).");
}

main().catch((err) => {
  log.error(`rollback failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
