// TERAGON AI BUSINESS OS — memory storage adapter seam (Wave 6, W6-A).
// One interface, three implementations:
// - IndexedDBMemoryAdapter — the real Mode-A adapter over getRepository
//   (bridges legacy Wave-1 records to V2 on read; never rewrites the store).
// - CloudMemoryAdapter — honest stub: every operation fails with
//   "לא זמין במצב הדגמה המקומי" (no fake sync).
// - MarkdownVaultAdapter — INTERFACE ONLY: the seam W6-B implements for
//   Obsidian vault import/export. W6-A ships no markdown/zip engine.
import type { MemoryRecord } from "@/domain/types";
import type {
  MemoryExportJob,
  MemoryImportJob,
  MemoryRecordV2,
} from "@/domain/memory";
import { getRepository } from "@/repositories/factory";
import type { Repository } from "@/repositories/Repository";
import { fromLegacyMemoryRecord, isMemoryRecordV2 } from "./legacyBridge";

// ---------------------------------------------------------------------------
// the adapter contract
// ---------------------------------------------------------------------------

export interface MemoryRepositoryAdapter {
  /** short id, e.g. "indexeddb-local" */
  readonly id: string;
  /** honest Hebrew mode label for the UI */
  readonly modeLabelHe: string;
  /** true when the adapter can actually serve reads/writes right now */
  readonly available: boolean;
  /** all records, legacy bridged to V2 */
  listRecords(): Promise<MemoryRecordV2[]>;
  getRecord(id: string): Promise<MemoryRecordV2 | undefined>;
  /** create/overwrite a V2 record (governed callers only — the workflow) */
  saveRecord(record: MemoryRecordV2): Promise<MemoryRecordV2>;
  updateRecord(id: string, patch: Partial<Omit<MemoryRecordV2, "id">>): Promise<MemoryRecordV2>;
}

/**
 * The seam W6-B implements (markdown/zip vault import/export). W6-A defines
 * the interface only — no implementation ships in this workstream.
 */
export interface MarkdownVaultAdapter {
  /** import an Obsidian-style vault; resolves to the finished job record */
  importVault(files: ReadonlyArray<{ path: string; content: string }>): Promise<MemoryImportJob>;
  /** export all records as markdown files; resolves to the finished job */
  exportVault(): Promise<MemoryExportJob>;
}

// ---------------------------------------------------------------------------
// IndexedDB (Mode A) — the real adapter
// ---------------------------------------------------------------------------

/** Raw record union as actually persisted in the "memoryRecords" store. */
type StoredMemoryRecord = MemoryRecord | MemoryRecordV2;

export class IndexedDBMemoryAdapter implements MemoryRepositoryAdapter {
  readonly id = "indexeddb-local";
  readonly modeLabelHe = "מאגר מקומי (IndexedDB) — מצב הדגמה";
  readonly available = true;

  private get repo(): Repository<MemoryRecordV2> {
    return getRepository<MemoryRecordV2>("memoryRecords");
  }

  async listRecords(): Promise<MemoryRecordV2[]> {
    const raw = (await this.repo.list()) as StoredMemoryRecord[];
    return raw.map((r) => (isMemoryRecordV2(r) ? r : fromLegacyMemoryRecord(r)));
  }

  async getRecord(id: string): Promise<MemoryRecordV2 | undefined> {
    const raw = (await this.repo.get(id)) as StoredMemoryRecord | undefined;
    if (!raw) return undefined;
    return isMemoryRecordV2(raw) ? raw : fromLegacyMemoryRecord(raw);
  }

  saveRecord(record: MemoryRecordV2): Promise<MemoryRecordV2> {
    return this.repo.create(record);
  }

  updateRecord(
    id: string,
    patch: Partial<Omit<MemoryRecordV2, "id">>,
  ): Promise<MemoryRecordV2> {
    return this.repo.update(id, patch);
  }
}

// ---------------------------------------------------------------------------
// Cloud — honest stub (Mode B not wired for memory yet)
// ---------------------------------------------------------------------------

export const CLOUD_MEMORY_UNAVAILABLE_HE = "לא זמין במצב הדגמה המקומי";

export class CloudMemoryAdapter implements MemoryRepositoryAdapter {
  readonly id = "cloud-stub";
  readonly modeLabelHe = `ענן — ${CLOUD_MEMORY_UNAVAILABLE_HE}`;
  readonly available = false;

  private fail<T>(): Promise<T> {
    return Promise.reject(new Error(CLOUD_MEMORY_UNAVAILABLE_HE));
  }

  listRecords(): Promise<MemoryRecordV2[]> {
    return this.fail();
  }
  getRecord(): Promise<MemoryRecordV2 | undefined> {
    return this.fail();
  }
  saveRecord(): Promise<MemoryRecordV2> {
    return this.fail();
  }
  updateRecord(): Promise<MemoryRecordV2> {
    return this.fail();
  }
}
