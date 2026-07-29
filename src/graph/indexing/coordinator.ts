// TERAGON Business Graph — event-driven rebuild COORDINATOR (Phase 5 / 5.1).
// ---------------------------------------------------------------------------
// PHASE-5 PRINCIPLE: a canonical mutation may TRIGGER a rebuild, but every
// successful update still produces a COMPLETE org snapshot via
// deriveOrganizationGraphSnapshot → stage → validate → SHA-256 → atomic activate.
// This coordinator NEVER patches/appends/deletes/mutates individual nodes or edges
// inside an ACTIVE snapshot — deletion/archival/rejection/supersession are all
// handled naturally by the complete rebuild. Correctness over partial-update speed.
//
// DELIVERY GUARANTEE — the REAL model (do NOT read exactly-once / durable-outbox
// into this): `Repository.subscribe` is best-effort in-process notification, NOT a
// durable transactional outbox. `graphPendingEvents` protects an event only AFTER
// it has been durably ingested here, so an event can be LOST between the canonical
// commit and this queue's durable write. The guarantee we actually provide is:
//   best-effort event ingestion + durable replay AFTER ingestion
//     + startup canonical reconciliation  ⇒  EVENTUAL graph consistency.
// Startup reconciliation is what closes the commit-before-enqueue gap: it compares
// the ACTIVE snapshot's sourceHash against a freshly-derived canonical sourceHash
// and rebuilds when they differ, so a lost event cannot leave the graph stale
// forever. There is NO exactly-once and NO durable outbox here.
//
// Per-organization guarantees: at most ONE in-flight rebuild; strict org isolation;
// never two activations at once; deterministic ordering (aggregateVersion nulls
// last, then the durable per-org ingest sequence, NEVER wall-clock); durable event
// identity is `gidxevt:{org}:{seq}` (a monotonic sequence, never the colliding
// source tuple); a re-delivered VERSIONED source event is deduped by its
// source fingerprint; replay is deduped by the durable eventId (processed ledger);
// bounded-window coalescing into ONE rebuild; a preserved highest watermark
// (checkpoint); events arriving DURING a rebuild mark the org dirty ⇒ exactly ONE
// subsequent rebuild.
//
// Time and task execution are INJECTED (clock + scheduler) — no Date.now, no
// setTimeout in the coordinator itself. Durability is the coordinator's OWN
// IndexedDB queue/checkpoint/sequence stores (not a competing product bus).
import type { BaseEntity } from "@/domain/types";
import type { ChangeEvent, Repository, Unsubscribe } from "@/repositories/Repository";
import { deriveOrganizationGraphSnapshot } from "../derivation";
import type { CanonicalRecord, GraphDerivationContext } from "../derivation";
import {
  GraphIndexError,
  buildIndexSnapshot,
  rebuildOrganizationGraph,
  type GraphIndexStore,
} from "../store";
import { normalizeChangeEvent } from "./eventAdapter";
import type { GraphIndexingScheduler } from "./scheduler";
import { GraphIndexingStateStore } from "./stateStore";
import {
  DEFAULT_GRAPH_INDEXING_POLICY,
  type GraphIndexingBatch,
  type GraphIndexingCheckpoint,
  type GraphIndexingEvent,
  type GraphIndexingFailure,
  type GraphIndexingPolicy,
  type GraphIndexingRun,
  type GraphIndexingRunResult,
  type GraphPendingEventRow,
} from "./types";

/** The consistent canonical record snapshot the caller supplies for a rebuild. */
export interface OrganizationRecordsSnapshot {
  records: Partial<Record<string, CanonicalRecord[]>>;
  /** deterministic source version — STABLE for unchanged source (drives NO_OP) */
  sourceSnapshotVersion: string;
  registryVersion?: string;
  allowOrgInheritance?: boolean;
}

/** Injected loader — the coordinator NEVER reads repositories directly. */
export type LoadOrganizationRecords = (
  organizationId: string,
) => Promise<OrganizationRecordsSnapshot>;

