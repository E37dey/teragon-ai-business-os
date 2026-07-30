// Gate S4 — duplicate-submit prevention + idempotent upsert (tasks domain).
import { beforeEach, describe, expect, it } from "vitest";
import type { BaseEntity } from "@/domain/types";
import type { Task } from "@/domain/types";
import { SupabaseRepository } from "@/persistence/supabase/SupabaseRepository";
import { getMapping } from "@/persistence/supabase/registry";
import { MockSupabase } from "./mockSupabase";

const ISO = "2026-07-22T08:00:00.000Z";

function taskEntity(id: string, over: Partial<Task> = {}): Task {
  return {
    id,
    createdAt: ISO,
    updatedAt: ISO,
    title: `משימה ${id}`,
    description: "",
    status: "פתוחה",
    priority: "בינונית",
    due: "2026-08-01",
    ownerId: "u-1",
    relatedRef: null,
    ...over,
  };
}

function tasksRepo(mock: MockSupabase): SupabaseRepository<BaseEntity> {
  const mapping = getMapping("tasks");
  if (!mapping) throw new Error("no tasks mapping");
  return new SupabaseRepository<BaseEntity>(mock, mapping, "org-1");
}

describe("idempotency + duplicate-submit prevention", () => {
  let mock: MockSupabase;
  beforeEach(() => {
    mock = new MockSupabase();
  });

  it("upsertSafe is idempotent by deterministic id (re-submit is not a duplicate)", async () => {
    const repo = tasksRepo(mock);
    const a = await repo.upsertSafe(taskEntity("tk-1"));
    const b = await repo.upsertSafe(taskEntity("tk-1", { title: "שונתה" }));
    expect(a.ok && b.ok).toBe(true);
    expect(mock.tables.get("tasks")?.size).toBe(1);
    expect(mock.tables.get("tasks")?.get("tk-1")?.title).toBe("שונתה");
  });

  it("concurrent identical submits collapse to a single in-flight write", async () => {
    const repo = tasksRepo(mock);
    const [a, b] = await Promise.all([repo.upsertSafe(taskEntity("tk-9")), repo.upsertSafe(taskEntity("tk-9"))]);
    expect(a.ok && b.ok).toBe(true);
    expect(mock.tables.get("tasks")?.size).toBe(1);
  });

  it("createSafe (non-idempotent insert) rejects a duplicate id with a safe error", async () => {
    const repo = tasksRepo(mock);
    const first = await repo.createSafe(taskEntity("tk-2"));
    expect(first.ok).toBe(true);
    const second = await repo.createSafe(taskEntity("tk-2"));
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error.code).toBe("duplicate");
  });

  it("rejects an invalid write before it reaches the client", async () => {
    const repo = tasksRepo(mock);
    const bad = await repo.upsertSafe(taskEntity("tk-3", { ownerId: "" })); // ownerId min(1)
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.error.code).toBe("validation");
    expect(mock.tables.get("tasks")?.has("tk-3")).toBeFalsy();
  });
});
