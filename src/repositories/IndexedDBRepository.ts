// IndexedDB-backed repository (idb). DB "teragon-os", one object store per
// collection (keyPath "id"), schema derived from the canonical COLLECTIONS list.
import { openDB, type IDBPDatabase } from "idb";
import type { BaseEntity } from "@/domain/types";
import { BaseRepository, DuplicateIdError, NotFoundError } from "./Repository";
import { COLLECTIONS } from "./collections";

export const IDB_NAME = "teragon-os";
// v2: + "notifications" object store (Wave 2 notification center)
export const IDB_VERSION = 7; // v7: + "memoryEntries" real local-memory CRUD (S13.4 / PR D)

let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(IDB_NAME, IDB_VERSION, {
      upgrade(database) {
        for (const collection of COLLECTIONS) {
          if (!database.objectStoreNames.contains(collection)) {
            database.createObjectStore(collection, { keyPath: "id" });
          }
        }
      },
    });
  }
  return dbPromise;
}

/** Test hook — reset the cached connection (fake-indexeddb runs). */
export function __resetIdbConnectionForTests(): void {
  dbPromise = null;
}

export function idbAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

export class IndexedDBRepository<T extends BaseEntity> extends BaseRepository<T> {
  async list(): Promise<T[]> {
    const database = await db();
    return (await database.getAll(this.collection)) as T[];
  }

  async get(id: string): Promise<T | undefined> {
    const database = await db();
    return (await database.get(this.collection, id)) as T | undefined;
  }

  async create(item: T): Promise<T> {
    const database = await db();
    const existing = await database.get(this.collection, item.id);
    if (existing !== undefined) throw new DuplicateIdError(this.collection, item.id);
    await database.put(this.collection, item);
    this.emit({ type: "create", collection: this.collection, id: item.id, item });
    return item;
  }

  async update(id: string, patch: Partial<Omit<T, "id">>): Promise<T> {
    const database = await db();
    const current = (await database.get(this.collection, id)) as T | undefined;
    if (current === undefined) throw new NotFoundError(this.collection, id);
    const next = { ...current, ...patch, id } as T;
    await database.put(this.collection, next);
    this.emit({ type: "update", collection: this.collection, id, item: next });
    return next;
  }

  async remove(id: string): Promise<void> {
    const database = await db();
    const current = await database.get(this.collection, id);
    if (current === undefined) throw new NotFoundError(this.collection, id);
    await database.delete(this.collection, id);
    this.emit({ type: "remove", collection: this.collection, id });
  }

  async clear(): Promise<void> {
    const database = await db();
    await database.clear(this.collection);
    this.emit({ type: "clear", collection: this.collection });
  }

  /** bulk write used by the seed boot path (single transaction per collection) */
  async putAll(items: readonly T[]): Promise<void> {
    const database = await db();
    const tx = database.transaction(this.collection, "readwrite");
    for (const item of items) {
      void tx.store.put(item);
    }
    await tx.done;
  }

  async count(): Promise<number> {
    const database = await db();
    return database.count(this.collection);
  }
}
