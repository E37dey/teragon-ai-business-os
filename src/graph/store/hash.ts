// TERAGON Business Graph — deterministic content hashing (Phase 4.1).
// ---------------------------------------------------------------------------
// THE EXACT ALGORITHM (documented, because the index depends on it byte-for-byte)
// ---------------------------------------------------------------------------
// 1. CANONICALIZE. `canonicalJSON(value)` produces a stable string:
//      • object keys are emitted in ASCII-sorted order, recursively;
//      • arrays keep their given order (the derivation already sorts every
//        collection by a stable key, so order is itself deterministic);
//      • only JSON-safe leaves are allowed (string/number/boolean/null); a
//        number that is NaN/±Infinity is refused (it is not stable JSON);
//      • `undefined` object properties are dropped (as JSON.stringify would).
//    Nothing browser-specific, no Date, no Math.random, no iteration-order
//    dependence enters the string.
// 2. HASH. `sha256Hex(str)` is SHA-256 over the UTF-8 bytes of the canonical
//    string via Web Crypto (`crypto.subtle.digest("SHA-256", …)`), returned as
//    a fixed 64-char lowercase hex string. SHA-256 is a standardized, non-keyed
//    hash with NO external dependency; Web Crypto is available and byte-identical
//    in both the browser (same-origin) and the Vitest/Node runtime. It is ASYNC,
//    so every hashing entry point returns a Promise.
//
// CONTRACT: identical canonical input ⇒ identical hex output; a one-byte change
// ⇒ a different digest. The same graph content (nodes/edges/issues) always yields
// the same `checksum`; the same source-derived content (nodes/edges tied to a
// source version) always yields the same `sourceHash`. Timestamps, random ids and
// volatile lifecycle fields are excluded by the CALLER (see snapshot.ts) — this
// module hashes only what it is given.
//
// SECURITY NOTE: this is an INTEGRITY checksum (corruption / partial-write /
// tamper detection), not a secret/authentication tag. FNV-1a was removed — it is
// no longer the canonical integrity checksum, and it had no other purpose here.
import {
  GRAPH_INDEX_CHECKSUM_ALGORITHM,
  GRAPH_INDEX_CHECKSUM_VERSION,
  type GraphIndexChecksumAlgorithm,
} from "./contracts";
import type { BusinessGraphNode } from "../contracts/node";
import type { BusinessGraphEdge } from "../contracts/edge";
import type {
  GraphDerivationIssue,
  GraphUnmappableRecord,
} from "../derivation";

// ---------------------------------------------------------------------------
// canonical JSON
// ---------------------------------------------------------------------------

/** A JSON-safe value graph — the only thing that may be canonicalized. */
export type Canonicalizable =
  | string
  | number
  | boolean
  | null
  | Canonicalizable[]
  | { [key: string]: Canonicalizable | undefined };

export function canonicalJSON(value: Canonicalizable): string {
  if (value === null) return "null";
  const t = typeof value;
  if (t === "string") return JSON.stringify(value);
  if (t === "boolean") return value ? "true" : "false";
  if (t === "number") {
    const n = value as number;
    if (!Number.isFinite(n)) {
      throw new Error(`canonicalJSON: non-finite number is not stable (${String(n)})`);
    }
    return JSON.stringify(n);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalJSON(v ?? null)).join(",")}]`;
  }
  // object: sort keys ASCII-ascending, drop undefined values.
  const obj = value as { [key: string]: Canonicalizable | undefined };
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  const parts = keys.map((k) => `${JSON.stringify(k)}:${canonicalJSON(obj[k] as Canonicalizable)}`);
  return `{${parts.join(",")}}`;
}

// ---------------------------------------------------------------------------
// SHA-256 (Web Crypto — no dependency, browser + Node byte-identical)
// ---------------------------------------------------------------------------

/** SHA-256 of a UTF-8 string → fixed 64-char lowercase hex. Async (Web Crypto). */
export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  const view = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < view.length; i += 1) {
    hex += view[i]!.toString(16).padStart(2, "0");
  }
  return hex;
}

/** Hash a canonicalizable value: canonicalize, then SHA-256. Async. */
export async function hashContent(value: Canonicalizable): Promise<string> {
  return sha256Hex(canonicalJSON(value));
}

// ---------------------------------------------------------------------------
// the two graph hashes
// ---------------------------------------------------------------------------

export interface GraphChecksumInput {
  schemaVersion: string;
  registryVersion: string;
  derivationVersion: string;
  organizationId: string;
  sourceSnapshotVersion: string;
  checksumAlgorithm: GraphIndexChecksumAlgorithm;
  checksumVersion: number;
  nodes: readonly BusinessGraphNode[];
  edges: readonly BusinessGraphEdge[];
  issues: readonly GraphDerivationIssue[];
  unmappableRecords: readonly GraphUnmappableRecord[];
}

/**
 * The full-content SHA-256 checksum. Covers everything persisted for the graph
 * body (plus the algorithm/version pins), so a dropped/partial node, edge or
 * issue — or a swapped hashing scheme — changes it: the corruption/partial-write
 * detector. Excludes ALL timestamps + lifecycle/build fields.
 */
export async function computeChecksum(input: GraphChecksumInput): Promise<string> {
  return hashContent({
    schemaVersion: input.schemaVersion,
    registryVersion: input.registryVersion,
    derivationVersion: input.derivationVersion,
    organizationId: input.organizationId,
    sourceSnapshotVersion: input.sourceSnapshotVersion,
    checksumAlgorithm: input.checksumAlgorithm,
    checksumVersion: input.checksumVersion,
    nodes: input.nodes as unknown as Canonicalizable,
    edges: input.edges as unknown as Canonicalizable,
    issues: input.issues as unknown as Canonicalizable,
    unmappableRecords: input.unmappableRecords as unknown as Canonicalizable,
  });
}

export interface GraphSourceHashInput {
  registryVersion: string;
  sourceSnapshotVersion: string;
  nodes: readonly BusinessGraphNode[];
  edges: readonly BusinessGraphEdge[];
}

/**
 * The source-tied SHA-256 hash. Covers only the source-derived nodes+edges (plus
 * the registry + source version that produced them). Comparing a stored
 * snapshot's `sourceHash` against a freshly-derived one is how staleness ("source
 * hash differs from latest canonical snapshot") is detected without a clock.
 */
export async function computeSourceHash(input: GraphSourceHashInput): Promise<string> {
  return hashContent({
    registryVersion: input.registryVersion,
    sourceSnapshotVersion: input.sourceSnapshotVersion,
    nodes: input.nodes as unknown as Canonicalizable,
    edges: input.edges as unknown as Canonicalizable,
  });
}

/**
 * The deterministic snapshot id: `idx-{org}-{checksum}`. Embeds the FULL SHA-256
 * checksum (64 hex chars ≥ 128-bit), never a random uuid or timestamp — so an
 * identical canonical input yields an identical id (idempotent rebuilds map to
 * the same snapshot).
 */
export function buildSnapshotId(organizationId: string, checksum: string): string {
  const safeOrg = organizationId.replace(/[^A-Za-z0-9_-]/gu, "_");
  return `idx-${safeOrg}-${checksum}`;
}

// re-exported for callers that stamp the metadata alongside the hash.
export { GRAPH_INDEX_CHECKSUM_ALGORITHM, GRAPH_INDEX_CHECKSUM_VERSION };
