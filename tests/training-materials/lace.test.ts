// W7-D — objections + LACE structure + simulator honesty guards (7.14).
import { describe, expect, it } from "vitest";
import {
  __resetLaceSeqForTests,
  CANONICAL_OBJECTIONS,
  evaluateLaceResponse,
  LACE_SIMULATOR_HONESTY_LABEL,
  laceEnvelope,
  MANDATED_OBJECTION_STATEMENTS,
  OBJECTIONS_CONTENT_VERSION,
  upgradeObjections,
  type ObjectionRecord,
} from "@/domain/training-materials";

const NOW = "2026-07-23T10:00:00.000Z";

function materialize(): ObjectionRecord[] {
  return upgradeObjections([], NOW, (i) => `obj-${i + 1}`).records;
}

describe("objections workspace (7.14)", () => {
  it("has AT LEAST the 7 mandated objections", () => {
    expect(CANONICAL_OBJECTIONS.length).toBeGreaterThanOrEqual(7);
    const statements = CANONICAL_OBJECTIONS.map((o) => o.surfaceStatement);
    for (const mandated of MANDATED_OBJECTION_STATEMENTS) {
      expect(statements).toContain(mandated);
    }
  });

  it("every objection is structurally complete — LACE, persona, owner, evidence, follow-up", () => {
    for (const o of CANONICAL_OBJECTIONS) {
      expect(o.underlyingConcern.length, o.key).toBeGreaterThan(10);
      expect(o.personaId, o.key).toMatch(/^per-[1-7]$/);
      expect(o.relatedRisk.length, o.key).toBeGreaterThan(10);
      expect(o.lace.listenHe.length, `${o.key} listen`).toBeGreaterThan(15);
      expect(o.lace.acknowledgeHe.length, `${o.key} acknowledge`).toBeGreaterThan(15);
      expect(o.lace.confirmHe.length, `${o.key} confirm`).toBeGreaterThan(15);
      expect(o.lace.exploreHe.length, `${o.key} explore`).toBeGreaterThan(30);
      expect(o.supportingEvidence.length, o.key).toBeGreaterThan(0);
      expect(o.relatedMaterialId, o.key).toMatch(/^tm-\d+$/);
      expect(o.ownerId, o.key).toBeTruthy();
      expect(o.followUpQuestion, o.key).toContain("?");
      // honest review status until a real conversation happened
      expect(o.reviewStatus).toBe("טרם נבדק בשטח");
    }
  });

  it("bridges idempotently into the objections collection shape", () => {
    const first = upgradeObjections([], NOW, (i) => `obj-${i + 1}`);
    expect(first.createdKeys).toHaveLength(CANONICAL_OBJECTIONS.length);
    const second = upgradeObjections(first.records, NOW, (i) => `obj-x-${i}`);
    expect(second.createdKeys).toHaveLength(0);
    expect(second.updatedKeys).toHaveLength(0);
    expect(second.records).toEqual(first.records);
  });

  it("content upgrades preserve a human-set review status", () => {
    const first = upgradeObjections([], NOW, (i) => `obj-${i + 1}`);
    const reviewed = first.records.map((o) =>
      o.key === "obj-no-trust"
        ? { ...o, reviewStatus: "נבדק בשיחה אמיתית" as const, contentVersion: OBJECTIONS_CONTENT_VERSION - 1 }
        : o,
    );
    const second = upgradeObjections(reviewed, NOW, (i) => `obj-${i + 1}`);
    const target = second.records.find((o) => o.key === "obj-no-trust");
    expect(second.updatedKeys).toEqual(["obj-no-trust"]);
    expect(target?.reviewStatus).toBe("נבדק בשיחה אמיתית");
  });
});

