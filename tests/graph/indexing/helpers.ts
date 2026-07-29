// TERAGON Business Graph — Phase 5 indexing test helpers.
// A REAL IndexedDB via fake-indexeddb, a deterministic monotonic clock, a
// hand-driven scheduler (NO real sleeps), a recording fake repository, and small
// org-carrying record fixtures. Everything is deterministic and injected.
import "fake-indexeddb/auto";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import type { BaseEntity } from "@/domain/types";
import type { ChangeEvent, Repository, Unsubscribe } from "@/repositories/Repository";
import {
  GraphIndexingCoordinator,
  GraphIndexingStateStore,
  IndexedDBGraphIndexStore,
  type CanonicalRecord,
  type GraphIndexingScheduler,
  type LoadOrganizationRecords,
} from "@/graph";

const CREATED = "2026-07-01T09:00:00.000Z";
const UPDATED = "2026-07-02T09:00:00.000Z";

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

/** A hand-driven scheduler: tasks run only when the test drains them. */
export class ManualScheduler implements GraphIndexingScheduler {
  private queue: Array<() => Promise<void>> = [];
  private timers: Array<{ due: number; seq: number; task: () => Promise<void> }> = [];
  private clockMs = 0;
  private seq = 0;

  enqueue(task: () => Promise<void>): void {
    this.queue.push(task);
  }

  enqueueAfter(delayMs: number, task: () => Promise<void>): void {
    this.timers.push({ due: this.clockMs + delayMs, seq: this.seq, task });
    this.seq += 1;
  }

  /** Drain the immediate queue (tasks may enqueue more; those run too). */
  async runUntilIdle(): Promise<void> {
    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (task) await task();
    }
  }

  /** Advance logical time, promote due timers, then drain. */
  async advance(ms: number): Promise<void> {
    this.clockMs += ms;
    const due = this.timers.filter((t) => t.due <= this.clockMs).sort((a, b) => a.due - b.due || a.seq - b.seq);
    this.timers = this.timers.filter((t) => t.due > this.clockMs);
    for (const t of due) this.queue.push(t.task);
    await this.runUntilIdle();
  }

  pendingTimers(): number {
    return this.timers.length;
  }
}

/** A recording fake repository — only subscribe/emit are functional. */
export class FakeRepository<T extends BaseEntity> implements Repository<T> {
  readonly collection: string;
  subscribeCalls = 0;
  private readonly listeners = new Set<(event: ChangeEvent<T>) => void>();

  constructor(collection: string) {
    this.collection = collection;
  }

  subscribe(listener: (event: ChangeEvent<T>) => void): Unsubscribe {
    this.subscribeCalls += 1;
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(event: ChangeEvent<T>): void {
    for (const l of this.listeners) l(event);
  }

  list(): Promise<T[]> {
    return Promise.resolve([]);
  }
  get(): Promise<T | undefined> {
    return Promise.resolve(undefined);
  }
  create(item: T): Promise<T> {
    return Promise.resolve(item);
  }
  update(): Promise<T> {
    return Promise.reject(new Error("not implemented"));
  }
  remove(): Promise<void> {
    return Promise.resolve();
  }
  clear(): Promise<void> {
    return Promise.resolve();
  }
}

type Rec = CanonicalRecord;

/** A single org-carrying customer record. */
export function customerRecord(org: string, id: string): Rec {
  return { id, name: `לקוח ${id}`, organizationId: org, status: "פעיל", createdAt: CREATED, updatedAt: UPDATED };
}

/** A clean, org-anchored record set (the customer carries organizationId). */
export function baseRecords(org: string, customerIds: readonly string[] = ["cu-1"]): Partial<Record<string, Rec[]>> {
  return {
    users: [{ id: "u-1", name: "משתמש", status: "פעיל", createdAt: CREATED, updatedAt: UPDATED }],
    customers: customerIds.map((id) => customerRecord(org, id)),
    leads: [{ id: "l-1", ownerId: "u-1", name: "ליד", status: "חדש", createdAt: CREATED, updatedAt: UPDATED }],
  };
}

/** An approved, org-carrying memoryRecord (has BOTH organizationField and versionField). */
export function memoryRecord(
  org: string,
  id: string,
  currentVersion: number,
  updatedAt: string = UPDATED,
): Rec {
  return {
    id,
    memoryLayer: "customer",
    organizationId: org,
    approvalState: "מאושר",
    sensitivity: "פנימי",
    title: "זיכרון",
    currentVersion,
    createdAt: CREATED,
    updatedAt,
  };
}

/** A ChangeEvent + its item for a customer mutation. */
export function customerChange(
  org: string,
  id: string,
  type: ChangeEvent<BaseEntity>["type"] = "create",
): { change: ChangeEvent<BaseEntity>; item: BaseEntity } {
  const item = customerRecord(org, id) as unknown as BaseEntity;
  const change: ChangeEvent<BaseEntity> =
    type === "clear" ? { type, collection: "customers" } : { type, collection: "customers", id, item };
  return { change, item };
}

export interface Harness {
  graphStore: IndexedDBGraphIndexStore;
  stateStore: GraphIndexingStateStore;
  scheduler: ManualScheduler;
  clock: () => string;
  coordinator: GraphIndexingCoordinator;
  loader: LoadOrganizationRecords;
}

/**
 * Build a coordinator over a shared fresh DB. `loader` resolves records per org
 * from an injected callback so tests fully control the canonical snapshot. Both
 * the graph store and the indexing state store share the same fresh fake DB.
 */
export function makeHarness(options: {
  enabled?: boolean;
  loader: LoadOrganizationRecords;
  maxRetries?: number;
  retryBackoffMs?: number;
  reset?: boolean;
  clock?: () => string;
}): Harness {
  if (options.reset !== false) resetIndexedDB();
  const clock = options.clock ?? makeClock();
  const graphStore = new IndexedDBGraphIndexStore({ now: clock });
  const stateStore = new GraphIndexingStateStore();
  const scheduler = new ManualScheduler();
  const coordinator = new GraphIndexingCoordinator({
    graphStore,
    stateStore,
    loadOrganizationRecords: options.loader,
    scheduler,
    clock,
    enabled: options.enabled ?? true,
    policy: {
      maxRetries: options.maxRetries ?? 3,
      retryBackoffMs: options.retryBackoffMs ?? 1000,
    },
  });
  return { graphStore, stateStore, scheduler, clock, coordinator, loader: options.loader };
}
