// TERAGON AI BUSINESS OS — knowledge approval lifecycle (Wave 6, W6-C).
// EVERY state transition into "מאושר" flows through the ONE canonical
// ApprovalEngine ('permanent-knowledge-update'). There is no other path:
// approve/reject/request-changes all call engine.decide(), which requires a
// pending Approval record — bypassing it throws inside the engine itself.
//
// Version semantics: a draft is version 1; approving version N appends the
// immutable snapshot ka-…-vN and marks older usage records superseded (the old
// usage rows are never rewritten — only their superseded markers are set).
import type { ISODate } from "@/domain/types";
import type { ApprovalEngine } from "@/agents/approvalEngine";
import type {
  KnowledgeArticleV2,
  KnowledgeConflict,
  KnowledgeDraftInput,
  KnowledgeReview,
} from "@/domain/knowledge";
import { knowledgeDraftInputSchema } from "@/domain/knowledge";
import { markUsageSuperseded } from "./evidenceEligibility";
import { appendVersionSnapshot, type KnowledgeClock, type KnowledgeStores } from "./stores";

/** runId namespace for knowledge approvals (no AgentRun record — the engine
 *  tolerates a missing run and simply skips run linkage). */
export const KNOWLEDGE_RUN_PREFIX = "knowledge-gov";

export function knowledgeRunId(articleId: string): string {
  return `${KNOWLEDGE_RUN_PREFIX}-${articleId}`;
}

/** States from which a draft may be edited. */
const EDITABLE_STATES = new Set(["טיוטה", "דורש עדכון", "נדחה"]);
/** States from which submit-for-review is allowed. */
const SUBMITTABLE_STATES = new Set(["טיוטה", "דורש עדכון", "נדחה", "שנוי במחלוקת"]);

export interface KnowledgeGovernanceDeps {
  stores: KnowledgeStores;
  engine: ApprovalEngine;
  clock?: KnowledgeClock;
}

export class KnowledgeGovernanceError extends Error {
  readonly code: string;
  constructor(code: string, detailHe: string) {
    super(`${code}: ${detailHe}`);
    this.name = "KnowledgeGovernanceError";
    this.code = code;
  }
}

export class KnowledgeGovernanceService {
  private readonly stores: KnowledgeStores;
  private readonly engine: ApprovalEngine;
  private readonly clock: KnowledgeClock;

  constructor(deps: KnowledgeGovernanceDeps) {
    this.stores = deps.stores;
    this.engine = deps.engine;
    this.clock = deps.clock ?? (() => new Date().toISOString());
  }

  // -------------------------------------------------------------------------
  // drafts
  // -------------------------------------------------------------------------

  async createDraft(
    input: KnowledgeDraftInput,
    authorId: string,
    id?: string,
  ): Promise<KnowledgeArticleV2> {
    const parsed = knowledgeDraftInputSchema.parse(input);
    const ts = this.clock();
    const existing = await this.stores.articles.list();
    const articleId = id ?? nextArticleId(existing.map((a) => a.id));
    const article: KnowledgeArticleV2 = {
      id: articleId,
      createdAt: ts,
      updatedAt: ts,
      ...parsed,
      sourceIds: [],
      authorId,
      reviewerId: null,
      approval: { state: "טיוטה", approvalId: null, decidedById: null, decidedAt: null, noteHe: "" },
      version: 1,
      effectiveDate: null,
      reviewDate: null,
      archived: false,
      demo: false,
    };
    return this.stores.articles.create(article);
  }

