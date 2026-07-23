// W7-A — entity schema validation: mandated stage/wave vocabularies, honest
// baselineState consistency, decision-audit invariants, measured-only results.
import { describe, expect, it } from "vitest";
import {
  ADOPTION_STAGE_NAMES,
  ROLLOUT_WAVE_NAMES,
  implementationProgrammeSchema,
  implementationDecisionSchema,
  implementationEvidenceSchema,
  pilotResultSchema,
  rolloutWaveSchema,
} from "@/domain/adoption";
import { freshBootstrapped } from "./helpers";

describe("adoption vocabularies (mandated)", () => {
  it("has exactly the 6 mandated adoption stage names, in order", () => {
    expect(ADOPTION_STAGE_NAMES).toEqual([
      "בעיה ותוצאה עסקית",
      "מפת AS-IS-TO-BE וגבולות אדם-AI",
      "שבע פרסונות ותכנית הדרכה",
      "פיילוט מבוקר",
      "הרחבה בגלים",
      "שגרה בקרה ושיפור מתמשך",
    ]);
  });

  it("has exactly the 5 mandated rollout wave names, in order", () => {
    expect(ROLLOUT_WAVE_NAMES).toEqual([
      "Champions",
      "Early Adopters",
      "מחלקה ראשונה",
      "מחלקות נוספות",
      "הפעלה שגרתית",
    ]);
  });
});

describe("implementationProgrammeSchema", () => {
  it("accepts the bootstrapped programme (round-trip through the real records)", async () => {
    const { programme } = await freshBootstrapped();
    const parsed = implementationProgrammeSchema.safeParse(programme);
    expect(parsed.success, JSON.stringify(parsed.success ? "" : parsed.error.issues)).toBe(true);
  });

  it("rejects a programme with 5 stages (must be exactly 6)", async () => {
    const { programme } = await freshBootstrapped();
    const bad = { ...programme, stages: programme.stages.slice(0, 5) };
    expect(implementationProgrammeSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a dishonest baselineState (metrics null but state 'מתועד')", async () => {
    const { programme } = await freshBootstrapped();
    const bad = { ...programme, baselineState: "קו בסיס מתועד" as const };
    expect(implementationProgrammeSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an 'approved' programme without a canonical approval id", async () => {
    const { programme } = await freshBootstrapped();
    const bad = { ...programme, approvalState: "מאושר" as const, approvalId: null };
    expect(implementationProgrammeSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a wrong stage name in position", async () => {
    const { programme } = await freshBootstrapped();
    const stages = programme.stages.map((s, i) =>
      i === 0 ? { ...s, name: "פיילוט מבוקר" as const } : s,
    );
    expect(implementationProgrammeSchema.safeParse({ ...programme, stages }).success).toBe(false);
  });
});

describe("implementationDecisionSchema — decision audit invariants", () => {
  const base = {
    id: "idec-t",
    createdAt: "2026-07-23T12:00:00.000Z",
    updatedAt: "2026-07-23T12:00:00.000Z",
    programmeId: "iprog-teragon",
    stageId: "as-4",
    gateName: "G4 — הפיילוט הצליח",
    plannedDate: "2026-09-09",
    rationaleHe: "",
    evidenceIds: [],
  };

  it("accepts an honest pending decision (all decision fields null)", () => {
    const ok = { ...base, decision: null, decidedById: null, decidedAt: null };
    expect(implementationDecisionSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects a decided gate WITHOUT a named decider (no anonymous Go)", () => {
    const bad = { ...base, decision: "Go" as const, decidedById: null, decidedAt: null };
    expect(implementationDecisionSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects decider/timestamp without an actual decision", () => {
    const bad = {
      ...base,
      decision: null,
      decidedById: "u-tzachi",
      decidedAt: "2026-07-23T12:00:00.000Z",
    };
    expect(implementationDecisionSchema.safeParse(bad).success).toBe(false);
  });
});

describe("implementationEvidenceSchema", () => {
  it("rejects a linked ref without a named capturer", () => {
    const bad = {
      id: "ie-t",
      createdAt: "2026-07-23T12:00:00.000Z",
      updatedAt: "2026-07-23T12:00:00.000Z",
      programmeId: "iprog-teragon",
      stageId: "as-1",
      requirementHe: "דרישה",
      ref: { collection: "personas", recordId: "per-1", route: "/personas" },
      capturedById: null,
      capturedAt: null,
      noteHe: "",
    };
    expect(implementationEvidenceSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a ref pointing at a non-existent collection key", () => {
    const bad = {
      id: "ie-t2",
      createdAt: "2026-07-23T12:00:00.000Z",
      updatedAt: "2026-07-23T12:00:00.000Z",
      programmeId: "iprog-teragon",
      stageId: "as-1",
      requirementHe: "דרישה",
      ref: { collection: "notARealCollection", recordId: "x", route: "/x" },
      capturedById: "u-tzachi",
      capturedAt: "2026-07-23T12:00:00.000Z",
      noteHe: "",
    };
    expect(implementationEvidenceSchema.safeParse(bad).success).toBe(false);
  });
});

describe("pilotResultSchema — measured-only", () => {
  it("rejects a result without measurement method / measurer (no fabricated success)", () => {
    const bad = {
      id: "pr-t",
      createdAt: "2026-07-23T12:00:00.000Z",
      updatedAt: "2026-07-23T12:00:00.000Z",
      pilotId: "pd-teragon",
      metricKey: "wau",
      measuredValue: 71,
      unit: "%",
      measuredAt: "2026-09-01",
      methodHe: "",
      measuredById: "",
    };
    expect(pilotResultSchema.safeParse(bad).success).toBe(false);
  });
});

describe("rolloutWaveSchema", () => {
  it("rejects a wave name outside the mandated 5", () => {
    const bad = {
      id: "rw-t",
      createdAt: "2026-07-23T12:00:00.000Z",
      updatedAt: "2026-07-23T12:00:00.000Z",
      programmeId: "iprog-teragon",
      order: 1,
      name: "Big Bang",
      audienceHe: "כולם",
      plannedStart: null,
      status: "לא התחיל",
      entryCriteria: [],
    };
    expect(rolloutWaveSchema.safeParse(bad).success).toBe(false);
  });
});
