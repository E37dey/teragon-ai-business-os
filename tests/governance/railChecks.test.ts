// W8-B — "מבקר הממשל" detections: each check fires on a crafted violation and
// stays quiet on clean data; the learning-rule check consumes the RuleEffect
// closed-union guard.
import { describe, expect, it } from "vitest";
import type { Approval, AuditEvent } from "@/domain/types";
import type { LearningRule, RuleEffect } from "@/domain/learning";
import type { GovernancePolicy, PromptVersionRecord } from "@/domain/governance";
import { runGovernanceAuditor, type GovernanceAuditorInput } from "@/governance";
import { bootedGovernance } from "./helpers";

const T0 = "2026-07-23T08:00:00.000Z";
const NOW = "2026-07-23T12:00:00.000Z";

function emptyInput(): GovernanceAuditorInput {
  return {
    policies: [],
    promptVersions: [],
    risks: [],
    approvals: [],
    audit: [],
    evidence: [],
    learningRules: [],
    now: NOW,
  };
}

function makePolicy(overrides: Partial<GovernancePolicy>): GovernancePolicy {
  return {
    id: "gp-t",
    createdAt: T0,
    updatedAt: T0,
    key: "t",
    titleHe: "מדיניות בדיקה",
    summaryHe: "תקציר",
    ownerId: "u-tzachi",
    ownerName: "צחי זוסטייהם",
    currentVersion: 1,
    status: "טיוטה",
    approvalId: null,
    approvedById: null,
    approvedByName: null,
    effectiveAt: null,
    nextReviewAt: null,
    affectedAgentIds: [],
    affectedOperations: [],
    ...overrides,
  };
}

