// TERAGON AI BUSINESS OS — "מבקר הממשל" rail detections (Wave 8, W8-B).
// Pure, deterministic checks over the real records. Every finding cites the
// records it derives from — nothing is invented, and an empty result honestly
// means "no finding by these heuristics", not "no problem exists".
import { AGENT_DEFINITIONS, AGENT_IDS } from "@/agents/definitions";
import { ruleEffectSchema, type LearningRule } from "@/domain/learning";
import type { Approval, AuditEvent, Evidence } from "@/domain/types";
import type {
  GovernancePolicy,
  GovernanceRisk,
  PromptVersionRecord,
} from "@/domain/governance";

export type GovernanceFindingKind =
  | "policy-without-owner"
  | "policy-review-overdue"
  | "excessive-permission"
  | "prompt-version-without-approval"
  | "action-without-evidence"
  | "approval-bypass-attempt"
  | "unresolved-critical-risk"
  | "audit-coverage-gap"
  | "learning-rule-prohibited-domain";

export interface GovernanceFinding {
  id: string;
  kind: GovernanceFindingKind;
  severityHe: "אזהרה" | "חמור";
  titleHe: string;
  detailHe: string;
  refs: string[];
}

export interface GovernanceAuditorInput {
  policies: readonly GovernancePolicy[];
  promptVersions: readonly PromptVersionRecord[];
  risks: readonly GovernanceRisk[];
  approvals: readonly Approval[];
  audit: readonly AuditEvent[];
  evidence: readonly Evidence[];
  learningRules: readonly LearningRule[];
  /** injected clock value (ISO) — no hidden Date.now in a pure derivation */
  now: string;
}

/** Domains no agent may ever hold writable access to. */
const FORBIDDEN_AGENT_DOMAINS = ["approvals", "auditEvents", "users", "roles"] as const;

/** Audit actions that indicate an execution/approval flow event. */
const EXECUTION_ACTIONS = ["approval.execute"];

