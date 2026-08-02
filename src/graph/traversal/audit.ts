// TERAGON Business Graph — safe query audit (Phase 6 + 6.1).
// A traversal emits an audit record of SAFE METADATA ONLY. Execution identity and
// request identity are SEPARATE (Phase 6.1): `executionId` is unique per run (an
// injected provider; default crypto.randomUUID) and names THIS execution, while
// `requestFingerprint` is deterministic (SHA-256 over the safe normalized request
// identity) and names the QUERY — correlating repeats without being a key. Raw
// search text is NEVER logged: only a stable hash + a coarse classification, so a
// sensitive search string cannot leak through the audit trail.
import { canonicalJSON, sha256Hex, type Canonicalizable } from "../store/hash";
import type {
  GraphQueryFilters,
  GraphTraversalOperation,
  GraphTraversalQueryLimits,
} from "./types";

/** Coarse, non-reversible duration buckets — never a raw millisecond count. */
export function durationBucket(ms: number): string {
  if (!Number.isFinite(ms) || ms < 1) return "lt_1ms";
  if (ms < 10) return "lt_10ms";
  if (ms < 100) return "lt_100ms";
  if (ms < 1000) return "lt_1s";
  return "gte_1s";
}

/**
 * Protect a raw search string: return a stable SHA-256 hash + a coarse class
 * (never the text). `null` in ⇒ `null` out. The class is length/charset-coarse
 * only — it reveals nothing about the content.
 */
export async function protectSearchText(
  raw: string | undefined,
): Promise<{ hash: string | null; classification: string | null }> {
  if (raw === undefined) return { hash: null, classification: null };
  const normalized = raw.trim();
  const hash = await sha256Hex(normalized.toLowerCase());
  let classification: string;
  if (normalized.length === 0) classification = "empty";
  else if (normalized.length <= 3) classification = "short";
  else if (normalized.length <= 32) classification = "medium";
  else classification = "long";
  return { hash, classification };
}

/**
 * The SAFE, normalized request identity that the deterministic fingerprint is
 * computed over. It carries ONLY request-shaping values — operation, org, the
 * start/target node ids, the resolved applied limits, the filter flags, and the
 * search-text HASH (never the raw text). It deliberately EXCLUDES execution
 * context (actor, snapshotId, stale, health) and result-derived fields (counts,
 * duration): those name the EXECUTION, not the request.
 */
export interface RequestFingerprintInput {
  operation: GraphTraversalOperation;
  organizationId: string;
  startNodeId: string | null;
  targetNodeId: string | null;
  appliedLimits: GraphTraversalQueryLimits;
  filters: GraphQueryFilters;
  searchTextHash: string | null;
}

/**
 * Derive the deterministic request fingerprint. Identical request identity ⇒
 * identical fingerprint, on any machine, at any time (no wall-clock, no
 * randomness). It is a CORRELATION value only — never a database primary key.
 */
export async function deriveRequestFingerprint(input: RequestFingerprintInput): Promise<string> {
  return sha256Hex(canonicalJSON(input as unknown as Canonicalizable));
}

/**
 * The default execution-id provider: a fresh Web Crypto UUID per call (allowed —
 * it is NOT `Math.random`/`Date.now`). Injected into the service so tests can
 * substitute a deterministic counter. The value names ONE execution and is never
 * used as a key.
 */
export function newExecutionId(): string {
  return globalThis.crypto.randomUUID();
}
