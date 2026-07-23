// TERAGON AI BUSINESS OS — zod schemas for memory domain v2 (Wave 6, W6-A).
// Each schema is pinned to its type via `satisfies z.ZodType<T>` so the two
// files can never drift. The confidence schema structurally REJECTS a bare
// number — the honesty contract is enforced at parse time, not by convention.
import { z } from "zod";
import type { ConfidenceInfo } from "@/domain/ai/envelope";
import type {
  MemoryCheckResult,
  MemoryConflict,
  MemoryConflictClaim,
  MemoryEntityLink,
  MemoryExportJob,
  MemoryImportJob,
  MemoryLink,
  MemoryProposal,
  MemoryProposalDraft,
  MemoryRecordV2,
  MemorySource,
  MemoryUsage,
  MemoryVersion,
} from "./types";

// ---------- shared ----------

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

export const memoryLayerSchema = z.enum(["customer", "business", "technical", "agent_learning"]);

export const memoryVerificationStateSchema = z.enum([
  "לא נבדק",
  "בבדיקה",
  "מאומת",
  "שנוי במחלוקת",
  "נדחה",
  "פג תוקף",
]);

export const memorySensitivitySchema = z.enum(["ציבורי", "פנימי", "רגיש", "מוגבל"]);

export const memoryApprovalStateSchema = z.enum(["טיוטה", "ממתין לאישור", "מאושר", "נדחה"]);

export const memoryRetentionPolicySchema = z.enum(["קבוע", "לסקירה תקופתית", "פג בתאריך יעד"]);

export const memoryRecordOriginSchema = z.enum(["proposal", "legacy-import", "restore"]);

/**
 * ConfidenceInfo — structurally an OBJECT: a bare number (the classic fake
 * "confidence: 87") fails parsing. value, when present, is 0–100.
 */
export const memoryConfidenceSchema = z.object({
  value: z.number().min(0).max(100).optional(),
  label: z.string().min(1),
  method: z.string().min(1),
  contributingSignals: z.array(z.string()),
  status: z.enum(["measured", "estimated", "unavailable"]),
}) satisfies z.ZodType<ConfidenceInfo>;

export const memoryEntityLinkSchema = z.object({
  collection: z.string().min(1),
  entityId: z.string().min(1),
  label: z.string().min(1),
}) satisfies z.ZodType<MemoryEntityLink>;

// ---------- record ----------

export const memoryRecordV2Schema = z.object({
  ...baseEntity,
  organizationId: z.string().min(1),
  title: z.string().min(1, { message: "כותרת היא שדה חובה" }),
  slug: z.string().min(1, { message: "slug הוא שדה חובה" }),
  bodyMarkdown: z.string(),
  plainText: z.string(),
  memoryLayer: memoryLayerSchema,
  folder: z.string(),
  entityLinks: z.array(memoryEntityLinkSchema),
  tags: z.array(z.string()),
  wikiLinks: z.array(z.string()),
  backlinks: z.array(z.string()),
  sourceIds: z.array(z.string()),
  ownerId: z.string().min(1),
  ownerName: z.string().min(1),
  sensitivity: memorySensitivitySchema,
  verificationState: memoryVerificationStateSchema,
  approvalState: memoryApprovalStateSchema,
  confidence: memoryConfidenceSchema,
  approvedAt: isoDate.nullable(),
  approvedBy: z.string().nullable(),
  version: z.number().int().min(1),
  supersedesId: z.string().nullable(),
  retentionPolicy: memoryRetentionPolicySchema,
  reviewDate: isoDate.nullable(),
  archivedAt: isoDate.nullable(),
  origin: memoryRecordOriginSchema,
}) satisfies z.ZodType<MemoryRecordV2>;

// ---------- proposal ----------

export const memoryCheckResultSchema = z.object({
  outcome: z.enum(["עבר", "נכשל", "אזהרה"]),
  detailHe: z.string(),
  relatedIds: z.array(z.string()),
}) satisfies z.ZodType<MemoryCheckResult>;

export const memoryProposalDraftSchema = z.object({
  title: z.string().min(1, { message: "כותרת היא שדה חובה" }),
  slug: z.string().min(1),
  bodyMarkdown: z.string().min(1, { message: "תוכן ההצעה הוא שדה חובה" }),
  memoryLayer: memoryLayerSchema,
  folder: z.string(),
  entityLinks: z.array(memoryEntityLinkSchema),
  tags: z.array(z.string()),
  sourceIds: z.array(z.string()),
  sensitivity: memorySensitivitySchema,
  retentionPolicy: memoryRetentionPolicySchema,
  reviewDate: isoDate.nullable(),
}) satisfies z.ZodType<MemoryProposalDraft>;