export interface GraphIndexingCoordinatorOptions {
  graphStore: GraphIndexStore;
  stateStore: GraphIndexingStateStore;
  loadOrganizationRecords: LoadOrganizationRecords;
  scheduler: GraphIndexingScheduler;
  /** injected clock: monotonic ISO string. NO Date.now inside the coordinator. */
  clock: () => string;
  enabled: boolean;
  policy?: Partial<GraphIndexingPolicy>;
}

/** Coordinator-level indexing status (distinct from graph-content health). */
export interface OrganizationIndexingStatus {
  organizationId: string;
  state: "HEALTHY" | "DEGRADED" | "REBUILD_REQUIRED";
  halted: boolean;
  retryPending: boolean;
  lastIngestSequence: number;
}

interface BatchOutcome {
  result: "ACTIVATED" | "NO_OP" | "FAILED";
  previousSnapshotId: string | null;
  resultingSnapshotId: string | null;
  sourceHashBefore: string | null;
  sourceHashAfter: string | null;
  errorCode: string | null;
}

/** Deterministic order: committed aggregateVersion (nulls last), then ingest seq. */
function compareEvents(a: GraphIndexingEvent, b: GraphIndexingEvent): number {
  const av = a.aggregateVersion;
  const bv = b.aggregateVersion;
  if (av !== bv) {
    if (av === null) return 1;
    if (bv === null) return -1;
    return av - bv;
  }
  return a.ingestSequence - b.ingestSequence;
}

function safeErrorCode(e: unknown): string {
  if (e instanceof GraphIndexError) return e.code;
  // NEVER surface a raw message — it may echo record content.
  return "GRAPH_INDEXING_UNEXPECTED";
}

export class GraphIndexingCoordinator {
  private readonly graphStore: GraphIndexStore;
  private readonly stateStore: GraphIndexingStateStore;
  private readonly loadOrganizationRecords: LoadOrganizationRecords;
  private readonly scheduler: GraphIndexingScheduler;
  private readonly clock: () => string;
  private readonly enabled: boolean;
  private readonly policy: GraphIndexingPolicy;

  private readonly inFlight = new Set<string>();
  private readonly dirty = new Set<string>();
  private readonly retryCounts = new Map<string, number>();
  /** orgs whose startup reconciliation could not complete ⇒ DEGRADED until a rebuild. */
  private readonly reconcileDegraded = new Set<string>();

  constructor(options: GraphIndexingCoordinatorOptions) {
    this.graphStore = options.graphStore;
    this.stateStore = options.stateStore;
    this.loadOrganizationRecords = options.loadOrganizationRecords;
    this.scheduler = options.scheduler;
    this.clock = options.clock;
    this.enabled = options.enabled;
    this.policy = { ...DEFAULT_GRAPH_INDEXING_POLICY, ...options.policy };
  }

  // -------------------------------------------------------------------------
  // registration — a NO-OP when the flag is off (registers no consumer)
  // -------------------------------------------------------------------------

  register(repositories: readonly Repository<BaseEntity>[]): Unsubscribe {
    if (!this.enabled) return () => undefined;
    const unsubs = repositories.map((repo) =>
      repo.subscribe((event) => {
        void this.ingest(event);
      }),
    );
    return () => {
      for (const u of unsubs) u();
    };
  }

  // -------------------------------------------------------------------------
  // ingest — normalize, stamp a sequence, durably enqueue, request processing
  // -------------------------------------------------------------------------