describe("individual detections", () => {
  it("policy-without-owner fires only when the owner is blank", () => {
    const clean = runGovernanceAuditor({ ...emptyInput(), policies: [makePolicy({})] });
    expect(clean.filter((f) => f.kind === "policy-without-owner")).toHaveLength(0);
    const dirty = runGovernanceAuditor({
      ...emptyInput(),
      policies: [makePolicy({ ownerId: " ", ownerName: "" })],
    });
    expect(dirty.filter((f) => f.kind === "policy-without-owner")).toHaveLength(1);
  });

  it("policy-review-overdue fires when nextReviewAt is in the past", () => {
    const dirty = runGovernanceAuditor({
      ...emptyInput(),
      policies: [makePolicy({ nextReviewAt: "2026-07-01T00:00:00.000Z" })],
    });
    expect(dirty.some((f) => f.kind === "policy-review-overdue")).toBe(true);
    const clean = runGovernanceAuditor({
      ...emptyInput(),
      policies: [makePolicy({ nextReviewAt: "2026-12-01T00:00:00.000Z" })],
    });
    expect(clean.some((f) => f.kind === "policy-review-overdue")).toBe(false);
  });

  it("excessive-permission is quiet — no frozen definition grants a governance domain", () => {
    const findings = runGovernanceAuditor(emptyInput());
    expect(findings.filter((f) => f.kind === "excessive-permission")).toHaveLength(0);
  });

  it("prompt-version-without-approval fires for an active unapproved prompt", () => {
    const pv: PromptVersionRecord = {
      id: "pv-t",
      createdAt: T0,
      updatedAt: T0,
      agentId: "ag-hunter",
      operation: null,
      labelHe: "פרומפט בדיקה",
      version: "v1",
      active: true,
      ownerId: "u-noa",
      ownerName: "נעה פרידמן",
      approvalId: null,
      approvedById: null,
      checksumSha256: "0".repeat(64),
      protectedTextStored: false,
    };
    const dirty = runGovernanceAuditor({ ...emptyInput(), promptVersions: [pv] });
    expect(dirty.some((f) => f.kind === "prompt-version-without-approval")).toBe(true);
    const clean = runGovernanceAuditor({
      ...emptyInput(),
      promptVersions: [{ ...pv, approvalId: "ap-x", approvedById: "u-tzachi" }],
    });
    expect(clean.some((f) => f.kind === "prompt-version-without-approval")).toBe(false);
  });

  it("action-without-evidence fires for an executed approval with no evidence record", () => {
    const approval: Approval = {
      id: "ap-t",
      createdAt: T0,
      updatedAt: T0,
      subjectRef: "agent-task:at-t",
      requestedById: "ag-hunter",
      requestedAt: T0,
      status: "אושר",
      decidedById: "u-tzachi",
      decidedAt: T0,
      note: "בדיקה",
    };
    const exec: AuditEvent = {
      id: "ae-exec",
      createdAt: T0,
      updatedAt: T0,
      at: T0,
      actor: "u-tzachi",
      action: "approval.execute",
      entityRef: "approval:ap-t",
      details: "בוצע",
      correlationId: null,
    };
    const dirty = runGovernanceAuditor({
      ...emptyInput(),
      approvals: [approval],
      audit: [exec],
    });
    expect(dirty.some((f) => f.kind === "action-without-evidence")).toBe(true);
    const clean = runGovernanceAuditor({
      ...emptyInput(),
      approvals: [approval],
      audit: [exec],
      evidence: [
        {
          id: "ev-t",
          createdAt: T0,
          updatedAt: T0,
          subjectRef: "agent-task:at-t",
          sourceType: "entity",
          sourceRef: "lead:l-1",
          claim: "ראיה",
          capturedAt: T0,
        },
      ],
    });
    expect(clean.some((f) => f.kind === "action-without-evidence")).toBe(false);
  });

  it("approval-bypass-attempt fires on blocked executions", () => {
    const dirty = runGovernanceAuditor({
      ...emptyInput(),
      audit: [
        {
          id: "ae-b",
          createdAt: T0,
          updatedAt: T0,
          at: T0,
          actor: "system",
          action: "approval.execute-failed",
          entityRef: "approval:ap-x",
          details: "AGENT_EXECUTION_WITHOUT_APPROVAL",
          correlationId: null,
        },
      ],
    });
    expect(dirty.some((f) => f.kind === "approval-bypass-attempt")).toBe(true);
  });

  it("unresolved-critical-risk fires for open critical risks only", async () => {
    const fx = await bootedGovernance();
    const risks = await fx.stores.risks.list();
    const findings = runGovernanceAuditor({ ...emptyInput(), risks });
    const critical = findings.filter((f) => f.kind === "unresolved-critical-risk");
    // the canonical set has exactly one critical risk (sensitive-data-leak), open
    expect(critical).toHaveLength(1);
    expect(critical[0]?.refs).toEqual(["governance-risk:gr-sensitive-data-leak"]);
  });

  it("audit-coverage-gap fires for a decided approval no audit event references", () => {
    const approval: Approval = {
      id: "ap-gap",
      createdAt: T0,
      updatedAt: T0,
      subjectRef: "agent-task:at-g",
      requestedById: "ag-hunter",
      requestedAt: T0,
      status: "אושר",
      decidedById: "u-tzachi",
      decidedAt: T0,
      note: "ללא ביקורת",
    };
    const dirty = runGovernanceAuditor({ ...emptyInput(), approvals: [approval] });
    expect(dirty.some((f) => f.kind === "audit-coverage-gap")).toBe(true);
    // a pending approval is NOT a gap
    const pending = runGovernanceAuditor({
      ...emptyInput(),
      approvals: [{ ...approval, status: "ממתין", decidedById: null, decidedAt: null }],
    });
    expect(pending.some((f) => f.kind === "audit-coverage-gap")).toBe(false);
  });

  it("learning-rule-prohibited-domain consumes the RuleEffect closed-union guard", () => {
    const rule = (effect: unknown): LearningRule => ({
      id: "rule-t",
      createdAt: T0,
      updatedAt: T0,
      nameHe: "כלל בדיקה",
      insightHe: "תובנה",
      proposalId: "lp-t",
      effect: effect as RuleEffect,
      status: "active",
      currentVersion: 1,
      sampleSize: 2,
      limitationsHe: ["מדגם קטן"],
      approvedById: "u-tzachi",
      approvedByName: "צחי זוסטייהם",
      approvedAt: T0,
      approvalId: "ap-1",
      effectivenessMeasured: false,
      effectivenessHe: null,
    });
    // a legal effect — quiet
    const clean = runGovernanceAuditor({
      ...emptyInput(),
      learningRules: [
        rule({ kind: "suggested-next-action", contextHe: "הקשר", actionHe: "פעולה" }),
      ],
    });
    expect(clean.some((f) => f.kind === "learning-rule-prohibited-domain")).toBe(false);
    // a forbidden-domain effect is INEXPRESSIBLE in the union ⇒ schema fails ⇒ finding
    const dirty = runGovernanceAuditor({
      ...emptyInput(),
      learningRules: [rule({ kind: "permission-change", grant: "approvals" })],
    });
    const found = dirty.filter((f) => f.kind === "learning-rule-prohibited-domain");
    expect(found).toHaveLength(1);
    expect(found[0]?.severityHe).toBe("חמור");
  });
});

describe("full boot state", () => {
  it("after bootstrap: prompt-without-approval + critical-risk findings exist; no false permission findings", async () => {
    const fx = await bootedGovernance();
    const [policies, promptVersions, risks, approvals, audit, evidence, learningRules] =
      await Promise.all([
        fx.stores.policies.list(),
        fx.stores.promptVersions.list(),
        fx.stores.risks.list(),
        fx.stores.approvals.list(),
        fx.stores.audit.list(),
        fx.stores.evidence.list(),
        fx.stores.learningRules.list(),
      ]);
    const findings = runGovernanceAuditor({
      policies,
      promptVersions,
      risks,
      approvals,
      audit,
      evidence,
      learningRules,
      now: NOW,
    });
    expect(findings.some((f) => f.kind === "prompt-version-without-approval")).toBe(true);
    expect(findings.some((f) => f.kind === "unresolved-critical-risk")).toBe(true);
    expect(findings.some((f) => f.kind === "excessive-permission")).toBe(false);
    expect(findings.some((f) => f.kind === "policy-without-owner")).toBe(false);
  });
});