  /**
   * Edit a draft. Allowed only in editable states. If the current version
   * already has an immutable snapshot (the article was approved before), the
   * edit bumps the version — history is never rewritten.
   */
  async updateDraft(
    articleId: string,
    input: KnowledgeDraftInput,
    byId: string,
  ): Promise<KnowledgeArticleV2> {
    const article = await this.requireArticle(articleId);
    if (!EDITABLE_STATES.has(article.approval.state)) {
      throw new KnowledgeGovernanceError(
        "KNOWLEDGE_STATE_INVALID",
        `עריכה מותרת רק במצבי טיוטה/דורש עדכון/נדחה — המאמר במצב "${article.approval.state}"`,
      );
    }
    const parsed = knowledgeDraftInputSchema.parse(input);
    const snapshotOfCurrent = await this.stores.versions.get(`${articleId}-v${article.version}`);
    const nextVersion = snapshotOfCurrent ? article.version + 1 : article.version;
    const ts = this.clock();
    return this.stores.articles.update(articleId, {
      ...parsed,
      version: nextVersion,
      updatedAt: ts,
      approval: {
        ...article.approval,
        state: "טיוטה",
        noteHe: article.approval.noteHe,
      },
      authorId: article.authorId || byId,
    });
  }

  // -------------------------------------------------------------------------
  // review lifecycle — through the canonical ApprovalEngine ONLY
  // -------------------------------------------------------------------------

  /** טיוטה/דורש עדכון/נדחה/שנוי במחלוקת → ממתין לבדיקה + canonical Approval. */
  async submitForReview(articleId: string, requestedById: string): Promise<KnowledgeReview> {
    const article = await this.requireArticle(articleId);
    if (!SUBMITTABLE_STATES.has(article.approval.state)) {
      throw new KnowledgeGovernanceError(
        "KNOWLEDGE_STATE_INVALID",
        `הגשה לבדיקה אינה אפשרית ממצב "${article.approval.state}"`,
      );
    }
    const runId = knowledgeRunId(articleId);
    const approval = await this.engine.requestApproval({
      runId,
      subjectRef: `knowledge-article:${articleId}`,
      action: "permanent-knowledge-update",
      requestedById,
      // recommendation-only approval — the state change is applied by this
      // service AFTER the engine records the human decision (no machine payload)
      executionPayload: null,
      previewHe: `«${article.title}» (גרסה ${article.version}) — אישור עדכון קבוע במאגר הידע`,
    });
    const ts = this.clock();
    await this.stores.articles.update(articleId, {
      approval: { ...article.approval, state: "ממתין לבדיקה", approvalId: approval.id },
      updatedAt: ts,
    });
    const reviews = await this.stores.reviews.list();
    return this.stores.reviews.create({
      id: `kr-${reviews.length + 1}-${articleId}-v${article.version}`,
      createdAt: ts,
      updatedAt: ts,
      articleId,
      articleVersion: article.version,
      reviewerId: null,
      requestedById,
      requestedAt: ts,
      decidedAt: null,
      decision: null,
      noteHe: "",
      approvalId: approval.id,
    });
  }

  /**
   * Approve — engine.decide('approve') first (throws unless a pending
   * Approval exists), then: state מאושר, immutable version snapshot, effective
   * dates, superseded markers on older usage.
   */
  async approve(
    articleId: string,
    reviewerId: string,
    opts: { effectiveDate?: ISODate; reviewDate?: ISODate | null; noteHe?: string } = {},
  ): Promise<KnowledgeArticleV2> {
    const article = await this.requirePendingReviewArticle(articleId);
    const approvalId = article.approval.approvalId;
    if (!approvalId) {
      throw new KnowledgeGovernanceError(
        "KNOWLEDGE_APPROVAL_MISSING",
        "למאמר אין רשומת אישור קנונית — אין נתיב אישור עוקף מנוע",
      );
    }
    await this.engine.decide({
      runId: knowledgeRunId(articleId),
      approvalId,
      kind: "approve",
      decidedById: reviewerId,
      noteHe: opts.noteHe,
    });
    const ts = this.clock();
    const effectiveDate = opts.effectiveDate ?? ts.slice(0, 10);
    const updated = await this.stores.articles.update(articleId, {
      approval: {
        state: "מאושר",
        approvalId,
        decidedById: reviewerId,
        decidedAt: ts,
        noteHe: opts.noteHe ?? "",
      },
      reviewerId,
      effectiveDate,
      reviewDate: opts.reviewDate === undefined ? addDays(effectiveDate, 180) : opts.reviewDate,
      archived: false,
      updatedAt: ts,
    });
    await appendVersionSnapshot(
      this.stores,
      updated,
      opts.noteHe ?? `אושרה גרסה ${updated.version}`,
      reviewerId,
      this.clock,
    );
    await markUsageSuperseded(this.stores, articleId, updated.version, this.clock);
    await this.closeReview(articleId, reviewerId, "אושר", opts.noteHe ?? "");
    return updated;
  }

