// TERAGON AI BUSINESS OS — platform deploy: env NAME reader (Gate S1).
// =============================================================================
// Mirrors the spirit of src/server/config.ts: read an injected env record,
// NEVER throw on read, NEVER return or log a VALUE. Everything here answers
// "which credential NAMES are present vs missing" — never "what is the value".
//
// The one place we intentionally throw is requireCredentials(), the fail-closed
// guard the remote-op scripts call BEFORE any network action. It reports NAMES
// only.
import process from "node:process";

/**
 * A value is "present" iff it is a non-empty, non-whitespace string.
 * We deliberately treat "   " and "" as absent — a blank placeholder in a
 * .env.deploy file is not a credential.
 */
export function isPresent(value) {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * Classify a list of env var NAMES against an env record (defaults to
 * process.env). Returns NAMES ONLY — never values.
 * @param {readonly string[]} names
 * @param {Readonly<Record<string, string | undefined>>} [env]
 * @returns {{present: string[], missing: string[]}}
 */
export function classifyEnv(names, env = process.env) {
  const present = [];
  const missing = [];
  for (const name of names) {
    if (isPresent(env[name])) present.push(name);
    else missing.push(name);
  }
  return { present, missing };
}

/** Typed error carrying the missing NAMES (never values). */
export class MissingCredentialsError extends Error {
  /** @param {string[]} missing */
  constructor(missing) {
    super(`Missing required credentials (by name): ${missing.join(", ")}`);
    this.name = "MissingCredentialsError";
    /** @type {string[]} */
    this.missing = missing;
  }
}

/**
 * Fail-closed credential gate. Throws MissingCredentialsError listing the
 * missing NAMES if ANY of `names` is absent from the env record. On success
 * returns the present NAMES (never values), so callers stay value-blind.
 * @param {readonly string[]} names
 * @param {Readonly<Record<string, string | undefined>>} [env]
 * @returns {string[]} present names
 */
export function requireCredentials(names, env = process.env) {
  const { present, missing } = classifyEnv(names, env);
  if (missing.length > 0) throw new MissingCredentialsError(missing);
  return present;
}

/**
 * Collect the VALUES of the given env NAMES for redaction wiring only.
 * This is the ONLY function that returns values, and its sole consumer is the
 * logger's redaction registry — never print its result. Absent names are
 * skipped. Short values (<=6 chars, e.g. "false", "true") are skipped to avoid
 * over-scrubbing common words.
 * @param {readonly string[]} names
 * @param {Readonly<Record<string, string | undefined>>} [env]
 * @returns {string[]} secret value substrings to scrub
 */
export function collectSecretValues(names, env = process.env) {
  const values = [];
  for (const name of names) {
    const v = env[name];
    if (typeof v === "string" && v.trim().length > 6) values.push(v.trim());
  }
  return values;
}
