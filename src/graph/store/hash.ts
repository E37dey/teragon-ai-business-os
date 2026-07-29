// TERAGON Business Graph — deterministic content hashing (Phase 4).
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
// 2. HASH. `fnv1a64(str)` is a pure FNV-1a 64-bit hash over the UTF-16 code
//    units of the canonical string, returned as a fixed 16-char lowercase hex
//    string. FNV-1a is deterministic and dependency-free (offset basis
//    0xcbf29ce484222325, prime 0x100000001b3, all math in BigInt mod 2^64).
//
// CONTRACT: identical canonical input ⇒ identical hex output. The same graph
// content (nodes/edges/issues) always yields the same `checksum`; the same
// source-derived content (nodes/edges tied to a source version) always yields
// the same `sourceHash`. Timestamps, random ids and volatile lifecycle fields
// are excluded by the CALLER (see snapshot.ts) — this module hashes only what it
// is given.
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
// FNV-1a 64-bit (pure, BigInt)
// ---------------------------------------------------------------------------

const FNV_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK_64 = (1n << 64n) - 1n;

export function fnv1a64(input: string): string {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = (hash * FNV_PRIME) & MASK_64;
  }
  return hash.toString(16).padStart(16, "0");
}

/** Hash a canonicalizable value: canonicalize, then FNV-1a-64. */
export function hashContent(value: Canonicalizable): string {
  return fnv1a64(canonicalJSON(value));
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
  nodes: readonly BusinessGraphNode[];
  edges: readonly BusinessGraphEdge[];
  issues: readonly GraphDerivationIssue[];
  unmappableRecords: readonly GraphUnmappableRecord[];
}

/**
 * The full-content checksum. Covers everything persisted for the graph body, so
 * a dropped/partial node, edge or issue changes it — the corruption/partial-
 * write detector. Excludes ALL timestamps + lifecycle/build fields.
 */
export function computeChecksum(input: GraphChecksumInput): string {
  return hashContent({
    schemaVersion: input.schemaVersion,
    registryVersion: input.registryVersion,
    derivationVersion: input.derivationVersion,
    organizationId: input.organizationId,
    sourceSnapshotVersion: input.sourceSnapshotVersion,
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
 * The source-tied hash. Covers only the source-derived nodes+edges (plus the
 * registry + source version that produced them). Comparing a stored snapshot's
 * `sourceHash` against a freshly-derived one is how staleness ("source hash
 * differs from latest canonical snapshot") is detected without a clock.
 */
export function computeSourceHash(input: GraphSourceHashInput): string {
  return hashContent({
    registryVersion: input.registryVersion,
    sourceSnapshotVersion: input.sourceSnapshotVersion,
    nodes: input.nodes as unknown as Canonicalizable,
    edges: input.edges as unknown as Canonicalizable,
  });
}

/**
 * The deterministic snapshot id: `idx-{org}-{checksum}`. Embeds the stable
 * checksum, never a random uuid or timestamp — so an identical canonical input
 * yields an identical id (idempotent rebuilds map to the same snapshot).
 */
export function buildSnapshotId(organizationId: string, checksum: string): string {
  const safeOrg = organizationId.replace(/[^A-Za-z0-9_-]/gu, "_");
  return `idx-${safeOrg}-${checksum}`;
}