  async ingest<T extends BaseEntity>(
    change: ChangeEvent<T>,
    item?: T,
  ): Promise<GraphIndexingEvent | null> {
    if (!this.enabled) return null;

    const normalized = normalizeChangeEvent(change, item);

    // an unsupported collection / clear event / unmappable-org record is a valid,
    // SAFE record but has no org to rebuild — never enqueued, never fabricated. No
    // durable sequence is allocated for it (it never enters the queue).
    if (!normalized.supported || normalized.organizationId === null) {
      return {
        ...normalized,
        eventId: `gidxevt:unmapped:${normalized.sourceRepository}:${normalized.aggregateId ?? "-"}`,
        ingestSequence: -1,
      };
    }

    // durable atomic ingest: allocate the per-org sequence + write the pending event
    // + (for a versioned event) the source fingerprint, all in one transaction.
    const outcome = await this.stateStore.ingestEvent(normalized);
    if (outcome.event === null) {
      // a re-delivered VERSIONED source event (or unroutable) ⇒ no new work.
      return null;
    }
    const event = outcome.event;
    const org = event.organizationId as string;
    if (this.inFlight.has(org)) {
      // an event arrived DURING an in-flight rebuild ⇒ mark dirty (one subsequent).
      this.dirty.add(org);
    } else {
      this.scheduler.enqueue(() => this.drainOrganization(org));
    }
    return event;
  }

  // -------------------------------------------------------------------------
  // startup — canonical reconciliation THEN durable replay (flag ON only)
  // -------------------------------------------------------------------------

  /**
   * On an ENABLED startup: (a) reconcile each known org against a freshly-loaded
   * canonical snapshot to close any commit-before-enqueue gap, then (b) replay any
   * durable pending events. When the flag is OFF this performs NO repository scan
   * and NO reconciliation. `reconcileOrganizations` lets a caller name orgs to
   * reconcile that have no durable checkpoint yet (e.g. an org with an active graph
   * but an empty queue); it is unioned with the orgs discovered from durable state.
   */
  async start(options: { reconcileOrganizations?: readonly string[] } = {}): Promise<void> {
    if (!this.enabled) return;

    // (1) canonical reconciliation — the durable-outbox gap closer. The ONLY place
    // startup reads the canonical source; skipped entirely when the flag is OFF.
    const pendingOrgs = await this.stateStore.pendingOrganizations();
    const checkpointOrgs = (await this.stateStore.allCheckpoints()).map((c) => c.organizationId);
    const reconcileTargets = new Set<string>([
      ...(options.reconcileOrganizations ?? []),
      ...pendingOrgs,
      ...checkpointOrgs,
    ]);
    for (const org of [...reconcileTargets].sort()) {
      await this.reconcileOrganization(org);
    }

    // (2) durable replay of any events committed-but-unprocessed before the crash.
    for (const org of pendingOrgs) {
      this.scheduler.enqueue(() => this.drainOrganization(org));
    }
  }

  // -------------------------------------------------------------------------
  // startup canonical reconciliation (operational metadata, NOT a CRM event)
  // -------------------------------------------------------------------------

