// W6-A — pure derivation for the /memory page. EVERY number on the page
// comes from one of these functions over repository data — no hardcoded KPIs.
// Zero data ⇒ honest 0 (counts) — rates that were never measured are not
// numbers here at all (the page renders "טרם נמדד" for those).
import type { MemoryRecord } from "@/domain/types";
import type {
  MemoryConflict,
  MemoryImportJob,
  MemoryLayer,
  MemoryLink,
  MemoryProposal,
  MemoryRecordV2,
  MemoryUsage,
} from "@/domain/memory";
import { fromLegacyMemoryRecord, isMemoryRecordV2 } from "@/memory/adapters/legacyBridge";

// ---------------------------------------------------------------------------
// bridging
// ---------------------------------------------------------------------------

/** bridge a raw memoryRecords list (legacy + V2 mixed) to V2 (pure). */
export function bridgeRecords(raw: readonly (MemoryRecord | MemoryRecordV2)[]): MemoryRecordV2[] {
  return raw.map((r) => (isMemoryRecordV2(r) ? r : fromLegacyMemoryRecord(r)));
}

// ---------------------------------------------------------------------------
// metrics (all derived; counts only — no invented rates)
// ---------------------------------------------------------------------------

export interface MemoryMetrics {
  approvedRecords: number;
  pendingProposals: number;
  totalLinks: number;
  unresolvedLinks: number;
  openConflicts: number;
  reviewsDue: number;
  importsToday: number;
  aiUsesToday: number;
}

export interface MemoryMetricsInput {
  records: readonly MemoryRecordV2[];
  proposals: readonly MemoryProposal[];
  links: readonly MemoryLink[];
  conflicts: readonly MemoryConflict[];
  usage: readonly MemoryUsage[];
  importJobs: readonly MemoryImportJob[];
}

/** date-only prefix comparison (deterministic, timezone-naive by design) */
function sameDay(iso: string | null, todayISO: string): boolean {
  return iso !== null && iso.slice(0, 10) === todayISO.slice(0, 10);
}

export function computeMemoryMetrics(input: MemoryMetricsInput, todayISO: string): MemoryMetrics {
  return {
    approvedRecords: input.records.filter(
      (r) => r.approvalState === "מאושר" && r.archivedAt === null,
    ).length,
    pendingProposals: input.proposals.filter((p) => p.status === "ממתין לאישור").length,
    totalLinks: input.links.length,
    unresolvedLinks: input.links.filter((l) => l.resolution !== "resolved").length,
    openConflicts: input.conflicts.filter((c) => c.status === "פתוח").length,
    reviewsDue: input.records.filter(
      (r) =>
        r.archivedAt === null &&
        r.reviewDate !== null &&
        r.reviewDate.slice(0, 10) <= todayISO.slice(0, 10),
    ).length,
    importsToday: input.importJobs.filter((j) => sameDay(j.startedAt, todayISO)).length,
    aiUsesToday: input.usage.filter((u) => sameDay(u.usedAt, todayISO)).length,
  };
}

// ---------------------------------------------------------------------------
// browsing / search
// ---------------------------------------------------------------------------

export interface NoteFilter {
  query: string;
  layer: MemoryLayer | null;
  folder: string | null;
}

export function filterRecords(
  records: readonly MemoryRecordV2[],
  filter: NoteFilter,
): MemoryRecordV2[] {
  const q = filter.query.trim().toLowerCase();
  return records
    .filter((r) => r.archivedAt === null)
    .filter((r) => (filter.layer ? r.memoryLayer === filter.layer : true))
    .filter((r) => (filter.folder ? r.folder === filter.folder : true))
    .filter((r) =>
      q.length === 0
        ? true
        : r.title.toLowerCase().includes(q) ||
          r.plainText.toLowerCase().includes(q) ||
          r.tags.some((t) => t.toLowerCase().includes(q)),
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** folders (with counts) per layer — the browser tree, fully derived */
export function foldersForLayer(
  records: readonly MemoryRecordV2[],
  layer: MemoryLayer,
): { folder: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of records) {
    if (r.archivedAt !== null || r.memoryLayer !== layer) continue;
    const key = r.folder || "ללא תיקייה";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([folder, count]) => ({ folder, count }))
    .sort((a, b) => a.folder.localeCompare(b.folder, "he"));
}

export function countByLayer(
  records: readonly MemoryRecordV2[],
): Record<MemoryLayer, number> {
  const out: Record<MemoryLayer, number> = {
    customer: 0,
    business: 0,
    technical: 0,
    agent_learning: 0,
  };
  for (const r of records) {
    if (r.archivedAt === null) out[r.memoryLayer] += 1;
  }
  return out;
}

// ---------------------------------------------------------------------------
// link graph (simple, no library)
// ---------------------------------------------------------------------------

export interface GraphNode {
  id: string;
  title: string;
  layer: MemoryLayer;
}

export interface GraphEdge {
  fromId: string;
  toId: string;
}

export interface LinkGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** wikilinks that do not resolve to a record (honest count for the UI) */
  unresolvedCount: number;
}

export function buildLinkGraph(
  records: readonly MemoryRecordV2[],
  links: readonly MemoryLink[],
): LinkGraph {
  const active = records.filter((r) => r.archivedAt === null);
  const ids = new Set(active.map((r) => r.id));
  const nodes: GraphNode[] = active.map((r) => ({ id: r.id, title: r.title, layer: r.memoryLayer }));
  const edges: GraphEdge[] = [];
  let unresolvedCount = 0;
  for (const link of links) {
    if (link.resolution === "resolved" && link.resolvedRecordId && ids.has(link.fromRecordId) && ids.has(link.resolvedRecordId)) {
      edges.push({ fromId: link.fromRecordId, toId: link.resolvedRecordId });
    } else {
      unresolvedCount += 1;
    }
  }
  return { nodes, edges, unresolvedCount };
}

// ---------------------------------------------------------------------------
// proposal queue
// ---------------------------------------------------------------------------

export function pendingProposals(proposals: readonly MemoryProposal[]): MemoryProposal[] {
  return proposals
    .filter((p) => p.status === "ממתין לאישור" || p.status === "טיוטה")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
