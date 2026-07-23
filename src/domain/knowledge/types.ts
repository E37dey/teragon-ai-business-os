// TERAGON AI BUSINESS OS — knowledge-governance domain (Wave 6, W6-C, Phase 6.9).
// KnowledgeArticleV2 + the surrounding governance records populate the Wave-6
// collections (knowledgeArticles/Sources/Versions/Usage/Conflicts/Questions/
// Reviews). Honesty contract: nothing here invents state — `isAuthoritative`
// is the ONE pure predicate used everywhere (page, Wiki agent, evidence gate).
import { z } from "zod";
import type { BaseEntity, ISODate } from "@/domain/types";

// ---------------------------------------------------------------------------
// vocabularies
// ---------------------------------------------------------------------------

/** The 9 canonical knowledge categories. */
export const KNOWLEDGE_CATEGORIES = [
  "מדפסות",
  "חומרי גלם",
  "Slicer",
  "תחזוקה",
  "פתרון תקלות",
  "קורסים",
  "מכירות",
  "שירות",
  "נהלים",
] as const;

export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number];

/** The 7 canonical article states. */
export const KNOWLEDGE_STATES = [
  "טיוטה",
  "ממתין לבדיקה",
  "מאושר",
  "דורש עדכון",
  "שנוי במחלוקת",
  "נדחה",
  "בארכיון",
] as const;

export type KnowledgeState = (typeof KNOWLEDGE_STATES)[number];

/** Where a knowledge source comes from. */
export const KNOWLEDGE_SOURCE_KINDS = [
  "קריאת שירות",
  "מסמך",
  "ניסיון מעשי",
  "הוראות יצרן",
  "אחר",
] as const;

export type KnowledgeSourceKind = (typeof KNOWLEDGE_SOURCE_KINDS)[number];

// ---------------------------------------------------------------------------
// records
// ---------------------------------------------------------------------------

/** Approval slice embedded in the article — mirrors the canonical Approval
 *  record created through the ONE ApprovalEngine ('permanent-knowledge-update'). */
export interface KnowledgeApprovalInfo {
  state: KnowledgeState;
  /** id of the canonical Approval record (approvals collection); null for drafts */
  approvalId: string | null;
  decidedById: string | null;
  decidedAt: ISODate | null;
  noteHe: string;
}

export interface KnowledgeArticleV2 extends BaseEntity {
  title: string;
  category: KnowledgeCategory;
  summary: string;
  /** markdown body — rendered ESCAPED (full sanitizer is W6-B's seam) */
  content: string;
  /** printerModel record ids this article applies to */
  supportedPrinterModels: string[];
  supportedMaterials: string[];
  troubleshootingCategories: string[];
  safetyNotes: string[];
  /** KnowledgeSource record ids */
  sourceIds: string[];
  authorId: string;
  reviewerId: string | null;
  approval: KnowledgeApprovalInfo;
  /** current version number; snapshots live in knowledgeVersions */
  version: number;
  /** the article is not effective before this date; null ⇒ never effective */
  effectiveDate: ISODate | null;
  /** next scheduled review; a passed reviewDate ⇒ EXPIRED (not authoritative) */
  reviewDate: ISODate | null;
  archived: boolean;
  /** labeled demo-seed records ("נתוני הדגמה") */
  demo: boolean;
}

export interface KnowledgeSource extends BaseEntity {
  articleId: string;
  kind: KnowledgeSourceKind;
  /** reference to the real underlying record, e.g. "ticket:t-9" */
  ref: string | null;
  titleHe: string;
  capturedAt: ISODate;
  ownerId: string | null;
}

/** Immutable version snapshot — append-only; never updated, never deleted. */
export interface KnowledgeVersion extends BaseEntity {
  articleId: string;
  version: number;
  snapshot: {
    title: string;
    category: KnowledgeCategory;
    summary: string;
    content: string;
    supportedPrinterModels: string[];
    supportedMaterials: string[];
    troubleshootingCategories: string[];
    safetyNotes: string[];
  };
  changeNoteHe: string;
  createdById: string;
}

/** One recorded use of an article as evidence inside a recommendation. */
export interface KnowledgeUsage extends BaseEntity {
  articleId: string;
  /** the article version that was actually used (never rewritten) */
  articleVersion: number;
  usedAt: ISODate;
  byAgent: string;
  /** reference to the recommendation/envelope the article backed */
  inRecommendation: string;
  /** set when a newer approved version supersedes the used one — the old usage
   *  record is NOT rewritten; only these marker fields are set */
  supersededByVersion: number | null;
  supersededAt: ISODate | null;
}

