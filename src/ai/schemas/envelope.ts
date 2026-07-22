// Zod schemas for the canonical AI response envelope V2 (Wave 5, W5-A).
// Pinned to the domain types via `satisfies z.ZodType<T>` so the schema and the
// type can never drift apart (same discipline as src/domain/schemas.ts).
import { z } from "zod";
import type {
  AIEnvelopeStatus,
  AIResponseEnvelopeV2,
  ApprovalInfo,
  ConfidenceInfo,
  EvidenceItem,
  UsageInfo,
} from "@/domain/ai/envelope";

/** "2026-07-23" or full ISO datetime (same shape as domain isoDate). */
export const aiIsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})?)?$/u, {
    message: "תאריך חייב להיות בפורמט ISO (YYYY-MM-DD)",
  });

export const evidenceSourceTypeSchema = z.enum(["entity", "document", "computation", "external"]);

export const evidenceItemSchema = z.object({
  sourceType: evidenceSourceTypeSchema,
  sourceId: z.string().min(1, "ראיה חייבת לצטט רשומה אמיתית (sourceId)"),
  title: z.string().min(1),
  relevantExcerpt: z.string(),
  relevanceMethod: z.string().min(1),
  verified: z.boolean(),
  lastUpdated: aiIsoDate,
}) satisfies z.ZodType<EvidenceItem>;

export const confidenceStatusSchema = z.enum(["measured", "estimated", "unavailable"]);

export const confidenceInfoSchema = z
  .object({
    /** percent 0–100 when honestly derived; ABSENT is never rendered as 0 */
    value: z.number().min(0).max(100).optional(),
    label: z.string().min(1),
    method: z.string().min(1),
    contributingSignals: z.array(z.string()),
    status: confidenceStatusSchema,
  })
  .refine((c) => !(c.status === "unavailable" && c.value !== undefined), {
    message: 'confidence.status="unavailable" אינו יכול לשאת ערך מספרי',
  })
  .refine((c) => !(c.status === "measured" && c.value === undefined), {
    message: 'confidence.status="measured" מחייב ערך מספרי אמיתי',
  }) satisfies z.ZodType<ConfidenceInfo>;

export const approvalStateSchema = z.enum([
  "not_required",
  "pending",
  "approved",
  "edited",
  "rejected",
  "expired",
  "cancelled",
]);

export const approvalInfoSchema = z
  .object({
    required: z.boolean(),
    state: approvalStateSchema,
    requestedAt: aiIsoDate.optional(),
    approvedAt: aiIsoDate.optional(),
    approverId: z.string().optional(),
    approverName: z.string().optional(),
    userEdits: z.string().optional(),
    rejectionReason: z.string().optional(),
  })
  .refine((a) => !(a.required && a.state === "not_required"), {
    message: 'approval.required=true אינו מתיישב עם state="not_required"',
  })
  .refine((a) => !(a.state === "rejected" && !a.rejectionReason), {
    message: "דחייה מחייבת סיבת דחייה (rejectionReason)",
  }) satisfies z.ZodType<ApprovalInfo>;

/** absent ≠ zero: every numeric field optional; measured says whether reported. */
export const usageInfoSchema = z.object({
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  totalTokens: z.number().int().nonnegative().optional(),
  estimatedCost: z.number().nonnegative().optional(),
  currency: z.string().optional(),
  measured: z.boolean(),
}) satisfies z.ZodType<UsageInfo>;

export const aiEnvelopeStatusSchema = z.enum([
  "הצלחה",
  "נכשל",
  "חלקי",
  "בוטל",
]) satisfies z.ZodType<AIEnvelopeStatus>;

export const aiResponseEnvelopeV2Schema = z.object({
  id: z.string().min(1),
  requestId: z.string().min(1),
  correlationId: z.string().min(1),
  provider: z.string().min(1),
  model: z.string().nullable(),
  createdAt: aiIsoDate,
  operation: z.string().min(1),
  recommendation: z.string(),
  reason: z.string().min(1, "כל פלט AI מחייב הנמקה (reason)"),
  evidence: z.array(evidenceItemSchema),
  confidence: confidenceInfoSchema,
  nextStep: z.string(),
  limitations: z.array(z.string()),
  approval: approvalInfoSchema,
  usage: usageInfoSchema,
  status: aiEnvelopeStatusSchema,
}) satisfies z.ZodType<AIResponseEnvelopeV2>;

export type AIResponseEnvelopeV2Parsed = z.infer<typeof aiResponseEnvelopeV2Schema>;
