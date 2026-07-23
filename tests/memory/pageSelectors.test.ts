// W6-A — /memory page selectors: every metric is derived; zero-data ⇒ honest
// 0; markdown seam escapes everything (no HTML interpretation, ever).
import { describe, expect, it } from "vitest";
import {
  bridgeRecords,
  buildLinkGraph,
  computeMemoryMetrics,
  countByLayer,
  filterRecords,
  foldersForLayer,
  pendingProposals,
} from "@/modules/memory/selectors";
import { parseMarkdownBlocks, splitInline } from "@/modules/memory/markdown";
import { fromLegacyMemoryRecord } from "@/memory/adapters/legacyBridge";
import { MEMORY_RECORDS } from "@/repositories/seed/seedData";
import type { MemoryLink, MemoryProposal, MemoryRecordV2 } from "@/domain/memory";

const V2 = MEMORY_RECORDS.map(fromLegacyMemoryRecord);
const TODAY = "2026-07-23T12:00:00.000Z";

function link(overrides: Partial<MemoryLink>): MemoryLink {
  return {
    id: "mlink-1",
    createdAt: TODAY,
    updatedAt: TODAY,
    fromRecordId: "mem-1",
    targetText: "יעד",
    resolution: "unresolved",
    resolvedRecordId: null,
    candidateIds: [],
    ...overrides,
  };
}

describe("memory metrics", () => {
  it("zero data ⇒ honest zeros everywhere", () => {
    const m = computeMemoryMetrics(
      { records: [], proposals: [], links: [], conflicts: [], usage: [], importJobs: [] },
      TODAY,
    );
    expect(m).toEqual({
      approvedRecords: 0,
      pendingProposals: 0,
      totalLinks: 0,
      unresolvedLinks: 0,
      openConflicts: 0,
      reviewsDue: 0,
      importsToday: 0,
      aiUsesToday: 0,
    });
  });

  it("derives counts from real data only", () => {
    const records: MemoryRecordV2[] = [
      { ...V2[0]!, reviewDate: "2026-07-20" },
      { ...V2[1]!, id: "x2", reviewDate: "2026-09-01" },
    ];
    const links = [link({}), link({ id: "mlink-2", resolution: "resolved", resolvedRecordId: "x2" })];
    const m = computeMemoryMetrics(
      {
        records,
        proposals: [],
        links,
        conflicts: [],
        usage: [
          {
            id: "muse-1",
            createdAt: TODAY,
            updatedAt: TODAY,
            envelopeId: "env-1",
            operation: "op",
            recordId: "x2",
            versionId: "x2-v-1",
            versionNumber: 1,
            usedAt: TODAY,
          },
        ],
        importJobs: [],
      },
      TODAY,
    );
    expect(m.approvedRecords).toBe(2);
    expect(m.totalLinks).toBe(2);
    expect(m.unresolvedLinks).toBe(1);
    expect(m.reviewsDue).toBe(1);
    expect(m.aiUsesToday).toBe(1);
    expect(m.importsToday).toBe(0);
  });
});

describe("browse / filter", () => {
  it("bridges the mixed raw store shape", () => {
    const bridged = bridgeRecords([MEMORY_RECORDS[0]!, V2[1]!]);
    expect(bridged).toHaveLength(2);
    expect(bridged[0]?.memoryLayer).toBeDefined();
  });

  it("filters by layer, folder and query", () => {
    const byLayer = filterRecords(V2, { query: "", layer: "customer", folder: null });
    expect(byLayer.every((r) => r.memoryLayer === "customer")).toBe(true);
    const byFolder = filterRecords(V2, { query: "", layer: "customer", folder: "לקוחות" });
    expect(byFolder.map((r) => r.id)).toEqual(["mem-2"]);
    const byQuery = filterRecords(V2, { query: "פילמנט", layer: null, folder: null });
    expect(byQuery.map((r) => r.id)).toEqual(["mem-5"]);
    expect(filterRecords(V2, { query: "אין-כזה-טקסט-בכלל", layer: null, folder: null })).toEqual([]);
  });

  it("derives folders and layer counts from the records", () => {
    const counts = countByLayer(V2);
    expect(counts.customer).toBe(2); // עסקאות + לקוחות
    expect(counts.business).toBe(1);
    expect(counts.technical).toBe(1);
    expect(counts.agent_learning).toBe(1);
    const folders = foldersForLayer(V2, "customer");
    expect(folders.map((f) => f.folder).sort()).toEqual(["לקוחות", "עסקאות"]);
  });
});

