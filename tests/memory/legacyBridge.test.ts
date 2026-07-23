// W6-A — legacy Wave-1 MemoryRecord → V2 bridge: seed records stay readable,
// nothing governance-related is invented.
import { describe, expect, it } from "vitest";
import { MEMORY_RECORDS } from "@/repositories/seed/seedData";
import {
  fromLegacyMemoryRecord,
  isMemoryRecordV2,
  legacyFolderToLayer,
} from "@/memory/adapters/legacyBridge";
import { memoryRecordV2Schema } from "@/domain/memory";

describe("legacy bridge", () => {
  it("bridges every seed record to a schema-valid V2 record", () => {
    for (const legacy of MEMORY_RECORDS) {
      const v2 = fromLegacyMemoryRecord(legacy);
      const parsed = memoryRecordV2Schema.safeParse(v2);
      expect(parsed.success, `record ${legacy.id}`).toBe(true);
      expect(v2.id).toBe(legacy.id);
      expect(v2.title).toBe(legacy.title);
      expect(v2.bodyMarkdown).toBe(legacy.markdown);
      expect(v2.folder).toBe(legacy.folder);
      expect(v2.origin).toBe("legacy-import");
    }
  });

  it("never invents an approval or confidence for legacy records", () => {
    const v2 = fromLegacyMemoryRecord(MEMORY_RECORDS[0]!);
    expect(v2.approvedBy).toBeNull();
    expect(v2.approvedAt).toBeNull();
    expect(v2.verificationState).toBe("לא נבדק");
    expect(v2.confidence.status).toBe("unavailable");
    expect(v2.confidence.value).toBeUndefined();
    expect(v2.confidence.label).toBe("טרם נמדד");
  });

  it("maps legacy folders to layers deterministically", () => {
    expect(legacyFolderToLayer("לקוחות")).toBe("customer");
    expect(legacyFolderToLayer("עסקאות")).toBe("customer");
    expect(legacyFolderToLayer("לקחים")).toBe("agent_learning");
    expect(legacyFolderToLayer("החלטות")).toBe("business");
    expect(legacyFolderToLayer("תפעול")).toBe("technical");
    expect(legacyFolderToLayer("תיקייה-לא-מוכרת")).toBe("business");
  });

  it("preserves wikilinks from the legacy links field", () => {
    const mem2 = MEMORY_RECORDS.find((m) => m.id === "mem-2")!;
    const v2 = fromLegacyMemoryRecord(mem2);
    expect(v2.wikiLinks).toEqual(mem2.links);
  });

  it("shape guard distinguishes legacy from V2", () => {
    const legacy = MEMORY_RECORDS[0]!;
    expect(isMemoryRecordV2(legacy)).toBe(false);
    expect(isMemoryRecordV2(fromLegacyMemoryRecord(legacy))).toBe(true);
  });

  it("is deterministic — bridging twice yields identical output", () => {
    const a = fromLegacyMemoryRecord(MEMORY_RECORDS[0]!);
    const b = fromLegacyMemoryRecord(MEMORY_RECORDS[0]!);
    expect(a).toEqual(b);
  });
});
