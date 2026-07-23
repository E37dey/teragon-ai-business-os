// TERAGON AI BUSINESS OS — risk register (Wave 8, W8-B).
// The 10 canonical AI-governance risks (bootstrapped פתוח, named owners) +
// the guarded lifecycle transition function. Every transition is validated
// against RISK_TRANSITIONS, requires a named actor + reason, appends to the
// risk's history and writes a canonical audit event.
import type { AuditEvent } from "@/domain/types";
import {
  RISK_TRANSITIONS,
  governanceRiskSchema,
  type GovernanceRisk,
  type GovernanceRiskState,
} from "@/domain/governance";
import { nextId } from "@/repositories/Repository";
import type { GovernanceStores } from "@/repositories/governanceStores";
import { GovernanceError } from "./errors";

export type Clock = () => string;

export interface CanonicalRiskDef {
  key: string;
  titleHe: string;
  descriptionHe: string;
  severity: GovernanceRisk["severity"];
  ownerId: string;
  ownerName: string;
  controlIds: string[];
  sourceRef: string | null;
}

/**
 * The 10 mandated canonical risks. controlIds reference REAL Control records
 * from the seeded "controls" collection (ctl-1…ctl-4); sourceRef points at the
 * real code/record surface the risk was identified from.
 */
export const CANONICAL_RISKS: readonly CanonicalRiskDef[] = [
  {
    key: "prompt-injection",
    titleHe: "הזרקת הוראות עוקפת את הזיהוי ההיוריסטי",
    descriptionHe:
      "רשימת דפוסי ההזרקה היא היוריסטית — ניסוח חדשני יעבור אותה. ההגנה בעומק: הסגר, אזהרה, ביקורת ושער אישור אנושי.",
    severity: "גבוהה",
    ownerId: "u-noa",
    ownerName: "נעה פרידמן",
    controlIds: ["ctl-1", "ctl-3"],
    sourceRef: "src/server/promptSecurity.ts#INJECTION_PATTERNS",
  },
  {
    key: "rubber-stamp-approval",
    titleHe: "אישור שטחי (rubber-stamping) של פעולות סוכן",
    descriptionHe:
      "משתמש שמאשר בקשות בלי לקרוא — הודעה שגויה תישלח למרות שער האישור. נדרש מעקב אחוזי-עריכה ותחקירי מדגם.",
    severity: "גבוהה",
    ownerId: "u-tzachi",
    ownerName: "צחי זוסטייהם",
    controlIds: ["ctl-1", "ctl-3"],
    sourceRef: "approval:ap-1",
  },
  {
    key: "unverified-recommendation",
    titleHe: "הסתמכות על המלצת AI ללא בדיקת ראיות",
    descriptionHe: "המלצה שלא נבדקה מול הראיות המצורפות עלולה להוביל להחלטה עסקית שגויה.",
    severity: "בינונית",
    ownerId: "u-maya",
    ownerName: "מאיה ברק",
    controlIds: ["ctl-3"],
    sourceRef: "collection:aiRecommendations",
  },
  {
    key: "sensitive-data-leak",
    titleHe: "דליפת מידע רגיש ללוגים או לייצוא",
    descriptionHe:
      "פרטי לקוחות/סודות עלולים לזלוג דרך לוגים או ייצוא. redact() הוא קו הגנה אחרון — לא תחליף למשמעת.",
    severity: "קריטית",
    ownerId: "u-noa",
    ownerName: "נעה פרידמן",
    controlIds: ["ctl-3"],
    sourceRef: "src/server/redact.ts",
  },
  {
    key: "provider-dependency",
    titleHe: "תלות בספק AI חיצוני",
    descriptionHe: "נפילת ספק מרוחק (כשיופעל) משביתה יכולות — קיים fallback מקומי עם גילוי נאות.",
    severity: "בינונית",
    ownerId: "u-noa",
    ownerName: "נעה פרידמן",
    controlIds: [],
    sourceRef: "src/ai/providers/registry.ts",
  },
  {
    key: "budget-overrun",
    titleHe: "חריגת עלות AI אם יופעל ספק מרוחק",
    descriptionHe: "שימוש לא מבוקר עלול לייצר עלות בלתי צפויה. כיום התקציב 0 ₪ ונאכף.",
    severity: "נמוכה",
    ownerId: "u-tzachi",
    ownerName: "צחי זוסטייהם",
    controlIds: ["ctl-4"],
    sourceRef: "src/agents/definitions.ts#maxUsageBudgetILS",
  },
  {
    key: "permission-creep",
    titleHe: "סחף הרשאות בהרחבות עתידיות",
    descriptionHe:
      "הוספת סוכנים/תחומים עלולה להרחיב הרשאות בהיסח דעת. מטריצת ההרשאות נגזרת מההגדרות הקפואות ונבדקת.",
    severity: "בינונית",
    ownerId: "u-noa",
    ownerName: "נעה פרידמן",
    controlIds: ["ctl-2"],
    sourceRef: "src/agents/definitions.ts#AGENT_DEFINITIONS",
  },
  {
    key: "bad-learning-rule",
    titleHe: "כלל למידה שגוי משפיע על המלצות עד ביטולו",
    descriptionHe:
      "כלל שאושר על סמך מדגם קטן עלול להטות המלצות. מגבלות: משטח אפקט סגור, מדגם מינימלי, rollback תמידי.",
    severity: "בינונית",
    ownerId: "u-tzachi",
    ownerName: "צחי זוסטייהם",
    controlIds: ["ctl-1"],
    sourceRef: "src/domain/learning/types.ts#RuleEffect",
  },
  {
    key: "audit-coverage-gap",
    titleHe: "פערי כיסוי ביומן הביקורת",
    descriptionHe: "פעולה ללא רשומת ביקורת/ראיות שוברת את שרשרת האחריות. מבקר הממשל סורק פערים.",
    severity: "גבוהה",
    ownerId: "u-noa",
    ownerName: "נעה פרידמן",
    controlIds: ["ctl-3"],
    sourceRef: "collection:auditEvents",
  },
  {
    key: "stale-knowledge",
    titleHe: "ידע מיושן או סותר משפיע על טיוטות",
    descriptionHe: "רשומת ידע שלא נבדקה מזמן עלולה להזין טיוטות שגויות. סתירות מסומנות ונאכף מועד בדיקה.",
    severity: "בינונית",
    ownerId: "u-oren",
    ownerName: "אורן שגב",
    controlIds: [],
    sourceRef: "collection:knowledgeArticles",
  },
];

