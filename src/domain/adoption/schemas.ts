// TERAGON AI BUSINESS OS — zod schemas for the adoption domain (W7-A, 7.1).
// Validation mirrors src/domain/adoption/types.ts exactly; Hebrew messages.
import { z } from "zod";
import { isCollectionKey } from "@/repositories/collections";
import { ADOPTION_STAGE_NAMES, ROLLOUT_WAVE_NAMES } from "./types";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z)?$/, "תאריך ISO לא תקין");

const baseEntity = {
  id: z.string().min(1, "מזהה חסר"),
  createdAt: isoDate,
  updatedAt: isoDate,
};

const nonEmpty = (msg: string) => z.string().min(1, msg);

export const adoptionStageStatusSchema = z.enum(["לא התחיל", "בתהליך", "הושלם"]);
export const goNoGoStateSchema = z.enum(["Go", "No-Go", "ממתין"]);
export const programmeApprovalStateSchema = z.enum(["טיוטה", "ממתין לאישור", "מאושר"]);
export const baselineStateSchema = z.enum(["לא הוגדר קו בסיס", "קו בסיס חלקי", "קו בסיס מתועד"]);
export const riskLevelSchema = z.enum(["נמוכה", "בינונית", "גבוהה"]);

export const implementationOwnerSchema = z.object({
  userId: nonEmpty("חסר מזהה משתמש"),
  name: nonEmpty("בעלים חייב שם — אין בעלות אנונימית"),
  role: z.enum(["ספונסר", "בעלים עסקי", "מטמיע", "אחראי שלב"]),
  scopeRef: nonEmpty("חסר תחום אחריות"),
});

export const baselineMetricSchema = z.object({
  metricKey: nonEmpty("חסר מפתח מדד"),
  nameHe: nonEmpty("חסר שם מדד"),
  unit: z.string(),
  value: z.number().finite().nullable(),
  capturedAt: isoDate.nullable(),
  methodHe: nonEmpty("חסרה שיטת מדידה"),
});

export const evidenceRefSchema = z.object({
  collection: z
    .string()
    .refine(isCollectionKey, { message: "collection לא קיים ברישום הקנוני" }),
  recordId: nonEmpty("חסר מזהה רשומה"),
  route: z.string().startsWith("/", "route חייב להתחיל ב-/"),
});

export const adoptionStageSchema = z.object({
  id: z.string().regex(/^as-[1-6]$/, "מזהה שלב חייב להיות as-1..as-6"),
  order: z.number().int().min(1).max(6),
  name: z.enum(ADOPTION_STAGE_NAMES),
  objective: nonEmpty("חסרה מטרת שלב"),
  ownerId: nonEmpty("לא הוקצה אחראי"),
  startPlanned: isoDate,
  targetDate: isoDate,
  status: adoptionStageStatusSchema,
  deliverables: z.array(nonEmpty("תוצר ריק")),
  evidenceRequirements: z.array(nonEmpty("דרישת ראיה ריקה")),
  nextAction: nonEmpty("חסרה פעולה הבאה"),
  nextGate: nonEmpty("חסר שער יציאה"),
  seedStageId: z.string().regex(/^is-[1-6]$/, "גשר seed חייב להצביע על is-1..is-6"),
});

export const implementationProgrammeSchema = z
  .object({
    ...baseEntity,
    name: nonEmpty("חסר שם תכנית"),
    businessProblem: nonEmpty("חסרה בעיה עסקית"),
    businessOutcome: nonEmpty("חסרה תוצאה עסקית"),
    sponsorId: nonEmpty("חסר ספונסר"),
    businessOwnerId: nonEmpty("חסר בעלים עסקי"),
    implementerId: nonEmpty("חסר מטמיע"),
    owners: z.array(implementationOwnerSchema).min(1, "נדרש לפחות בעלים אחד בשם"),
    startDate: isoDate,
    targetEndDate: isoDate,
    baselineMetrics: z.array(baselineMetricSchema),
    baselineState: baselineStateSchema,
    approvalState: programmeApprovalStateSchema,
    approvalId: z.string().nullable(),
    version: z.number().int().min(1),
    currentStageId: z.string().regex(/^as-[1-6]$/),
    stages: z
      .array(adoptionStageSchema)
      .length(6, "תכנית הטמעה חייבת בדיוק 6 שלבים"),
    demo: z.boolean(),
  })
  .superRefine((p, ctx) => {
    // the 6 stages must be exactly the mandated names, in order
    p.stages.forEach((s, i) => {
      if (s.name !== ADOPTION_STAGE_NAMES[i]) {
        ctx.addIssue({
          code: "custom",
          path: ["stages", i, "name"],
          message: `שלב ${i + 1} חייב להיות "${ADOPTION_STAGE_NAMES[i]}"`,
        });
      }
      if (s.order !== i + 1) {
        ctx.addIssue({
          code: "custom",
          path: ["stages", i, "order"],
          message: "סדר שלבים שגוי",
        });
      }
    });
    if (!p.stages.some((s) => s.id === p.currentStageId)) {
      ctx.addIssue({
        code: "custom",
        path: ["currentStageId"],
        message: "currentStageId חייב להצביע על שלב קיים",
      });
    }
    // honest baselineState: must agree with the metrics
    const measured = p.baselineMetrics.filter((m) => m.value !== null).length;
    const expected =
      p.baselineMetrics.length === 0 || measured === 0
        ? "לא הוגדר קו בסיס"
        : measured === p.baselineMetrics.length
          ? "קו בסיס מתועד"
          : "קו בסיס חלקי";
    if (p.baselineState !== expected) {
      ctx.addIssue({
        code: "custom",
        path: ["baselineState"],
        message: `baselineState חייב לשקף את המדדים בפועל ("${expected}")`,
      });
    }
    // an approved programme must carry a real approval reference
    if (p.approvalState === "מאושר" && p.approvalId === null) {
      ctx.addIssue({
        code: "custom",
        path: ["approvalId"],
        message: 'תכנית "מאושר" חייבת מזהה אישור קנוני — אין אישור מומצא',
      });
    }
  });