  /** Reject — engine.decide('reject') (a reason is REQUIRED by the engine). */
  async reject(articleId: string, reviewerId: string, noteHe: string): Promise<KnowledgeArticleV2> {
    return this.declineTo(articleId, reviewerId, noteHe, "נדחה", "נדחה");
  }

  /** Request changes — engine rejection whose note says what to fix; the
   *  article returns to the author as "דורש עדכון". */
  async requestChanges(
    articleId: string,
    reviewerId: string,
    noteHe: string,
  ): Promise<KnowledgeArticleV2> {
    return this.declineTo(articleId, reviewerId, noteHe, "דורש עדכון", "דורש שינויים");
  }

  private async declineTo(
    articleId: string,
    reviewerId: string,
    noteHe: string,
    nextState: "נדחה" | "דורש עדכון",
    reviewDecision: "נדחה" | "דורש שינויים",
  ): Promise<KnowledgeArticleV2> {
    if (!noteHe.trim()) {
      throw new KnowledgeGovernanceError(
        "KNOWLEDGE_NOTE_REQUIRED",
        "דחייה או בקשת שינויים מחייבת נימוק",
      );
    }
    const article = await this.requirePendingReviewArticle(articleId);
    const approvalId = article.approval.approvalId;
    if (!approvalId) {
      throw new KnowledgeGovernanceError(
        "KNOWLEDGE_APPROVAL_MISSING",
        "למאמר אין רשומת אישור קנונית — אין נתיב הכרעה עוקף מנוע",
      );
    }
    await this.engine.decide({
      runId: knowledgeRunId(articleId),
      approvalId,
      kind: "reject",
      decidedById: reviewerId,
      noteHe: reviewDecision === "דורש שינויים" ? `דורש שינויים: ${noteHe}` : noteHe,
    });
    const ts = this.clock();
    const updated = await this.stores.articles.update(articleId, {
      approval: {
        state: nextState,
        approvalId,
        decidedById: reviewerId,
        decidedAt: ts,
        noteHe,
      },
      reviewerId,
      updatedAt: ts,
    });
    await this.closeReview(articleId, reviewerId, reviewDecision, noteHe);
    return updated;
  }

  /**
   * Pull an approved/disputed article back for editing ("דורש עדכון").
   * This only REMOVES authority (fail-closed) — no approval is needed to stop
   * trusting knowledge; returning to "מאושר" requires the full engine cycle.
   */
  async markNeedsUpdate(
    articleId: string,
    byId: string,
    noteHe: string,
  ): Promise<KnowledgeArticleV2> {
    if (!noteHe.trim()) {
      throw new KnowledgeGovernanceError(
        "KNOWLEDGE_NOTE_REQUIRED",
        "סימון «דורש עדכון» מחייב נימוק",
      );
    }
    const article = await this.requireArticle(articleId);
    if (article.approval.state !== "מאושר" && article.approval.state !== "שנוי במחלוקת") {
      throw new KnowledgeGovernanceError(
        "KNOWLEDGE_STATE_INVALID",
        `סימון «דורש עדכון» אפשרי רק ממאושר/שנוי במחלוקת — המאמר במצב "${article.approval.state}"`,
      );
    }
    const ts = this.clock();
    return this.stores.articles.update(articleId, {
      approval: {
        ...article.approval,
        state: "דורש עדכון",
        decidedById: byId,
        decidedAt: ts,
        noteHe,
      },
      updatedAt: ts,
    });
  }

  // -------------------------------------------------------------------------
  // archive + dispute flow
  // -------------------------------------------------------------------------

