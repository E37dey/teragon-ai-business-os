// TERAGON AI BUSINESS OS — W7-E (Phase 7.18): zod schemas for the submission
// model. Mirrors ./types.ts exactly; Hebrew messages; collection keys are
// validated against the canonical registry.
import { z } from "zod";
import { isCollectionKey } from "@/repositories/collections";
import { REGISTRY_DELIVERABLE_KEYS } from "./contentRegistry";
import { DELIVERABLE_STATES, READINESS_STATES } from "./types";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z)?$/, "תאריך ISO לא תקין");

const baseEntity = {
  id: z.string().min(1, "מזהה חסר"),
  createdAt: isoDate,
  updatedAt: isoDate,
};

const nonEmpty = (msg: string) => z.string().min(1, msg);

export const deliverableKeySchema = z.enum(
  REGISTRY_DELIVERABLE_KEYS as unknown as [string, ...string[]],
);

export const deliverableStateSchema = z.enum(
  DELIVERABLE_STATES as unknown as [string, ...string[]],
);

export const readinessStateSchema = z.enum(READINESS_STATES as unknown as [string, ...string[]]);

export const submissionEvidenceRefSchema = z.object({
  collection: z.string().refine(isCollectionKey, "אוסף לא מוכר"),
  recordId: nonEmpty("חסר מזהה רשומה"),
  route: nonEmpty("חסר נתיב"),
});

export const submissionPackageSchema = z.object({
  ...baseEntity,
  name: nonEmpty("חסר שם חבילה"),
  version: z.number().int().positive(),
  ownerId: nonEmpty("חבילה חייבת בעלים בשם"),
  readiness: readinessStateSchema,
  deliverableKeys: z.array(deliverableKeySchema).length(12, "נדרשים בדיוק 12 תוצרים"),
  noteHe: z.string(),
});

export const submissionDeliverableRecordSchema = z.object({
  ...baseEntity,
  key: deliverableKeySchema,
  title: nonEmpty("חסרה כותרת"),
  state: deliverableStateSchema,
  ownerId: z.string().nullable(),
  route: nonEmpty("חסר נתיב"),
  printable: z.boolean(),
  approvalId: z.string().nullable(),
  stateReasonsHe: z.array(z.string()),
  lastEvaluatedAt: isoDate,
});

export const submissionEvidenceRecordSchema = z.object({
  ...baseEntity,
  deliverableKey: deliverableKeySchema,
  label: nonEmpty("חסרה תווית ראיה"),
  ref: submissionEvidenceRefSchema.nullable(),
  resolved: z.boolean(),
  statusHe: nonEmpty("חסר סטטוס"),
});

export const submissionValidationRecordSchema = z.object({
  ...baseEntity,
  deliverableKey: deliverableKeySchema,
  criterion: nonEmpty("חסר קריטריון"),
  state: z.enum(["pass", "warning", "fail", "not_applicable"]),
  reasonHe: nonEmpty("תוצאה חייבת נימוק"),
  evidenceHe: z.array(z.string()),
  missingFields: z.array(z.string()),
  affectedRecord: z.string().nullable(),
  recommendedFixHe: z.string().nullable(),
  checkedAt: isoDate,
  validatorVersion: nonEmpty("חסרה גרסת ולידטור"),
});

export const submissionBlockerSchema = z.object({
  ...baseEntity,
  deliverableKey: deliverableKeySchema.nullable(),
  severity: z.enum(["חוסם", "אזהרה"]),
  titleHe: nonEmpty("חסרה כותרת"),
  detailHe: nonEmpty("חוסם חייב פירוט"),
  targetRoute: z.string().nullable(),
  resolvedAt: isoDate.nullable(),
});

export const submissionSnapshotSchema = z.object({
  ...baseEntity,
  takenAt: isoDate,
  takenById: nonEmpty("צילום מצב חייב מבצע בשם"),
  readiness: readinessStateSchema,
  deliverableStates: z.record(z.string(), deliverableStateSchema),
  qualitySummary: z.object({
    pass: z.number().int().nonnegative(),
    warning: z.number().int().nonnegative(),
    fail: z.number().int().nonnegative(),
    notApplicable: z.number().int().nonnegative(),
  }),
  blockerCount: z.number().int().nonnegative(),
  noteHe: z.string(),
});
