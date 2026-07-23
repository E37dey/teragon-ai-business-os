// TERAGON AI BUSINESS OS — W7-E (Phases 7.18+7.19): deliverable readiness +
// overall submission readiness + the "מבקר ההגשה" auditor findings.
// "מלא" is DERIVED — content exists + named owner + valid approval + evidence
// resolves + no blocking quality fail + linked route exists + print view flag.
// The overall state is NEVER "מוכן להגשה" while any blocker exists.
import { APP_ROUTES } from "@/app/routes";
import type { Approval } from "@/domain/types";
import {
  CANONICAL_OWNER_NAMES,
  EXPECTED_COUNTS,
  isNamedOwner,
  REGISTRY_DELIVERABLE_KEYS,
  type DeliverableKey,
} from "./contentRegistry";
import { DELIVERABLE_DEFS, type DeliverableDef, type SubmissionSources } from "./deliverables";
import { SUBMISSION_METRICS } from "./metricLevels";
import type { QualityValidationResult } from "@/validation/submission/qualityValidator";
import type {
  DeliverableEvaluation,
  DeliverableState,
  ReadinessState,
  SubmissionAuditFinding,
} from "./types";

/** approval subjectRef convention for deliverables (canonical approvals engine) */
export function approvalSubjectRef(key: DeliverableKey): string {
  return `submission-deliverable:${key}`;
}

function findApproval(key: DeliverableKey, approvals: readonly Approval[]): Approval | null {
  const subject = approvalSubjectRef(key);
  const matching = approvals.filter((a) => a.subjectRef === subject);
  // latest decision wins (deterministic: by requestedAt then id)
  const sorted = [...matching].sort(
    (a, b) => a.requestedAt.localeCompare(b.requestedAt) || a.id.localeCompare(b.id),
  );
  return sorted[sorted.length - 1] ?? null;
}

/**
 * Evaluate ONE deliverable against the live sources + its quality results.
 * Deterministic; the state falls where it falls — no forced 12/12.
 */
export function evaluateDeliverable(
  def: DeliverableDef,
  ctx: SubmissionSources,
  quality: readonly QualityValidationResult[],
): DeliverableEvaluation {
  const reasons: string[] = [];

  const content = def.contentExists(ctx);
  const evidence = def.evidence.map((e) => e.resolve(ctx));
  const allEvidenceResolved = evidence.every((e) => e.resolved);
  const routeExists = APP_ROUTES.some((r) => r.path === def.route);
  const ownerNamed = isNamedOwner(def.ownerId);
  const approval = findApproval(def.key, ctx.approvals);
  const approvalValid = approval !== null && approval.status === "אושר";

  const mine = quality.filter((q) => q.deliverableKey === def.key);
  const qualityFails = mine.filter((q) => q.state === "fail").map((q) => q.criterion);
  const qualityWarnings = mine.filter((q) => q.state === "warning").map((q) => q.criterion);

  // expiry: a material-backed deliverable whose material review date passed
  let expired = false;
  if (def.materialSeedId) {
    const mat = ctx.materials.find((m) => m.id === def.materialSeedId);
    if (mat?.reviewDate && Date.parse(mat.reviewDate) < Date.parse(ctx.nowISO)) expired = true;
    if (mat?.status === "דורש עדכון") expired = true;
  }

  if (!content.exists) reasons.push(content.reasonHe ?? "התוכן חסר");
  if (!ownerNamed) reasons.push("לא הוקצה אחראי בשם");
  if (!approvalValid)
    reasons.push(approval === null ? "אין רשומת אישור — ממתין לאישור במנוע הקנוני" : `אישור בסטטוס "${approval.status}"`);
  if (!allEvidenceResolved)
    reasons.push(`${evidence.filter((e) => !e.resolved).length} ראיות אינן נפתרות`);
  if (!routeExists) reasons.push(`הנתיב ${def.route} אינו קיים ב-APP_ROUTES`);
  if (!def.printable) reasons.push("אין תצוגת הדפסה");
  if (qualityFails.length > 0) reasons.push(`כשלי איכות חוסמים: ${qualityFails.join(", ")}`);
  if (expired) reasons.push("תוקף התוכן פג — נדרש רענון");

  let state: DeliverableState;
  if (!content.exists) state = "חסר";
  else if (expired) state = "פג תוקף";
  else if (qualityFails.length > 0) state = "חסום";
  else if (reasons.length === 0) state = "מלא";
  else if (ownerNamed && allEvidenceResolved && routeExists && def.printable && !approvalValid)
    state = "ממתין לבדיקה";
  else state = "חלקי";

  // W7-F seam: presenter-note coverage — honest "חסר" until F lands
  const note = ctx.presenterNotes.find((n) => n.deliverableKey === def.key);
  const presentationStatusHe =
    ctx.presenterNotes.length === 0
      ? "חסר — הערות מרצה טרם נוצרו (W7-F)"
      : note
        ? "הערת מרצה קיימת"
        : "אין הערת מרצה לתוצר זה";

  return {
    key: def.key,
    order: def.order,
    title: def.titleHe,
    state,
    ownerId: def.ownerId,
    ownerNameHe: CANONICAL_OWNER_NAMES[def.ownerId] ?? null,
    route: def.route,
    routeExists,
    printable: def.printable,
    approvalStatusHe: approval === null ? "אין רשומת אישור" : approval.status === "אושר" ? "מאושר" : `אישור: ${approval.status}`,
    approvalId: approval?.id ?? null,
    evidence,
    qualityFails,
    qualityWarnings,
    stateReasonsHe: reasons,
    presentationStatusHe,
  };
}

