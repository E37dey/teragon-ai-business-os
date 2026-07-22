// TERAGON AI BUSINESS OS — generic repository contract (Wave 1).
// One collection = one repository. UI code never touches storage directly;
// screens consume repositories through TanStack Query hooks (Waves 2+).
import type { BaseEntity } from "@/domain/types";

export type ChangeType = "create" | "update" | "remove" | "clear";

export interface ChangeEvent<T extends BaseEntity> {
  type: ChangeType;
  /** collection key, e.g. "leads" */
  collection: string;
  /** present for create/update/remove */
  id?: string;
  /** present for create/update */
  item?: T;
}

export type Unsubscribe = () => void;

export interface Repository<T extends BaseEntity> {
  /** collection key this repository persists under */
  readonly collection: string;
  list(): Promise<T[]>;
  get(id: string): Promise<T | undefined>;
  create(item: T): Promise<T>;
  update(id: string, patch: Partial<Omit<T, "id">>): Promise<T>;
  remove(id: string): Promise<void>;
  /** wipe the whole collection (tests / reset-demo-data) */
  clear(): Promise<void>;
  subscribe(listener: (event: ChangeEvent<T>) => void): Unsubscribe;
}

export class NotFoundError extends Error {
  constructor(collection: string, id: string) {
    super(`[repository:${collection}] no item with id "${id}"`);
    this.name = "NotFoundError";
  }
}

export class DuplicateIdError extends Error {
  constructor(collection: string, id: string) {
    super(`[repository:${collection}] item with id "${id}" already exists`);
    this.name = "DuplicateIdError";
  }
}

/**
 * Deterministic id generation: `<prefix>-<n>` where n = 1 + the highest numeric
 * suffix already present in the collection. Same inputs ⇒ same id (no Math.random).
 */
export function nextId(prefix: string, existingIds: readonly string[]): string {
  let max = 0;
  const re = new RegExp(`^${prefix}-(\\d+)$`);
  for (const id of existingIds) {
    const m = re.exec(id);
    if (m?.[1]) {
      const n = Number.parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return `${prefix}-${max + 1}`;
}

/** Shared listener plumbing for concrete repositories. */
export abstract class BaseRepository<T extends BaseEntity> implements Repository<T> {
  readonly collection: string;
  protected listeners = new Set<(event: ChangeEvent<T>) => void>();

  constructor(collection: string) {
    this.collection = collection;
  }

  abstract list(): Promise<T[]>;
  abstract get(id: string): Promise<T | undefined>;
  abstract create(item: T): Promise<T>;
  abstract update(id: string, patch: Partial<Omit<T, "id">>): Promise<T>;
  abstract remove(id: string): Promise<void>;
  abstract clear(): Promise<void>;

  subscribe(listener: (event: ChangeEvent<T>) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  protected emit(event: ChangeEvent<T>): void {
    for (const l of this.listeners) {
      try {
        l(event);
      } catch {
        // a broken listener must not break persistence
      }
    }
  }
}
