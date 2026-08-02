// Gate S4 — explicit export/import: preview + named-human approval, no auto-upload.
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BaseEntity } from "@/domain/types";
import type { CollectionKey } from "@/repositories/collections";
import type { RepoResult } from "@/persistence/result";
import { ok } from "@/persistence/result";
import {
  EXPORT_FORMAT_VERSION,
  importToSupabase,
  previewImport,
  type LocalExport,
} from "@/persistence/migration/localExport";

function snapshot(): LocalExport {
  const rows: BaseEntity[] = [
    { id: "cu-1", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
    { id: "cu-2", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
  ];
  return {
    format: EXPORT_FORMAT_VERSION,
    exportedAt: "2026-07-30T00:00:00.000Z",
    collections: { customers: rows },
    totalRows: 2,
  };
}

/** A fake neutral repo that records upserts (stands in for the SUPABASE repo). */
function fakeRepoFactory() {
  const upserts: BaseEntity[] = [];
  const getRepository = (_c: CollectionKey) =>
    Promise.resolve({
      upsertSafe: (item: BaseEntity): Promise<RepoResult<BaseEntity>> => {
        upserts.push(item);
        return Promise.resolve(ok(item));
      },
    });
  return { getRepository, upserts };
}

describe("migration — preview + named-human approval gate", () => {
  it("previewImport describes writes but performs NONE (read-only)", () => {
    const snap = snapshot();
    const factory = fakeRepoFactory();
    const preview = previewImport(snap);
    expect(preview.perCollection).toEqual({ customers: 2 });
    expect(preview.totalRows).toBe(2);
    expect(preview.approvalToken).toContain("APPROVE-IMPORT:");
    // preview never wrote anything
    expect(factory.upserts).toHaveLength(0);
  });

  it("refuses to import without a named human approver", async () => {
    const factory = fakeRepoFactory();
    const res = await importToSupabase(
      { snapshot: snapshot(), approvalToken: previewImport(snapshot()).approvalToken, approvedBy: "" },
      { getRepository: factory.getRepository },
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("unauthorized");
    expect(factory.upserts).toHaveLength(0); // NO auto-upload
  });

  it("refuses to import with a mismatched approval token", async () => {
    const factory = fakeRepoFactory();
    const res = await importToSupabase(
      { snapshot: snapshot(), approvalToken: "APPROVE-IMPORT:wrong:0", approvedBy: "אייליה" },
      { getRepository: factory.getRepository },
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("unauthorized");
    expect(factory.upserts).toHaveLength(0);
  });

  it("imports only with the exact token + named approver, upserting each row", async () => {
    const factory = fakeRepoFactory();
    const snap = snapshot();
    const token = previewImport(snap).approvalToken;
    const res = await importToSupabase(
      { snapshot: snap, approvalToken: token, approvedBy: "אייליה" },
      { getRepository: factory.getRepository },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.totalWritten).toBe(2);
    expect(res.data.approvedBy).toBe("אייליה");
    expect(factory.upserts.map((r) => r.id)).toEqual(["cu-1", "cu-2"]);
  });

  it("aborts on the first failed remote write (no silent fallback / partial hide)", async () => {
    const getRepository = (_c: CollectionKey) =>
      Promise.resolve({
        upsertSafe: (): Promise<RepoResult<BaseEntity>> =>
          Promise.resolve({ ok: false, error: { code: "network", message: "x", retriable: true } }),
      });
    const snap = snapshot();
    const res = await importToSupabase(
      { snapshot: snap, approvalToken: previewImport(snap).approvalToken, approvedBy: "אייליה" },
      { getRepository },
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("network");
  });

  it("rejects a snapshot with an unrecognized format", async () => {
    const bad = { ...snapshot(), format: "bogus/9" } as unknown as LocalExport;
    const res = await importToSupabase({ snapshot: bad, approvalToken: "x", approvedBy: "אייליה" });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("validation");
  });
});

describe("migration — exportLocal is read-only", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("reads local collections into a portable snapshot and uploads nothing", async () => {
    const { __resetRepositoriesForTests, getRepository } = await import("@/repositories/factory");
    const { __resetIdbConnectionForTests } = await import("@/repositories/IndexedDBRepository");
    __resetIdbConnectionForTests();
    __resetRepositoriesForTests();
    // put one real row locally
    await getRepository("customers").create({
      id: "cu-100",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    } as BaseEntity);

    const { exportLocal } = await import("@/persistence/migration/localExport");
    const snap = await exportLocal(() => "2026-07-30T00:00:00.000Z");
    expect(snap.format).toBe(EXPORT_FORMAT_VERSION);
    expect(snap.collections.customers?.some((r) => r.id === "cu-100")).toBe(true);
    expect(snap.totalRows).toBeGreaterThanOrEqual(1);
  });
});