  /**
   * Reconcile one org against its canonical source. A `RECONCILE` here is
   * OPERATIONAL METADATA — we NEVER synthesize a GraphIndexingEvent for a canonical
   * record that did not change. No entity bodies are ever logged.
   *   • active sourceHash === canonical sourceHash ⇒ RECONCILED_NO_OP (no rebuild)
   *   • different, or NO active graph              ⇒ full rebuild (RECONCILE signal)
   *   • reconciliation fails                       ⇒ preserve active + mark DEGRADED
   */
  private async reconcileOrganization(org: string): Promise<void> {
    const startedAt = this.clock();
    try {
      const snap = await this.loadOrganizationRecords(org);
      const context = this.derivationContext(org, snap);

      const active = await this.graphStore.getActiveSnapshot(org);
      const derivation = deriveOrganizationGraphSnapshot(snap.records, context);
      const candidate = await buildIndexSnapshot(derivation, context, { now: this.clock });
      const canonicalSourceHash = candidate.snapshot.sourceHash;

      if (active !== null && active.sourceHash === canonicalSourceHash) {
        // (4) equal ⇒ no rebuild; record the reconciliation NO_OP.
        await this.recordReconcileRun(org, "RECONCILED_NO_OP", startedAt, {
          previousSnapshotId: active.snapshotId,
          resultingSnapshotId: active.snapshotId,
          sourceHashBefore: active.sourceHash,
          sourceHashAfter: canonicalSourceHash,
        });
        this.reconcileDegraded.delete(org);
        return;
      }

      // (5) different, or (6) no active graph ⇒ a full rebuild driven by a RECONCILE
      // signal (never a fabricated event). The rebuild preserves the active snapshot
      // on any failure and only activates a fully-validated replacement.
      const rebuild = await rebuildOrganizationGraph(snap.records, context, this.graphStore, {
        now: this.clock,
      });
      if (rebuild.outcome === "ACTIVATED") {
        const nowActive = await this.graphStore.getActiveSnapshot(org);
        await this.recordReconcileRun(org, "ACTIVATED", startedAt, {
          previousSnapshotId: active?.snapshotId ?? null,
          resultingSnapshotId: rebuild.snapshotId,
          sourceHashBefore: active?.sourceHash ?? null,
          sourceHashAfter: nowActive?.sourceHash ?? canonicalSourceHash,
        });
        this.reconcileDegraded.delete(org);
        return;
      }

      // (7) rebuild rejected/failed ⇒ active snapshot preserved, org DEGRADED.
      this.reconcileDegraded.add(org);
      await this.recordReconcileRun(org, "RECONCILE_FAILED", startedAt, {
        previousSnapshotId: active?.snapshotId ?? null,
        resultingSnapshotId: null,
        sourceHashBefore: active?.sourceHash ?? null,
        sourceHashAfter: null,
        errorCode: rebuild.errorCode ?? "GRAPH_INDEX_REBUILD_REJECTED",
      });
    } catch (e) {
      // (7) reconciliation itself failed ⇒ preserve whatever is active + DEGRADED.
      this.reconcileDegraded.add(org);
      await this.recordReconcileRun(org, "RECONCILE_FAILED", startedAt, {
        previousSnapshotId: null,
        resultingSnapshotId: null,
        sourceHashBefore: null,
        sourceHashAfter: null,
        errorCode: safeErrorCode(e),
      });
    }
  }

  private derivationContext(
    org: string,
    snap: OrganizationRecordsSnapshot,
  ): GraphDerivationContext {
    return {
      organizationId: org,
      registryVersion: snap.registryVersion ?? this.policy.registryVersion,
      sourceSnapshotVersion: snap.sourceSnapshotVersion,
      allowOrgInheritance: snap.allowOrgInheritance ?? this.policy.allowOrgInheritance,
    };
  }

  private async recordReconcileRun(
    org: string,
    result: GraphIndexingRunResult,
    startedAt: string,
    fields: {
      previousSnapshotId: string | null;
      resultingSnapshotId: string | null;
      sourceHashBefore: string | null;
      sourceHashAfter: string | null;
      errorCode?: string;
    },
  ): Promise<void> {
    const cp = await this.stateStore.getCheckpoint(org);
    const checkpoint = cp === null || cp.lastIngestSequence < 0 ? 0 : cp.lastIngestSequence;
    const run: GraphIndexingRun = {
      runId: `reconcile-${org}-${startedAt}`,
      organizationId: org,
      batchEventIds: [], // reconciliation folds NO events — it is not event-driven.
      eventCount: 0,
      startingCheckpoint: checkpoint,
      endingCheckpoint: checkpoint, // reconciliation never advances the watermark.
      startedAt,
      completedAt: this.clock(),
      result,
      previousSnapshotId: fields.previousSnapshotId,
      resultingSnapshotId: fields.resultingSnapshotId,
      sourceHashBefore: fields.sourceHashBefore,
      sourceHashAfter: fields.sourceHashAfter,
      retryCount: 0,
      safeErrorCodes: fields.errorCode === undefined ? [] : [fields.errorCode],
    };
    await this.stateStore.putRun(run);
  }

  // -------------------------------------------------------------------------
  // drain — the single per-org processing loop (one in-flight max)
  // -------------------------------------------------------------------------

