// TERAGON AI BUSINESS OS — staging stage tracker (Gate S7.0).
// =============================================================================
// Records WHERE the staging pipeline got to, so a failed rerun can detect the
// idempotent steps already completed and continue safely — never duplicating a
// project or admin, never deleting a remote DB, never resetting production,
// never overwriting unrelated Netlify config.
//
// It stores ONLY SAFE, MASKED metadata (project ref masked, site id masked,
// timestamps, the current state name). No secrets, ever. The state file is
// gitignored. Injectable path/clock for tests.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./context.mjs";

/** Ordered pipeline states. FAILED is terminal-until-retry. */
export const STATES = /** @type {const} */ ([
  "PLAN_READY",
  "PROVISIONING",
  "PROJECT_READY",
  "MIGRATIONS_APPLIED",
  "SCHEMA_VERIFIED",
  "RLS_VALIDATED",
  "ADMIN_BOOTSTRAPPED",
  "NETLIFY_CONFIGURED",
  "PREVIEW_DEPLOYED",
  "ACCEPTANCE_PASSED",
  "FAILED",
]);

/** The successful forward order (excludes FAILED) — used for "already done?". */
export const FORWARD_ORDER = STATES.filter((s) => s !== "FAILED");

const DEFAULT_PATH = join(REPO_ROOT, ".teragon-staging-state.json");

/** Mask a ref/id so only a prefix is ever persisted or shown. */
export function mask(value) {
  if (typeof value !== "string" || value.length === 0) return null;
  if (value.length <= 6) return `${value.slice(0, 2)}…`;
  return `${value.slice(0, 6)}…(${value.length})`;
}

function emptyState() {
  return {
    version: 1,
    state: "PLAN_READY",
    completed: /** @type {string[]} */ ([]),
    project: { refMask: /** @type {string|null} */ (null), orgVerified: false, region: null },
    netlify: { siteIdMask: /** @type {string|null} */ (null) },
    admin: { emailDomain: /** @type {string|null} */ (null), bootstrapped: false },
    updatedAt: null,
    history: /** @type {Array<{state:string, at:string, note?:string}>} */ ([]),
  };
}

/**
 * Create a stage tracker.
 * @param {Object} [deps]
 * @param {string} [deps.path]           state file path (defaults to gitignored repo file)
 * @param {()=>string} [deps.now]        clock (ISO string)
 * @param {(p:string)=>string|null} [deps.reader]   raw file reader (test injection)
 * @param {(p:string,text:string)=>void} [deps.writer]  raw file writer (test injection)
 */
export function createStageTracker(deps = {}) {
  const path = deps.path ?? DEFAULT_PATH;
  const now = deps.now ?? (() => new Date().toISOString());
  const reader =
    deps.reader ?? ((p) => (existsSync(p) ? readFileSync(p, "utf8") : null));
  const writer = deps.writer ?? ((p, t) => writeFileSync(p, t, { encoding: "utf8", mode: 0o600 }));

  function read() {
    const raw = reader(path);
    if (!raw) return emptyState();
    try {
      const parsed = JSON.parse(raw);
      return { ...emptyState(), ...parsed };
    } catch {
      return emptyState();
    }
  }

  function write(state) {
    state.updatedAt = now();
    writer(path, JSON.stringify(state, null, 2) + "\n");
    return state;
  }

  /** Has a forward state already been reached in a given state object? */
  function isComplete(state, target) {
    return Array.isArray(state?.completed) && state.completed.includes(target);
  }

  /**
   * Record that a forward step completed. Never regresses past FAILED silently:
   * a completed step is recorded in `completed` (idempotent set) and becomes the
   * current state. Safe metadata may be merged via `patch`.
   * @param {string} target one of FORWARD_ORDER
   * @param {object} [patch] safe, masked metadata to merge (project/netlify/admin)
   * @param {string} [note]
   */
  function markComplete(target, patch = {}, note) {
    if (!FORWARD_ORDER.includes(target)) throw new Error(`unknown stage: ${target}`);
    const state = read();
    if (!state.completed.includes(target)) state.completed.push(target);
    state.state = target;
    if (patch.project) state.project = { ...state.project, ...patch.project };
    if (patch.netlify) state.netlify = { ...state.netlify, ...patch.netlify };
    if (patch.admin) state.admin = { ...state.admin, ...patch.admin };
    state.history.push({ state: target, at: now(), ...(note ? { note } : {}) });
    return write(state);
  }

  /** Enter a transient in-progress state (e.g. PROVISIONING) without completing it. */
  function enter(target, note) {
    const state = read();
    state.state = target;
    state.history.push({ state: target, at: now(), ...(note ? { note } : {}) });
    return write(state);
  }

  /** Record failure with a SAFE reason (already redacted by the caller). */
  function fail(reason) {
    const state = read();
    state.state = "FAILED";
    state.history.push({ state: "FAILED", at: now(), note: String(reason).slice(0, 200) });
    return write(state);
  }

  /** Was a step already completed? (public idempotency probe) */
  function completed(target) {
    return read().completed.includes(target);
  }

  return { path, read, write, markComplete, enter, fail, completed, isComplete };
}
