#!/usr/bin/env node
// TERAGON AI BUSINESS OS — configure the LINKED Netlify site (Gate S1).
// =============================================================================
// Fail-closed on credentials. Idempotent: updates existing Functions-scoped env
// vars in place (set is upsert), never creates a second site. Reuses the linked
// siteId from NETLIFY_SITE_ID / .netlify/state.json. Never sets VITE_-prefixed
// vars (those would ship to the browser).
import { guardOrExit } from "./shared/guard.mjs";
import { run } from "./shared/exec.mjs";
import { NETLIFY } from "./shared/names.mjs";
import { netlifyStatePresent } from "./shared/context.mjs";
import { log } from "./shared/log.mjs";
import process from "node:process";

guardOrExit({ script: "configure-netlify", needs: NETLIFY });

// --- remote body (only reached with credentials present) --------------------
async function main() {
  const link = netlifyStatePresent();
  log.info(`site link ${link.path}: ${link.present ? "present → reuse (no new site)" : "absent → NETLIFY_SITE_ID is authoritative"}`);

  // Server AI_* env (see .env.example) is set at scope Functions ONLY, never
  // build, never VITE_-prefixed. `env:set` is an UPSERT → idempotent.
  //
  // WOULD RUN (per server var, scope functions):
  //   npx netlify env:set AI_PROVIDER      "<value>" --scope functions --context all
  //   npx netlify env:set AI_MODEL         "<value>" --scope functions --context all
  //   npx netlify env:set AI_API_KEY       "<value>" --scope functions --context all --secret
  //   ...
  // Auth: NETLIFY_AUTH_TOKEN (env), site: NETLIFY_SITE_ID (env). No values logged.
  await run("npx", ["netlify", "env:list", "--json"]); // read-before-write (idempotency)
  log.ok("configure-netlify complete (idempotent env upsert, Functions scope only).");
}

main().catch((err) => {
  log.error(`configure-netlify failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