describe("link graph", () => {
  it("builds nodes for all active records and edges only for resolved links", () => {
    const links = [
      link({ id: "l1", fromRecordId: "mem-1", resolution: "resolved", resolvedRecordId: "mem-2" }),
      link({ id: "l2", fromRecordId: "mem-1", resolution: "unresolved" }),
      link({ id: "l3", fromRecordId: "mem-3", resolution: "broken" }),
    ];
    const graph = buildLinkGraph(V2, links);
    expect(graph.nodes).toHaveLength(V2.length);
    expect(graph.edges).toEqual([{ fromId: "mem-1", toId: "mem-2" }]);
    expect(graph.unresolvedCount).toBe(2);
  });

  it("excludes archived records", () => {
    const archived = V2.map((r, i) => (i === 0 ? { ...r, archivedAt: TODAY } : r));
    const graph = buildLinkGraph(archived, []);
    expect(graph.nodes.some((n) => n.id === V2[0]!.id)).toBe(false);
  });
});

describe("safe markdown seam", () => {
  it("never interprets HTML — raw tags stay literal text", () => {
    const blocks = parseMarkdownBlocks('<script>alert("xss")</script>\n\n<img src=x onerror=y>');
    expect(blocks).toHaveLength(2);
    for (const b of blocks) {
      expect(b.kind).toBe("paragraph");
      if (b.kind === "paragraph") {
        const text = b.segments.map((s) => s.value).join("");
        expect(text).toMatch(/^</u); // the literal "<" survives as plain TEXT
        expect(b.segments.every((s) => s.kind === "text" || s.kind === "wikilink")).toBe(true);
      }
    }
  });

  it("parses headings, lists, dividers and wikilinks", () => {
    const blocks = parseMarkdownBlocks("# כותרת\n\n- פריט [[קישור]]\n- שני\n\n---\n\nפסקה");
    expect(blocks.map((b) => b.kind)).toEqual(["heading", "list", "divider", "paragraph"]);
    const list = blocks[1];
    if (list?.kind === "list") {
      expect(list.items).toHaveLength(2);
      expect(list.items[0]?.some((s) => s.kind === "wikilink" && s.value === "קישור")).toBe(true);
    }
  });

  it("splitInline honors aliases and keeps surrounding text", () => {
    const segments = splitInline("לפני [[יעד|כינוי]] אחרי");
    expect(segments).toEqual([
      { kind: "text", value: "לפני " },
      { kind: "wikilink", value: "כינוי" },
      { kind: "text", value: " אחרי" },
    ]);
  });
});

describe("proposal queue selector", () => {
  it("keeps only pending/draft proposals, newest first", () => {
    const base: Omit<MemoryProposal, "id" | "status" | "createdAt"> = {
      updatedAt: TODAY,
      organizationId: "org-teragon",
      observationHe: "x",
      proposedById: "a",
      proposedByName: "א",
      draft: {
        title: "t",
        slug: "t",
        bodyMarkdown: "b",
        memoryLayer: "business",
        folder: "",
        entityLinks: [],
        tags: [],
        sourceIds: [],
        sensitivity: "פנימי",
        retentionPolicy: "קבוע",
        reviewDate: null,
      },
      checks: {
        sourceValidation: { outcome: "עבר", detailHe: "", relatedIds: [] },
        duplicateCheck: { outcome: "עבר", detailHe: "", relatedIds: [] },
        contradictionCheck: { outcome: "עבר", detailHe: "", relatedIds: [] },
        sensitivityCheck: { outcome: "עבר", detailHe: "", relatedIds: [] },
      },
      approvalId: null,
      runId: "r",
      resultRecordId: null,
      decidedById: null,
      decidedByName: null,
      decidedAt: null,
      mergeTargetId: null,
      moreSourcesRequestHe: null,
    };
    const list: MemoryProposal[] = [
      { ...base, id: "p1", status: "מאושר", createdAt: "2026-07-20" },
      { ...base, id: "p2", status: "ממתין לאישור", createdAt: "2026-07-21" },
      { ...base, id: "p3", status: "טיוטה", createdAt: "2026-07-22" },
      { ...base, id: "p4", status: "נדחה", createdAt: "2026-07-23" },
    ];
    expect(pendingProposals(list).map((p) => p.id)).toEqual(["p3", "p2"]);
  });
});