  private async drainOrganization(org: string): Promise<void> {
    if (!this.enabled) return;
    if (this.inFlight.has(org)) {
      // a concurrent drain is running ⇒ mark dirty; it will loop once more.
      this.dirty.add(org);
      return;
    }
    this.inFlight.add(org);
    try {
      let loop = true;
      while (loop) {
        loop = false;
        const cp = (await this.stateStore.getCheckpoint(org)) ?? this.initialCheckpoint(org);
        if (cp.halted) break; // queue HALTED for human review — process nothing.

        const rows = await this.stateStore.pendingAfter(org, cp.lastIngestSequence);
        if (rows.length === 0) break;

        const batch = await this.buildBatch(org, rows);
        const allSeqs = rows.map((r) => r.ingestSequence);
        const toSeq = Math.max(...allSeqs);

        const outcome =
          batch.events.length === 0
            ? await this.noopOutcome(org)
            : await this.runBatch(org, batch);

        if (outcome.result === "FAILED") {
          await this.commitFailure(org, batch, outcome, cp);
          break; // do not advance; retry (if any) is scheduled by commitFailure.
        }

        await this.commitSuccess(org, batch, allSeqs, toSeq, cp, outcome);
        this.retryCounts.delete(org);

        // events that arrived DURING this rebuild ⇒ exactly ONE more pass.
        if (this.dirty.has(org)) {
          this.dirty.delete(org);
          loop = true;
        }
      }
    } finally {
      this.inFlight.delete(org);
    }
  }

  private initialCheckpoint(org: string): GraphIndexingCheckpoint {
    return {
      organizationId: org,
      lastIngestSequence: -1,
      lastEventId: null,
      lastSourceHash: null,
      updatedAt: this.clock(),
      halted: false,
      haltReason: null,
    };
  }

  private async buildBatch(
    org: string,
    rows: readonly GraphPendingEventRow[],
  ): Promise<GraphIndexingBatch> {
    const allSeqs = rows.map((r) => r.ingestSequence);
    const toSeq = Math.max(...allSeqs);
    const ordered = [...rows].sort((a, b) => compareEvents(a.event, b.event));
    const seen = new Set<string>();
    const events: GraphIndexingEvent[] = [];
    for (const r of ordered) {
      const id = r.event.eventId;
      if (seen.has(id)) continue; // dedup within the window
      seen.add(id);
      // restart idempotency: an eventId already folded into a completed run is skipped.
      if (await this.stateStore.isProcessed(org, id)) continue;
      events.push(r.event);
    }
    return {
      batchId: `batch-${org}-${toSeq}`,
      organizationId: org,
      events,
      eventIds: events.map((e) => e.eventId),
      fromIngestSequence: Math.min(...allSeqs),
      toIngestSequence: toSeq,
    };
  }

  // -------------------------------------------------------------------------
  // full-rebuild-only: derive → sourceHash NO_OP short-circuit → atomic activate
  // -------------------------------------------------------------------------

  private async noopOutcome(org: string): Promise<BatchOutcome> {
    const active = await this.graphStore.getActiveSnapshot(org);
    return {
      result: "NO_OP",
      previousSnapshotId: active?.snapshotId ?? null,
      resultingSnapshotId: active?.snapshotId ?? null,
      sourceHashBefore: active?.sourceHash ?? null,
      sourceHashAfter: active?.sourceHash ?? null,
      errorCode: null,
    };
  }

