// TERAGON AI BUSINESS OS — typed accessors over the Wave-6 memory
// collections (W6-A; existing repository files untouched). One seam for the
// proposal workflow / versioning / page. The versions store is wrapped so
// update/remove THROW — MemoryVersion is immutable by construction.
import type { BaseEntity } from "@/domain/types";
import type {
  MemoryConflict,
  MemoryExportJob,
  MemoryImportJob,
  MemoryLink,
  MemoryProposal,
  MemoryRecordV2,
  MemorySource,
  MemoryUsage,
  MemoryVersion,
} from "@/domain/memory";
import type { Repository } from "@/repositories/Repository";
import type { CollectionKey } from "@/repositories/collections";
import { getRepository } from "@/repositories/factory";

export const MEMORY_VERSION_IMMUTABLE_HE =
  "MemoryVersion היא רשומה בלתי ניתנת לשינוי — עדכון/מחיקה של גרסה נחסמים";

/** Deep-freeze (versions snapshots are frozen before persisting). */
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

/**
 * Wrap a repository so that update/remove/clear throw — append-only store.
 * The underlying repository structural-clones on read/write (IndexedDB
 * semantics), so EVERY object returned here is re-frozen on the way out.
 */
export function immutableStore<T extends BaseEntity>(repo: Repository<T>): Repository<T> {
  return {
    collection: repo.collection,
    list: async () => (await repo.list()).map((x) => deepFreeze(x)),
    get: async (id) => {
      const item = await repo.get(id);
      return item === undefined ? undefined : deepFreeze(item);
    },
    create: async (item) => deepFreeze(await repo.create(deepFreeze(item))),
    update: () => {
      throw new Error(MEMORY_VERSION_IMMUTABLE_HE);
    },
    remove: () => {
      throw new Error(MEMORY_VERSION_IMMUTABLE_HE);
    },
    clear: () => {
      throw new Error(MEMORY_VERSION_IMMUTABLE_HE);
    },
    subscribe: (listener) => repo.subscribe(listener),
  };
}

export interface MemoryStores {
  /** legacy + V2 records share the "memoryRecords" collection (shape-bridged) */
  records: Repository<MemoryRecordV2>;
  proposals: Repository<MemoryProposal>;
  sources: Repository<MemorySource>;
  links: Repository<MemoryLink>;
  /** append-only — update/remove throw (immutability enforced) */
  versions: Repository<MemoryVersion>;
  usage: Repository<MemoryUsage>;
  conflicts: Repository<MemoryConflict>;
  importJobs: Repository<MemoryImportJob>;
  exportJobs: Repository<MemoryExportJob>;
  /** generic escape hatch (entity-link validation etc.) */
  collection<T extends BaseEntity = BaseEntity>(key: CollectionKey): Repository<T>;
}

/** Production wiring over the canonical repository factory. */
export function memoryStores(): MemoryStores {
  return {
    records: getRepository<MemoryRecordV2>("memoryRecords"),
    proposals: getRepository<MemoryProposal>("memoryProposals"),
    sources: getRepository<MemorySource>("memorySources"),
    links: getRepository<MemoryLink>("memoryLinks"),
    versions: immutableStore(getRepository<MemoryVersion>("memoryVersions")),
    usage: getRepository<MemoryUsage>("memoryUsage"),
    conflicts: getRepository<MemoryConflict>("memoryConflicts"),
    importJobs: getRepository<MemoryImportJob>("memoryImportJobs"),
    exportJobs: getRepository<MemoryExportJob>("memoryExportJobs"),
    collection: <T extends BaseEntity = BaseEntity>(key: CollectionKey) => getRepository<T>(key),
  };
}
