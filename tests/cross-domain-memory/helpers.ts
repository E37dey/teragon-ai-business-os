// W6-E test helpers — load the frozen Wave-6 baseline snapshot (283 records /
// 49 collections, docs/backups) into fake-indexeddb and build deterministic
// migration environments.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import snapshotRaw from "../../docs/backups/wave6-baseline-seed-snapshot.json?raw";
import type { BaseEntity } from "@/domain/types";
import {
  __resetRepositoriesForTests,
  getRepository,
  IndexedDBRepository,
  isCollectionKey,
  type CollectionKey,
} from "@/repositories";
import { __resetIdbConnectionForTests } from "@/repositories/IndexedDBRepository";
import type { MigrationEnv, MigrationStores } from "@/migrations/framework";

export interface BaselineSnapshot {
  exportedAt: string;
  idb: string;
  collections: Record<string, BaseEntity[]>;
}

export function loadSnapshot(): BaselineSnapshot {
  return JSON.parse(snapshotRaw) as BaselineSnapshot;
}

/** collections present in the snapshot, filtered to canonical keys */
export function snapshotCollections(snap: BaselineSnapshot): CollectionKey[] {
  return Object.keys(snap.collections).filter(isCollectionKey);
}

export function snapshotTotal(snap: BaselineSnapshot): number {
  return Object.values(snap.collections).reduce((sum, records) => sum + records.length, 0);
}

/** fresh fake-indexeddb + repository singletons per test */
export function resetStores(): void {
  globalThis.indexedDB = new IDBFactory();
  __resetIdbConnectionForTests();
  __resetRepositoriesForTests();
}

export async function seedFromSnapshot(snap: BaselineSnapshot): Promise<void> {
  for (const key of snapshotCollections(snap)) {
    const repo = getRepository(key);
    if (repo instanceof IndexedDBRepository) {
      await repo.putAll(snap.collections[key] ?? []);
    }
  }
}

export function testStores(): MigrationStores {
  return { collection: getRepository };
}

export const FIXED_NOW = "2026-07-23T12:00:00.000Z";

export function memoryStorage(entries: Record<string, string> = {}): Pick<Storage, "getItem"> {
  return { getItem: (key: string) => (key in entries ? (entries[key] ?? null) : null) };
}

export function testEnv(storage: Pick<Storage, "getItem"> | null = null): MigrationEnv {
  return { stores: testStores(), localStorage: storage, now: () => FIXED_NOW };
}

/** current record count of a collection */
export async function countOf(key: CollectionKey): Promise<number> {
  return (await getRepository(key).list()).length;
}