export function runGovernanceAuditor(input: GovernanceAuditorInput): GovernanceFinding[] {
  const findings: GovernanceFinding[] = [];
  let seq = 0;
  const add = (f: Omit<GovernanceFinding, "id">) => {
    seq += 1;
    findings.push({ id: `gf-${seq}`, ...f });
  };

  // 1. policy without a named owner
  for (const p of input.policies) {
    if (!p.ownerId.trim() || !p.ownerName.trim()) {
      add({
        kind: "policy-without-owner",
        severityHe: "חמור",
        titleHe: "מדיניות ללא בעלים",
        detailHe: `למדיניות "${p.titleHe}" אין בעלים בשם — אחריות חייבת להיות אישית`,
        refs: [`governance-policy:${p.id}`],
      });
    }
  }

  // 2. policy past its review date
  for (const p of input.policies) {
    if (p.nextReviewAt !== null && p.nextReviewAt < input.now) {
      add({
        kind: "policy-review-overdue",
        severityHe: "אזהרה",
        titleHe: "מועד בדיקת מדיניות חלף",
        detailHe: `המדיניות "${p.titleHe}" הייתה אמורה להיבדק עד ${p.nextReviewAt}`,
        refs: [`governance-policy:${p.id}`],
      });
    }
  }

  // 3. excessive permission — an agent with writable access to a forbidden
  //    governance domain (should be none; derived from the frozen definitions)
  for (const id of AGENT_IDS) {
    const def = AGENT_DEFINITIONS[id];
    if (!def) continue;
    const granted = FORBIDDEN_AGENT_DOMAINS.filter((d) =>
      (def.allowedDomains as readonly string[]).includes(d),
    );
    if (granted.length > 0) {
      add({
        kind: "excessive-permission",
        severityHe: "חמור",
        titleHe: "הרשאה חורגת לסוכן",
        detailHe: `לסוכן ${def.nameHe} (${def.id}) הוענקה גישה לתחום אסור: ${granted.join(", ")}`,
        refs: [`agent:${def.id}`],
      });
    }
  }

  // 4. prompt version without a formal approval record
  for (const pv of input.promptVersions) {
    if (pv.active && pv.approvalId === null) {
      add({
        kind: "prompt-version-without-approval",
        severityHe: "אזהרה",
        titleHe: "גרסת פרומפט ללא אישור",
        detailHe: `"${pv.labelHe}" (${pv.version}) פעילה ללא רשומת אישור פורמלית`,
        refs: [`prompt-version:${pv.id}`],
      });
    }
  }

  // 5. executed action without any evidence record on its subject
  const evidenceBySubject = new Set(input.evidence.map((e) => e.subjectRef));
  const approvalById = new Map(input.approvals.map((a) => [a.id, a]));
  for (const ev of input.audit) {
    if (!EXECUTION_ACTIONS.some((a) => ev.action === a)) continue;
    const approvalId = ev.entityRef?.startsWith("approval:")
      ? ev.entityRef.slice("approval:".length)
      : null;
    const approval = approvalId ? approvalById.get(approvalId) : undefined;
    const subjectRef = approval?.subjectRef ?? ev.entityRef ?? "";
    if (!evidenceBySubject.has(subjectRef) && !evidenceBySubject.has(ev.entityRef ?? "")) {
      add({
        kind: "action-without-evidence",
        severityHe: "אזהרה",
        titleHe: "פעולה שבוצעה ללא ראיות",
        detailHe: `הביצוע ${ev.id} (${ev.entityRef ?? "—"}) אינו מגובה ברשומת ראיה`,
        refs: [`audit-event:${ev.id}`],
      });
    }
  }

  // 6. approval bypass attempts — blocked executions / bypass phrasing in audit
  for (const ev of input.audit) {
    const hay = `${ev.action} ${ev.details}`;
    if (
      ev.action === "approval.execute-failed" ||
      hay.includes("AGENT_EXECUTION_WITHOUT_APPROVAL") ||
      hay.includes("ללא אישור —") ||
      hay.includes("עקיפת אישור")
    ) {
      add({
        kind: "approval-bypass-attempt",
        severityHe: "חמור",
        titleHe: "ניסיון עקיפת אישור / ביצוע כושל",
        detailHe: `אירוע ${ev.id}: ${ev.details.slice(0, 120)}`,
        refs: [`audit-event:${ev.id}`],
      });
    }
  }

  // 7. unresolved critical risk
  for (const r of input.risks) {
    if (r.severity === "קריטית" && r.status !== "נסגר" && r.status !== "הופחת") {
      add({
        kind: "unresolved-critical-risk",
        severityHe: "חמור",
        titleHe: "סיכון קריטי פתוח",
        detailHe: `"${r.titleHe}" במצב ${r.status} — בבעלות ${r.ownerName}`,
        refs: [`governance-risk:${r.id}`],
      });
    }
  }

  // 8. audit coverage gap — a DECIDED approval no audit event references
  const referencedApprovals = new Set(
    input.audit
      .map((e) => e.entityRef)
      .filter((r): r is string => r !== null && r.startsWith("approval:"))
      .map((r) => r.slice("approval:".length)),
  );
  for (const a of input.approvals) {
    if (a.status === "ממתין") continue;
    if (!referencedApprovals.has(a.id)) {
      add({
        kind: "audit-coverage-gap",
        severityHe: "אזהרה",
        titleHe: "פער כיסוי ביומן הביקורת",
        detailHe: `האישור ${a.id} הוכרע אך אף אירוע ביקורת אינו מפנה אליו`,
        refs: [`approval:${a.id}`],
      });
    }
  }

  // 9. learning rule touching a prohibited domain — the RuleEffect closed
  //    union guard: any persisted effect that fails the schema is a violation
  for (const rule of input.learningRules) {
    const parsed = ruleEffectSchema.safeParse((rule as LearningRule).effect);
    if (!parsed.success) {
      add({
        kind: "learning-rule-prohibited-domain",
        severityHe: "חמור",
        titleHe: "כלל למידה מחוץ למשטח המותר",
        detailHe: `האפקט של הכלל "${rule.nameHe}" אינו במשטח הסגור המותר — נדרש ביטול מיידי`,
        refs: [`learning-rule:${rule.id}`],
      });
    }
  }

  return findings;
}