export const implementationMilestoneSchema = z.object({
  ...baseEntity,
  programmeId: nonEmpty("חסר מזהה תכנית"),
  stageId: z.string().regex(/^as-[1-6]$/),
  title: nonEmpty("חסרה כותרת"),
  dueDate: isoDate,
  ownerId: nonEmpty("לא הוקצה אחראי"),
  status: z.enum(["מתוכננת", "בתהליך", "הושלמה", "בוטלה"]),
  completedAt: isoDate.nullable(),
});

export const implementationRiskSchema = z.object({
  ...baseEntity,
  programmeId: nonEmpty("חסר מזהה תכנית"),
  stageId: z.string().regex(/^as-[1-6]$/).nullable(),
  title: nonEmpty("חסרה כותרת סיכון"),
  description: nonEmpty("חסר תיאור"),
  probability: riskLevelSchema,
  impact: riskLevelSchema,
  mitigation: nonEmpty("חסר מיתון"),
  ownerId: nonEmpty("לא הוקצה אחראי"),
  status: z.enum(["פתוח", "בטיפול", "סגור"]),
  reviewDate: isoDate,
});

export const implementationEvidenceSchema = z
  .object({
    ...baseEntity,
    programmeId: nonEmpty("חסר מזהה תכנית"),
    stageId: z.string().regex(/^as-[1-6]$/),
    requirementHe: nonEmpty("חסרה דרישת ראיה"),
    ref: evidenceRefSchema.nullable(),
    capturedById: z.string().nullable(),
    capturedAt: isoDate.nullable(),
    noteHe: z.string(),
  })
  .superRefine((e, ctx) => {
    if (e.ref !== null && e.capturedById === null) {
      ctx.addIssue({
        code: "custom",
        path: ["capturedById"],
        message: "ראיה מקושרת חייבת אדם בשם שקישר אותה",
      });
    }
  });

export const implementationDecisionSchema = z
  .object({
    ...baseEntity,
    programmeId: nonEmpty("חסר מזהה תכנית"),
    stageId: z.string().regex(/^as-[1-6]$/),
    gateName: nonEmpty("חסר שם שער"),
    plannedDate: isoDate,
    decision: z.enum(["Go", "No-Go"]).nullable(),
    decidedById: z.string().nullable(),
    decidedAt: isoDate.nullable(),
    rationaleHe: z.string(),
    evidenceIds: z.array(z.string().min(1)),
  })
  .superRefine((d, ctx) => {
    // a decided gate must have a named decider + timestamp (audit honesty)
    if (d.decision !== null && (d.decidedById === null || d.decidedAt === null)) {
      ctx.addIssue({
        code: "custom",
        path: ["decidedById"],
        message: "החלטת Go/No-Go חייבת מחליט בשם ותאריך החלטה",
      });
    }
    if (d.decision === null && (d.decidedById !== null || d.decidedAt !== null)) {
      ctx.addIssue({
        code: "custom",
        path: ["decision"],
        message: "אין מחליט/תאריך ללא החלטה בפועל",
      });
    }
  });

export const rolloutWaveSchema = z.object({
  ...baseEntity,
  programmeId: nonEmpty("חסר מזהה תכנית"),
  order: z.number().int().min(1).max(5),
  name: z.enum(ROLLOUT_WAVE_NAMES),
  audienceHe: nonEmpty("חסר קהל גל"),
  plannedStart: isoDate.nullable(),
  status: adoptionStageStatusSchema,
  entryCriteria: z.array(nonEmpty("קריטריון כניסה ריק")),
});

export const pilotSuccessCriterionSchema = z.object({
  metricKey: nonEmpty("חסר מפתח מדד"),
  nameHe: nonEmpty("חסר שם מדד"),
  targetHe: nonEmpty("חסר יעד"),
});

export const pilotDefinitionSchema = z.object({
  ...baseEntity,
  programmeId: nonEmpty("חסר מזהה תכנית"),
  scopeHe: nonEmpty("חסרה הגדרת היקף"),
  startDate: isoDate.nullable(),
  decisionDate: isoDate,
  successCriteria: z.array(pilotSuccessCriterionSchema).min(1, "פיילוט ללא קריטריון הצלחה"),
  status: z.enum(["מוגדר", "רץ", "הסתיים"]),
});

/** Measured-only: every field is required — an absent record ⇒ "טרם נמדד". */
export const pilotResultSchema = z.object({
  ...baseEntity,
  pilotId: nonEmpty("חסר מזהה פיילוט"),
  metricKey: nonEmpty("חסר מפתח מדד"),
  measuredValue: z.number().finite(),
  unit: z.string(),
  measuredAt: isoDate,
  methodHe: nonEmpty("תוצאת פיילוט חייבת שיטת מדידה"),
  measuredById: nonEmpty("תוצאת פיילוט חייבת מודד בשם"),
});