  private async runBatch(org: string, _batch: GraphIndexingBatch): Promise<BatchOutcome> {
    let previousSnapshotId: string | null = null;
    let sourceHashBefore: string | null = null;
    try {
      const snap = await this.loadOrganizationRecords(org);
      const context = this.derivationContext(org, snap);

      const active = await this.graphStore.getActiveSnapshot(org);
      previousSnapshotId = active?.snapshotId ?? null;
      sourceHashBefore = active?.sourceHash ?? null;

      // compute the candidate sourceHash to detect a NO_OP without activating.
      const derivation = deriveOrganizationGraphSnapshot(snap.records, context);
      const candidate = await buildIndexSnapshot(derivation, context, { now: this.clock });
      const sourceHashAfter = candidate.snapshot.sourceHash;

      if (active !== null && sourceHashBefore === sourceHashAfter) {
        // (4) NO_OP — advance checkpoint, create NO snapshot, never mutate active.
        return {
          result: "NO_OP",
          previousSnapshotId,
          resultingSnapshotId: previousSnapshotId,
          sourceHashBefore,
          sourceHashAfter,
          errorCode: null,
        };
      }

      // (5-9) stage → validate → SHA-256 → atomic activate (previous → SUPERSEDED).
      const rebuild = await rebuildOrganizationGraph(snap.records, context, this.graphStore, {
        now: this.clock,
      });
      if (rebuild.outcome === "ACTIVATED") {
        const nowActive = await this.graphStore.getActiveSnapshot(org);
        return {
          result: "ACTIVATED",
          previousSnapshotId,
          resultingSnapshotId: rebuild.snapshotId,
          sourceHashBefore,
          sourceHashAfter: nowActive?.sourceHash ?? sourceHashAfter,
          errorCode: null,
        };
      }
      // REJECTED_INVALID | REJECTED_CHECKSUM | FAILED — active snapshot preserved.
      return {
        result: "FAILED",
        previousSnapshotId,
        resultingSnapshotId: null,
        sourceHashBefore,
        sourceHashAfter,
        errorCode: rebuild.errorCode ?? "GRAPH_INDEX_REBUILD_REJECTED",
      };
    } catch (e) {
      return {
        result: "FAILED",
        previousSnapshotId,
        resultingSnapshotId: null,
        sourceHashBefore,
        sourceHashAfter: null,
        errorCode: safeErrorCode(e),
      };
    }
  }

  // -------------------------------------------------------------------------
  // commit paths
  // -------------------------------------------------------------------------

  private async commitSuccess(
    org: string,
    batch: GraphIndexingBatch,
    allSeqs: readonly number[],
    toSeq: number,
    cp: GraphIndexingCheckpoint,
    outcome: BatchOutcome,
  ): Promise<void> {
    const startedAt = this.clock();
    const runId = `run-${org}-${startedAt}`;
    const startingCheckpoint = cp.lastIngestSequence < 0 ? 0 : cp.lastIngestSequence;

    // (10) persist the successful checkpoint — advances ONLY after success/NO_OP.
    await this.stateStore.putCheckpoint({
      organizationId: org,
      lastIngestSequence: toSeq,
      lastEventId: batch.events.at(-1)?.eventId ?? cp.lastEventId,
      lastSourceHash: outcome.sourceHashAfter,
      updatedAt: this.clock(),
      halted: false,
      haltReason: null,
    });

    if (batch.events.length > 0) {
      await this.stateStore.markProcessed(
        batch.events.map((e) => this.stateStore.processedRow(org, e.eventId, runId, startedAt)),
      );
    }
    await this.stateStore.deletePending(org, allSeqs);

    const run: GraphIndexingRun = {
      runId,
      organizationId: org,
      batchEventIds: batch.eventIds,
      eventCount: batch.events.length,
      startingCheckpoint,
      endingCheckpoint: toSeq,
      startedAt,
      completedAt: this.clock(),
      result: outcome.result as GraphIndexingRunResult,
      previousSnapshotId: outcome.previousSnapshotId,
      resultingSnapshotId: outcome.resultingSnapshotId,
      sourceHashBefore: outcome.sourceHashBefore,
      sourceHashAfter: outcome.sourceHashAfter,
      retryCount: this.retryCounts.get(org) ?? 0,
      safeErrorCodes: [],
    };
    await this.stateStore.putRun(run);
  }