  /** Human operator action — archived articles are never authoritative. */
  async archive(articleId: string, byId: string, noteHe = ""): Promise<KnowledgeArticleV2> {
    const article = await this.requireArticle(articleId);
    const ts = this.clock();
    return this.stores.articles.update(articleId, {
      approval: {
        ...article.approval,
        state: "בארכיון",
        decidedById: byId,
        decidedAt: ts,
        noteHe: noteHe || article.approval.noteHe,
      },
      archived: true,
      updatedAt: ts,
    });
  }

  /**
   * Contradiction flow (fail-closed): persists the conflict record and moves
   * BOTH articles out of "מאושר" into "שנוי במחלוקת" — they immediately stop
   * being authoritative. Returning to "מאושר" requires the full review cycle.
   */
  async flagDisputed(
    conflict: Omit<KnowledgeConflict, "id" | "createdAt" | "updatedAt">,
  ): Promise<KnowledgeConflict> {
    const ts = this.clock();
    const all = await this.stores.conflicts.list();
    const record = await this.stores.conflicts.create({
      id: `kc-${all.length + 1}-${conflict.articleIds.join("-")}`,
      createdAt: ts,
      updatedAt: ts,
      ...conflict,
    });
    for (const articleId of conflict.articleIds) {
      const article = await this.stores.articles.get(articleId);
      if (article && article.approval.state === "מאושר") {
        await this.stores.articles.update(articleId, {
          approval: { ...article.approval, state: "שנוי במחלוקת" },
          updatedAt: ts,
        });
      }
    }
    return record;
  }

  /** Close a conflict record. The articles STAY disputed until re-reviewed. */
  async resolveConflict(conflictId: string, noteHe: string): Promise<KnowledgeConflict> {
    if (!noteHe.trim()) {
      throw new KnowledgeGovernanceError("KNOWLEDGE_NOTE_REQUIRED", "סגירת סתירה מחייבת נימוק");
    }
    const conflict = await this.stores.conflicts.get(conflictId);
    if (!conflict) {
      throw new KnowledgeGovernanceError("KNOWLEDGE_NOT_FOUND", `סתירה "${conflictId}" לא נמצאה`);
    }
    const ts = this.clock();
    return this.stores.conflicts.update(conflictId, {
      status: "נפתר",
      resolvedAt: ts,
      resolutionNoteHe: noteHe,
      updatedAt: ts,
    });
  }

  // -------------------------------------------------------------------------
  // internals
  // -------------------------------------------------------------------------

  private async requireArticle(articleId: string): Promise<KnowledgeArticleV2> {
    const article = await this.stores.articles.get(articleId);
    if (!article) {
      throw new KnowledgeGovernanceError("KNOWLEDGE_NOT_FOUND", `מאמר "${articleId}" לא נמצא`);
    }
    return article;
  }

  private async requirePendingReviewArticle(articleId: string): Promise<KnowledgeArticleV2> {
    const article = await this.requireArticle(articleId);
    if (article.approval.state !== "ממתין לבדיקה") {
      throw new KnowledgeGovernanceError(
        "KNOWLEDGE_STATE_INVALID",
        `הכרעה אפשרית רק ממצב "ממתין לבדיקה" — המאמר במצב "${article.approval.state}"`,
      );
    }
    return article;
  }

  private async closeReview(
    articleId: string,
    reviewerId: string,
    decision: "אושר" | "נדחה" | "דורש שינויים",
    noteHe: string,
  ): Promise<void> {
    const reviews = (await this.stores.reviews.list())
      .filter((r) => r.articleId === articleId && r.decidedAt === null)
      .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));
    const open = reviews[reviews.length - 1];
    if (!open) return;
    const ts = this.clock();
    await this.stores.reviews.update(open.id, {
      reviewerId,
      decidedAt: ts,
      decision,
      noteHe,
      updatedAt: ts,
    });
  }
}

function nextArticleId(existingIds: readonly string[]): string {
  let max = 0;
  const re = /^ka-(\d+)$/;
  for (const id of existingIds) {
    const m = re.exec(id);
    if (m?.[1]) {
      const n = Number.parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return `ka-${max + 1}`;
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