export type KnowledgeConflictStatus = "פתוח" | "נפתר";

export interface KnowledgeConflictClaim {
  articleId: string;
  articleVersion: number;
  claimHe: string;
}

export interface KnowledgeConflict extends BaseEntity {
  articleIds: string[];
  claims: KnowledgeConflictClaim[];
  /** the deterministic overlap key that triggered detection (e.g. parameter name) */
  overlapKeyHe: string;
  detectionMethodHe: string;
  status: KnowledgeConflictStatus;
  detectedAt: ISODate;
  resolvedAt: ISODate | null;
  resolutionNoteHe: string;
}

export type KnowledgeQuestionStatus = "פתוחה" | "נענתה";

export interface KnowledgeQuestion extends BaseEntity {
  questionHe: string;
  askedById: string;
  askedAt: ISODate;
  status: KnowledgeQuestionStatus;
  /** article that answered it (must resolve to a real record) */
  answeredByArticleId: string | null;
  answerHe: string | null;
}

export type KnowledgeReviewDecision = "אושר" | "נדחה" | "דורש שינויים";

export interface KnowledgeReview extends BaseEntity {
  articleId: string;
  articleVersion: number;
  reviewerId: string | null;
  requestedById: string;
  requestedAt: ISODate;
  decidedAt: ISODate | null;
  decision: KnowledgeReviewDecision | null;
  noteHe: string;
  /** the canonical Approval record backing this review */
  approvalId: string;
}

// ---------------------------------------------------------------------------
// THE authoritative predicate — used everywhere (page, Wiki agent, evidence)
// ---------------------------------------------------------------------------

/**
 * The ONE pure predicate for "may this article be trusted / retrieved / cited".
 * authoritative ⇔ state "מאושר" AND not archived AND effective now AND not
 * past its reviewDate (expired). Draft / pending / rejected / disputed /
 * archived / expired ⇒ NEVER authoritative.
 */
export function isAuthoritative(article: KnowledgeArticleV2, nowISO: ISODate): boolean {
  if (article.approval.state !== "מאושר") return false;
  if (article.archived) return false;
  if (article.effectiveDate === null) return false;
  const now = nowISO.slice(0, 10);
  if (article.effectiveDate.slice(0, 10) > now) return false;
  if (article.reviewDate !== null && article.reviewDate.slice(0, 10) < now) return false;
  return true;
}

/** Hebrew reason why an article is NOT authoritative (for honest UI/agent text). */
export function nonAuthoritativeReasonHe(
  article: KnowledgeArticleV2,
  nowISO: ISODate,
): string | null {
  if (isAuthoritative(article, nowISO)) return null;
  if (article.archived || article.approval.state === "בארכיון") return "בארכיון";
  if (article.approval.state !== "מאושר") return `מצב "${article.approval.state}"`;
  if (article.effectiveDate === null) return "ללא תאריך תחולה";
  const now = nowISO.slice(0, 10);
  if (article.effectiveDate.slice(0, 10) > now) return "טרם נכנס לתוקף";
  return "פג תוקף הבדיקה (reviewDate עבר)";
}

// ---------------------------------------------------------------------------
// zod schemas — pinned to the domain types (cannot drift)
// ---------------------------------------------------------------------------

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})?)?$/u, {
    message: "תאריך חייב להיות בפורמט ISO (YYYY-MM-DD)",
  });

const baseEntity = {
  id: z.string().min(1),
  createdAt: isoDate,
  updatedAt: isoDate,
};

export const knowledgeCategorySchema = z.enum(KNOWLEDGE_CATEGORIES);
export const knowledgeStateSchema = z.enum(KNOWLEDGE_STATES);
export const knowledgeSourceKindSchema = z.enum(KNOWLEDGE_SOURCE_KINDS);

export const knowledgeApprovalInfoSchema = z.object({
  state: knowledgeStateSchema,
  approvalId: z.string().min(1).nullable(),
  decidedById: z.string().min(1).nullable(),
  decidedAt: isoDate.nullable(),
  noteHe: z.string(),
}) satisfies z.ZodType<KnowledgeApprovalInfo>;