/** Persist the canonical risks — create-if-missing, never overwrite. */
export async function bootstrapRisks(stores: GovernanceStores, clock: Clock): Promise<number> {
  const existing = new Set((await stores.risks.list()).map((r) => r.id));
  let created = 0;
  for (const def of CANONICAL_RISKS) {
    const id = `gr-${def.key}`;
    if (existing.has(id)) continue;
    const ts = clock();
    const risk: GovernanceRisk = governanceRiskSchema.parse({
      id,
      createdAt: ts,
      updatedAt: ts,
      key: def.key,
      titleHe: def.titleHe,
      descriptionHe: def.descriptionHe,
      severity: def.severity,
      status: "פתוח",
      ownerId: def.ownerId,
      ownerName: def.ownerName,
      controlIds: def.controlIds,
      mitigationHe: null,
      sourceRef: def.sourceRef,
      history: [],
      reviewDueAt: null,
    } satisfies GovernanceRisk);
    await stores.risks.create(risk);
    created += 1;
  }
  return created;
}

export interface RiskTransitionInput {
  riskId: string;
  to: GovernanceRiskState;
  byId: string;
  byName: string;
  reasonHe: string;
  /** mandatory when transitioning to הופחת */
  mitigationHe?: string;
}

/** Guarded lifecycle transition — invalid moves throw, everything is audited. */
export async function transitionRisk(
  stores: GovernanceStores,
  input: RiskTransitionInput,
  clock: Clock,
): Promise<GovernanceRisk> {
  const risk = await stores.risks.get(input.riskId);
  if (!risk) {
    throw new GovernanceError("GOV_RISK_NOT_FOUND", `סיכון "${input.riskId}" לא נמצא`);
  }
  const allowed = RISK_TRANSITIONS[risk.status] ?? [];
  if (!allowed.includes(input.to)) {
    throw new GovernanceError(
      "GOV_RISK_TRANSITION_INVALID",
      `מעבר "${risk.status}" → "${input.to}" אינו חוקי (מותר: ${allowed.join(" / ") || "—"})`,
    );
  }
  if (!input.reasonHe.trim()) {
    throw new GovernanceError("GOV_REASON_REQUIRED", "מעבר מצב סיכון מחייב נימוק");
  }
  if (!input.byId.trim() || !input.byName.trim()) {
    throw new GovernanceError("GOV_APPROVER_NOT_NAMED", "מעבר מצב סיכון מחייב מבצע בשם");
  }
  if (input.to === "הופחת" && !input.mitigationHe?.trim()) {
    throw new GovernanceError("GOV_REASON_REQUIRED", 'מעבר ל"הופחת" מחייב תיאור הפחתה (mitigation)');
  }
  const ts = clock();
  const updated = await stores.risks.update(risk.id, {
    status: input.to,
    mitigationHe: input.to === "הופחת" ? (input.mitigationHe as string) : risk.mitigationHe,
    history: [
      ...risk.history,
      {
        from: risk.status,
        to: input.to,
        at: ts,
        byId: input.byId,
        byName: input.byName,
        reasonHe: input.reasonHe,
      },
    ],
    updatedAt: ts,
  });
  await writeGovernanceAudit(stores, clock, {
    actor: input.byId,
    action: "governance.risk-transition",
    entityRef: `governance-risk:${risk.id}`,
    detailsHe: `סיכון "${risk.titleHe}": ${risk.status} → ${input.to} — ${input.reasonHe}`,
    correlationId: risk.id,
  });
  return updated;
}

// ---------------------------------------------------------------------------
// shared audit helper (canonical auditEvents collection)
// ---------------------------------------------------------------------------

export interface GovernanceAuditInput {
  actor: string;
  action: string;
  entityRef: string;
  detailsHe: string;
  correlationId: string | null;
}

export async function writeGovernanceAudit(
  stores: GovernanceStores,
  clock: Clock,
  input: GovernanceAuditInput,
): Promise<AuditEvent> {
  const ts = clock();
  const existing = await stores.audit.list();
  return stores.audit.create({
    id: nextId("gae", existing.map((a) => a.id)),
    createdAt: ts,
    updatedAt: ts,
    at: ts,
    actor: input.actor,
    action: input.action,
    entityRef: input.entityRef,
    details: input.detailsHe,
    correlationId: input.correlationId,
  });
}
