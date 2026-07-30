#!/usr/bin/env node
// TERAGON AI BUSINESS OS — deploy a Netlify DEPLOY PREVIEW (Gate S1).
// =============================================================================
// Fail-closed on credentials. Non-production by construction (no --prod). Builds
// dist/ then deploys a preview to the LINKED site. Idempotent: each run produces
// a fresh immutable preview URL for the same site; it never creates a new site.
import { guardOrExit } from "./shared/guard.mjs";
import { run } from "./shared/exec.mjs";
import { NETLIFY_DEPLOY } from "./shared/names.mjs";
import { log } from "./shared/log.mjs";
import process from "node:process";

guardOrExit({ script: "deploy-preview", needs: NETLIFY_DEPLOY });

// --- remote body (only reached with credentials present) --------------------
async function main() {
  // Build locally first so the exact dist/ is what gets uploaded.
  // WOULD RUN: npm run build
  await run("npm", ["run", "build"]);
  // Preview deploy — NO --prod flag ⇒ never touches the production alias.
  // WOULD RUN: npx netlify deploy --dir dist --site $NETLIFY_SITE_ID
  await run("npx", ["netlify", "deploy", "--dir", "dist", "--site", process.env["NETLIFY_SITE_ID"] ?? ""]);
  log.ok("deploy-preview complete (preview URL, non-production).");
}

main().catch((err) => {
  log.error(`deploy-preview failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
