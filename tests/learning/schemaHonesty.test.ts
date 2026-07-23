// W6-D — schema-level honesty rules (Phase 6.13).
import { describe, expect, it } from "vitest";
import {
  learningProposalSchema,
  learningRuleSchema,
  recommendationOutcomeSchema,
  ruleEffectivenessDisplayHe,
  outcomeDisplayHe,
  LEARNING_UNMEASURED_HE,
  MIN_RULE_SAMPLE_SIZE,
  SINGLE_CASE_MARKER_HE,
} from "@/domain/learning";
import { makeProposal, makeRule } from "./helpers";

describe("proposal honesty rules (schema)", () => {
  it("a valid multi-record proposal parses", () => {
    expect(learningProposalSchema.safeParse(makeProposal()).success).toBe(true);
  });

  it('sampleSize=1 REQUIRES the marker "מקרה יחיד — לא מספיק ליצירת כלל"', () => {
    const missingMarker = makeProposal({
      sampleSize: 1,
      supportingRecordIds: ["ai-recommendation:rec-3"],
      singleCaseMarkerHe: null,
    });
    expect(learningProposalSchema.safeParse(missingMarker).success).toBe(false);

    const withMarker = makeProposal({
      sampleSize: 1,
      supportingRecordIds: ["ai-recommendation:rec-3"],
      singleCaseMarkerHe: SINGLE_CASE_MARKER_HE,
    });
    expect(learningProposalSchema.safeParse(withMarker).success).toBe(true);
  });

  it("the single-case marker is forbidden on multi-record proposals", () => {
    const wrong = makeProposal({ singleCaseMarkerHe: SINGLE_CASE_MARKER_HE });
    expect(learningProposalSchema.safeParse(wrong).success).toBe(false);
  });

  it("sampleSize must equal the supporting-record count — no invented counts", () => {
    const inflated = makeProposal({ sampleSize: 12 });
    expect(learningProposalSchema.safeParse(inflated).success).toBe(false);
  });

  it("correlation is never labeled causation without an evidence ref", () => {
    const fakeCausation = makeProposal({ evidenceBasis: "causation", causationEvidenceRef: null });
    expect(learningProposalSchema.safeParse(fakeCausation).success).toBe(false);

    const realCausation = makeProposal({
      evidenceBasis: "causation",
      causationEvidenceRef: "evidence:ev-3",
    });
    expect(learningProposalSchema.safeParse(realCausation).success).toBe(true);
  });

  it("limitations must be non-empty — honest proposals always state limits", () => {
    const noLimits = makeProposal({ limitationsHe: [] });
    expect(learningProposalSchema.safeParse(noLimits).success).toBe(false);
  });
});

describe("rule honesty rules (schema)", () => {
  it(`a rule can never exist with sampleSize < ${MIN_RULE_SAMPLE_SIZE} (single case blocked at schema level)`, () => {
    expect(learningRuleSchema.safeParse(makeRule({ sampleSize: 1 })).success).toBe(false);
    expect(learningRuleSchema.safeParse(makeRule()).success).toBe(true);
  });

  it('unmeasured effectiveness renders "טרם נמדד" — never a value', () => {
    const rule = makeRule();
    expect(rule.effectivenessMeasured).toBe(false);
    expect(ruleEffectivenessDisplayHe(rule)).toBe(LEARNING_UNMEASURED_HE);
  });

  it("effectiveness text without measurement is rejected", () => {
    const fake = makeRule({ effectivenessMeasured: false, effectivenessHe: "שיפור של 40%" });
    expect(learningRuleSchema.safeParse(fake).success).toBe(false);
  });

  it("measured effectiveness requires a measurement description", () => {
    const empty = makeRule({ effectivenessMeasured: true, effectivenessHe: null });
    expect(learningRuleSchema.safeParse(empty).success).toBe(false);
    const ok = makeRule({
      effectivenessMeasured: true,
      effectivenessHe: "נמדד: 3 מתוך 4 קריאות נפתרו בסדר המומלץ",
    });
    expect(learningRuleSchema.safeParse(ok).success).toBe(true);
  });
});

describe("outcome honesty rules (schema)", () => {
  const baseOutcome = {
    id: "ro-rec-1",
    createdAt: "2026-07-20T08:00:00.000Z",
    updatedAt: "2026-07-20T08:00:00.000Z",
    recommendationId: "rec-1",
    decision: "approved" as const,
    decidedById: "u-tzachi",
    userEditHe: null,
    measuredResult: null,
    measurementMethodHe: null,
    measuredAt: null,
    notesHe: "",
  };

  it("a measured result without a measurement method is rejected", () => {
    const fake = { ...baseOutcome, measuredResult: "success" as const };
    expect(recommendationOutcomeSchema.safeParse(fake).success).toBe(false);
  });

  it("a measured result with method + date parses", () => {
    const ok = {
      ...baseOutcome,
      measuredResult: "success" as const,
      measurementMethodHe: "סטטוס הקריאה עודכן ל'נפתר' על ידי הטכנאי",
      measuredAt: "2026-07-21T08:00:00.000Z",
    };
    expect(recommendationOutcomeSchema.safeParse(ok).success).toBe(true);
  });

  it('an unmeasured outcome displays "טרם נמדד" — never 0/success', () => {
    expect(outcomeDisplayHe(recommendationOutcomeSchema.parse(baseOutcome))).toBe(
      LEARNING_UNMEASURED_HE,
    );
    expect(outcomeDisplayHe(null)).toBe(LEARNING_UNMEASURED_HE);
  });
});
