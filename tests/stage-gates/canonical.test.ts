// W7-C — the exactly-6 guard + no-percentage-pass guarantees.
import { describe, expect, it } from "vitest";
import {
  CANONICAL_STAGE_GATES,
  STAGE_GATE_KEYS,
  STAGE_GATE_V2_STATES,
  validateGate,
} from "@/domain/stage-gates";
import { NOW, defOf, makeCtx, makeGateV2 } from "./helpers";

describe("canonical stage gates — exactly six", () => {
  it("has EXACTLY 6 gates, keys G1..G6", () => {
    expect(CANONICAL_STAGE_GATES).toHaveLength(6);
    expect(CANONICAL_STAGE_GATES.map((d) => d.gateKey)).toEqual([...STAGE_GATE_KEYS]);
    expect(STAGE_GATE_KEYS).toEqual(["G1", "G2", "G3", "G4", "G5", "G6"]);
  });

  it("carries the mandated Hebrew names in order", () => {
    expect(CANONICAL_STAGE_GATES.map((d) => d.nameHe)).toEqual([
      "מוכנות",
      "עיצוב הדרכה",
      "פיילוט מוכן",
      "הפיילוט הצליח",
      "מוכן להרחבה",
      "הפעלה שגרתית",
    ]);
  });

  it("bridges onto exactly the six seeded records sg-1..sg-6", () => {
    expect(CANONICAL_STAGE_GATES.map((d) => d.legacyId)).toEqual([
      "sg-1",
      "sg-2",
      "sg-3",
      "sg-4",
      "sg-5",
      "sg-6",
    ]);
  });

  it("defines exactly the 7 gate states", () => {
    expect(STAGE_GATE_V2_STATES).toEqual([
      "לא התחיל",
      "בבדיקה",
      "חסרות ראיות",
      "Go",
      "No-Go",
      "פג תוקף",
      "נפתח מחדש",
    ]);
  });

  it("every criterion demands typed refs with a positive minimum — no free-text evidence", () => {
    for (const def of CANONICAL_STAGE_GATES) {
      expect(def.criteria.length).toBeGreaterThan(0);
      for (const c of def.criteria) {
        expect(c.requiredRefTypes.length).toBeGreaterThan(0);
        expect(c.minCount).toBeGreaterThan(0);
        expect(c.evidenceExamplesHe.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("no percentage-based pass path", () => {
  it("the gate definitions contain no percent/progress field", () => {
    const json = JSON.stringify(CANONICAL_STAGE_GATES);
    expect(json).not.toMatch(/percent/i);
    expect(json).not.toMatch(/progress/i);
  });

  it("validation output exposes no percent/progress key", () => {
    const v = validateGate(makeGateV2("sg-1"), defOf("G1"), makeCtx(), NOW);
    for (const key of Object.keys(v)) {
      expect(key).not.toMatch(/percent|progress/i);
    }
  });

  it("a legacy record marked 'עבר' does NOT make the V2 gate Go without evidence", () => {
    const gate = makeGateV2("sg-1", {}, "עבר");
    const v = validateGate(gate, defOf("G1"), makeCtx(), NOW);
    expect(v.state).not.toBe("Go");
    expect(v.readyForGo).toBe(false);
    expect(v.blockingReasonsHe.length).toBeGreaterThan(0);
  });
});