export const knowledgeArticleV2Schema = z.object({
  ...baseEntity,
  title: z.string().min(3, { message: "כותרת המאמר קצרה מדי (לפחות 3 תווים)" }),
  category: knowledgeCategorySchema,
  summary: z.string().min(1, { message: "תקציר הוא שדה חובה" }),
  content: z.string().min(1, { message: "תוכן המאמר הוא שדה חובה" }),
  supportedPrinterModels: z.array(z.string().min(1)),
  supportedMaterials: z.array(z.string().min(1)),
  troubleshootingCategories: z.array(z.string().min(1)),
  safetyNotes: z.array(z.string().min(1)),
  sourceIds: z.array(z.string().min(1)),
  authorId: z.string().min(1, { message: "מאמר חייב מחבר" }),
  reviewerId: z.string().min(1).nullable(),
  approval: knowledgeApprovalInfoSchema,
  version: z.number().int().min(1),
  effectiveDate: isoDate.nullable(),
  reviewDate: isoDate.nullable(),
  archived: z.boolean(),
  demo: z.boolean(),
}) satisfies z.ZodType<KnowledgeArticleV2>;

/** Input schema for the create/edit-draft form (page). */
export const knowledgeDraftInputSchema = z.object({
  title: z.string().min(3, { message: "כותרת המאמר קצרה מדי (לפחות 3 תווים)" }),
  category: knowledgeCategorySchema,
  summary: z.string().min(1, { message: "תקציר הוא שדה חובה" }),
  content: z.string().min(1, { message: "תוכן המאמר הוא שדה חובה" }),
  supportedPrinterModels: z.array(z.string().min(1)),
  supportedMaterials: z.array(z.string().min(1)),
  troubleshootingCategories: z.array(z.string().min(1)),
  safetyNotes: z.array(z.string().min(1)),
});

export type KnowledgeDraftInput = z.infer<typeof knowledgeDraftInputSchema>;

export const knowledgeSourceSchema = z.object({
  ...baseEntity,
  articleId: z.string().min(1),
  kind: knowledgeSourceKindSchema,
  ref: z.string().min(1).nullable(),
  titleHe: z.string().min(1),
  capturedAt: isoDate,
  ownerId: z.string().min(1).nullable(),
}) satisfies z.ZodType<KnowledgeSource>;

export const knowledgeVersionSchema = z.object({
  ...baseEntity,
  articleId: z.string().min(1),
  version: z.number().int().min(1),
  snapshot: z.object({
    title: z.string().min(1),
    category: knowledgeCategorySchema,
    summary: z.string(),
    content: z.string(),
    supportedPrinterModels: z.array(z.string().min(1)),
    supportedMaterials: z.array(z.string().min(1)),
    troubleshootingCategories: z.array(z.string().min(1)),
    safetyNotes: z.array(z.string().min(1)),
  }),
  changeNoteHe: z.string(),
  createdById: z.string().min(1),
}) satisfies z.ZodType<KnowledgeVersion>;

export const knowledgeUsageSchema = z.object({
  ...baseEntity,
  articleId: z.string().min(1),
  articleVersion: z.number().int().min(1),
  usedAt: isoDate,
  byAgent: z.string().min(1),
  inRecommendation: z.string().min(1),
  supersededByVersion: z.number().int().min(1).nullable(),
  supersededAt: isoDate.nullable(),
}) satisfies z.ZodType<KnowledgeUsage>;

export const knowledgeConflictSchema = z.object({
  ...baseEntity,
  articleIds: z.array(z.string().min(1)).min(2),
  claims: z.array(
    z.object({
      articleId: z.string().min(1),
      articleVersion: z.number().int().min(1),
      claimHe: z.string().min(1),
    }),
  ),
  overlapKeyHe: z.string().min(1),
  detectionMethodHe: z.string().min(1),
  status: z.enum(["פתוח", "נפתר"]),
  detectedAt: isoDate,
  resolvedAt: isoDate.nullable(),
  resolutionNoteHe: z.string(),
}) satisfies z.ZodType<KnowledgeConflict>;

export const knowledgeQuestionSchema = z.object({
  ...baseEntity,
  questionHe: z.string().min(3, { message: "שאלה קצרה מדי" }),
  askedById: z.string().min(1),
  askedAt: isoDate,
  status: z.enum(["פתוחה", "נענתה"]),
  answeredByArticleId: z.string().min(1).nullable(),
  answerHe: z.string().min(1).nullable(),
}) satisfies z.ZodType<KnowledgeQuestion>;

export const knowledgeReviewSchema = z.object({
  ...baseEntity,
  articleId: z.string().min(1),
  articleVersion: z.number().int().min(1),
  reviewerId: z.string().min(1).nullable(),
  requestedById: z.string().min(1),
  requestedAt: isoDate,
  decidedAt: isoDate.nullable(),
  decision: z.enum(["אושר", "נדחה", "דורש שינויים"]).nullable(),
  noteHe: z.string(),
  approvalId: z.string().min(1),
}) satisfies z.ZodType<KnowledgeReview>;
