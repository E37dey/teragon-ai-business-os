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
]);
