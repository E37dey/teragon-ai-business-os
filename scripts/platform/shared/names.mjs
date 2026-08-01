// TERAGON AI BUSINESS OS — platform deploy: credential NAME registry (Gate S1).
// =============================================================================
// The single source of truth for WHICH env var NAMES each step needs. NAMES
// ONLY — this file contains no values and is safe to print. Every remote-op
// script imports its required names from here and fail-closes on them, and the
// plan/logger use ALL_DEPLOY_ENV_NAMES to build the readiness report and the
// redaction registry.
//
// Convention (mirrors .env.deploy.example): server-only, NEVER VITE_-prefixed.

/** Supabase project provisioning / linking (Management API + CLI). */
export const SUPABASE_PROVISION = ["SUPABASE_ACCESS_TOKEN", "SUPABASE_ORG_ID", "SUPABASE_DB_PASSWORD"];

/** Applying migrations against the linked remote DB. */
export const SUPABASE_MIGRATE = ["SUPABASE_ACCESS_TOKEN", "SUPABASE_DB_PASSWORD", "SUPABASE_PROJECT_REF"];

/** Seeding the first admin (service-role / DB access on the provisioned project). */
export const ADMIN_BOOTSTRAP = ["SUPABASE_ACCESS_TOKEN", "SUPABASE_PROJECT_REF", "TERAGON_ADMIN_EMAIL", "TERAGON_ADMIN_PASSWORD"];

/** Pushing env + config to the linked Netlify site. */
export const NETLIFY = ["NETLIFY_AUTH_TOKEN", "NETLIFY_SITE_ID"];

/** Deploy preview / production to Netlify. */
export const NETLIFY_DEPLOY = ["NETLIFY_AUTH_TOKEN", "NETLIFY_SITE_ID"];

/**
 * Every deploy env NAME we know about — used ONLY to build the credential
 * readiness report (present/missing by name) and to register secret values for
 * redaction. Optional names are marked so plan can label them.
 */
export const ALL_DEPLOY_ENV_NAMES = [
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_ORG_ID",
  "SUPABASE_DB_PASSWORD",
  "SUPABASE_PROJECT_REF",
  "SUPABASE_REGION",
  "NETLIFY_AUTH_TOKEN",
  "NETLIFY_SITE_ID",
  "TERAGON_ADMIN_EMAIL",
  "TERAGON_ADMIN_PASSWORD",
  "DEPLOY_PRODUCTION",
];

/** NAMES that are optional (have a default or are only sometimes needed). */
export const OPTIONAL_DEPLOY_ENV_NAMES = new Set([
  "SUPABASE_PROJECT_REF",
  "SUPABASE_REGION",
  "DEPLOY_PRODUCTION",
  // S7.0 additions — server-only project connection values resolved AFTER
  // provisioning (never VITE_-prefixed) and the explicit confirmation gates.
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "TERAGON_ADMIN_EMAIL_CONFIRMED",
  "SUPABASE_ACCESS_TOKEN",
]);

/**
 * S7.0 secret VALUE names — the subset whose VALUES must be scrubbed from every
 * log line no matter where they were sourced (process.env OR the gitignored
 * .env.staging.local). NAMES only; values are resolved by the credential
 * provider and registered with the logger, never printed.
 */
export const SECRET_VALUE_NAMES = [
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_DB_PASSWORD",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ANON_KEY",
  "TERAGON_ADMIN_PASSWORD",
  "NETLIFY_AUTH_TOKEN",
];

/**
 * S7.0 unified per-command credential specification. The single source of truth
 * the credential provider validates against. Each entry declares:
 *   • supabaseAuth — the command needs Supabase Management-API authorization,
 *     satisfied by SUPABASE_ACCESS_TOKEN (env-token) OR an authenticated CLI
 *     session (cli-session). This is expressed as an authorization REQUIREMENT,
 *     never as a bare SUPABASE_ACCESS_TOKEN name, so a logged-in operator with
 *     no token still passes fail-closed.
 *   • names — plain env/staging NAMES that must be present (values never read
 *     for validation — presence only).
 *   • serviceClient — the command talks to the project via the service-role
 *     Admin API and therefore needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 *   • confirmGate — an explicit NAME that must equal "true" or the command
 *     refuses (used to hold bootstrap-admin until the email is human-confirmed).
 *   • netlifyAuth — the command needs a Netlify token (NETLIFY_AUTH_TOKEN).
 * NAMES ONLY — safe to print.
 */
export const COMMAND_CREDENTIALS = {
  "provision-staging": {
    supabaseAuth: true,
    names: ["SUPABASE_ORG_ID", "SUPABASE_DB_PASSWORD"],
    optional: ["SUPABASE_PROJECT_REF", "SUPABASE_REGION"],
  },
  migrate: {
    supabaseAuth: true,
    names: ["SUPABASE_DB_PASSWORD", "SUPABASE_PROJECT_REF"],
  },
  "bootstrap-admin": {
    serviceClient: true,
    names: ["TERAGON_ADMIN_EMAIL", "TERAGON_ADMIN_PASSWORD"],
    confirmGate: "TERAGON_ADMIN_EMAIL_CONFIRMED",
  },
  "configure-netlify": {
    netlifyAuth: true,
    serviceClient: true,
    names: ["NETLIFY_SITE_ID", "SUPABASE_URL", "SUPABASE_ANON_KEY"],
  },
  "deploy-preview": {
    netlifyAuth: true,
    names: ["NETLIFY_SITE_ID"],
  },
  "verify-preview": {
    netlifyAuth: true,
    names: ["NETLIFY_SITE_ID"],
  },
};
