// /knowledge pure derivation library (Wave 6, W6-C). Everything here is a
// deterministic function over real records — the rail and the panels render
// ONLY these results ("טרם נמדד" whenever a value cannot be honestly derived).
import type { Course, PrinterModel, ServiceTicket } from "@/domain/types";
import type {
  KnowledgeArticleV2,
  KnowledgeConflict,
  KnowledgeQuestion,
  KnowledgeReview,
  KnowledgeSource,
  KnowledgeUsage,
} from "@/domain/knowledge";
import { isAuthoritative } from "@/domain/knowledge";

export const OLD_SOURCE_DAYS = 180;
export const REVIEW_DUE_SOON_DAYS = 30;

function daysBetween(fromISO: string, toISO: string): number {
  const from = new Date(`${fromISO.slice(0, 10)}T00:00:00Z`).getTime();
  const to = new Date(`${toISO.slice(0, 10)}T00:00:00Z`).getTime();
  return Math.floor((to - from) / 86_400_000);
}

/** Sources captured more than OLD_SOURCE_DAYS ago. */
export function oldSources(sources: readonly KnowledgeSource[], nowISO: string): KnowledgeSource[] {
  return sources.filter((s) => daysBetween(s.capturedAt, nowISO) > OLD_SOURCE_DAYS);
}

/** Sources without an owner — nobody answers for their freshness. */
export function ownerlessSources(sources: readonly KnowledgeSource[]): KnowledgeSource[] {
  return sources.filter((s) => s.ownerId === null);
}

/** Approved articles whose reviewDate falls within the next N days. */
export function upcomingReviews(
  articles: readonly KnowledgeArticleV2[],
  nowISO: string,
  withinDays = REVIEW_DUE_SOON_DAYS,
): KnowledgeArticleV2[] {
  const now = nowISO.slice(0, 10);
  return articles
    .filter((a) => {
      if (a.approval.state !== "מאושר" || a.archived || a.reviewDate === null) return false;
      const d = daysBetween(now, a.reviewDate);
      return d >= 0 && d <= withinDays;
    })
    .sort((a, b) => (a.reviewDate ?? "").localeCompare(b.reviewDate ?? "") || a.id.localeCompare(b.id));
}

/** Approved articles whose reviewDate already passed — honestly EXPIRED. */
export function expiredArticles(
  articles: readonly KnowledgeArticleV2[],
  nowISO: string,
): KnowledgeArticleV2[] {
  const now = nowISO.slice(0, 10);
  return articles.filter(
    (a) =>
      a.approval.state === "מאושר" &&
      !a.archived &&
      a.reviewDate !== null &&
      a.reviewDate.slice(0, 10) < now,
  );
}

export function openConflicts(conflicts: readonly KnowledgeConflict[]): KnowledgeConflict[] {
  return [...conflicts.filter((c) => c.status === "פתוח")].sort((a, b) =>
    a.id.localeCompare(b.id),
  );
}

export function openQuestions(questions: readonly KnowledgeQuestion[]): KnowledgeQuestion[] {
  return [...questions.filter((q) => q.status === "פתוחה")].sort((a, b) =>
    a.askedAt.localeCompare(b.askedAt) || a.id.localeCompare(b.id),
  );
}

/** Reviews still awaiting a decision — "עדכונים מוצעים". */
export function pendingReviews(reviews: readonly KnowledgeReview[]): KnowledgeReview[] {
  return [...reviews.filter((r) => r.decidedAt === null)].sort((a, b) =>
    a.requestedAt.localeCompare(b.requestedAt),
  );
}

export interface UsageStats {
  total: number;
  superseded: number;
  byAgent: Map<string, number>;
}

export function usageStats(usage: readonly KnowledgeUsage[]): UsageStats {
  const byAgent = new Map<string, number>();
  let superseded = 0;
  for (const u of usage) {
    byAgent.set(u.byAgent, (byAgent.get(u.byAgent) ?? 0) + 1);
    if (u.supersededByVersion !== null) superseded += 1;
  }
  return { total: usage.length, superseded, byAgent };
}

/**
 * Evidence coverage: % of authoritative articles with at least one source.
 * null (= "טרם נמדד") when there are no authoritative articles to measure.
 */
export function evidenceCoveragePercent(
  articles: readonly KnowledgeArticleV2[],
  nowISO: string,
): number | null {
  const authoritative = articles.filter((a) => isAuthoritative(a, nowISO));
  if (authoritative.length === 0) return null;
  const withSources = authoritative.filter((a) => a.sourceIds.length > 0).length;
  return Math.round((withSources / authoritative.length) * 100);
}

// ---------------------------------------------------------------------------
// related-record joins (deterministic text/id matching — declared as such)
// ---------------------------------------------------------------------------

export const RELATED_METHOD_HE = "התאמה דטרמיניסטית לפי דגמים/קטגוריות — לא מודל";

export function relatedPrinterModels(
  article: KnowledgeArticleV2,
  models: readonly PrinterModel[],
): PrinterModel[] {
  return models.filter((m) => article.supportedPrinterModels.includes(m.id));
}

/** Tickets whose printer name matches a supported model, or whose text
 *  contains one of the article's troubleshooting categories. */
export function relatedServiceTickets(
  article: KnowledgeArticleV2,
  tickets: readonly ServiceTicket[],
  models: readonly PrinterModel[],
): ServiceTicket[] {
  const modelNames = relatedPrinterModels(article, models).map((m) => m.name);
  return tickets.filter((t) => {
    if (modelNames.some((n) => t.printer.includes(n) || n.includes(t.printer))) return true;
    const text = `${t.issue} ${t.description}`;
    return article.troubleshootingCategories.some((c) => text.includes(c));
  });
}

/** Courses whose name/blurb mentions the article's materials or categories. */
export function relatedCourses(
  article: KnowledgeArticleV2,
  courses: readonly Course[],
): Course[] {
  const needles = [...article.supportedMaterials, ...article.troubleshootingCategories];
  if (needles.length === 0) return [];
  return courses.filter((c) => {
    const text = `${c.name} ${c.blurb}`;
    return needles.some((n) => text.includes(n));
  });
}

// ---------------------------------------------------------------------------
// filters
// ---------------------------------------------------------------------------

export type ReviewDueFilter = "all" | "due-soon" | "expired";

export function filterArticles(
  articles: readonly KnowledgeArticleV2[],
  opts: {
    category: string; // "" = all
    state: string; // "" = all
    reviewDue: ReviewDueFilter;
    nowISO: string;
  },
): KnowledgeArticleV2[] {
  let out = [...articles];
  if (opts.category) out = out.filter((a) => a.category === opts.category);
  if (opts.state) out = out.filter((a) => a.approval.state === opts.state);
  if (opts.reviewDue === "due-soon") {
    const due = new Set(upcomingReviews(out, opts.nowISO).map((a) => a.id));
    out = out.filter((a) => due.has(a.id));
  } else if (opts.reviewDue === "expired") {
    const exp = new Set(expiredArticles(out, opts.nowISO).map((a) => a.id));
    out = out.filter((a) => exp.has(a.id));
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
}
