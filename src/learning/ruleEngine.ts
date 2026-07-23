// TERAGON AI BUSINESS OS — bounded rule application surface (Wave 6, W6-D).
//
// Rules may influence ONLY the six RuleEffect surfaces: ranking, suggested
// next action, default draft structure, follow-up timing recommendation,
// knowledge retrieval weighting, troubleshooting order. Permissions, approval
// requirements, pricing authority, security policy, provider config, org
// access and system instructions are UNREPRESENTABLE — the closed RuleEffect
// union cannot express them (guard-tested in tests/learning/ruleEngine).
//
// Every application is recorded as an auditable AuditEvent; a rolled-back
// rule refuses NEW applications but its PAST applications remain visible.
import type { AuditEvent, ISODate } from "@/domain/types";
import {
  ruleEffectSchema,
  RULE_EFFECT_KIND_LABELS_HE,
  type RuleEffect,
} from "@/domain/learning";
import { LearningGovernanceError } from "./errors";
import { writeLearningAudit, type Clock } from "./loop";
import type { LearningStores } from "./stores";

/** Audit action recorded for every single rule application. */
export const RULE_APPLY_AUDIT_ACTION = "learning.rule-apply";

export interface RuleApplication {
  ruleId: string;
  version: number;
  effect: RuleEffect;
  /** the record/flow the rule influenced, e.g. "ticket:t-9" */
  contextRef: string;
  appliedAt: ISODate;
  auditId: string;
}

/** Human-readable Hebrew description of a bounded effect. */
export function describeRuleEffectHe(effect: RuleEffect): string {
  const label = RULE_EFFECT_KIND_LABELS_HE[effect.kind];
  switch (effect.kind) {
    case "ranking-adjustment":
      return `${label}: ${effect.direction === "boost" ? "קידום" : "הורדה"} של ${effect.targetHe} — ${effect.rationaleHe}`;
    case "suggested-next-action":
      return `${label}: בהקשר "${effect.contextHe}" — ${effect.actionHe}`;
    case "default-draft-structure":
      return `${label} (${effect.draftTypeHe}): ${effect.sectionsHe.join(" ← ")}`;
    case "follow-up-timing":
      return `${label}: "${effect.contextHe}" — בתוך ${effect.recommendedDelayHours} שעות`;
    case "knowledge-retrieval-weighting":
      return `${label}: ${effect.direction === "increase" ? "הגברת" : "הפחתת"} משקל ${effect.sourceRef}`;
    case "troubleshooting-order":
      return `${label} ("${effect.symptomHe}"): ${effect.orderedActionsHe.join(" ← ")}`;
  }
}

/**
 * Apply an ACTIVE rule to a context. Effects outside the closed union are
 * impossible by construction; a rolled-back rule throws; every application
 * lands in auditEvents (action learning.rule-apply, correlationId = ruleId).
 */
export async function applyRule(
  stores: LearningStores,
  ruleId: string,
  contextRef: string,
  actorId: string,
  clock: Clock,
): Promise<RuleApplication> {
  const rule = await stores.rules.get(ruleId);
  if (!rule) {
    throw new LearningGovernanceError("LEARNING_RULE_NOT_FOUND", `כלל "${ruleId}" לא נמצא`);
  }
  if (rule.status !== "active") {
    throw new LearningGovernanceError(
      "LEARNING_RULE_INACTIVE",
      `הכלל "${ruleId}" בוטל — כלל שבוטל אינו משפיע יותר (יישומי העבר נשארים גלויים)`,
    );
  }
  const parsed = ruleEffectSchema.safeParse(rule.effect);
  if (!parsed.success) {
    throw new LearningGovernanceError(
      "LEARNING_EFFECT_INVALID",
      `אפקט הכלל "${ruleId}" מחוץ למשטח המותר — היישום נחסם`,
    );
  }
  const effect = parsed.data;
  const audit = await writeLearningAudit(
    stores,
    {
      actor: actorId,
      action: RULE_APPLY_AUDIT_ACTION,
      entityRef: `learning-rule:${ruleId}`,
      detailsHe: `יישום כלל (גרסה ${rule.currentVersion}) על ${contextRef} — ${describeRuleEffectHe(effect)}`,
      correlationId: ruleId,
    },
    clock,
  );
  return {
    ruleId,
    version: rule.currentVersion,
    effect,
    contextRef,
    appliedAt: audit.at,
    auditId: audit.id,
  };
}

/**
 * All recorded applications (of one rule or all rules) — pure selector over
 * auditEvents. Includes applications of rolled-back rules: history never hides.
 */
export function ruleApplicationsFromAudit(
  audit: readonly AuditEvent[],
  ruleId?: string,
): AuditEvent[] {
  return audit
    .filter(
      (a) =>
        a.action === RULE_APPLY_AUDIT_ACTION &&
        (ruleId === undefined || a.correlationId === ruleId),
    )
    .sort((a, b) => a.at.localeCompare(b.at));
}
