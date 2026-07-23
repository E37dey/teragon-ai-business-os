// TERAGON AI BUSINESS OS — policy lifecycle (Wave 8, W8-B).
// Policies are NEVER auto-approved: bootstrap creates drafts, submission opens
// a canonical Approval ('permanent-knowledge-update'-style, recommendation-only
// payload — nothing executes by machine), and only a NAMED human decision via
// the ONE ApprovalEngine moves a policy to "פעילה". Versions are append-only
// (the store throws on update/remove) with a sha-256 content checksum.
import type { ApprovalEngine } from "@/agents";
import {
  governancePolicySchema,
  governancePolicyVersionSchema,
  type GovernancePolicy,
  type GovernancePolicyVersion,
  type PolicySection,
} from "@/domain/governance";
import type { GovernanceStores } from "@/repositories/governanceStores";
import { sha256Hex } from "./checksum";
import { GovernanceError } from "./errors";
import { CANONICAL_POLICIES, type CanonicalPolicyDef } from "./policySet";
import { writeGovernanceAudit, type Clock } from "./riskRegister";

/** The dedicated run id all governance approvals hang off. */
export const GOVERNANCE_RUN_ID = "governance-w8b";

/** Days until the next mandatory review of an approved policy. */
export const POLICY_REVIEW_INTERVAL_DAYS = 90;

/** Canonical content checksum of a policy version (tamper evidence). */
export function policyContentChecksum(
  policyId: string,
  version: number,
  titleHe: string,
  sections: readonly PolicySection[],
): string {
  return sha256Hex(JSON.stringify({ policyId, version, titleHe, sections }));
}

function policyId(def: CanonicalPolicyDef): string {
  return `gp-${def.key}`;
}

/**
 * Bootstrap one canonical policy as a DRAFT (+ immutable v1). When
 * submitForReview is set, a canonical Approval is opened and the status is
 * "ממתין לבדיקה" — still NOT approved, effectiveAt stays null.
 */
async function bootstrapPolicy(
  stores: GovernanceStores,
  engine: ApprovalEngine,
  def: CanonicalPolicyDef,
  clock: Clock,
): Promise<boolean> {
  const id = policyId(def);
  if (await stores.policies.get(id)) return false;
  const ts = clock();

  let approvalId: string | null = null;
  if (def.submitForReview) {
    const approval = await engine.requestApproval({
      runId: GOVERNANCE_RUN_ID,
      subjectRef: `governance-policy:${id}`,
      action: "permanent-knowledge-update",
      requestedById: "governance-bootstrap",
      executionPayload: null, // recommendation-only — nothing executes by machine
      previewHe: `הפעלת מדיניות: ${def.titleHe}`,
    });
    approvalId = approval.id;
  }

  const policy: GovernancePolicy = governancePolicySchema.parse({
    id,
    createdAt: ts,
    updatedAt: ts,
    key: def.key,
    titleHe: def.titleHe,
    summaryHe: def.summaryHe,
    ownerId: def.ownerId,
    ownerName: def.ownerName,
    currentVersion: 1,
    status: def.submitForReview ? "ממתין לבדיקה" : "טיוטה",
    approvalId,
    approvedById: null,
    approvedByName: null,
    effectiveAt: null, // null until a NAMED human approves
    nextReviewAt: null,
    affectedAgentIds: def.affectedAgentIds,
    affectedOperations: def.affectedOperations,
  } satisfies GovernancePolicy);
  await stores.policies.create(policy);

  const version: GovernancePolicyVersion = governancePolicyVersionSchema.parse({
    id: `${id}-v1`,
    createdAt: ts,
    updatedAt: ts,
    policyId: id,
    version: 1,
    titleHe: def.titleHe,
    sections: def.sections,
    changeReasonHe: "גרסה ראשונה — נוסח קנוני (Wave 8)",
    createdById: def.ownerId,
    checksumSha256: policyContentChecksum(id, 1, def.titleHe, def.sections),
  } satisfies GovernancePolicyVersion);
  await stores.policyVersions.create(version);
  return true;
}

