// TERAGON AI BUSINESS OS — Gate S4: the provider-neutral persistence boundary.
//
// Callers depend on THIS interface, not on IndexedDB nor on Supabase. It extends
// the existing `Repository<T>` (unchanged throwing CRUD contract used everywhere
// today) with SAFE-result variants the remote provider needs (never throw a raw
// driver error at the UI) plus range pagination.
//
// `getPersistenceRepository` is the single seam. For LOCAL it returns a thin
// wrapper over the existing IndexedDB/InMemory repository (default, untouched).
// For SUPABASE it LAZILY (dynamic import) loads the entire `./supabase/**` tree
// so `@supabase/supabase-js` never enters the default bundle.
import type { BaseEntity } from "@/domain/types";
import type { Repository, ChangeEvent, Unsubscribe } from "@/repositories/Repository";
import type { CollectionKey } from "@/repositories/collections";
import { PERSISTENCE_PROVIDER, resolvePersistenceProvider } from "./provider";
import type { Page, PageRequest, RepoResult } from "./result";
import { ok, err, safeError } from "./result";

/** The neutral contract every backend satisfies. */
export interface PersistenceRepository<T extends BaseEntity> extends Repository<T> {
  /** Safe list — remote errors become a RepoResult, never a throw. */
  listSafe(): Promise<RepoResult<T[]>>;
  getSafe(id: string): Promise<RepoResult<T | undefined>>;
  createSafe(item: T): Promise<RepoResult<T>>;
  updateSafe(id: string, patch: Partial<Omit<T, "id">>): Promise<RepoResult<T>>;
  removeSafe(id: string): Promise<RepoResult<void>>;
  /**
   * Idempotent, duplicate-submit-safe write keyed by the entity's deterministic
   * id. Re-issuing the SAME id is a no-op-equivalent upsert (never a duplicate
   * error), and concurrent identical submits collapse to one in-flight write.
   */
  upsertSafe(item: T): Promise<RepoResult<T>>;
  /** Range-based page (inclusive from/to). */
  listPage(range: PageRequest): Promise<RepoResult<Page<T>>>;
}

/**
 * Wrap a legacy throwing `Repository<T>` (the LOCAL default) as a neutral
 * `PersistenceRepository<T>`. Safe methods catch and map to RepoResult; there is
 * NO silent fallback — a failure is surfaced as an error result, never hidden.
 */
export function wrapLocalRepository<T extends BaseEntity>(repo: Repository<T>): PersistenceRepository<T> {
  const guard = async <R>(fn: () => Promise<R>, notFound = false): Promise<RepoResult<R>> => {
    try {
      return ok(await fn());
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      if (name === "NotFoundError") return err(safeError("not_found", repo.collection));
      if (name === "DuplicateIdError") return err(safeError("duplicate", repo.collection));
      if (notFound) return err(safeError("not_found", repo.collection));
      return err(safeError("unknown", repo.collection));
    }
  };
  return {
    collection: repo.collection,
    list: () => repo.list(),
    get: (id) => repo.get(id),
    create: (item) => repo.create(item),
    update: (id, patch) => repo.update(id, patch),
    remove: (id) => repo.remove(id),
    clear: () => repo.clear(),
    subscribe: (listener: (event: ChangeEvent<T>) => void): Unsubscribe => repo.subscribe(listener),
    listSafe: () => guard(() => repo.list()),
    getSafe: (id) => guard(() => repo.get(id)),
    createSafe: (item) => guard(() => repo.create(item)),
    updateSafe: (id, patch) => guard(() => repo.update(id, patch)),
    removeSafe: (id) => guard(() => repo.remove(id)),
    // LOCAL upsert: create-or-update by id (idempotent), never a duplicate error.
    upsertSafe: async (item) => {
      const existing = await repo.get(item.id);
      if (existing) {
        const { id: _id, ...patch } = item;
        return guard(() => repo.update(item.id, patch as Partial<Omit<T, "id">>));
      }
      return guard(() => repo.create(item));
    },
    listPage: async (range: PageRequest) => {
      try {
        const all = await repo.list();
        const rows = all.slice(range.from, range.to + 1);
        return ok<Page<T>>({ rows, range, hasMore: rows.length === range.to - range.from + 1 });
      } catch {
        return err<Page<T>>(safeError("unknown", repo.collection));
      }
    },
  };
}

/**
 * The single provider seam. Resolves the active provider and returns a neutral
 * repository. SUPABASE support is loaded ONLY here, ONLY via dynamic import, so
 * the default (LOCAL) build never references `@supabase/supabase-js`.
 *
 * @param override optional provider override (tests / staging harness)
 */
export async function getPersistenceRepository<T extends BaseEntity = BaseEntity>(
  collection: CollectionKey,
  override?: string | null,
): Promise<PersistenceRepository<T>> {
  const provider = override === undefined ? PERSISTENCE_PROVIDER : resolvePersistenceProvider(override);
  if (provider === "SUPABASE") {
    // Lazy — this is the ONLY path that reaches the Supabase code + driver.
    const mod = await import("./supabase/index");
    return mod.createSupabaseRepository<T>(collection);
  }
  const { getRepository } = await import("@/repositories/factory");
  return wrapLocalRepository<T>(getRepository<T>(collection));
}
