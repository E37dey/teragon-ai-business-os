import { describe, expect, it } from "vitest";
import {
  defaultStepForStage,
  JOURNEY_STEPS,
  journeyConversion,
  journeyCounts,
  journeyStepOf,
  loadJourneyPositions,
  nextStep,
  saveJourneyPositions,
  stuckDeals,
} from "@/modules/sales/journey";
import type { Opportunity } from "@/domain/types";

function opp(id: string, overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    id,
    createdAt: "2026-07-01T08:00:00.000Z",
    updatedAt: "2026-07-01T08:00:00.000Z",
    name: `עסקה ${id}`,
    leadId: null,
    customerId: null,
    stage: "זיהוי",
    amount: 1000,
    expectedClose: "2026-08-01",
    ownerId: "u-1",
    notes: "",
    ...overrides,
  };
}

describe("journey model", () => {
  it("has exactly the 10 RTL journey steps in order", () => {
    expect(JOURNEY_STEPS.map((s) => s.label)).toEqual([
      "פנייה חדשה",
      "אבחון צרכים",
      "התאמת מדפסת",
      "שיחת ייעוץ",
      "הצעת מחיר",
      "ממתין להחלטה",
      "הזמנה אושרה",
      "אספקה והתקנה",
      "הדרכה ראשונית",
      "ליווי לאחר רכישה",
    ]);
  });

  it("maps coarse stages to sensible default steps", () => {
    expect(defaultStepForStage("זיהוי")).toBe("j1");
    expect(defaultStepForStage("הצעה")).toBe("j5");
    expect(defaultStepForStage("נסגרה - זכייה")).toBe("j7");
  });

  it("nextStep walks the journey and stops at the end", () => {
    expect(nextStep("j1")?.id).toBe("j2");
    expect(nextStep("j10")).toBeNull();
    expect(nextStep("nope")).toBeNull();
  });

  it("journeyStepOf prefers the stored fine position but never regresses behind the coarse stage", () => {
    const o = opp("a", { stage: "הצעה" });
    expect(journeyStepOf(o, {})).toBe("j5");
    expect(journeyStepOf(o, { a: "j6" })).toBe("j6");
    // stored j2 contradicts coarse "הצעה" (j5) → derived wins
    expect(journeyStepOf(o, { a: "j2" })).toBe("j5");
  });

  it("journeyCounts skips lost deals", () => {
    const counts = journeyCounts(
      [opp("a"), opp("b", { stage: "נסגרה - הפסד" }), opp("c", { stage: "משא ומתן" })],
      {},
    );
    expect(counts["j1"]).toBe(1);
    expect(counts["j6"]).toBe(1);
    expect(Object.values(counts).reduce((s, n) => s + n, 0)).toBe(2);
  });
});

describe("journey persistence", () => {
  it("round-trips positions and drops invalid step ids", () => {
    const mem = new Map<string, string>();
    const storage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
    };
    saveJourneyPositions({ "opp-1": "j4", "opp-2": "bogus" }, storage);
    const loaded = loadJourneyPositions(storage);
    expect(loaded["opp-1"]).toBe("j4");
    expect(loaded["opp-2"]).toBeUndefined();
  });
});

describe("conversion + stuck deals", () => {
  it("winRate null when nothing decided", () => {
    expect(journeyConversion([opp("a")]).winRate).toBeNull();
  });

  it("winRate from decided cohort, openValue from open deals only", () => {
    const c = journeyConversion([
      opp("a", { stage: "נסגרה - זכייה", amount: 500 }),
      opp("b", { stage: "נסגרה - הפסד", amount: 900 }),
      opp("c", { stage: "משא ומתן", amount: 700 }),
    ]);
    expect(c.winRate).toBe(50);
    expect(c.openValue).toBe(700);
    expect(c.open).toBe(1);
  });

  it("stuckDeals: open deals past expectedClose, most overdue first", () => {
    const stuck = stuckDeals(
      [
        opp("a", { expectedClose: "2026-07-20" }),
        opp("b", { expectedClose: "2026-07-01" }),
        opp("c", { expectedClose: "2026-07-01", stage: "נסגרה - זכייה" }),
        opp("d", { expectedClose: "2026-07-30" }),
      ],
      "2026-07-22",
    );
    expect(stuck.map((s) => s.opp.id)).toEqual(["b", "a"]);
    expect(stuck[0]?.daysOverdue).toBe(21);
  });
});
