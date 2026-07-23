// W6 WIRING — Command-Center memory band (Phase 6.20): every value derives
// from records (honest zeros), and the row mapper hides zero values — no
// decorative numbers survive.
import { describe, expect, it } from "vitest";
import { commandCenterMemoryBand } from "@/integration/commandCenterMemory";
import { memoryBandItems } from "@/modules/command-center/memoryBandItems";
import type { MemoryRecord } from "@/domain/types";

const TODAY = "2026-07-23T12:00:00.000Z";

function legacyRecord(id: string, updatedAt: string, links: string[] = []): MemoryRecord {
  return {
    id,
    createdAt: "2026-07-01T08:00:00.000Z",
    updatedAt,
    title: `רשומה ${id}`,
    markdown: "תוכן",
    frontmatter: {},
    folder: "לקוחות",
    tags: [],
    links,
  };
}

function emptyInput() {
  return {
    memoryRecords: [] as MemoryRecord[],
    memoryProposals: [] as unknown[],
    memoryConflicts: [] as unknown[],
    knowledgeConflicts: [] as unknown[],
    knowledgeReviews: [] as unknown[],
    knowledgeUsage: [] as unknown[],
    learningProposals: [] as unknown[],
    todayIso: TODAY,
  };
}

describe("commandCenterMemoryBand — derived from records only", () => {
  it("empty collections ⇒ honest zeros everywhere", () => {
    const band = commandCenterMemoryBand(emptyInput());
    expect(band.approvedCount).toBe(0);
    expect(band.linkCount).toBe(0);
    expect(band.updatedToday).toBe(0);
    expect(band.pendingProposals).toBe(0);
    expect(band.unresolvedContradictions).toBe(0);
    expect(band.reviewsDue).toBe(0);
    expect(band.learningProposalsWaiting).toBe(0);
    expect(band.recentApproved).toEqual([]);
    expect(band.recentWikiUsage).toEqual([]);
  });

  it("counts derive from the actual records (links, today, pending, conflicts)", () => {
    const band = commandCenterMemoryBand({
      ...emptyInput(),
      memoryRecords: [
        legacyRecord("mem-a", TODAY, ["קישור 1", "קישור 2"]),
        legacyRecord("mem-b", "2026-07-01T08:00:00.000Z", ["קישור 3"]),
      ],
      memoryProposals: [
        { id: "memp-1", status: "ממתין לאישור" },
        { id: "memp-2", status: "נדחה" },
      ],
      memoryConflicts: [{ id: "mc-1", status: "פתוח" }],
      knowledgeConflicts: [{ id: "kc-1", status: "נפתר", resolvedAt: TODAY }],
      learningProposals: [{ id: "lp-1", status: "ממתין" }],
    });
    expect(band.approvedCount).toBe(2);
    expect(band.linkCount).toBe(3);
    expect(band.updatedToday).toBe(1);
    expect(band.pendingProposals).toBe(1);
    // resolved knowledge conflict is NOT counted
    expect(band.unresolvedContradictions).toBe(1);
    expect(band.learningProposalsWaiting).toBe(1);
    expect(band.recentApproved[0]?.id).toBe("mem-a");
  });
});

describe("memoryBandItems — zero-value hiding (no decorative numbers)", () => {
  it("an all-zero band renders no rows at all", () => {
    expect(memoryBandItems(commandCenterMemoryBand(emptyInput()))).toEqual([]);
  });

  it("only non-zero rows survive, each with a real route", () => {
    const band = commandCenterMemoryBand({
      ...emptyInput(),
      memoryRecords: [legacyRecord("mem-a", TODAY, ["קישור"])],
      learningProposals: [{ id: "lp-1", status: "ממתין" }],
    });
    const items = memoryBandItems(band);
    const ids = items.map((i) => i.id);
    expect(ids).toContain("approved");
    expect(ids).toContain("links");
    expect(ids).toContain("updated-today");
    expect(ids).toContain("learning-pending");
    expect(ids).not.toContain("pending-proposals");
    expect(ids).not.toContain("contradictions");
    expect(ids).not.toContain("reviews-due");
    for (const item of items) {
      expect(item.value).toBeGreaterThan(0);
      expect(item.route).toMatch(/^\/(memory|knowledge|learning)/);
    }
  });
});
