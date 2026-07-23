// W6-E — Command-Center memory band selectors (Phase 6.17 data side).
// DERIVED ONLY: counts and recent lists over the governance collections.
// Approved memory = the canonical memoryRecords collection; everything from
// the parallel W6-A/B/C workstreams is consumed defensively (unknown-shaped).
// No hardcoded numbers, no writes, no invented values — an empty collection
// yields an honest 0.
import type { MemoryRecord } from "@/domain/types";
import { asRecord, isOnDay, isPendingStatus, str } from "./defensive";

export interface CommandCenterMemoryBand {
  /** approved memory records (canonical collection) */
  approvedCount: number;
  /** wikilink edges across approved memory (sum of links[]) */
  linkCount: number;
  /** approved memory records updated today */
  updatedToday: number;
  /** memory proposals still awaiting a decision */
  pendingProposals: number;
  /** memory/knowledge contradictions without a resolution */
  unresolvedContradictions: number;
  /** knowledge reviews due (pending or past their review date) */
  reviewsDue: number;
  /** newest approved memory first */
  recentApproved: { id: string; title: string; updatedAt: string }[];
  /** newest Wiki/knowledge usage events first */
  recentWikiUsage: { id: string; at: string; description: string }[];
  /** learning proposals awaiting a decision */
  learningProposalsWaiting: number;
}

export interface CommandCenterMemoryInput {
  memoryRecords: readonly MemoryRecord[];
  memoryProposals: readonly unknown[];
  memoryConflicts: readonly unknown[];
  knowledgeConflicts: readonly unknown[];
  knowledgeReviews: readonly unknown[];
  knowledgeUsage: readonly unknown[];
  learningProposals: readonly unknown[];
  todayIso: string;
}

function isUnresolved(conflict: unknown): boolean {
  if (!asRecord(conflict)) return false; // not a record — nothing to resolve
  const resolution = str(conflict, "resolution");
  const resolvedAt = str(conflict, "resolvedAt");
  const status = str(conflict, "status");
  if (resolution || resolvedAt) return false;
  if (status && /נפתר|נסגר/.test(status)) return false;
  return true;
}

function isReviewDue(review: unknown, todayIso: string): boolean {
  const status = str(review, "status");
  if (status && /בוצע|הושלם|נסגר/.test(status)) return false;
  const due = str(review, "dueAt") ?? str(review, "reviewAt") ?? str(review, "due");
  if (due) return due.slice(0, 10) <= todayIso.slice(0, 10);
  return isPendingStatus(status);
}

/** The whole memory band, derived from real records only. */
export function commandCenterMemoryBand(input: CommandCenterMemoryInput): CommandCenterMemoryBand {
  const approved = [...input.memoryRecords].sort(
    (a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id),
  );
  const pendingProposals = input.memoryProposals.filter((p) =>
    isPendingStatus(str(p, "status")),
  ).length;
  const unresolvedContradictions =
    input.memoryConflicts.filter(isUnresolved).length +
    input.knowledgeConflicts.filter(isUnresolved).length;
  const reviewsDue = input.knowledgeReviews.filter((r) => isReviewDue(r, input.todayIso)).length;
  const recentWikiUsage = input.knowledgeUsage
    .map((u) => ({
      id: str(u, "id") ?? "(ללא מזהה)",
      at: str(u, "usedAt") ?? str(u, "at") ?? str(u, "createdAt") ?? "",
      description: str(u, "description") ?? str(u, "context") ?? str(u, "articleId") ?? "",
    }))
    .sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id))
    .slice(0, 5);
  return {
    approvedCount: approved.length,
    linkCount: approved.reduce((sum, m) => sum + m.links.length, 0),
    updatedToday: approved.filter((m) => isOnDay(m.updatedAt, input.todayIso)).length,
    pendingProposals,
    unresolvedContradictions,
    reviewsDue,
    recentApproved: approved
      .slice(0, 5)
      .map((m) => ({ id: m.id, title: m.title, updatedAt: m.updatedAt })),
    recentWikiUsage,
    learningProposalsWaiting: input.learningProposals.filter((p) =>
      isPendingStatus(str(p, "status")),
    ).length,
  };
}
