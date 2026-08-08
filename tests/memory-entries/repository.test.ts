// S13.4 (PR D) — real local-memory repository: durable IndexedDB persistence
// (proved across a simulated reload with fake-indexeddb), org isolation, CRUD,
// search/filter, archive/restore, fail-closed org scope, and validation.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetRepositoriesForTests } from "@/repositories";
import { __resetIdbConnectionForTests } from "@/repositories/IndexedDBRepository";
import {
  MemoryOrgScopeError,
  MemoryValidationError,
  MemoryNotFoundError,
  activeMemoryForAgents,
  archiveMemoryEntry,
  createMemoryEntry,
  getMemoryEntry,
  listMemoryEntries,
  restoreMemoryEntry,
  searchMemoryEntries,
  updateMemoryEntry,
} from "@/memory/entries/memoryEntryRepository";

const ORG_A = "org-1";
const ORG_B = "org-2";

/** Simulate a browser reload: drop repository singletons; the fake-idb DB (and
 *  its data) persists, so re-opening reads exactly what was written. */
function reload(): void {
  __resetRepositoriesForTests();
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory(); // fresh, empty DB per test (no seed in unit)
  __resetIdbConnectionForTests(); // drop the cached idb connection so the new DB is opened
  __resetRepositoriesForTests();
});
afterEach(() => vi.restoreAllMocks());