/** evaluate ALL 12 deliverables, in mandated order */
export function evaluateAllDeliverables(
  ctx: SubmissionSources,
  quality: readonly QualityValidationResult[],
): DeliverableEvaluation[] {
  return DELIVERABLE_DEFS.map((def) => evaluateDeliverable(def, ctx, quality));
}

/**
 * Overall readiness. NEVER "מוכן להגשה" while any deliverable is
 * חסר/חסום/פג תוקף, any quality fail exists, or any auditor blocker remains.
 */
export function overallReadiness(
  evaluations: readonly DeliverableEvaluation[],
  findings: readonly SubmissionAuditFinding[],
): ReadinessState {
  const anyBlocking =
    evaluations.some((e) => e.state === "חסר" || e.state === "חסום" || e.state === "פג תוקף") ||
    findings.some((f) => f.severity === "חוסם");
  if (anyBlocking) return "לא מוכן להגשה";
  const allComplete = evaluations.every((e) => e.state === "מלא");
  return allComplete ? "מוכן להגשה" : "בהכנה";
}

// ---------------------------------------------------------------------------
// "מבקר ההגשה" — the rail auditor (SPEC ch.19 left panel)
// ---------------------------------------------------------------------------

/** allotted presentation minutes (SPEC ch.19: "10 דקות") */
export const PRESENTATION_MINUTES_ALLOTTED = 10;

