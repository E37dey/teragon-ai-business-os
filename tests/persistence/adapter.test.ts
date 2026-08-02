// Gate S4 — generic Supabase adapter: mapping, validation, pagination, safe
// errors, deterministic ids, no silent fallback. Uses the deterministic mock.
import { beforeEach, describe, expect, it } from "vitest";
import type { BaseEntity } from "@/domain/types";
import type { CollectionKey } from "@/repositories/collections";
import { SupabaseRepository, RepositoryRemoteError } from "@/persistence/supabase/SupabaseRepository";
import { getMapping } from "@/persistence/supabase/registry";
import type { DbRow } from "@/persistence/supabase/db";
import { MockSupabase } from "./mockSupabase";

const ISO = "2026-07-22T08:00:00.000Z";

function repo(collection: CollectionKey, mock: MockSupabase, org = "org-1"): SupabaseRepository<BaseEntity> {
  const mapping = getMapping(collection);
  if (!mapping) throw new Error(`no mapping for ${collection}`);
  return new SupabaseRepository<BaseEntity>(mock, mapping, org);
}

function customerRow(id: string, over: Partial<DbRow> = {}): DbRow {
  return {
    id,
    organization_id: "org-1",
    name: `לקוח ${id}`,
    type: "עסק",
    phone: "",
    email: "",
    city: "",
    owning_org_id: null,
    printer_summary: "",
    course_names: [],
    revenue: 0,
    contact_state: "פעיל",
    review: null,
    status: "פעיל",
    created_at: ISO,
    updated_at: ISO,
    ...over,
  };
}

describe("SupabaseRepository — row↔entity mapping + validation", () => {
  let mock: MockSupabase;
  beforeEach(() => {
    mock = new MockSupabase();
  });

  it("maps snake_case columns to the camelCase entity (owning_org_id → organizationId)", async () => {
    mock.seed("customers", [customerRow("cu-1", { owning_org_id: "org-9", revenue: 1200 })]);
    const r = await repo("customers", mock).getSafe("cu-1");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toMatchObject({ id: "cu-1", organizationId: "org-9", revenue: 1200, contactState: "פעיל" });
    // camelCase base fields present, snake_case absent
    expect((r.data as unknown as Record<string, unknown>).created_at).toBeUndefined();
    expect(r.data?.createdAt).toBe(ISO);
  });

  it("normalizes Postgres microsecond timestamps to the domain millisecond-ISO form", async () => {
    // Regression: Postgres `timestamptz` renders 6 fractional digits and a
    // `+00:00` offset — the exact shape an `updated_at` trigger stamps on every
    // UPDATE. The domain `isoDate` accepts only ≤3 fractional digits, so an
    // unnormalized row failed validation and made EVERY live adapter UPDATE
    // return code=validation. The row→entity boundary must present it in
    // canonical `toISOString()` (millisecond) form.
    const pgMicros = "2026-07-31T08:07:32.327157+00:00";
    mock.seed("customers", [customerRow("cu-ts", { updated_at: pgMicros })]);
    const r = await repo("customers", mock).getSafe("cu-ts");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data?.updatedAt).toBe("2026-07-31T08:07:32.327Z");
  });

  it("rejects a row that fails zod validation (never trusts a bad row)", async () => {
    mock.seed("customers", [customerRow("cu-1", { revenue: -50 })]); // revenue < 0 invalid
    const r = await repo("customers", mock).getSafe("cu-1");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("validation");
  });

  it("writes entity → row through insert and reads it back", async () => {
    const entity: BaseEntity & Record<string, unknown> = {
      id: "cu-7",
      createdAt: ISO,
      updatedAt: ISO,
      name: "חדש",
      type: "פרטי",
      phone: "050",
      email: "a@b.co",
      city: "חיפה",
      organizationId: null,
      printerSummary: "",
      courseNames: [],
      revenue: 0,
      contactState: "פעיל",
      review: null,
      status: "פעיל",
    };
    const created = await repo("customers", mock).createSafe(entity as BaseEntity);
    expect(created.ok).toBe(true);
    // stored row is snake_case with tenant + owning_org_id columns
    const stored = mock.tables.get("customers")?.get("cu-7");
    expect(stored).toMatchObject({ id: "cu-7", organization_id: "org-1", owning_org_id: null, name: "חדש" });
  });
});

describe("SupabaseRepository — pagination + deterministic ids", () => {
  let mock: MockSupabase;
  beforeEach(() => {
    mock = new MockSupabase();
    mock.seed(
      "customers",
      ["cu-1", "cu-2", "cu-3", "cu-4", "cu-5"].map((id) => customerRow(id)),
    );
  });

  it("range-based pagination reports hasMore correctly", async () => {
    const first = await repo("customers", mock).listPage({ from: 0, to: 1 });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.data.rows.map((r) => r.id)).toEqual(["cu-1", "cu-2"]);
    expect(first.data.hasMore).toBe(true);

    const last = await repo("customers", mock).listPage({ from: 4, to: 5 });
    expect(last.ok).toBe(true);
    if (!last.ok) return;
    expect(last.data.rows.map((r) => r.id)).toEqual(["cu-5"]);
    expect(last.data.hasMore).toBe(false);
  });

  it("allocateId reuses the deterministic <prefix>-<n> strategy (never random)", async () => {
    const id = await repo("customers", mock).allocateId();
    expect(id.ok).toBe(true);
    if (!id.ok) return;
    expect(id.data).toBe("cu-6");
  });
});

describe("SupabaseRepository — safe error mapping + no silent fallback", () => {
  let mock: MockSupabase;
  beforeEach(() => {
    mock = new MockSupabase();
    mock.seed("customers", [customerRow("cu-1")]);
  });

  it("maps a PostgREST error to a safe result (never throws) on the safe API", async () => {
    mock.failNext({ code: "42501", message: "permission denied for table customers" });
    const r = await repo("customers", mock).listSafe();
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("unauthorized");
    // the raw PostgREST message never leaks into the safe error
    expect(JSON.stringify(r.error)).not.toContain("permission denied for table");
  });

  it("throwing API raises a typed RepositoryRemoteError, not a raw driver error", async () => {
    mock.failNext({ code: "23503", message: "fk violation" });
    await expect(repo("customers", mock).list()).rejects.toBeInstanceOf(RepositoryRemoteError);
  });

  it("a failed remote write surfaces an error and does NOT fall back to local", async () => {
    mock.failNext({ code: "42501", message: "denied" });
    const r = await repo("customers", mock).createSafe(customerRow("cu-2") as unknown as BaseEntity);
    expect(r.ok).toBe(false);
    // no partial/hidden write happened anywhere in the mock store
    expect(mock.tables.get("customers")?.has("cu-2")).toBe(false);
  });
});
