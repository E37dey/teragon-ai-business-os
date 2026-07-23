// W6-A — adapter contract: IndexedDBMemoryAdapter (over the factory, which
// falls back to seeded InMemory in jsdom) + the honest Cloud stub.
import { beforeEach, describe, expect, it } from "vitest";
import { __resetRepositoriesForTests } from "@/repositories";
import {
  CLOUD_MEMORY_UNAVAILABLE_HE,
  CloudMemoryAdapter,
  IndexedDBMemoryAdapter,
} from "@/memory/adapters/MemoryRepository";
import { fromLegacyMemoryRecord } from "@/memory/adapters/legacyBridge";
import { MEMORY_RECORDS } from "@/repositories/seed/seedData";
import { memoryRecordV2Schema } from "@/domain/memory";

describe("IndexedDBMemoryAdapter", () => {
  beforeEach(() => {
    __resetRepositoriesForTests();
  });

  it("lists the 5 seed records bridged to schema-valid V2", async () => {
    const adapter = new IndexedDBMemoryAdapter();
    const records = await adapter.listRecords();
    expect(records).toHaveLength(MEMORY_RECORDS.length);
    for (const r of records) {
      expect(memoryRecordV2Schema.safeParse(r).success).toBe(true);
      expect(r.origin).toBe("legacy-import");
    }
  });

  it("getRecord bridges a single legacy record", async () => {
    const adapter = new IndexedDBMemoryAdapter();
    const record = await adapter.getRecord("mem-1");
    expect(record).toEqual(fromLegacyMemoryRecord(MEMORY_RECORDS.find((m) => m.id === "mem-1")!));
  });

  it("save + get round-trips a V2 record without re-bridging", async () => {
    const adapter = new IndexedDBMemoryAdapter();
    const v2 = { ...fromLegacyMemoryRecord(MEMORY_RECORDS[0]!), id: "memr-99", origin: "proposal" as const };
    await adapter.saveRecord(v2);
    const back = await adapter.getRecord("memr-99");
    expect(back).toEqual(v2);
    const updated = await adapter.updateRecord("memr-99", { title: "כותרת מעודכנת" });
    expect(updated.title).toBe("כותרת מעודכנת");
  });

  it("declares an honest Mode-A label and availability", () => {
    const adapter = new IndexedDBMemoryAdapter();
    expect(adapter.available).toBe(true);
    expect(adapter.modeLabelHe).toContain("מצב הדגמה");
  });
});

describe("CloudMemoryAdapter (honest stub)", () => {
  it("is unavailable and every operation fails with the exact Hebrew reason", async () => {
    const cloud = new CloudMemoryAdapter();
    expect(cloud.available).toBe(false);
    expect(cloud.modeLabelHe).toContain(CLOUD_MEMORY_UNAVAILABLE_HE);
    await expect(cloud.listRecords()).rejects.toThrow(CLOUD_MEMORY_UNAVAILABLE_HE);
    await expect(cloud.getRecord()).rejects.toThrow(CLOUD_MEMORY_UNAVAILABLE_HE);
    await expect(cloud.saveRecord()).rejects.toThrow(CLOUD_MEMORY_UNAVAILABLE_HE);
    await expect(cloud.updateRecord()).rejects.toThrow(CLOUD_MEMORY_UNAVAILABLE_HE);
  });
});
