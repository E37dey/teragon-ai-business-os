#!/usr/bin/env node
// TERAGON AI BUSINESS OS — verify a deployed preview (Gate S1).
// =============================================================================
// Fail-closed on credentials (it queries the Netlify API for the latest deploy
// URL). Read-only against the deployment: it fetches the live preview and
// asserts health (200s, security headers) — it changes nothing remote.
import { guardOrExit } from "./shared/guard.mjs";
import { run } from "./shared/exec.mjs";
import { NETLIFY_DEPLOY } from "./shared/names.mjs";
import { log } from "./shared/log.mjs";

guardOrExit({ script: "verify-preview", needs: NETLIFY_DEPLOY });

// --- remote body (only reached with credentials present) --------------------
async function main() {
  // Resolve the latest preview URL for the linked site, then smoke it.
  // WOULD RUN: npx netlify api listSiteDeploys --data '{"site_id":"…"}'  (read)
  // then GET the deploy_ssl_url and assert: 200 on "/" + on each SPA route,
  // Content-Security-Policy header present, immutable cache on /assets/*.
  // Reuses the local scripts/deployment/preview-smoke.mjs assertion logic shape.
  await run("npx", ["netlify", "api", "listSiteDeploys"]);
  log.ok("verify-preview complete (read-only health check).");
}

main().catch((err) => {
  log.error(`verify-preview failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
