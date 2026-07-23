// W6-D — the bounded rule surface: forbidden effects are IMPOSSIBLE by
// construction (closed RuleEffect union) + every application is audited.
import { describe, expect, it } from "vitest";
import {
  ruleEffectSchema,
  RULE_EFFECT_KINDS,
  FORBIDDEN_RULE_AREAS_HE,
  type RuleEffect,
} from "@/domain/learning";
import {
  applyRule,
  ruleApplicationsFromAudit,
  LearningGovernanceError,
  RULE_APPLY_AUDIT_ACTION,
} from "@/learning";
import { freshLearning, makeRule } from "./helpers";

const ALLOWED_SAMPLES: RuleEffect[] = [
  { kind: "ranking-adjustment", targetHe: "דגם P1S", direction: "boost", rationaleHe: "נמכר" },
  { kind: "suggested-next-action", contextHe: "תלמיד חסום", actionHe: "בדיקת חסם טכני" },
  { kind: "default-draft-structure", draftTypeHe: "הצעת מחיר", sectionsHe: ["פתיח", "מפרט"] },
  { kind: "follow-up-timing", contextHe: "ליד ללא מענה", recommendedDelayHours: 48 },
  { kind: "knowledge-retrieval-weighting", sourceRef: "knowledge:kn-1", direction: "increase" },
  { kind: "troubleshooting-order", symptomHe: "וורפינג", orderedActionsHe: ["Brim", "מיטה 70°C"] },
];

// every forbidden governance area, expressed as the effect an attacker would try
const FORBIDDEN_ATTEMPTS: Record<string, unknown> = {
  permissions: { kind: "permission-change", agentId: "ag-hunter", grant: "approvals" },
  approvalRequirements: { kind: "approval-requirement-change", action: "discount", required: false },
  pricingAuthority: { kind: "pricing-authority", agentId: "ag-hunter", maxDiscountPct: 20 },
  securityPolicy: { kind: "security-policy-change", policy: "disable-injection-detection" },
  providerConfig: { kind: "provider-config-change", remoteEnabled: true },
  orgAccess: { kind: "org-access-change", userId: "u-x", role: 'מנכ"ל' },
  systemInstructions: { kind: "system-instruction-update", promptVersion: "v9" },
};

describe("RuleEffect closed union — bounded by construction", () => {
  it("has exactly the 6 sanctioned surfaces", () => {
    expect(RULE_EFFECT_KINDS).toHaveLength(6);
    expect(FORBIDDEN_RULE_AREAS_HE).toHaveLength(7);
  });

  it("every sanctioned effect parses", () => {
    for (const effect of ALLOWED_SAMPLES) {
      expect(ruleEffectSchema.safeParse(effect).success).toBe(true);
    }
  });

  for (const [area, attempt] of Object.entries(FORBIDDEN_ATTEMPTS)) {
    it(`forbidden effect is unrepresentable: ${area}`, () => {
      expect(ruleEffectSchema.safeParse(attempt).success).toBe(false);
    });
  }

  it("smuggling forbidden powers through extra keys on an allowed kind is rejected (strict)", () => {
    const smuggled = {
      kind: "troubleshooting-order",
      symptomHe: "וורפינג",
      orderedActionsHe: ["Brim"],
      grantPermission: "approvals",
    };
    expect(ruleEffectSchema.safeParse(smuggled).success).toBe(false);
  });
});

describe("applyRule — audited, active-only", () => {
  it("records every application in auditEvents (action learning.rule-apply)", async () => {
    const { stores, clock } = freshLearning();
    const rule = await stores.rules.create(makeRule());
    const application = await applyRule(stores, rule.id, "ticket:t-9", "u-tzachi", clock);
    expect(application.ruleId).toBe(rule.id);
    const audit = await stores.audit.list();
    const apps = ruleApplicationsFromAudit(audit, rule.id);
    expect(apps).toHaveLength(1);
    expect(apps[0]?.action).toBe(RULE_APPLY_AUDIT_ACTION);
    expect(apps[0]?.correlationId).toBe(rule.id);
  });

  it("a rolled-back rule refuses NEW applications but past ones stay visible", async () => {
    const { stores, clock } = freshLearning();
    const rule = await stores.rules.create(makeRule());
    await applyRule(stores, rule.id, "ticket:t-9", "u-tzachi", clock);
    await stores.rules.update(rule.id, { status: "rolled-back", updatedAt: clock() });

    await expect(applyRule(stores, rule.id, "ticket:t-3", "u-tzachi", clock)).rejects.toMatchObject(
      { code: "LEARNING_RULE_INACTIVE" },
    );
    // the past application remains visible
    const audit = await stores.audit.list();
    expect(ruleApplicationsFromAudit(audit, rule.id)).toHaveLength(1);
  });

  it("an unknown rule throws a structured error", async () => {
    const { stores, clock } = freshLearning();
    await expect(applyRule(stores, "rule-none", "x", "u-tzachi", clock)).rejects.toBeInstanceOf(
      LearningGovernanceError,
    );
  });
});
