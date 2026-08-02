// TERAGON AI BUSINESS OS — migration lineage + safety helper (Gate S7.0).
// =============================================================================
// The migration set was validated LIVE in Gate S5 (see docs/SUPABASE_CI_
// VALIDATION_REPORT.md + the S5.2 live-adapter PASS). migrate.mjs must never
// push a migration set that has silently drifted from that validated baseline.
//
// This module:
//   • computes a deterministic sha256 manifest of the local supabase/migrations
//     *.sql files (filename + content hash, sorted);
//   • compares it to the committed lock (supabase/migrations.lock.json) — the
//     recorded S5-validated lineage;
//   • scans migration SQL for DESTRUCTIVE statements that must never run against
//     a remote/staging DB (drop database / drop schema public / truncate /
//     `db reset`-style wipes);
//   • compares a remote migration history (versions applied on the linked
//     project) against the local set to reject UNEXPECTED remote migrations.
// No remote calls happen here — callers pass the remote history in.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./context.mjs";

const MIGRATIONS_DIR = join(REPO_ROOT, "supabase", "migrations");
export const LOCK_PATH = join(MIGRATIONS_DIR, "migrations.lock.json");
export const EXPECTED_COUNT = 14;

function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Normalize CRLF→LF so a hash is stable across checkouts / OSes. */
function normalize(text) {
  return text.replace(/\r\n/g, "\n");
}

/**
 * Build the manifest of the local migration files: sorted list of
 * { file, sha256 } plus a combined digest. Pure over a directory reader.
 * @param {string} [dir]
 * @param {{ list?: (d:string)=>string[], read?: (p:string)=>string }} [io]
 */
export function computeManifest(dir = MIGRATIONS_DIR, io = {}) {
  const list = io.list ?? ((d) => readdirSync(d));
  const read = io.read ?? ((p) => readFileSync(p, "utf8"));
  const files = list(dir)
    .filter((f) => f.toLowerCase().endsWith(".sql"))
    .sort();
  const entries = files.map((file) => ({ file, sha256: sha256(normalize(read(join(dir, file)))) }));
  const combined = sha256(entries.map((e) => `${e.file}:${e.sha256}`).join("\n"));
  return { count: entries.length, combined, entries };
}

/** Load the committed S5-validated lock, or null when absent. */
export function loadLock(path = LOCK_PATH, read = (p) => (existsSync(p) ? readFileSync(p, "utf8") : null)) {
  const raw = read(path);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Write the lock file (used once to record the validated baseline). */
export function writeLock(manifest, path = LOCK_PATH) {
  const lock = {
    note: "S5-validated migration lineage. migrate.mjs refuses to push a set whose combined digest differs from this. Regenerate ONLY after re-validating live (Gate S5).",
    validatedGate: "S5.2",
    count: manifest.count,
    combined: manifest.combined,
    entries: manifest.entries,
  };
  writeFileSync(path, JSON.stringify(lock, null, 2) + "\n", "utf8");
  return lock;
}

// Destructive statements that must NEVER be pushed to a remote/staging DB.
const DESTRUCTIVE_PATTERNS = [
  { id: "drop-database", re: /\bdrop\s+database\b/i },
  { id: "drop-schema-public", re: /\bdrop\s+schema\s+(if\s+exists\s+)?public\b/i },
  { id: "truncate", re: /\btruncate\s+/i },
  { id: "drop-table", re: /\bdrop\s+table\b/i },
  { id: "delete-unqualified", re: /\bdelete\s+from\s+[a-z0-9_."]+\s*;/i },
];

/**
 * Scan the migration SQL bodies for destructive statements.
 * @returns {Array<{file:string, id:string}>} findings (empty = clean)
 */
export function scanDestructive(dir = MIGRATIONS_DIR, io = {}) {
  const list = io.list ?? ((d) => readdirSync(d));
  const read = io.read ?? ((p) => readFileSync(p, "utf8"));
  const findings = [];
  for (const file of list(dir).filter((f) => f.toLowerCase().endsWith(".sql")).sort()) {
    const text = read(join(dir, file));
    for (const { id, re } of DESTRUCTIVE_PATTERNS) if (re.test(text)) findings.push({ file, id });
  }
  return findings;
}

/**
 * Compare a REMOTE migration history against the local manifest. Any remote
 * version NOT represented by a local migration filename is "unexpected" and
 * blocks apply (someone changed the remote out of band).
 * @param {Array<{version?:string, name?:string}>} remoteHistory
 * @param {{entries:Array<{file:string}>}} manifest
 */
export function compareRemoteHistory(remoteHistory, manifest) {
  // Local versions are the leading numeric prefix of each filename (001, 002…).
  const localVersions = new Set(
    manifest.entries.map((e) => {
      const m = /^(\d+)/.exec(e.file);
      return m ? m[1] : e.file;
    }),
  );
  const unexpected = [];
  for (const row of Array.isArray(remoteHistory) ? remoteHistory : []) {
    const v = String(row.version ?? row.name ?? "").trim();
    if (!v) continue;
    const short = /^(\d+)/.exec(v)?.[1] ?? v;
    if (!localVersions.has(short) && !localVersions.has(v)) unexpected.push(v);
  }
  return { unexpected, localVersionCount: localVersions.size };
}

/**
 * Full pre-apply safety verdict (pure). Callers pass the remote history (or null
 * when it could not be read). Returns a structured, NAMES/versions-only report.
 * @param {Object} args
 * @param {Array<{version?:string}>|null} args.remoteHistory
 * @param {string} [args.dir]
 * @param {object} [args.io]
 */
export function migrationSafetyReport({ remoteHistory, dir = MIGRATIONS_DIR, io = {} }) {
  const manifest = computeManifest(dir, io);
  const lock = loadLock();
  const countOk = manifest.count === EXPECTED_COUNT;
  const lineageOk = Boolean(lock) && lock.combined === manifest.combined;
  const destructive = scanDestructive(dir, io);
  const remote = remoteHistory == null ? null : compareRemoteHistory(remoteHistory, manifest);
  const reasons = [];
  if (!countOk) reasons.push(`expected ${EXPECTED_COUNT} migrations, found ${manifest.count}`);
  if (!lock) reasons.push("migrations.lock.json missing (no S5-validated baseline to compare)");
  else if (!lineageOk) reasons.push("local migration digest differs from the S5-validated lock");
  if (destructive.length) reasons.push(`destructive SQL: ${destructive.map((d) => `${d.file}:${d.id}`).join(", ")}`);
  if (remote && remote.unexpected.length) reasons.push(`unexpected remote migrations: ${remote.unexpected.join(", ")}`);
  return {
    ok: reasons.length === 0,
    countOk,
    lineageOk,
    count: manifest.count,
    combined: manifest.combined,
    destructive,
    remote,
    reasons,
  };
}
