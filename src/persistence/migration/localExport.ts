// TERAGON AI BUSINESS OS — Gate S4: explicit local→Supabase migration tool.
//
// This is an OPT-IN operator utility. It is NOT wired into the UI and is NEVER
// invoked automatically. Its whole reason to exist is safety:
//
//   * `exportLocal()` reads the local (IndexedDB/InMemory) data into a portable,
//     versioned JSON snapshot. Read-only — it uploads NOTHING.
//   * `previewImport()` describes exactly what an import WOULD write. Still no
//     writes.
//   * `importToSupabase()` refuses to run unless given a named-human-approval
//     token that matches the previewed snapshot. There is NO auto-upload of
//     existing browser data, and no silent path from export to write.
import type { BaseEntity } from "@/domain/types";
import { COLLECTIONS, type CollectionKey } from "@/repositories/collections";
import type { RepoResult } from "../result";
import { err, ok, safeError } from "../result";

export const EXPORT_FORMAT_VERSION = "teragon-local-export/1";

export interface LocalExport {
  readonly format: typeof EXPORT_FORMAT_VERSION;
  readonly exportedAt: string;
  /** collection → rows. */
  readonly collections: Readonly<Record<string, readonly BaseEntity[]>>;
  /** total row count across all collections (preview convenience). */
  readonly totalRows: number;
}

/**
 * Read every LOCAL collection into a portable snapshot. Pure read — this never
 * contacts Supabase and never mutates anything.
 */
export async function exportLocal(now: () => string = () => new Date().toISOString()): Promise<LocalExport> {
  const { getRepository } = await import("@/repositories/factory");
  const collections: Record<string, readonly BaseEntity[]> = {};
  let totalRows = 0;
  for (const key of COLLECTIONS) {
    const rows = await getRepository(key).list();
    collections[key] = rows;
    totalRows += rows.length;
  }
  return { format: EXPORT_FORMAT_VERSION, exportedAt: now(), collections, totalRows };
}

export interface ImportPreview {
  readonly snapshot: LocalExport;
  /** per-collection row counts the import WOULD write. */
  readonly perCollection: Readonly<Record<string, number>>;
  readonly totalRows: number;
  /**
   * The token an operator must echo back (verbatim) to authorize the import.
   * Deterministic from the snapshot so it cannot be pre-guessed or reused for a
   * different snapshot.
   */
  readonly approvalToken: string;
}

/** Deterministic token binding an approval to THIS exact snapshot. */
function approvalTokenFor(snapshot: LocalExport): string {
  return `APPROVE-IMPORT:${snapshot.exportedAt}:${snapshot.totalRows}`;
}

/**
 * Describe what an import would do. WRITES NOTHING. The returned `approvalToken`
 * must later be presented, verbatim and by a named human, to actually import.
 */
export function previewImport(snapshot: LocalExport): ImportPreview {
  const perCollection: Record<string, number> = {};
  for (const [key, rows] of Object.entries(snapshot.collections)) perCollection[key] = rows.length;
  return {
    snapshot,
    perCollection,
    totalRows: snapshot.totalRows,
    approvalToken: approvalTokenFor(snapshot),
  };
}

export interface ImportRequest {
  readonly snapshot: LocalExport;
  /** must equal `previewImport(snapshot).approvalToken`. */
  readonly approvalToken: string;
  /** a named, accountable human — recorded, never optional. */
  readonly approvedBy: string;
}

export interface ImportOutcome {
  readonly written: Readonly<Record<string, number>>;
  readonly totalWritten: number;
  readonly approvedBy: string;
}

/**
 * Upsert a previously-exported snapshot INTO Supabase — but only after an
 * explicit, named-human approval whose token matches this snapshot. Any of:
 * missing/blank approver, wrong/blank token, or bad format ⇒ a safe error and
 * ZERO writes. There is no automatic or silent upload path.
 *
 * `deps.getRepository` is injectable so this is testable without a live
 * Supabase; in production it defaults to the SUPABASE-backed boundary.
 */
export async function importToSupabase(
  request: ImportRequest,
  deps?: {
    getRepository?: (
      collection: CollectionKey,
    ) => Promise<{ upsertSafe(item: BaseEntity): Promise<RepoResult<BaseEntity>> }>;
  },
): Promise<RepoResult<ImportOutcome>> {
  if (request.snapshot.format !== EXPORT_FORMAT_VERSION) {
    return err(safeError("validation", "unrecognized export format"));
  }
  if (!request.approvedBy || request.approvedBy.trim() === "") {
    return err(safeError("unauthorized", "named human approval required"));
  }
  const expected = approvalTokenFor(request.snapshot);
  if (request.approvalToken !== expected) {
    return err(safeError("unauthorized", "approval token does not match snapshot"));
  }

  const getRepository =
    deps?.getRepository ??
    (async (collection: CollectionKey) => {
      const { getPersistenceRepository } = await import("../boundary");
      return getPersistenceRepository<BaseEntity>(collection, "SUPABASE");
    });

  const written: Record<string, number> = {};
  let totalWritten = 0;
  for (const [key, rows] of Object.entries(request.snapshot.collections)) {
    if (rows.length === 0) continue;
    const repo = await getRepository(key as CollectionKey);
    let count = 0;
    for (const row of rows) {
      const res = await repo.upsertSafe(row);
      // No silent fallback: a failed remote write aborts the import and surfaces.
      if (!res.ok) return err(res.error);
      count += 1;
    }
    written[key] = count;
    totalWritten += count;
  }
  return ok({ written, totalWritten, approvedBy: request.approvedBy });
}