/** Idempotent bootstrap of all 10 canonical policies. */
export async function bootstrapPolicies(
  stores: GovernanceStores,
  engine: ApprovalEngine,
  clock: Clock,
): Promise<number> {
  let created = 0;
  for (const def of CANONICAL_POLICIES) {
    if (await bootstrapPolicy(stores, engine, def, clock)) created += 1;
  }
  return created;
}

/** Submit a draft policy for review — opens the canonical Approval. */
export async function submitPolicyForReview(
  stores: GovernanceStores,
  engine: ApprovalEngine,
  input: { policyId: string; requestedById: string },
  clock: Clock,
): Promise<GovernancePolicy> {
  const policy = await stores.policies.get(input.policyId);
  if (!policy) {
    throw new GovernanceError("GOV_POLICY_NOT_FOUND", `מדיניות "${input.policyId}" לא נמצאה`);
  }
  if (policy.status !== "טיוטה") {
    throw new GovernanceError(
      "GOV_POLICY_NOT_DRAFT",
      `רק טיוטה ניתנת להגשה לבדיקה (מצב נוכחי: ${policy.status})`,
    );
  }
  const approval = await engine.requestApproval({
    runId: GOVERNANCE_RUN_ID,
    subjectRef: `governance-policy:${policy.id}`,
    action: "permanent-knowledge-update",
    requestedById: input.requestedById,
    executionPayload: null,
    previewHe: `הפעלת מדיניות: ${policy.titleHe}`,
  });
  const ts = clock();
  const updated = await stores.policies.update(policy.id, {
    status: "ממתין לבדיקה",
    approvalId: approval.id,
    updatedAt: ts,
  });
  await writeGovernanceAudit(stores, clock, {
    actor: input.requestedById,
    action: "governance.policy-submitted",
    entityRef: `governance-policy:${policy.id}`,
    detailsHe: `המדיניות "${policy.titleHe}" הוגשה לבדיקה`,
    correlationId: policy.id,
  });
  return updated;
}

export interface PolicyDecisionInput {
  policyId: string;
  decidedById: string;
  decidedByName: string;
  noteHe?: string;
}

