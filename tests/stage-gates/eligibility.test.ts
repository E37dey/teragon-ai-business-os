// W7-C — every evidence-eligibility rule of the deterministic validator.
import { describe, expect, it } from "vitest";
import type { MetricObservation, TrainingMaterial } from "@/domain/types";
import {
  METRIC_FRESHNESS_DAYS,
  evaluateEvidenceRef,
  validateGate,
} from "@/domain/stage-gates";
import { makeArticle } from "../knowledge/helpers";
import { NOW, defOf, makeCtx, makeGateV2, makeRef } from "./helpers";

const g1 = defOf("G1");
const g1Goal = g1.criteria.find((c) => c.key === "g1-goal");
const g4 = defOf("G4");
const g4Metrics = g4.criteria.find((c) => c.key === "g4-metrics");
const g3 = defOf("G3");
const g3Baseline = g3.criteria.find((c) => c.key === "g3-baseline");
if (!g1Goal || !g4Metrics || !g3Baseline) throw new Error("canonical criteria missing");

function obs(overrides: Partial<MetricObservation>): MetricObservation {
  return {
    id: "mo-t-1",
    createdAt: NOW,
    updatedAt: NOW,
    metricKey: "pilot_adoption",
    observedAt: "2026-07-20T10:00:00.000Z",
    value: 55,
    method: "נמדד ידנית בבדיקה",
    ...overrides,
  };
}

describe("evidence eligibility — knowledge articles", () => {
  it("a DRAFT article is not approved evidence", () => {
    const draft = makeArticle({
      approval: { state: "טיוטה", approvalId: null, decidedById: null, decidedAt: null, noteHe: "" },
    });
    const ctx = makeCtx({ knowledgeArticles: [draft] });
    const out = evaluateEvidenceRef(
      makeRef({ refType: "knowledgeArticle", refId: draft.id, criterionKey: "g1-goal" }),
      g1Goal,
      ctx,
      NOW,
    );
    expect(out.status).toBe("פסולה");
    expect(out.reasonHe).toMatch(/אינו כשיר כראיה/);
  });

  it("an approved + effective article IS eligible", () => {
    const ok = makeArticle();
    const ctx = makeCtx({ knowledgeArticles: [ok] });
    const out = evaluateEvidenceRef(
      makeRef({ refType: "knowledgeArticle", refId: ok.id, criterionKey: "g1-goal" }),
      g1Goal,
      ctx,
      NOW,
    );
    expect(out.status).toBe("תקפה");
    expect(out.reasonHe).toBeNull();
  });
});

describe("evidence eligibility — training materials", () => {
  it("a REJECTED material is invalid evidence", () => {
    const rejected = {
      id: "tm-t-1",
      createdAt: NOW,
      updatedAt: NOW,
      title: "חומר שנדחה",
      description: "",
      kind: "מדריך",
      audiencePersonaIds: [],
      url: null,
      stageId: null,
      approvalState: "נדחה",
    } as TrainingMaterial;
    const crit = defOf("G2").criteria.find((c) => c.key === "g2-core-materials");
    if (!crit) throw new Error("criterion missing");
    const out = evaluateEvidenceRef(
      makeRef({ refType: "trainingMaterial", refId: "tm-t-1", criterionKey: crit.key }),
      crit,
      makeCtx({ trainingMaterials: [rejected] }),
      NOW,
    );
    expect(out.status).toBe("פסולה");
    expect(out.reasonHe).toMatch(/נדחה/);
  });
});

describe("evidence eligibility — metric observations", () => {
  it("an observation without a value is 'טרם נמדד' — never counted", () => {
    const o = obs({ value: null });
    const out = evaluateEvidenceRef(
      makeRef({ refType: "metricObservation", refId: o.id, criterionKey: g3Baseline.key }),
      g3Baseline,
      makeCtx({ metricObservations: [o] }),
      NOW,
    );
    expect(out.status).toBe("פסולה");
    expect(out.reasonHe).toMatch(/טרם נמדד/);
  });

  it(`an observation older than ${METRIC_FRESHNESS_DAYS} days is expired — not current`, () => {
    const o = obs({ observedAt: "2026-03-01T10:00:00.000Z" });
    const out = evaluateEvidenceRef(
      makeRef({ refType: "metricObservation", refId: o.id, criterionKey: g3Baseline.key }),
      g3Baseline,
      makeCtx({ metricObservations: [o] }),
      NOW,
    );
    expect(out.status).toBe("פג תוקף");
  });

  it("a metric-based claim WITHOUT a baseline is blocked", () => {
    const o = obs({});
    const out = evaluateEvidenceRef(
      makeRef({ refType: "metricObservation", refId: o.id, criterionKey: g4Metrics.key }),
      g4Metrics,
      makeCtx({ metricObservations: [o] }),
      NOW,
    );
    expect(out.status).toBe("פסולה");
    expect(out.reasonHe).toMatch(/לא הוגדר קו בסיס/);
  });

  it("the same claim WITH an earlier non-null baseline is valid", () => {
    const baseline = obs({ id: "mo-t-base", observedAt: "2026-07-01T10:00:00.000Z", value: 40 });
    const current = obs({ id: "mo-t-cur" });
    const out = evaluateEvidenceRef(
      makeRef({ refType: "metricObservation", refId: current.id, criterionKey: g4Metrics.key }),
      g4Metrics,
      makeCtx({ metricObservations: [baseline, current] }),
      NOW,
    );
    expect(out.status).toBe("תקפה");
  });
});

describe("evidence eligibility — structural rules", () => {
  it("a ref to a nonexistent record is invalid", () => {
    const out = evaluateEvidenceRef(
      makeRef({ refType: "memoryRecord", refId: "mem-ghost", criterionKey: g1Goal.key }),
      g1Goal,
      makeCtx(),
      NOW,
    );
    expect(out.status).toBe("פסולה");
    expect(out.reasonHe).toMatch(/לא נמצאה/);
  });

  it("a ref whose type is not required by the criterion is invalid", () => {
    const out = evaluateEvidenceRef(
      makeRef({ refType: "persona", refId: "per-1", criterionKey: g1Goal.key }),
      g1Goal,
      makeCtx(),
      NOW,
    );
    expect(out.status).toBe("פסולה");
    expect(out.reasonHe).toMatch(/אינו נדרש/);
  });
});

describe("gate-level honesty blocks", () => {
  it("an unnamed owner blocks the gate", () => {
    const gate = makeGateV2("sg-1", { ownerId: null });
    const v = validateGate(gate, g1, makeCtx(), NOW);
    expect(v.readyForGo).toBe(false);
    expect(v.blockingReasonsHe.some((r) => r.includes("לא הוקצה אחראי"))).toBe(true);
  });

  it("a missing reviewer blocks the gate", () => {
    const gate = makeGateV2("sg-1", { reviewerId: null });
    const v = validateGate(gate, g1, makeCtx(), NOW);
    expect(v.readyForGo).toBe(false);
    expect(v.blockingReasonsHe.some((r) => r.includes("לא הוקצה בודק"))).toBe(true);
  });

  it("G4 without any PilotResult record cannot be ready for Go — THE honesty rule", () => {
    const gate = makeGateV2("sg-4");
    const v = validateGate(gate, g4, makeCtx(), NOW);
    expect(v.readyForGo).toBe(false);
    expect(v.blockingReasonsHe.some((r) => r.includes("PilotResult"))).toBe(true);
  });
});
