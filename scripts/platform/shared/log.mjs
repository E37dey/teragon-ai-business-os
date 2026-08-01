// TERAGON AI BUSINESS OS — platform deploy: redacting logger (Gate S1).
// =============================================================================
// Every line printed by a platform script goes through here. The logger holds
// a registry of known secret VALUE substrings and scrubs them out of every
// message before it reaches stdout/stderr — so an accidental interpolation of a
// token can never leak. Values are NEVER stored except as the scrub registry,
// which is itself never printed.
//
// By default it auto-registers the values of ALL_DEPLOY_ENV_NAMES from
// process.env, so the moment a real .env.deploy is loaded, those values are
// redacted everywhere without any per-call effort.
import { collectSecretValues } from "./env.mjs";
import { ALL_DEPLOY_ENV_NAMES } from "./names.mjs";

const REDACTION_MASK = "«REDACTED»";

/** @type {Set<string>} known secret value substrings to scrub */
const secretValues = new Set();

/**
 * Register additional secret value substrings for scrubbing. Callers pass NAMES
 * (not values); we resolve values from process.env here so the value never has
 * to travel through calling code.
 * @param {readonly string[]} names
 */
export function registerSecretNames(names) {
  for (const v of collectSecretValues(names)) secretValues.add(v);
}

/**
 * Register secret VALUES directly (already resolved by a caller — e.g. values
 * parsed out of the gitignored .env.staging.local, which never live in
 * process.env). Same contract as registerSecretNames: the values are only ever
 * added to the scrub registry, never printed. Short values (<=6 chars) are
 * skipped to avoid over-scrubbing common words like "true"/"false".
 * @param {Iterable<string|undefined|null>} values
 */
export function registerSecretValues(values) {
  for (const v of values) {
    if (typeof v === "string" && v.trim().length > 6) secretValues.add(v.trim());
  }
}

// Auto-register the full deploy credential set on module load.
registerSecretNames(ALL_DEPLOY_ENV_NAMES);

/**
 * Scrub every registered secret value substring out of arbitrary text. Also
 * neutralises obvious inline `KEY=value` / `Bearer x` shapes as a belt-and-
 * suspenders pass for values we were never told about.
 * @param {unknown} input
 * @returns {string}
 */
export function redact(input) {
  let text = typeof input === "string" ? input : safeStringify(input);
  for (const value of secretValues) {
    if (value) text = text.split(value).join(REDACTION_MASK);
  }
  // Generic shapes — do not depend on prior registration.
  text = text.replace(/\b(sk-[A-Za-z0-9_-]{6,})/g, REDACTION_MASK);
  text = text.replace(/\b([Bb]earer)\s+[A-Za-z0-9._~+/=-]{12,}/g, `$1 ${REDACTION_MASK}`);
  // Mask the value FOLLOWING --db-password (or --password) in any command
  // preview / failure message, independent of secret-value registration. Covers
  // both `--db-password VALUE` and `--db-password=VALUE` forms.
  text = text.replace(/(--(?:db-)?password)(\s+|=)(\S+)/gi, `$1$2${REDACTION_MASK}`);
  return text;
}

function safeStringify(input) {
  if (input instanceof Error) return `${input.name}: ${input.message}`;
  try {
    return JSON.stringify(input);
  } catch {
    return String(input);
  }
}

/** Redact each arg, then join — used for every console write. */
function emit(stream, prefix, args) {
  const line = args.map((a) => redact(a)).join(" ");
  stream(`${prefix}${line}`);
}

export const log = {
  info: (...args) => emit(console.log, "  ", args),
  warn: (...args) => emit(console.warn, "  ! ", args),
  error: (...args) => emit(console.error, "  ✗ ", args),
  ok: (...args) => emit(console.log, "  ✓ ", args),
  step: (...args) => emit(console.log, "\n▸ ", args),
  plain: (...args) => emit(console.log, "", args),
};
