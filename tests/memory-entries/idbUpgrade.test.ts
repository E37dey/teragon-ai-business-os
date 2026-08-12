// S13.4 (PR D) — IndexedDB schema migration safety (IDB_VERSION 6 → 7).
// Bumping the IDB version is a real client-side migration: it MUST preserve every
// existing object store and its data, add ONLY "memoryEntries", and never wipe
// user data. Seeding must never overwrite user-created memoryEntries.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { openDB } from "idb";
import { beforeEach, describe, expect, it } from "vitest";
import {
  IDB_NAME,
  __resetIdbConnectionForTests,
} from "@/repositories/IndexedDBRepository";
import { __resetRepositoriesForTests, getRepository, seedIfEmpty } from "@/repositories";
import { createMemoryEntry, listMemoryEntries } from "@/memory/entries/memoryEntryRepository";

// A representative subset of pre-existing (v6) stores with real data to preserve.
const V6_STORES = ["organizations", "customers", "memoryRecords", "auditEvents"] as const;

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  __resetIdbConnectionForTests();
  __resetRepositoriesForTests();
});

describe("IndexedDB v6 → v7 upgrade safety", () => {
  it("preserves every existing store + data and adds ONLY memoryEntries", async () => {
    // 1) Simulate a pre-existing v6 database with user data in old stores.
    const db6 = await openDB(IDB_NAME, 6, {
      upgrade(database) {
        for (const s of V6_STORES) {
          if (!database.objectStoreNames.contains(s)) database.createObjectStore(s, { keyPath: "id" });
        }
      },
    });
    await db6.put("memoryRecords", { id: "mr-keep", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", title: "שמור" });
    await db6.put("customers", { id: "cu-keep", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", name: "לקוח קיים" });
    const v6StoreNames = [...db6.objectStoreNames];
    db6.close();

    // 2) Open through the repository (IDB_VERSION = 7) → triggers the 6→7 upgrade.
    __resetIdbConnectionForTests();
    __resetRepositoriesForTests();

    // Existing data survives the upgrade untouched.
    expect((await getRepository("memoryRecords").get("mr-keep"))).toMatchObject({ id: "mr-keep", title: "שמור" });
    expect((await getRepository("customers").get("cu-keep"))).toMatchObject({ id: "cu-keep", name: "לקוח קיים" });

    // The new memoryEntries store now exists and is empty (added, not seeded here).
    expect(await listMemoryEntries("org-1")).toEqual([]);

    // Every pre-existing store still exists after the upgrade (none dropped).
    for (const s of v6StoreNames) {
      expect(getRepository(s as (typeof V6_STORES)[number])).toBeTruthy();
    }
  });

  it("seedIfEmpty does NOT overwrite user-created memoryEntries", async () => {
    // A user creates a real entry first.
    const created = await createMemoryEntry("org-1", { title: "של המשתמש", content: "לא לדרוס", category: "NOTE" });
    const before = (await listMemoryEntries("org-1", { includeArchived: true })).map((e) => e.id);
    expect(before).toEqual([created.id]);

    // Boot-time seeding runs — memoryEntries is non-empty, so it is skipped.
    await seedIfEmpty();

    const after = (await listMemoryEntries("org-1", { includeArchived: true })).map((e) => e.id);
    expect(after).toEqual([created.id]); // user entry kept; the 3-entry seed was NOT added
  });

  it("seedIfEmpty DOES seed memoryEntries only when the store is empty", async () => {
    // Fresh empty store → seed populates the deterministic demo entries.
    const seeded = await seedIfEmpty();
    expect(seeded).toContain("memoryEntries");
    expect((await listMemoryEntries("org-1", { includeArchived: true })).length).toBeGreaterThan(0);
  });
});