describe("LACE simulator — deterministic detection, no fake score (7.14)", () => {
  const objection = materialize()[0];
  if (!objection) throw new Error("no objection materialized");

  it("detects dismissive wording (ביטול)", () => {
    const result = evaluateLaceResponse(objection, "שטויות, אין מה לדאוג, פשוט תתרגל");
    expect(result.warnings.some((w) => w.rule === "ביטול")).toBe(true);
    expect(result.suggestions.length).toBeGreaterThan(0);
  });

  it("detects over-promising (הבטחת-יתר)", () => {
    const result = evaluateLaceResponse(objection, "המערכת אף פעם לא טועה, היא מדויקת 100%");
    expect(result.warnings.some((w) => w.rule === "הבטחת-יתר")).toBe(true);
  });

  it("detects policy-bypassing wording (עקיפת-מדיניות)", () => {
    const result = evaluateLaceResponse(objection, "אפשר לשלוח ישר ללקוח בלי אישור, לא צריך לבדוק");
    expect(result.warnings.some((w) => w.rule === "עקיפת-מדיניות")).toBe(true);
  });

  it("recognizes a good LACE response — no warnings, stage coverage, evidence citation", () => {
    const good =
      "אני מבין למה זה מדאיג — זו דאגה לגיטימית. אם הבנתי נכון, החשש הוא מהסתמכות " +
      "על תשובה שגויה? בוא נבדוק יחד את הראיות במרכז האישורים — מה היה עוזר לך להרגיש בטוח?";
    const result = evaluateLaceResponse(objection, good);
    expect(result.warnings).toHaveLength(0);
    expect(result.stageCoverage.acknowledge).toBe(true);
    expect(result.stageCoverage.confirm).toBe(true);
    expect(result.stageCoverage.explore).toBe(true);
    expect(result.citesEvidence).toBe(true);
    expect(result.strengths.length).toBeGreaterThan(0);
  });

  it("is deterministic — same input yields the same evaluation", () => {
    const a = evaluateLaceResponse(objection, "אל תדאג, המערכת מושלמת");
    const b = evaluateLaceResponse(objection, "אל תדאג, המערכת מושלמת");
    expect(a).toEqual(b);
  });

  it("claims NO measured coaching accuracy — no score, exact honesty label", () => {
    const result = evaluateLaceResponse(objection, "תשובה כלשהי");
    expect(result.honestyLabel).toBe("הערכה דטרמיניסטית מבוססת כללים — טרם נמדד");
    expect(result.honestyLabel).toBe(LACE_SIMULATOR_HONESTY_LABEL);
    // no numeric score anywhere in the evaluation shape
    const keys = Object.keys(result);
    expect(keys).not.toContain("score");
    expect(keys).not.toContain("grade");
    expect(keys).not.toContain("accuracy");
    const numericValues = Object.values(result).filter((v) => typeof v === "number");
    expect(numericValues).toHaveLength(0);
  });

  it("wraps the evaluation in an honest envelope (model=null, usage unmeasured, confidence unavailable)", () => {
    __resetLaceSeqForTests();
    const evaluation = evaluateLaceResponse(objection, "אל תדאג");
    const envelope = laceEnvelope(objection, evaluation, () => NOW);
    expect(envelope.model).toBeNull();
    expect(envelope.provider).toBe("local-rules-lace");
    expect(envelope.usage.measured).toBe(false);
    expect(envelope.confidence.status).toBe("unavailable");
    expect(envelope.confidence.label).toBe("טרם נמדד");
    expect(envelope.limitations).toContain(LACE_SIMULATOR_HONESTY_LABEL);
    expect(envelope.evidence.length).toBeGreaterThan(0);
    expect(envelope.evidence[0]?.sourceId).toBe(objection.id);
    expect(envelope.approval.required).toBe(false);
  });

  it("envelope generation is deterministic given a fixed clock and reset sequence", () => {
    const evaluation = evaluateLaceResponse(objection, "אל תדאג");
    __resetLaceSeqForTests();
    const a = laceEnvelope(objection, evaluation, () => NOW);
    __resetLaceSeqForTests();
    const b = laceEnvelope(objection, evaluation, () => NOW);
    expect(a).toEqual(b);
  });
});