  private async commitFailure(
    org: string,
    batch: GraphIndexingBatch,
    outcome: BatchOutcome,
    cp: GraphIndexingCheckpoint,
  ): Promise<void> {
    const now = this.clock();
    const tries = (this.retryCounts.get(org) ?? 0) + 1;
    const halted = tries > this.policy.maxRetries;
    const errorCode = outcome.errorCode ?? "GRAPH_INDEXING_UNEXPECTED";
    const startingCheckpoint = cp.lastIngestSequence < 0 ? 0 : cp.lastIngestSequence;

    const existing = await this.stateStore.getFailure(org, batch.batchId);
    const failure: GraphIndexingFailure = {
      key: this.stateStore.failureKeyFor(org, batch.batchId),
      batchId: batch.batchId,
      organizationId: org,
      batchEventIds: batch.eventIds,
      startingCheckpoint,
      attemptCount: tries,
      safeErrorCodes: [...new Set([...(existing?.safeErrorCodes ?? []), errorCode])],
      firstFailedAt: existing?.firstFailedAt ?? now,
      lastFailedAt: now,
      halted,
    };
    await this.stateStore.putFailure(failure);

    const runId = `run-${org}-${now}`;
    const run: GraphIndexingRun = {
      runId,
      organizationId: org,
      batchEventIds: batch.eventIds,
      eventCount: batch.events.length,
      startingCheckpoint,
      endingCheckpoint: startingCheckpoint, // checkpoint does NOT advance on failure
      startedAt: now,
      completedAt: this.clock(),
      result: halted ? "HALTED" : "RETRY_PENDING",
      previousSnapshotId: outcome.previousSnapshotId,
      resultingSnapshotId: null, // active snapshot preserved
      sourceHashBefore: outcome.sourceHashBefore,
      sourceHashAfter: null,
      retryCount: tries,
      safeErrorCodes: [errorCode],
    };
    await this.stateStore.putRun(run);

    if (halted) {
      // exhausted retries ⇒ HALT this org's queue; do NOT skip the failed event and
      // do NOT process later causal events. Checkpoint stays put (halted flag set).
      this.retryCounts.delete(org);
      await this.stateStore.putCheckpoint({
        organizationId: org,
        lastIngestSequence: cp.lastIngestSequence < 0 ? 0 : cp.lastIngestSequence,
        lastEventId: cp.lastEventId,
        lastSourceHash: cp.lastSourceHash,
        updatedAt: this.clock(),
        halted: true,
        haltReason: errorCode,
      });
      return;
    }

    // bounded, deterministic backoff via the injected scheduler — NO infinite loop.
    this.retryCounts.set(org, tries);
    this.scheduler.enqueueAfter(this.policy.retryBackoffMs * tries, () =>
      this.drainOrganization(org),
    );
  }

  // -------------------------------------------------------------------------
  // read-only status accessors (for tests / internal diagnostics)
  // -------------------------------------------------------------------------

  async getCheckpoint(org: string): Promise<GraphIndexingCheckpoint | null> {
    return this.stateStore.getCheckpoint(org);
  }

  async listRuns(org: string): Promise<GraphIndexingRun[]> {
    return this.stateStore.listRuns(org);
  }

  async listFailures(org: string): Promise<GraphIndexingFailure[]> {
    return this.stateStore.listFailures(org);
  }

  async getIndexingStatus(org: string): Promise<OrganizationIndexingStatus> {
    const cp = await this.stateStore.getCheckpoint(org);
    const retryPending = (this.retryCounts.get(org) ?? 0) > 0;
    const halted = cp?.halted ?? false;
    const degraded = retryPending || this.reconcileDegraded.has(org);
    const state: OrganizationIndexingStatus["state"] = halted
      ? "REBUILD_REQUIRED"
      : degraded
        ? "DEGRADED"
        : "HEALTHY";
    return {
      organizationId: org,
      state,
      halted,
      retryPending,
      lastIngestSequence: cp?.lastIngestSequence ?? -1,
    };
  }
}