export function buildAuditFindings(
  ctx: SubmissionSources,
  evaluations: readonly DeliverableEvaluation[],
): SubmissionAuditFinding[] {
  const findings: SubmissionAuditFinding[] = [];

  // missing deliverable
  for (const e of evaluations) {
    if (e.state === "חסר") {
      findings.push({
        kind: "missing-deliverable",
        severity: "חוסם",
        titleHe: `תוצר חסר: ${e.title}`,
        detailHe: e.stateReasonsHe[0] ?? "התוכן חסר",
        targetRoute: e.route,
      });
    }
  }

  // conflicting numbers — count guards
  const countChecks: { label: string; expected: number; actual: number; route: string }[] = [
    { label: "פרסונות", expected: EXPECTED_COUNTS.personas, actual: ctx.personas.length, route: "/personas" },
    { label: "חומרי הדרכה", expected: EXPECTED_COUNTS.trainingMaterials, actual: ctx.materials.length, route: "/training-materials" },
    { label: "תוצרי הגשה", expected: EXPECTED_COUNTS.deliverables, actual: evaluations.length, route: "/submission" },
  ];
  if (ctx.gateValidations !== null) {
    countChecks.push({
      label: "שערים",
      expected: EXPECTED_COUNTS.stageGates,
      actual: ctx.gateValidations.length,
      route: "/stage-gates",
    });
  }
  for (const c of countChecks) {
    if (c.actual !== c.expected) {
      const finding: SubmissionAuditFinding = {
        kind: c.label === "פרסונות" ? "wrong-persona-count" : "conflicting-number",
        severity: "חוסם",
        titleHe: `ספירה סותרת: ${c.label}`,
        detailHe: `נדרשות בדיוק ${c.expected} — קיימות ${c.actual}`,
        targetRoute: c.route,
      };
      findings.push(finding);
    }
  }

  // missing baseline — every metric currently has baseline null (honest)
  const noBaseline = SUBMISSION_METRICS.filter((m) => m.baseline === null);
  if (noBaseline.length > 0) {
    findings.push({
      kind: "missing-baseline",
      severity: "אזהרה",
      titleHe: `${noBaseline.length} מדדים ללא קו בסיס`,
      detailHe: 'לא הוגדר קו בסיס — מדידת קו בסיס נדרשת לפני הפיילוט (אף מספר דונור לא יובא)',
      targetRoute: "/submission",
    });
  }

  // missing named owner
  for (const e of evaluations) {
    if (!isNamedOwner(e.ownerId)) {
      findings.push({
        kind: "missing-named-owner",
        severity: "חוסם",
        titleHe: `תוצר ללא אחראי בשם: ${e.title}`,
        detailHe: "בעלים חייב להיות אחד מחמשת משתמשי ה-seed — תפקיד אינו אדם (C3)",
        targetRoute: e.route,
      });
    }
  }

  // unresolved evidence
  for (const e of evaluations) {
    const unresolved = e.evidence.filter((ev) => !ev.resolved);
    if (unresolved.length > 0) {
      findings.push({
        kind: "unresolved-evidence",
        severity: "חוסם",
        titleHe: `ראיות לא נפתרות: ${e.title}`,
        detailHe: unresolved.map((u) => `${u.label} — ${u.statusHe}`).join(" · "),
        targetRoute: e.route,
      });
    }
  }

  // expired material
  for (const m of ctx.materials) {
    if (m.reviewDate && Date.parse(m.reviewDate) < Date.parse(ctx.nowISO)) {
      findings.push({
        kind: "expired-material",
        severity: "חוסם",
        titleHe: `חומר שפג תוקפו: ${m.title}`,
        detailHe: `מועד הבדיקה ${m.reviewDate.slice(0, 10)} חלף`,
        targetRoute: "/training-materials",
      });
    }
  }

  // failed route
  for (const e of evaluations) {
    if (!e.routeExists) {
      findings.push({
        kind: "failed-route",
        severity: "חוסם",
        titleHe: `נתיב שבור: ${e.route}`,
        detailHe: `התוצר "${e.title}" מקושר לנתיב שאינו קיים ב-APP_ROUTES`,
        targetRoute: "/submission",
      });
    }
  }

  // missing presenter notes (W7-F seam — honest "חסר" until F lands)
  if (ctx.presenterNotes.length === 0) {
    findings.push({
      kind: "missing-presenter-note",
      severity: "אזהרה",
      titleHe: "הערות מרצה חסרות",
      detailHe: "אוסף presenterNotes ריק — ימולא על ידי מצגת ההגשה (W7-F)",
      targetRoute: "/submission/presentation",
    });
  }

  // presentation timing overflow (reads presentationSections when present)
  const totalMinutes = ctx.presentationSections.reduce(
    (sum, s) => sum + (typeof s.durationMinutes === "number" ? s.durationMinutes : 0),
    0,
  );
  if (totalMinutes > PRESENTATION_MINUTES_ALLOTTED) {
    findings.push({
      kind: "timing-overflow",
      severity: "חוסם",
      titleHe: "חריגת זמן במצגת",
      detailHe: `סך המקטעים ${totalMinutes} דק' — המסגרת היא ${PRESENTATION_MINUTES_ALLOTTED} דק'`,
      targetRoute: "/submission/presentation",
    });
  }

  // stale screenshot — honest: no screenshot artefacts are tracked yet
  findings.push({
    kind: "stale-screenshot",
    severity: "אזהרה",
    titleHe: "אין צילומי מסך מתועדים",
    detailHe: "צילומי QA ייווצרו בסגירת הגל (docs/WAVE_7_VISUAL_QA) — עד אז אין מה לבדוק לרעננות",
    targetRoute: "/submission",
  });

  return findings;
}

/** guard: the evaluations list covers exactly the 12 registry keys */
export function evaluationsCoverRegistry(evaluations: readonly DeliverableEvaluation[]): boolean {
  return (
    evaluations.length === REGISTRY_DELIVERABLE_KEYS.length &&
    REGISTRY_DELIVERABLE_KEYS.every((k) => evaluations.some((e) => e.key === k))
  );
}
