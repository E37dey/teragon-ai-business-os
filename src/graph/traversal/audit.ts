// TERAGON Business Graph — safe query audit (Phase 6).
// A traversal emits an audit record of SAFE METADATA ONLY. `queryId` is
// deterministic (SHA-256 over the query identity — never a clock/random). Raw
// search text is NEVER logged: only a stable hash + a coarse classification, so
// a sensitive search string cannot leak through the audit trail.
import { canonicalJSON, sha256Hex, type Canonicalizable } from "../store/hash";
import type { ActorRef } from "../contracts/actor";
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

export interface QueryIdInput {
  operation: GraphTraversalOperation;
  organizationId: string;
  actorRef: ActorRef;
  snapshotId: string | null;
  startNodeId: string | null;
  targetNodeId: string | null;
  searchTextHash: string | null;
  appliedLimits: GraphTraversalQueryLimits;
  filters: GraphQueryFilters;
  stale: boolean;
  health: string;
}

/**
 * Derive the deterministic query id. Identical query identity ⇒ identical id, on
 * any machine, at any time (no wall-clock, no randomness). Result-derived fields
 * (counts, duration) are deliberately EXCLUDED so the id names the QUERY.
 */
export async function deriveQueryId(input: QueryIdInput): Promise<string> {
  const digest = await sha256Hex(canonicalJSON(input as unknown as Canonicalizable));
  return `gq-${digest}`;
}
