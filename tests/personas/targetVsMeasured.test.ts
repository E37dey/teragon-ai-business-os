// W7-B — target ≠ measured separation: numeric target only where the spec
// defines one (80% for משתמש קצה), honest notes everywhere else, and NO
// measured value anywhere ("טרם נמדד").
import { describe, expect, it } from "vitest";
import {
  NO_NUMERIC_TARGET,
  NOT_MEASURED,
  PERSONA_V2_DEFINITIONS,
} from "@/domain/personas";

describe("success metric — target vs measured separation", () => {
  it("משתמש קצה carries the spec-defined 80% target", () => {
    const endUser = PERSONA_V2_DEFINITIONS.find((p) => p.name === "משתמש קצה")!;
    expect(endUser.successMetric.numericTarget).toBe(80);
    expect(endUser.successMetric.unit).toBe("%");
    expect(endUser.successMetric.targetNote).toContain("80%");
  });

  it("every other persona has NO invented numeric target — honest note instead", () => {
    for (const p of PERSONA_V2_DEFINITIONS.filter((x) => x.name !== "משתמש קצה")) {
      expect(p.successMetric.numericTarget, p.name).toBeNull();
      expect(p.successMetric.unit, p.name).toBeNull();
      expect(p.successMetric.targetNote, p.name).toContain(NO_NUMERIC_TARGET);
    }
  });

  it("NO persona has a measured value — measurement is honestly 'טרם נמדד'", () => {
    for (const p of PERSONA_V2_DEFINITIONS) {
      expect(p.successMetric.measuredValue, p.name).toBeNull();
      expect(p.successMetric.measuredNote, p.name).toBe(NOT_MEASURED);
    }
  });

  it("a target is never presented as a measurement (fields are distinct)", () => {
    for (const p of PERSONA_V2_DEFINITIONS) {
      if (p.successMetric.numericTarget !== null) {
        expect(p.successMetric.measuredValue).not.toBe(p.successMetric.numericTarget);
      }
    }
  });
});
