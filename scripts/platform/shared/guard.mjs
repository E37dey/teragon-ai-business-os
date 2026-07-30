// TERAGON AI BUSINESS OS — platform deploy: fail-closed guard helper (Gate S1).
// =============================================================================
// The shared entry gate every remote-op script runs FIRST. It calls
// requireCredentials([...]) and, if anything is missing, prints the missing
// NAMES ONLY and exits BEFORE any remote action. It also registers the required
// names for redaction and enforces the DEPLOY_PRODUCTION gate when asked.
//
// Usage in a remote-op script:
//   guardOrExit({ script: "migrate", needs: SUPABASE_MIGRATE });   // then remote body
import process from "node:process";
import { requireCredentials, MissingCredentialsError } from "./env.mjs";
import { registerSecretNames, log } from "./log.mjs";
import { deployProductionEnabled } from "./context.mjs";

/**
 * @param {{script: string, needs: readonly string[], requireProductionGate?: boolean}} opts
 * @returns {string[]} present names (never values) — only returned when the gate passes
 */
export function guardOrExit({ script, needs, requireProductionGate = false }) {
  log.step(`${script} — fail-closed credential check`);

  if (requireProductionGate && !deployProductionEnabled()) {
    log.error(
      `refused: production deploy requires DEPLOY_PRODUCTION=true (currently disabled). No remote action taken.`,
    );
    process.exit(3);
  }

  // Register secret values for redaction BEFORE any further logging.
  registerSecretNames(needs);

  try {
    const present = requireCredentials(needs);
    log.ok(`all required credentials present by name: ${present.join(", ")}`);
    return present;
  } catch (err) {
    if (err instanceof MissingCredentialsError) {
      log.error(`refused BEFORE any remote action — missing credentials (by NAME): ${err.missing.join(", ")}`);
      log.info(`set these in an untracked .env.deploy (see .env.deploy.example). Values are never printed.`);
      process.exit(2);
    }
    throw err;
  }
}
