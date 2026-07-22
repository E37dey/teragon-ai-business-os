// Repository factory — lazy singletons per collection. Chooses IndexedDB in the
// browser and falls back to seeded InMemory when IndexedDB is unavailable
// (unit tests / SSR). seedIfEmpty() is the boot path called once from main.tsx.
import type { BaseEntity } from "@/domain/types";
import type { Repository } from "./Repository";
import { COLLECTIONS, type CollectionKey } from "./collections";
import { IndexedDBRepository, idbAvailable } from "./IndexedDBRepository";
import { InMemoryRepository } from "./InMemoryRepository";
import { SEED } from "./seed";

const singletons = new Map<CollectionKey, Repository<BaseEntity>>();

/** Test hook — drop all cached repositories (fresh factory state per test). */
export function __resetRepositoriesForTests(): void {
  singletons.clear();
}

export function getRepository<T extends BaseEntity = BaseEntity>(
  collection: CollectionKey,
): Repository<T> {
  let repo = singletons.get(collection);
  if (!repo) {
    repo = idbAvailable()
      ? new IndexedDBRepository<BaseEntity>(collection)
      : new InMemoryRepository<BaseEntity>(collection, SEED[collection]);
    singletons.set(collection, repo);
  }
  return repo as Repository<T>;
}

/**
 * Boot path: seed every empty collection with its deterministic demo data
 * ("נתוני הדגמה"). Non-empty collections are never touched — user edits survive
 * reloads. Returns the list of collections that were seeded.
 */
export async function seedIfEmpty(): Promise<CollectionKey[]> {
  const seeded: CollectionKey[] = [];
  for (const collection of COLLECTIONS) {
    // collections with an empty seed (e.g. derived "notifications") have nothing to seed
    if (SEED[collection].length === 0) continue;
    const repo = getRepository(collection);
    if (repo instanceof IndexedDBRepository) {
      const count = await repo.count();
      if (count === 0) {
        await repo.putAll(SEED[collection]);
        seeded.push(collection);
      }
    }
    // InMemoryRepository is constructed pre-seeded — nothing to do.
  }
  return seeded;
}