async function requireReviewablePolicy(
  stores: GovernanceStores,
  input: PolicyDecisionInput,
): Promise<GovernancePolicy> {
  const policy = await stores.policies.get(input.policyId);
  if (!policy) {
    throw new GovernanceError("GOV_POLICY_NOT_FOUND", `מדיניות "${input.policyId}" לא נמצאה`);
  }
  if (policy.status !== "ממתין לבדיקה" || !policy.approvalId) {
    throw new GovernanceError(
      "GOV_POLICY_NOT_PENDING",
      `המדיניות "${policy.titleHe}" אינה ממתינה לבדיקה (מצב: ${policy.status}) — אין אישור אוטומטי ואין קיצור דרך`,
    );
  }
  if (!input.decidedById.trim() || !input.decidedByName.trim()) {
    throw new GovernanceError("GOV_APPROVER_NOT_NAMED", "אישור מדיניות מחייב מאשר בשם — אין אישור אנונימי");
  }
  return policy;
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

/**
 * Approve a pending policy ⇒ "פעילה". The decision goes through
 * ApprovalEngine.decide — a bypass (missing/decided approval) throws there.
 */
export async function approvePolicy(
  stores: GovernanceStores,
  engine: ApprovalEngine,
  input: PolicyDecisionInput,
  clock: Clock,
): Promise<GovernancePolicy> {
  const policy = await requireReviewablePolicy(stores, input);
  await engine.decide({
    runId: GOVERNANCE_RUN_ID,
    approvalId: policy.approvalId as string,
    kind: "approve",
    decidedById: input.decidedById,
    noteHe: input.noteHe,
  });
  const ts = clock();
  const updated = await stores.policies.update(policy.id, {
    status: "פעילה",
    approvedById: input.decidedById,
    approvedByName: input.decidedByName,
    effectiveAt: ts,
    nextReviewAt: addDays(ts, POLICY_REVIEW_INTERVAL_DAYS),
    updatedAt: ts,
  });
  await writeGovernanceAudit(stores, clock, {
    actor: input.decidedById,
    action: "governance.policy-approved",
    entityRef: `governance-policy:${policy.id}`,
    detailsHe: `המדיניות "${policy.titleHe}" אושרה והופעלה על ידי ${input.decidedByName} (גרסה ${policy.currentVersion})`,
    correlationId: policy.id,
  });
  return updated;
}

/** Reject a pending policy — reason mandatory (here AND in the engine). */
export async function rejectPolicy(
  stores: GovernanceStores,
  engine: ApprovalEngine,
  input: PolicyDecisionInput & { reasonHe: string },
  clock: Clock,
): Promise<GovernancePolicy> {
  const policy = await requireReviewablePolicy(stores, input);
  if (!input.reasonHe.trim()) {
    throw new GovernanceError("GOV_REASON_REQUIRED", "דחיית מדיניות מחייבת נימוק");
  }
  await engine.decide({
    runId: GOVERNANCE_RUN_ID,
    approvalId: policy.approvalId as string,
    kind: "reject",
    decidedById: input.decidedById,
    noteHe: input.reasonHe,
  });
  const ts = clock();
  const updated = await stores.policies.update(policy.id, {
    status: "טיוטה",
    approvalId: null,
    updatedAt: ts,
  });
  await writeGovernanceAudit(stores, clock, {
    actor: input.decidedById,
    action: "governance.policy-rejected",
    entityRef: `governance-policy:${policy.id}`,
    detailsHe: `המדיניות "${policy.titleHe}" נדחתה: ${input.reasonHe}`,
    correlationId: policy.id,
  });
  return updated;
}

/**
 * Append a NEW immutable version (never edits an existing one) and bump the
 * policy's currentVersion. An active policy returns to "ממתין לבדיקה"?
 * No — honesty: a content change INVALIDATES the approval, so the policy
 * returns to טיוטה and must be re-submitted and re-approved by name.
 */
export async function revisePolicy(
  stores: GovernanceStores,
  input: {
    policyId: string;
    titleHe: string;
    sections: PolicySection[];
    changeReasonHe: string;
    actorId: string;
  },
  clock: Clock,
): Promise<GovernancePolicyVersion> {
  const policy = await stores.policies.get(input.policyId);
  if (!policy) {
    throw new GovernanceError("GOV_POLICY_NOT_FOUND", `מדיניות "${input.policyId}" לא נמצאה`);
  }
  if (!input.changeReasonHe.trim()) {
    throw new GovernanceError("GOV_REASON_REQUIRED", "גרסה חדשה מחייבת נימוק שינוי");
  }
  const ts = clock();
  const version = policy.currentVersion + 1;
  const record: GovernancePolicyVersion = governancePolicyVersionSchema.parse({
    id: `${policy.id}-v${version}`,
    createdAt: ts,
    updatedAt: ts,
    policyId: policy.id,
    version,
    titleHe: input.titleHe,
    sections: input.sections,
    changeReasonHe: input.changeReasonHe,
    createdById: input.actorId,
    checksumSha256: policyContentChecksum(policy.id, version, input.titleHe, input.sections),
  } satisfies GovernancePolicyVersion);
  const created = await stores.policyVersions.create(record);
  await stores.policies.update(policy.id, {
    currentVersion: version,
    titleHe: input.titleHe,
    // content change invalidates any standing approval — back to draft
    status: "טיוטה",
    approvalId: null,
    approvedById: null,
    approvedByName: null,
    effectiveAt: null,
    nextReviewAt: null,
    updatedAt: ts,
  });
  await writeGovernanceAudit(stores, clock, {
    actor: input.actorId,
    action: "governance.policy-revised",
    entityRef: `governance-policy:${policy.id}`,
    detailsHe: `נוצרה גרסה ${version} למדיניות "${input.titleHe}" — האישור הקודם בוטל, נדרש אישור מחדש`,
    correlationId: policy.id,
  });
  return created;
}
