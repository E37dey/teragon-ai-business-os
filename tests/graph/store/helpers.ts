// TERAGON Business Graph — Phase 4 store test helpers.
// A REAL IndexedDB via fake-indexeddb, a deterministic clock, fresh store per
// test, and small clean/failing record fixtures for isolation + failure paths.
import "fake-indexeddb/auto";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { openDB } from "idb";
import {
  IndexedDBGraphIndexStore,
  type CanonicalRecord,
  type GraphDerivationContext,
  type IndexedDBGraphStoreOptions,
} from "@/graph";

export const GRAPH_INDEX_DB_NAME = "teragon-graph-index";

/** Reset to a pristine fake IndexedDB (new factory ⇒ empty databases). */
export function resetIndexedDB(): void {
  globalThis.indexedDB = new IDBFactory();
  globalThis.IDBKeyRange = IDBKeyRange as unknown as typeof globalThis.IDBKeyRange;
}

/** A deterministic, monotonically-increasing ISO clock. */
export function makeClock(startISO = "2026-07-29T00:00:00.000Z", stepMs = 1000): () => string {
  let t = Date.parse(startISO);
  return () => {
    const iso = new Date(t).toISOString();
    t += stepMs;
    return iso;
  };
}

/** Fresh store on a pristine DB. */
export function freshStore(options: IndexedDBGraphStoreOptions = {}): IndexedDBGraphIndexStore {
  resetIndexedDB();
  return new IndexedDBGraphIndexStore({ now: makeClock(), ...options });
}

/** A minimal, clean single-org record set that derives with ZERO error issues. */
export function cleanRecords(): Partial<Record<string, CanonicalRecord[]>> {
  return {
    users: [{ id: "u-1", name: "משתמש", status: "פעיל", createdAt: "2026-07-01T09:00:00.000Z", updatedAt: "2026-07-02T09:00:00.000Z" }],
    customers: [{ id: "cu-1", name: "לקוח", status: "פעיל", createdAt: "2026-07-01T09:00:00.000Z", updatedAt: "2026-07-02T09:00:00.000Z" }],
    leads: [{ id: "l-1", ownerId: "u-1", name: "ליד", status: "חדש", createdAt: "2026-07-01T09:00:00.000Z", updatedAt: "2026-07-02T09:00:00.000Z" }],
  };
}

/** A clean context for a given organization (inheritance on). */
export function contextFor(organizationId: string, over: Partial<GraphDerivationContext> = {}): GraphDerivationContext {
  return {
    organizationId,
    registryVersion: "core-v1",
    sourceSnapshotVersion: `src-${organizationId}`,
    allowOrgInheritance: true,
    ...over,
  };
}

/**
 * A record set for `organizationId` with `extraUsers` additional user records —
 * used to produce a DISTINCT-but-still-valid snapshot (different content ⇒
 * different checksum/snapshotId) for supersede/retention tests.
 */
export function cleanRecordsWithUsers(extraUsers: number): Partial<Record<string, CanonicalRecord[]>> {
  const base = cleanRecords();
  const users = [...(base.users ?? [])];
  for (let i = 0; i < extraUsers; i += 1) {
    users.push({
      id: `u-extra-${i}`,
      name: `משתמש ${i}`,
      status: "פעיל",
      createdAt: "2026-07-01T09:00:00.000Z",
      updatedAt: "2026-07-02T09:00:00.000Z",
    });
  }
  return { ...base, users };
}

/**
 * A record set for `organizationId` that DERIVES A NODE IN ANOTHER ORG — a
 * memoryRecord carrying its own foreign organizationId. Under a context of
 * `organizationId` this yields a snapshot whose node belongs to `foreignOrg`,
 * failing validation (NODE_CROSS_ORGANIZATION) — a deterministic failing rebuild.
 */
export function crossOrgFailingRecords(foreignOrg: string): Partial<Record<string, CanonicalRecord[]>> {
  return {
    ...cleanRecords(),
    memoryRecords: [
      {
        id: "mem-x",
        memoryLayer: "customer",
        organizationId: foreignOrg,
        approvalState: "מאושר",
        sensitivity: "פנימי",
        title: "זיכרון ארגון זר",
        currentVersion: 1,
        createdAt: "2026-07-01T09:00:00.000Z",
        updatedAt: "2026-07-02T09:00:00.000Z",
      },
    ],
  };
}

/** Open the raw graph-index DB (to simulate external corruption in tests).
 *  Opens without a fixed version so it attaches to whatever version the store
 *  created (the DB was bumped to v2 for the Phase-5 coordinator stores). */
export async function openRawGraphIndexDb() {
  return openDB(GRAPH_INDEX_DB_NAME);
}
