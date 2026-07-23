// W6-D — deterministic derivation of the loop from EXISTING seed records
// (Phase 6.14): observations/outcomes/proposals are derived, never invented.
import { describe, expect, it } from "vitest";
import { AI_RECOMMENDATIONS, APPROVALS, EVIDENCE } from "@/repositories/seed";
import {
  learningProposalSchema,
  SINGLE_CASE_MARKER_HE,
} from "@/domain/learning";
import {
  deriveObservations,
  deriveOutcomes,
  deriveProposals,
  syncObservations,
  syncOutcomes,
} from "@/learning";
import { freshLearning, REVIEWER } from "./helpers";

describe("deriveObservations — from seed aiRecommendations + approvals", () => {
  it("is deterministic: same records in ⇒ identical observations out", () => {
    const a = deriveObservations(AI_RECOMMENDATIONS, APPROVALS);
    const b = deriveObservations(AI_RECOMMENDATIONS, APPROVALS);
    expect(a).toEqual(b);
  });

  it("derives exactly the observations the seed records honestly support", () => {
    const obs = deriveObservations(AI_RECOMMENDATIONS, APPROVALS);
    const byId = new Map(obs.map((o) => [o.id, o]));

    // rec-1 waits on the PENDING ap-1 — no decision, therefore NO observation
    expect(byId.has("lo-rec-1")).toBe(false);

    // rec-2: service solution matched to a knowledge record (ticket entityRef)
    expect(byId.get("lo-rec-2")?.origin).toBe("repeated-service-solution");
    expect(byId.get("lo-rec-2")?.businessDomain).toBe("שירות");
    expect(byId.get("lo-rec-2")?.sourceRef).toBe("ai-recommendation:rec-2");

    // rec-3: training outcome (enrollment entityRef)
    expect(byId.get("lo-rec-3")?.origin).toBe("training-outcome");
    expect(byId.get("lo-rec-3")?.businessDomain).toBe("הדרכה");

    // ap-3: a DECIDED approval (אושר) not referenced by any recommendation
    expect(byId.get("lo-ap-3")?.origin).toBe("recommendation-approved");
    expect(byId.get("lo-ap-3")?.sourceRef).toBe("approval:ap-3");

    // pending approvals (ap-1, ap-2) yield nothing
    expect(byId.has("lo-ap-1")).toBe(false);
    expect(byId.has("lo-ap-2")).toBe(false);
  });
});

describe("deriveOutcomes — honest: nothing measured ⇒ null, never success", () => {
  it("creates one outcome per recommendation, all unmeasured", () => {
    const outcomes = deriveOutcomes(AI_RECOMMENDATIONS, APPROVALS);
    expect(outcomes.map((o) => o.id)).toEqual(["ro-rec-1", "ro-rec-2", "ro-rec-3"]);
    for (const o of outcomes) {
      expect(o.measuredResult).toBeNull();
      expect(o.measurementMethodHe).toBeNull();
    }
    // rec-1 hangs on the pending ap-1
    expect(outcomes[0]?.decision).toBe("pending");
  });

  it("is deterministic", () => {
    expect(deriveOutcomes(AI_RECOMMENDATIONS, APPROVALS)).toEqual(
      deriveOutcomes(AI_RECOMMENDATIONS, APPROVALS),
    );
  });
});

describe("deriveProposals — deterministic aggregation with honest sampleSize", () => {
  const observations = deriveObservations(AI_RECOMMENDATIONS, APPROVALS);

  it("is deterministic and schema-valid", () => {
    const a = deriveProposals(observations, EVIDENCE, REVIEWER);
    const b = deriveProposals(observations, EVIDENCE, REVIEWER);
    expect(a).toEqual(b);
    for (const draft of a) {
      expect(learningProposalSchema.safeParse(draft.proposal).success).toBe(true);
    }
  });

  it("the service proposal counts its real supporting records (obs + knowledge evidence)", () => {
    const drafts = deriveProposals(observations, EVIDENCE, REVIEWER);
    const service = drafts.find((d) => d.proposal.id === "lp-service-warping");
    expect(service).toBeDefined();
    expect(service?.proposal.sampleSize).toBe(service?.proposal.supportingRecordIds.length);
    expect(service?.proposal.sampleSize).toBe(2);
    expect(service?.proposal.singleCaseMarkerHe).toBeNull();
    expect(service?.proposal.evidenceBasis).toBe("correlation");
    expect(service?.proposal.namedReviewerId).toBe(REVIEWER.id);
  });

  it("the single-record training proposal carries the MANDATORY single-case marker", () => {
    const drafts = deriveProposals(observations, EVIDENCE, REVIEWER);
    const training = drafts.find((d) => d.proposal.id === "lp-training-first-check");
    expect(training?.proposal.sampleSize).toBe(1);
    expect(training?.proposal.singleCaseMarkerHe).toBe(SINGLE_CASE_MARKER_HE);
    expect(training?.proposal.limitationsHe).toContain(SINGLE_CASE_MARKER_HE);
  });
});

describe("sync* — idempotent persistence through repositories", () => {
  it("running syncObservations twice never duplicates records", async () => {
    const { stores } = freshLearning();
    const first = await syncObservations(stores);
    const second = await syncObservations(stores);
    expect(second.length).toBe(first.length);
    expect(first.length).toBeGreaterThan(0);
  });

  it("running syncOutcomes twice never duplicates records", async () => {
    const { stores } = freshLearning();
    const first = await syncOutcomes(stores);
    const second = await syncOutcomes(stores);
    expect(second.length).toBe(first.length);
  });
});
