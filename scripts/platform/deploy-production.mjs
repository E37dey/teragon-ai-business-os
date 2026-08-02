#!/usr/bin/env node
// TERAGON AI BUSINESS OS — deploy to Netlify PRODUCTION (Gate S1).
// =============================================================================
// DOUBLE-GATED. Refuses unless DEPLOY_PRODUCTION=true AND all Netlify
// credentials are present — both checks run BEFORE any remote action. Builds
// dist/ then promotes to the production alias (--prod). Idempotent against the
// linked site (redeploys the same site; never creates a new one).
import { guardOrExit } from "./shared/guard.mjs";
import { run } from "./shared/exec.mjs";
import { NETLIFY_DEPLOY } from "./shared/names.mjs";
import { log } from "./shared/log.mjs";
import process from "node:process";

// requireProductionGate: exits (code 3) unless DEPLOY_PRODUCTION=true, THEN the
// credential fail-closed check runs. No remote call happens before both pass.
guardOrExit({ script: "deploy-production", needs: NETLIFY_DEPLOY, requireProductionGate: true });

// --- remote body (only reached with gate + credentials present) -------------
async function main() {
  // WOULD RUN: npm run build
  await run("npm", ["run", "build"]);
  // Production promotion — the ONLY script that passes --prod.
  // WOULD RUN: npx netlify deploy --prod --dir dist --site $NETLIFY_SITE_ID
  await run("npx", ["netlify", "deploy", "--prod", "--dir", "dist", "--site", process.env["NETLIFY_SITE_ID"] ?? ""]);
  log.ok("deploy-production complete (production alias updated).");
}

main().catch((err) => {
  log.error(`deploy-production failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
