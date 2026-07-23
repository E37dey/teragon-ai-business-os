// W6-E — Command-Center memory band selectors: derived only, honest zeros,
// defensive against unknown-shaped governance records from parallel streams.
import { describe, expect, it } from "vitest";
import type { MemoryRecord } from "@/domain/types";
import {
  commandCenterMemoryBand,
  type CommandCenterMemoryInput,
} from "@/integration/commandCenterMemory";

const TODAY = "2026-07-23";
const base = { createdAt: "2026-07-20T08:00:00.000Z", updatedAt: "2026-07-20T08:00:00.000Z" };

const mem = (id: string, updatedAt: string, links: string[]): MemoryRecord => ({
  id,
  title: `רשומה ${id}`,
  markdown: "",
  frontmatter: {},
  folder: "לקוחות",
  tags: [],
  links,
  createdAt: base.createdAt,
  updatedAt,
});

function emptyInput(): CommandCenterMemoryInput {
  return {
    memoryRecords: [],
    memoryProposals: [],
    memoryConflicts: [],
    knowledgeConflicts: [],
    knowledgeReviews: [],
    knowledgeUsage: [],
    learningProposals: [],
    todayIso: TODAY,
  };
}

describe("command-center memory band selectors", () => {
  it("empty collections yield honest zeros — nothing invented", () => {
    const band = commandCenterMemoryBand(emptyInput());
    expect(band).toEqual({
      approvedCount: 0,
      linkCount: 0,
      updatedToday: 0,
      pendingProposals: 0,
      unresolvedContradictions: 0,
      reviewsDue: 0,
      recentApproved: [],
      recentWikiUsage: [],
      learningProposalsWaiting: 0,
    });
  });

  it("derives counts, links, today-updates and recents from real records", () => {
    const band = commandCenterMemoryBand({
      ...emptyInput(),
      memoryRecords: [
        mem("mem-1", "2026-07-23T09:00:00.000Z", ["א", "ב"]),
        mem("mem-2", "2026-07-20T09:00:00.000Z", ["ג"]),
        mem("mem-3", "2026-07-23T07:00:00.000Z", []),
      ],
      memoryProposals: [
        { id: "mp-1", status: "ממתין לאישור" },
        { id: "mp-2", status: "אושר" },
        { id: "mp-3", status: "טיוטה" },
        { id: "mp-broken" }, // no status — defensively NOT counted as pending
      ],
      memoryConflicts: [
        { id: "mc-1", status: "פתוח" },
        { id: "mc-2", resolvedAt: "2026-07-22T10:00:00.000Z" },
      ],
      knowledgeConflicts: [{ id: "kc-1" }],
      knowledgeReviews: [
        { id: "kr-1", status: "ממתין", dueAt: "2026-07-22" },
        { id: "kr-2", status: "ממתין", dueAt: "2026-09-01" },
        { id: "kr-3", status: "בוצע", dueAt: "2026-07-01" },
      ],
      knowledgeUsage: [
        { id: "ku-1", usedAt: "2026-07-23T08:00:00.000Z", description: "שימוש בפתרון" },
        { id: "ku-2", at: "2026-07-21T08:00:00.000Z", context: "קישור ממסך שירות" },
      ],
      learningProposals: [{ id: "lp-1", status: "ממתין לאישור" }, { id: "lp-2", status: "נדחה" }],
    });
    expect(band.approvedCount).toBe(3);
    expect(band.linkCount).toBe(3);
    expect(band.updatedToday).toBe(2);
    expect(band.pendingProposals).toBe(2);
    // mc-1 open + kc-1 without any resolution field = 2 unresolved
    expect(band.unresolvedContradictions).toBe(2);
    // kr-1 past due; kr-2 future; kr-3 done
    expect(band.reviewsDue).toBe(1);
    expect(band.recentApproved.map((r) => r.id)).toEqual(["mem-1", "mem-3", "mem-2"]);
    expect(band.recentWikiUsage.map((u) => u.id)).toEqual(["ku-1", "ku-2"]);
    expect(band.learningProposalsWaiting).toBe(1);
  });

  it("never throws on garbage-shaped records", () => {
    const band = commandCenterMemoryBand({
      ...emptyInput(),
      memoryProposals: [null, 7, "מחרוזת", { status: 3 }],
      memoryConflicts: [null, {}],
      knowledgeReviews: [42],
      knowledgeUsage: [null],
      learningProposals: [undefined],
    });
    expect(band.pendingProposals).toBe(0);
    // {} has no resolution info — counted unresolved (conservative), null ignored
    expect(band.unresolvedContradictions).toBe(1);
    expect(band.reviewsDue).toBe(0);
    expect(band.recentWikiUsage).toHaveLength(1);
  });
});
