// TERAGON Business Graph — retention + non-destructive recovery (Phase 4).
// Recovery affects ONLY the derived index — it NEVER modifies canonical CRM
// records (the store has no access to them). It selects a previous known-good
// snapshot, verifies its checksum + organization, and re-activates it via the
// store's restoreSnapshot (which records a GraphIndexRecoveryPoint).
import type {
  GraphIndexRecoveryPoint,
  GraphIndexSnapshot,
  GraphIndexSnapshotHeader,
  GraphIndexStore,
} from "./contracts";
import { recomputeChecksum } from "./snapshot";

/** Retention config: how much history to keep beyond the active snapshot. */
export interface RetentionPolicy {
  /**
   * Number of historical (SUPERSEDED, still-known-good) snapshots to keep in
   * addition to the ACTIVE one and the single most-recent known-good previous.
   */
  keepHistorical: number;
}

export const DEFAULT_RETENTION_POLICY: RetentionPolicy = { keepHistorical: 3 };

/** A header is a "known-good" recovery candidate: VALID + not currently served. */
export function isKnownGoodCandidate(header: GraphIndexSnapshotHeader): boolean {
  return (
    header.validationState === "VALID" &&
    (header.buildState === "SUPERSEDED" || header.buildState === "VALID")
  );
}

/**
 * Verify a candidate snapshot is safe to restore: it belongs to `organizationId`
 * and its checksum recomputes. Returns true only when both hold.
 */
export async function verifyRecoveryCandidate(
  snapshot: GraphIndexSnapshot,
  organizationId: string,
): Promise<boolean> {
  if (snapshot.organizationId !== organizationId) return false;
  if (snapshot.validationState !== "VALID") return false;
  return (await recomputeChecksum(snapshot)) === snapshot.checksum;
}

/**
 * Pick the best recovery candidate for an org: the most-recently-appended
 * known-good non-served snapshot whose checksum verifies. Returns null when
 * none qualifies. `now`-free and deterministic given the store's ordering.
 */
export async function selectRecoveryCandidate(
  store: GraphIndexStore,
  organizationId: string,
): Promise<GraphIndexSnapshot | null> {
  const headers = await store.listSnapshots(organizationId);
  // newest-appended first.
  for (const header of [...headers].reverse()) {
    if (!isKnownGoodCandidate(header)) continue;
    const snapshot = await store.getSnapshot(header.snapshotId);
    if (snapshot !== null && (await verifyRecoveryCandidate(snapshot, organizationId))) {
      return snapshot;
    }
  }
  return null;
}

/**
 * Non-destructive recovery: when the active snapshot is unhealthy, select a
 * previous known-good snapshot and re-activate it as RECOVERY. Returns the
 * recorded recovery point, or null when no candidate qualifies (the previous
 * active is then left untouched — recovery never clears a served index blindly).
 */
export async function recoverOrganizationIndex(
  store: GraphIndexStore,
  organizationId: string,
): Promise<GraphIndexRecoveryPoint | null> {
  const active = await store.getActiveSnapshot(organizationId);
  const candidate = await selectRecoveryCandidate(store, organizationId);
  if (candidate === null) return null;
  // never "restore" the already-active snapshot onto itself.
  if (active !== null && active.snapshotId === candidate.snapshotId) return null;
  return store.restoreSnapshot(candidate.snapshotId);
}

/**
 * Determine which snapshot ids are retention-eligible for deletion. Keeps: the
 * ACTIVE/RECOVERY snapshot, the single most-recent previous known-good, and the
 * newest `keepHistorical` known-good snapshots. Everything else (older history,
 * INVALID, FAILED, orphaned STAGED) is eligible. Deterministic and pure.
 */
export function selectExpiredSnapshotIds(
  headers: readonly GraphIndexSnapshotHeader[],
  activeSnapshotId: string | null,
  policy: RetentionPolicy = DEFAULT_RETENTION_POLICY,
): string[] {
  const keep = new Set<string>();
  if (activeSnapshotId !== null) keep.add(activeSnapshotId);

  // newest-first known-good history (excluding the active one).
  const knownGood = [...headers]
    .reverse()
    .filter((h) => h.snapshotId !== activeSnapshotId && isKnownGoodCandidate(h));

  // keep the most-recent previous known-good PLUS keepHistorical more.
  const keepCount = policy.keepHistorical + 1;
  for (const h of knownGood.slice(0, keepCount)) keep.add(h.snapshotId);

  const expired: string[] = [];
  for (const h of headers) {
    if (keep.has(h.snapshotId)) continue;
    expired.push(h.snapshotId);
  }
  return expired;
}
