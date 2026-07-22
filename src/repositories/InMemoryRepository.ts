// In-memory repository — unit tests and SSR/non-browser fallback. Same contract
// and semantics as IndexedDBRepository (structural clone on read/write so callers
// can never mutate the store by reference).
import type { BaseEntity } from "@/domain/types";
import { BaseRepository, DuplicateIdError, NotFoundError } from "./Repository";

export class InMemoryRepository<T extends BaseEntity> extends BaseRepository<T> {
  private items: T[];

  constructor(collection: string, seed: readonly T[] = []) {
    super(collection);
    this.items = seed.map((x) => structuredClone(x));
  }

  list(): Promise<T[]> {
    return Promise.resolve(this.items.map((x) => structuredClone(x)));
  }

  get(id: string): Promise<T | undefined> {
    const found = this.items.find((x) => x.id === id);
    return Promise.resolve(found ? structuredClone(found) : undefined);
  }

  create(item: T): Promise<T> {
    if (this.items.some((x) => x.id === item.id)) {
      return Promise.reject(new DuplicateIdError(this.collection, item.id));
    }
    const clone = structuredClone(item);
    this.items.push(clone);
    this.emit({
      type: "create",
      collection: this.collection,
      id: item.id,
      item: structuredClone(clone),
    });
    return Promise.resolve(structuredClone(clone));
  }

  update(id: string, patch: Partial<Omit<T, "id">>): Promise<T> {
    const idx = this.items.findIndex((x) => x.id === id);
    const current = this.items[idx];
    if (idx === -1 || current === undefined) {
      return Promise.reject(new NotFoundError(this.collection, id));
    }
    const next = { ...current, ...structuredClone(patch), id } as T;
    this.items[idx] = next;
    this.emit({ type: "update", collection: this.collection, id, item: structuredClone(next) });
    return Promise.resolve(structuredClone(next));
  }

  remove(id: string): Promise<void> {
    const idx = this.items.findIndex((x) => x.id === id);
    if (idx === -1) return Promise.reject(new NotFoundError(this.collection, id));
    this.items.splice(idx, 1);
    this.emit({ type: "remove", collection: this.collection, id });
    return Promise.resolve();
  }

  clear(): Promise<void> {
    this.items = [];
    this.emit({ type: "clear", collection: this.collection });
    return Promise.resolve();
  }
}
