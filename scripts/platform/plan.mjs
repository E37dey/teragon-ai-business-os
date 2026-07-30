#!/usr/bin/env node
// TERAGON AI BUSINESS OS — platform deploy PLAN (Gate S1).
// =============================================================================
// FULLY READ-ONLY. Makes NO remote call. Requires NO credentials. Exits 0.
// Prints exactly what WOULD be created / migrated / seeded / configured /
// deployed for staging (and production, only if DEPLOY_PRODUCTION=true), plus:
//   • a credential readiness report BY NAME (present/missing) — never values
//   • the toolchain state (Supabase CLI, Docker daemon)
//   • the read-only local facts (git, migrations, config, site link)
//
// This is the safe "dry-run of the whole pipeline" the operator runs first.
import process from "node:process";
import { log } from "./shared/log.mjs";
import { classifyEnv } from "./shared/env.mjs";
import {
  ALL_DEPLOY_ENV_NAMES,
  OPTIONAL_DEPLOY_ENV_NAMES,
  SUPABASE_PROVISION,
  SUPABASE_MIGRATE,
  ADMIN_BOOTSTRAP,
  NETLIFY,
  NETLIFY_DEPLOY,
} from "./shared/names.mjs";
import {
  resolveEnvironment,
  deployProductionEnabled,
  gitFacts,
  migrationsPresent,
  supabaseConfigPresent,
  netlifyStatePresent,
  supabaseCliState,
  dockerState,
} from "./shared/context.mjs";

// Each pipeline stage: the script that owns it, the credential NAMES it needs,
// and the read-only description of what it WOULD do.
const STAGES = [
  {
    id: "provision-staging",
    needs: SUPABASE_PROVISION,
    would: [
      "verify-before-create: reuse SUPABASE_PROJECT_REF if the project already exists",
      "otherwise create a new Supabase project in SUPABASE_ORG_ID (region SUPABASE_REGION)",
      "link the local repo to the project (npx supabase link)",
    ],
  },
  {
    id: "migrate",
    needs: SUPABASE_MIGRATE,
    would: [
      "push committed supabase/migrations/*.sql to the LINKED remote DB (npx supabase db push)",
      "NEVER runs `db reset` against a linked/remote project",
    ],
  },
  {
    id: "bootstrap-admin",
    needs: ADMIN_BOOTSTRAP,
    would: [
      "idempotent: create the first admin (TERAGON_ADMIN_EMAIL) only if absent",
      "no-op if the admin user already exists",
    ],
  },
  {
    id: "configure-netlify",
    needs: NETLIFY,
    would: [
      "set Functions-scoped env on the linked Netlify site (names from .env.deploy, never VITE_-prefixed)",
      "idempotent: updates existing vars in place, never duplicates the site",
    ],
  },
  {
    id: "deploy-preview",
    needs: NETLIFY_DEPLOY,
    would: ["build dist/ then deploy a Netlify DEPLOY PREVIEW (non-production)"],
  },
  {
    id: "verify-preview",
    needs: NETLIFY_DEPLOY,
    would: ["smoke-check the deployed preview URL (headers, routes) — read-only"],
  },
];

const PRODUCTION_STAGE = {
  id: "deploy-production",
  needs: NETLIFY_DEPLOY,
  would: [
    "REQUIRES DEPLOY_PRODUCTION=true or it refuses",
    "build dist/ then deploy to Netlify PRODUCTION (--prod)",
  ],
};

function label(name) {
  return OPTIONAL_DEPLOY_ENV_NAMES.has(name) ? `${name} (optional)` : name;
}

async function main() {
  const env = process.env;
  const targetEnv = resolveEnvironment(env);
  const prodGate = deployProductionEnabled(env);

  log.step("TERAGON platform PLAN — READ-ONLY (no remote calls, no credentials required)");
  log.info(`target environment: ${targetEnv}`);
  log.info(`DEPLOY_PRODUCTION gate: ${prodGate ? "ENABLED (production stages shown)" : "disabled (staging only)"}`);

  // --- read-only local facts -------------------------------------------------
  log.step("Local facts (read-only)");
  const git = await gitFacts();
  log.info(`git: commit=${git.commit ?? "?"} branch=${git.branch ?? "?"} clean=${git.clean === null ? "unknown" : git.clean}`);
  const mig = migrationsPresent();
  log.info(`supabase migrations: ${mig.present ? `${mig.count} file(s)` : "none yet (supabase/migrations/)"}`);
  log.info(`supabase config.toml: ${supabaseConfigPresent() ? "present" : "absent"}`);
  const link = netlifyStatePresent();
  log.info(`netlify site link (${link.path}): ${link.present ? "linked" : "not linked"}`);

  // --- toolchain state -------------------------------------------------------
  log.step("Toolchain state");
  const cli = await supabaseCliState();
  log.info(`supabase CLI: ${cli.available ? `available ${cli.version}` : "NOT resolvable via npx (run npm install)"}`);
  const docker = await dockerState();
  log.info(`docker daemon: ${docker.available ? `up (server ${docker.serverVersion})` : "DOWN / not installed (local Supabase steps would be skipped)"}`);

  // --- the plan itself -------------------------------------------------------
  const stages = prodGate ? [...STAGES, PRODUCTION_STAGE] : STAGES;
  log.step(`Planned pipeline for: ${targetEnv}`);
  for (const stage of stages) {
    const { missing } = classifyEnv(stage.needs, env);
    const readiness = missing.length === 0 ? "creds READY" : `creds MISSING: ${missing.join(", ")}`;
    log.plain(`  [${stage.id}] — ${readiness}`);
    for (const line of stage.would) log.plain(`      would: ${line}`);
  }

  // --- credential readiness report BY NAME (never values) --------------------
  log.step("Credential readiness (by NAME — values never read or printed)");
  const { present, missing } = classifyEnv(ALL_DEPLOY_ENV_NAMES, env);
  log.plain(`  PRESENT (${present.length}): ${present.map(label).join(", ") || "(none)"}`);
  log.plain(`  MISSING (${missing.length}): ${missing.map(label).join(", ") || "(none)"}`);

  log.step("PLAN complete — nothing was created, migrated, deployed, or contacted. (exit 0)");
  process.exit(0);
}

main().catch((err) => {
  // Even an unexpected failure must not leak — route through the redacting log.
  log.error(`plan failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
