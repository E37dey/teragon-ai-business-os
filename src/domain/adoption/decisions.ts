// TERAGON AI BUSINESS OS — Go/No-Go gate decisions (W7-A, 7.1).
// A gate NEVER passes on a progress percentage: "Go" requires EVERY evidence
// requirement of the stage to be eligible (real record, approved where
// applicable). Every decision writes an AuditEvent — full decision audit.
import type { AuditEvent, BaseEntity } from "@/domain/types";
import type { ImplementationStores } from "@/repositories/implementationStores";
import type { Clock } from "./bootstrap";
import { evidenceEligibility, type EvidenceEligibility } from "./evidenceEligibility";
import type { ImplementationDecision, ImplementationEvidence } from "./types";

export interface EvidenceWithEligibility {
  evidence: ImplementationEvidence;
  eligibility: EvidenceEligibility;
}

/** Resolve each evidence row's typed ref against the real collections. */
export async function resolveEvidence(
  stores: ImplementationStores,
  rows: ImplementationEvidence[],
): Promise<EvidenceWithEligibility[]> {
  return Promise.all(
    rows.map(async (evidence) => {
      let record: BaseEntity | null = null;
      if (evidence.ref !== null) {
        record = (await stores.collection(evidence.ref.collection).get(evidence.ref.recordId)) ?? null;
      }
      return { evidence, eligibility: evidenceEligibility(evidence, record) };
    }),
  );
}

export class GateDecisionError extends Error {
  readonly blockers: string[];
  constructor(message: string, blockers: string[]) {
    super(message);
    this.name = "GateDecisionError";
    this.blockers = blockers;
  }
}

export interface DecideGateInput {
  decisionId: string;
  decision: "Go" | "No-Go";
  decidedById: string;
  rationaleHe: string;
}

/**
 * Decide a gate. "Go" is REFUSED (GateDecisionError) while any evidence
 * requirement of the decision is missing or ineligible — no gate passes on
 * a percentage. "No-Go" is always recordable but requires a rationale.
 * Both outcomes append an AuditEvent (decision audit trail).
 */
export async function decideGate(
  stores: ImplementationStores,
  input: DecideGateInput,
  clock: Clock = () => new Date().toISOString(),
): Promise<ImplementationDecision> {
  const decision = await stores.decisions.get(input.decisionId);
  if (!decision) throw new Error(`decideGate: החלטה ${input.decisionId} לא נמצאה`);
  if (decision.decision !== null) {
    throw new Error(`decideGate: השער ${decision.gateName} כבר הוכרע (${decision.decision})`);
  }
  if (input.rationaleHe.trim() === "") {
    throw new Error("decideGate: החלטת שער חייבת נימוק");
  }
  const decider = await stores.users.get(input.decidedById);
  if (!decider) {
    throw new Error("decideGate: המחליט חייב להיות משתמש בשם במערכת");
  }

  const allEvidence = await stores.evidence.list();
  const rows = allEvidence.filter((e) => decision.evidenceIds.includes(e.id));
  const resolved = await resolveEvidence(stores, rows);
  const blockers = resolved
    .filter((r) => !r.eligibility.eligible)
    .map((r) => `${r.evidence.requirementHe} — ${r.eligibility.statusHe}`);

  if (input.decision === "Go" && blockers.length > 0) {
    throw new GateDecisionError(
      `אי אפשר להכריע Go בשער ${decision.gateName} — ${blockers.length} דרישות ראיה אינן קבילות`,
      blockers,
    );
  }

  const now = clock();
  const updated = await stores.decisions.update(decision.id, {
    decision: input.decision,
    decidedById: input.decidedById,
    decidedAt: now,
    rationaleHe: input.rationaleHe,
    updatedAt: now,
  });

  const audit: AuditEvent = {
    id: `ae-idec-${decision.id}-${now}`,
    createdAt: now,
    updatedAt: now,
    at: now,
    actor: input.decidedById,
    action: `החלטת שער ${decision.gateName}: ${input.decision}`,
    entityRef: `implementationDecision:${decision.id}`,
    details: input.rationaleHe,
    correlationId: null,
  };
  await stores.audit.create(audit);
  return updated;
}