describe("memoryEntryRepository — durable, org-scoped CRUD", () => {
  it("create persists and survives a reload (real IndexedDB)", async () => {
    const created = await createMemoryEntry(ORG_A, { title: "כותרת", content: "תוכן", category: "NOTE" });
    expect(created.id).toMatch(/^me-/);
    expect(created.status).toBe("ACTIVE");
    reload();
    const after = await listMemoryEntries(ORG_A);
    expect(after.map((e) => e.id)).toContain(created.id);
    expect(after.find((e) => e.id === created.id)?.title).toBe("כותרת");
  });

  it("edit persists (updatedAt changes) and survives a reload", async () => {
    const created = await createMemoryEntry(ORG_A, { title: "לפני", content: "x", category: "NOTE" }, "2026-08-01T00:00:00.000Z");
    const edited = await updateMemoryEntry(ORG_A, created.id, { title: "אחרי", content: "y", category: "DECISION", tags: ["t"] }, "2026-08-02T00:00:00.000Z");
    expect(edited.title).toBe("אחרי");
    expect(edited.category).toBe("DECISION");
    expect(edited.updatedAt).not.toBe(created.updatedAt);
    reload();
    const got = await getMemoryEntry(ORG_A, created.id);
    expect(got?.title).toBe("אחרי");
    expect(got?.tags).toEqual(["t"]);
  });

  it("archive hides from default view; restore brings it back; both persist", async () => {
    const c = await createMemoryEntry(ORG_A, { title: "לארכב", content: "x", category: "PROCESS" });
    await archiveMemoryEntry(ORG_A, c.id);
    reload();
    expect((await listMemoryEntries(ORG_A)).map((e) => e.id)).not.toContain(c.id); // default hides archived
    expect((await listMemoryEntries(ORG_A, { includeArchived: true })).map((e) => e.id)).toContain(c.id);
    await restoreMemoryEntry(ORG_A, c.id);
    reload();
    expect((await listMemoryEntries(ORG_A)).map((e) => e.id)).toContain(c.id);
  });

  it("search matches title, content, and tags; category + archived filters work", async () => {
    await createMemoryEntry(ORG_A, { title: "אישורים", content: "מדיניות", category: "PROCESS", tags: ["ממשל"] });
    await createMemoryEntry(ORG_A, { title: "לקוח", content: "פרטי קשר", category: "NOTE", tags: ["crm"] });
    expect((await searchMemoryEntries(ORG_A, { query: "אישורים" })).length).toBe(1); // title
    expect((await searchMemoryEntries(ORG_A, { query: "קשר" })).length).toBe(1); // content
    expect((await searchMemoryEntries(ORG_A, { query: "ממשל" })).length).toBe(1); // tag
    expect((await searchMemoryEntries(ORG_A, { category: "NOTE" })).length).toBe(1); // category filter
    expect((await searchMemoryEntries(ORG_A, {})).length).toBe(2); // no query → all active
  });

  it("organization isolation: org A cannot read org B (list/get/search never cross)", async () => {
    const a = await createMemoryEntry(ORG_A, { title: "סוד A", content: "רק לארגון A", category: "NOTE" });
    const b = await createMemoryEntry(ORG_B, { title: "סוד B", content: "רק לארגון B", category: "NOTE" });
    reload();
    expect((await listMemoryEntries(ORG_A)).map((e) => e.id)).toEqual([a.id]);
    expect((await listMemoryEntries(ORG_B)).map((e) => e.id)).toEqual([b.id]);
    expect(await getMemoryEntry(ORG_A, b.id)).toBeUndefined(); // cross-org read blocked
    expect(await getMemoryEntry(ORG_B, a.id)).toBeUndefined();
    expect((await searchMemoryEntries(ORG_A, { query: "סוד" })).map((e) => e.id)).toEqual([a.id]);
  });

  it("cross-org update/archive fail closed and never mutate", async () => {
    const a = await createMemoryEntry(ORG_A, { title: "A", content: "x", category: "NOTE" });
    await expect(updateMemoryEntry(ORG_B, a.id, { title: "hijack", content: "y", category: "NOTE" })).rejects.toBeInstanceOf(MemoryNotFoundError);
    await expect(archiveMemoryEntry(ORG_B, a.id)).rejects.toBeInstanceOf(MemoryNotFoundError);
    reload();
    expect((await getMemoryEntry(ORG_A, a.id))?.title).toBe("A"); // untouched
    expect((await getMemoryEntry(ORG_A, a.id))?.status).toBe("ACTIVE");
  });

  it("missing organization id fails closed (no unscoped query)", async () => {
    await expect(listMemoryEntries("")).rejects.toBeInstanceOf(MemoryOrgScopeError);
    await expect(createMemoryEntry("  ", { title: "t", content: "c", category: "NOTE" })).rejects.toBeInstanceOf(MemoryOrgScopeError);
    await expect(searchMemoryEntries("", { query: "x" })).rejects.toBeInstanceOf(MemoryOrgScopeError);
  });

  it("invalid input creates no record (fail closed, no false success)", async () => {
    await expect(createMemoryEntry(ORG_A, { title: "", content: "c", category: "NOTE" })).rejects.toBeInstanceOf(MemoryValidationError);
    await expect(createMemoryEntry(ORG_A, { title: "t", content: "", category: "NOTE" })).rejects.toBeInstanceOf(MemoryValidationError);
    reload();
    expect((await listMemoryEntries(ORG_A, { includeArchived: true })).length).toBe(0); // nothing written
  });

  it("agents READ via the bounded adapter (active only, capped) — no write path exists", async () => {
    await createMemoryEntry(ORG_A, { title: "פעיל", content: "מדיניות אישורים", category: "PROCESS", tags: ["ממשל"] });
    const archived = await createMemoryEntry(ORG_A, { title: "ישן", content: "מדיניות ישנה", category: "LEARNING" });
    await archiveMemoryEntry(ORG_A, archived.id);
    const forAgents = await activeMemoryForAgents(ORG_A, "מדיניות", 5);
    expect(forAgents.every((e) => e.status === "ACTIVE")).toBe(true);
    expect(forAgents.map((e) => e.id)).not.toContain(archived.id); // archived never exposed
    // the module exposes NO agent-facing create/update/archive — only reads
    const mod = await import("@/memory/entries/memoryEntryRepository");
    expect(typeof mod.activeMemoryForAgents).toBe("function");
    expect((mod as Record<string, unknown>).agentCreateMemory).toBeUndefined();
  });
});
