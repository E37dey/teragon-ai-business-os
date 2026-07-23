// W8-C — zod schemas mirroring src/domain/administration/types.ts exactly.
// Every administration record is validated before persistence; the schemas
// EMBED the invalid-combination + ag-* rules so a bad record cannot even be
// constructed (constructive enforcement, not just UI validation).
import { z } from "zod";
import {
  ADMIN_DEMO_LABEL_HE,
  CANONICAL_ROLE_IDS,
  EMERGENCY_CONTROL_KINDS,
  GRANT_LEVELS,
  PERMISSION_DOMAINS,
} from "./types";
import type { PermissionDomain, GrantLevel, RoleGrants } from "./types";
import { isAiAgentId, roleGrantViolations } from "./guards";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z)?$/, "תאריך ISO לא תקין");

const baseEntity = {
  id: z.string().min(1, "מזהה חסר"),
  createdAt: isoDate,
  updatedAt: isoDate,
};

const nonEmpty = (msg: string) => z.string().min(1, msg);

/** user-id field that can NEVER be an AI agent id (runtime mirror of HumanUserId). */
const humanId = (roleHe: string) =>
  z
    .string()
    .min(1, `מזהה ${roleHe} חסר`)
    .refine((id) => !isAiAgentId(id), {
      message: `סוכן AI לעולם אינו יכול לשמש ${roleHe} — נדרש משתמש אנושי בשם`,
    });

export const permissionDomainSchema = z.enum(PERMISSION_DOMAINS);
export const grantLevelSchema = z.enum(GRANT_LEVELS);
export const canonicalRoleIdSchema = z.enum(CANONICAL_ROLE_IDS);

const grantsShape = Object.fromEntries(
  PERMISSION_DOMAINS.map((d) => [d, grantLevelSchema]),
) as Record<PermissionDomain, typeof grantLevelSchema>;

export const roleGrantsSchema = z.object(grantsShape);

export const grantOverrideSchema = z.object({
  domain: permissionDomainSchema,
  level: grantLevelSchema,
});

/** canonical role record — combination rules enforced IN the schema. */
export const roleDefinitionRecordSchema = z
  .object({
    ...baseEntity,
    recordKind: z.literal("canonical-role"),
    roleId: canonicalRoleIdSchema,
    nameHe: nonEmpty("שם תפקיד חסר"),
    descriptionHe: nonEmpty("תיאור תפקיד חסר"),
    grants: roleGrantsSchema,
    demoLabelHe: z.literal(ADMIN_DEMO_LABEL_HE),
  })
  .superRefine((rec, ctx) => {
    for (const v of roleGrantViolations(rec.roleId, rec.grants as RoleGrants)) {
      ctx.addIssue({ code: "custom", message: v.detailHe, path: ["grants", v.domain] });
    }
  });

export const roleAssignmentRecordSchema = z.object({
  ...baseEntity,
  recordKind: z.literal("role-assignment"),
  userId: humanId("נושא תפקיד"),
  roleId: canonicalRoleIdSchema,
  overrides: z.array(grantOverrideSchema),
  assignedById: humanId("מקצה תפקיד"),
  demoLabelHe: z.literal(ADMIN_DEMO_LABEL_HE),
});

export const accessChangeRequestRecordSchema = z
  .object({
    ...baseEntity,
    recordKind: z.literal("access-change-request"),
    kind: z.enum(["user-override", "role-grant"]),
    targetRef: z.string().regex(/^(user|role):.+$/, "targetRef חייב להיות user:* או role:*"),
    domain: permissionDomainSchema,
    newLevel: grantLevelSchema,
    previousLevel: grantLevelSchema,
    requestedById: humanId("מבקש"),
    requestedByName: nonEmpty("שם המבקש חסר"),
    approverId: humanId("מאשר"),
    approverName: nonEmpty("שם המאשר חסר — אישור אנושי בשם בלבד"),
    status: z.enum(["ממתין", "נדחה", "בוצע", "נכשל"]),
    approvalId: z.string().nullable(),
    runId: nonEmpty("runId חסר"),
    previewHe: nonEmpty("תצוגה מקדימה חסרה — אין שינוי הרשאות ללא preview"),
    decidedById: z.string().nullable(),
    decidedAt: isoDate.nullable(),
    verifiedAt: isoDate.nullable(),
    noteHe: z.string(),
    demoLabelHe: z.literal(ADMIN_DEMO_LABEL_HE),
  })
  .superRefine((rec, ctx) => {
    if (rec.approverId === rec.requestedById) {
      ctx.addIssue({
        code: "custom",
        message: "אישור עצמי חסום — המאשר חייב להיות שונה מהמבקש",
        path: ["approverId"],
      });
    }
    if (rec.decidedById !== null && isAiAgentId(rec.decidedById)) {
      ctx.addIssue({
        code: "custom",
        message: "סוכן AI לעולם אינו מכריע בקשת שינוי הרשאות",
        path: ["decidedById"],
      });
    }
  });

export const emergencyDisableRecordSchema = z.object({
  ...baseEntity,
  recordKind: z.literal("emergency-disable"),
  control: z.enum(EMERGENCY_CONTROL_KINDS),
  targetRef: z.string().nullable(),
  state: z.enum(["פעיל", "בוטל"]),
  activatedById: humanId("מפעיל בקרת חירום"),
  activatedByName: nonEmpty("שם מפעיל בקרת החירום חסר"),
  reasonHe: nonEmpty("בקרת חירום מחייבת נימוק"),
  deactivatedAt: isoDate.nullable(),
  honestScopeHe: nonEmpty("חסרה הצהרת היקף כנה (מה באמת קורה במצב A)"),
  demoLabelHe: z.literal(ADMIN_DEMO_LABEL_HE),
});

export const administrationRecordSchema = z.discriminatedUnion("recordKind", [
  roleAssignmentRecordSchema,
  accessChangeRequestRecordSchema,
  emergencyDisableRecordSchema,
]);

export const accessReviewRecordSchema = z.object({
  ...baseEntity,
  userId: humanId("נסקר"),
  userName: nonEmpty("שם הנסקר חסר"),
  roleId: canonicalRoleIdSchema,
  status: z.enum(["ממתין", "אושר", "נדחה"]),
  dueAt: isoDate,
  decidedById: humanId("סוקר").nullable(),
  decidedByName: z.string().nullable(),
  decidedAt: isoDate.nullable(),
  noteHe: z.string(),
  demoLabelHe: z.literal(ADMIN_DEMO_LABEL_HE),
});

export type RoleGrantsParsed = Record<PermissionDomain, GrantLevel>;