export const memoryProposalStatusSchema = z.enum([
  "טיוטה",
  "ממתין לאישור",
  "מאושר",
  "נדחה",
  "בוטל",
  "מוזג",
]);

export const memoryProposalSchema = z.object({
  ...baseEntity,
  organizationId: z.string().min(1),
  observationHe: z.string().min(1),
  proposedById: z.string().min(1),
  proposedByName: z.string().min(1),
  draft: memoryProposalDraftSchema,
  status: memoryProposalStatusSchema,
  checks: z.object({
    sourceValidation: memoryCheckResultSchema,
    duplicateCheck: memoryCheckResultSchema,
    contradictionCheck: memoryCheckResultSchema,
    sensitivityCheck: memoryCheckResultSchema,
  }),
  approvalId: z.string().nullable(),
  runId: z.string().min(1),
  resultRecordId: z.string().nullable(),
  decidedById: z.string().nullable(),
  decidedByName: z.string().nullable(),
  decidedAt: isoDate.nullable(),
  mergeTargetId: z.string().nullable(),
  moreSourcesRequestHe: z.string().nullable(),
}) satisfies z.ZodType<MemoryProposal>;

// ---------- source ----------

export const memorySourceSchema = z.object({
  ...baseEntity,
  kind: z.enum(["entity", "document", "conversation", "observation", "external"]),
  refId: z.string().min(1),
  titleHe: z.string().min(1),
  excerpt: z.string().min(1, { message: "מקור חייב לכלול ציטוט תומך" }),
  capturedAt: isoDate,
  verified: z.boolean(),
}) satisfies z.ZodType<MemorySource>;

// ---------- link ----------

export const memoryLinkResolutionSchema = z.enum([
  "resolved",
  "unresolved",
  "ambiguous",
  "broken",
]);

export const memoryLinkSchema = z.object({
  ...baseEntity,
  fromRecordId: z.string().min(1),
  targetText: z.string().min(1),
  resolution: memoryLinkResolutionSchema,
  resolvedRecordId: z.string().nullable(),
  candidateIds: z.array(z.string()),
}) satisfies z.ZodType<MemoryLink>;

// ---------- version ----------

export const memoryVersionSchema = z.object({
  ...baseEntity,
  recordId: z.string().min(1),
  versionNumber: z.number().int().min(1),
  previousVersionId: z.string().nullable(),
  snapshot: memoryRecordV2Schema,
  changedFields: z.array(z.string()),
  authorId: z.string().min(1),
  authorName: z.string().min(1),
  approverId: z.string().nullable(),
  approverName: z.string().nullable(),
  reasonHe: z.string().min(1),
  timestamp: isoDate,
  rollbackEligible: z.boolean(),
}) satisfies z.ZodType<MemoryVersion>;

// ---------- usage ----------

export const memoryUsageSchema = z.object({
  ...baseEntity,
  envelopeId: z.string().min(1),
  operation: z.string().min(1),
  recordId: z.string().min(1),
  versionId: z.string().min(1),
  versionNumber: z.number().int().min(1),
  usedAt: isoDate,
}) satisfies z.ZodType<MemoryUsage>;

// ---------- conflict ----------

export const memoryConflictClaimSchema = z.object({
  holderId: z.string().min(1),
  holderKind: z.enum(["proposal", "record"]),
  claimKey: z.string().min(1),
  claimValue: z.string(),
}) satisfies z.ZodType<MemoryConflictClaim>;

export const memoryConflictSchema = z.object({
  ...baseEntity,
  proposalId: z.string().min(1),
  recordId: z.string().min(1),
  claimA: memoryConflictClaimSchema,
  claimB: memoryConflictClaimSchema,
  status: z.enum(["פתוח", "נפתר"]),
  resolutionHe: z.string().nullable(),
  detectedAt: isoDate,
}) satisfies z.ZodType<MemoryConflict>;

// ---------- import/export jobs ----------

const jobStatusSchema = z.enum(["ממתין", "רץ", "הושלם", "נכשל"]);

export const memoryImportJobSchema = z.object({
  ...baseEntity,
  format: z.enum(["markdown", "zip"]),
  status: jobStatusSchema,
  requestedById: z.string().min(1),
  startedAt: isoDate.nullable(),
  endedAt: isoDate.nullable(),
  importedCount: z.number().int().min(0),
  detailHe: z.string(),
}) satisfies z.ZodType<MemoryImportJob>;

export const memoryExportJobSchema = z.object({
  ...baseEntity,
  format: z.enum(["markdown", "zip"]),
  status: jobStatusSchema,
  requestedById: z.string().min(1),
  startedAt: isoDate.nullable(),
  endedAt: isoDate.nullable(),
  exportedCount: z.number().int().min(0),
  detailHe: z.string(),
}) satisfies z.ZodType<MemoryExportJob>;
