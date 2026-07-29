// TERAGON Business Graph — atomic full rebuild (Phase 4).
// ---------------------------------------------------------------------------
// rebuildOrganizationGraph: canonical records → PURE Phase-3 derivation → wrap as
// a STAGED snapshot → validate → checksum verification → ATOMIC activation
// (previous ACTIVE becomes SUPERSEDED). If ANY step fails the previous ACTIVE
// snapshot is left UNCHANGED, the new snapshot is marked INVALID/FAILED with its
// diagnostics preserved, and NO partial graph state is exposed. The active index
// is NEVER cleared before a valid replacement exists.
import { deriveOrganizationGraphSnapshot } from "../derivation";
import type { CanonicalRecord, GraphDerivationContext } from "../derivation";
import {
  GraphIndexError,
  type GraphIndexBuildResult,
  type GraphIndexSnapshot,
  type GraphIndexStore,
} from "./contracts";
import { buildIndexSnapshot, recomputeChecksum, type SnapshotBuildOptions } from "./snapshot";

export interface RebuildOptions extends SnapshotBuildOptions {}

export async function rebuildOrganizationGraph(
  records: Partial<Record<string, CanonicalRecord[]>>,
  context: GraphDerivationContext,
  store: GraphIndexStore,
  options: RebuildOptions = {},
): Promise<GraphIndexBuildResult> {
  const organizationId = context.organizationId;

  // capture the currently-served snapshot up front — it must survive any failure.
  const previousActive = await store.getActiveSnapshot(organizationId);
  const previousActiveSnapshotId = previousActive?.snapshotId ?? null;

  const fail = (
    outcome: GraphIndexBuildResult["outcome"],
    errorCode: string,
    errorHe: string,
    snapshot: GraphIndexSnapshot | null,
    validation: GraphIndexBuildResult["validation"],
  ): GraphIndexBuildResult => ({
    outcome,
    activated: false,
    snapshotId: snapshot?.snapshotId ?? null,
    snapshot,
    validation,
    supersededSnapshotId: null,
    previousActiveSnapshotId,
    errorCode,
    errorHe,
  });

  try {
    // 1. PURE derivation (never touches a repository, clock or randomness).
    const derivation = deriveOrganizationGraphSnapshot(records, context);

    // 2. wrap as a staged snapshot (deterministic id/checksum/sourceHash).
    const built = buildIndexSnapshot(derivation, context, options);
    const candidate = built.snapshot;

    // idempotency short-circuit: an identical build is already the active
    // snapshot ⇒ nothing to do, the served index is unchanged.
    if (
      previousActive !== null &&
      previousActive.snapshotId === candidate.snapshotId &&
      previousActive.checksum === candidate.checksum &&
      recomputeChecksum(previousActive) === previousActive.checksum
    ) {
      return {
        outcome: "ACTIVATED",
        activated: true,
        snapshotId: previousActive.snapshotId,
        snapshot: previousActive,
        validation: null,
        supersededSnapshotId: null,
        previousActiveSnapshotId,
        errorCode: null,
        errorHe: null,
      };
    }

    // 3. stage + validate.
    await store.stageSnapshot(candidate);
    const validation = await store.validateStagedSnapshot(candidate.snapshotId);
    if (!validation.valid) {
      // previous ACTIVE untouched; the new snapshot stays INVALID for diagnostics.
      const invalid = await store.getSnapshot(candidate.snapshotId);
      return fail("REJECTED_INVALID", "GRAPH_INDEX_INVALID_ACTIVATION", "אימות תמונת המצב נכשל — לא הופעלה", invalid, validation);
    }

    // 4. checksum verification against the persisted-then-read-back content.
    const persisted = await store.getSnapshot(candidate.snapshotId);
    if (persisted === null || recomputeChecksum(persisted) !== candidate.checksum) {
      return fail("REJECTED_CHECKSUM", "GRAPH_INDEX_CHECKSUM_MISMATCH", "אימות סכום הביקורת נכשל — לא הופעלה", persisted, validation);
    }

    // 5. ATOMIC activation (previous ACTIVE → SUPERSEDED inside the store tx).
    const activated = await store.activateSnapshot(candidate.snapshotId);
    return {
      outcome: "ACTIVATED",
      activated: true,
      snapshotId: activated.snapshotId,
      snapshot: activated,
      validation,
      supersededSnapshotId: previousActiveSnapshotId,
      previousActiveSnapshotId,
      errorCode: null,
      errorHe: null,
    };
  } catch (e) {
    // any unexpected failure: the previous ACTIVE snapshot is still served.
    const err = e instanceof GraphIndexError ? e : null;
    const errorHe = err?.detailHe ?? (e instanceof Error ? e.message : "כשל בלתי צפוי בבנייה מחדש");
    return fail("FAILED", err?.code ?? "GRAPH_INDEX_STATE", errorHe, null, null);
  }
}
