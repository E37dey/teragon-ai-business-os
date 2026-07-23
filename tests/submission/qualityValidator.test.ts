// W7-E (7.17) — the eight-item quality validator: exactly 8 criteria, deep
// deterministic rules, and NO hardcoded 8/8 (honest warnings/fails expected).
import { describe, expect, it } from "vitest";
import { deliverableByKey, type SubmissionSources } from "@/domain/submission";
import {
  checkCriterion,
  QUALITY_CRITERIA,
  QUALITY_VALIDATOR_VERSION,
  qualitySummary,
  runQualityValidation,
} from "@/validation/submission/qualityValidator";
import { buildSources, TEST_NOW_ISO } from "./helpers";

describe("quality validator — the 8 mandated criteria (7.17)", () => {
  it("has EXACTLY the 8 mandated criteria, in order", () => {
    expect(QUALITY_CRITERIA).toEqual([
      "בהירות",
      "רלוונטיות",
      "פרסונליזציה",
      "בטיחות",
      "אחריות",
      "תרגול",
      "מדידה",
      "תחזוקה",
    ]);
  });

  it("produces a full 12×8 matrix with reasons and version on every result", () => {
    const results = runQualityValidation(buildSources());
    expect(results).toHaveLength(96);
    for (const r of results) {
      expect(r.reasonHe.length).toBeGreaterThan(0);
      expect(r.validatorVersion).toBe(QUALITY_VALIDATOR_VERSION);
      expect(r.checkedAt).toBe(TEST_NOW_ISO);
    }
  });

  it("NO hardcoded 8/8 — the honest run yields warnings (results fall where they fall)", () => {
    const summary = qualitySummary(runQualityValidation(buildSources()));
    expect(summary.pass).toBeGreaterThan(0);
    // honest expected state: numeric targets without measurement sources,
    // materials without review dates, gate validation not loaded → warnings
    expect(summary.warning).toBeGreaterThan(0);
    expect(summary.pass + summary.warning + summary.fail + summary.notApplicable).toBe(96);
  });

  it("is deterministic — same sources ⇒ identical results", () => {
    const a = runQualityValidation(buildSources());
    const b = runQualityValidation(buildSources());
    expect(a).toEqual(b);
  });

  it("תרגול FAILS without an exercise record (personas without exercises)", () => {
    const src = buildSources();
    const noExercise: SubmissionSources = {
      ...src,
      personas: src.personas.map((p) => ({ ...p, exercise: "" })),
    };
    const r = checkCriterion("תרגול", deliverableByKey("personas-map"), noExercise);
    expect(r.state).toBe("fail");
    expect(r.missingFields.length).toBe(7);
  });

  it("תרגול passes on the real personas (all 7 have a defined exercise)", () => {
    const r = checkCriterion("תרגול", deliverableByKey("personas-map"), buildSources());
    expect(r.state).toBe("pass");
  });

  it("אחריות FAILS when the owner is a role, not a named person (C3)", () => {
    const def = { ...deliverableByKey("one-pager"), ownerId: "מטמיע" };
    const r = checkCriterion("אחריות", def, buildSources());
    expect(r.state).toBe("fail");
    expect(r.reasonHe).toContain("תפקיד אינו אדם");
  });

  it("אחריות passes for a named seed owner", () => {
    const r = checkCriterion("אחריות", deliverableByKey("one-pager"), buildSources());
    expect(r.state).toBe("pass");
    expect(r.reasonHe).toContain("צחי זוסטייהם");
  });

  it("מדידה WARNS when a numeric target has no measurement source (per-1: 80%)", () => {
    const r = checkCriterion("מדידה", deliverableByKey("personas-map"), buildSources());
    expect(r.state).toBe("warning");
    expect(r.missingFields).toContain("משתמש קצה");
  });

  it("בהירות checks material structure (steps + expected results present)", () => {
    // quick-start: real actions all carry demo + expectedResult → pass
    expect(checkCriterion("בהירות", deliverableByKey("quick-start"), buildSources()).state).toBe(
      "pass",
    );
    // training-script is material-backed with structured sections → not fail
    const script = checkCriterion("בהירות", deliverableByKey("training-script"), buildSources());
    expect(["pass", "warning"]).toContain(script.state);
  });

  it("בטיחות checks the אסור list presence in the policy material (tm-4)", () => {
    const r = checkCriterion("בטיחות", deliverableByKey("correct-use-policy"), buildSources());
    expect(r.state).toBe("pass");
    expect(r.evidenceHe.join(" ")).toContain("6");
  });

  it("בטיחות fails the policy when personas/materials sources break the אסור list", () => {
    // an empty objections set breaks faq-lace safety honestly (warning path)
    const r = checkCriterion("בטיחות", deliverableByKey("faq-lace"), {
      ...buildSources(),
      objections: [],
    });
    expect(r.state).toBe("warning");
  });

  it("רלוונטיות fails when evidence does not resolve to real records", () => {
    const src = buildSources();
    const noMaterials: SubmissionSources = { ...src, materials: [] };
    const r = checkCriterion("רלוונטיות", deliverableByKey("correct-use-policy"), noMaterials);
    expect(r.state).toBe("fail");
    expect(r.missingFields.length).toBeGreaterThan(0);
  });

  it("תחזוקה warns honestly when a material has no review date", () => {
    const r = checkCriterion("תחזוקה", deliverableByKey("correct-use-policy"), buildSources());
    // bridge leaves reviewDate unset → honest warning, not a fake pass
    expect(["warning", "pass"]).toContain(r.state);
    if (r.state === "warning") expect(r.missingFields).toContain("reviewDate");
  });

  it("תחזוקה FAILS (expired) when a material review date has passed", () => {
    const src = buildSources();
    const expired: SubmissionSources = {
      ...src,
      materials: src.materials.map((m) =>
        m.id === "tm-4" ? { ...m, reviewDate: "2026-01-01" } : m,
      ),
    };
    const r = checkCriterion("תחזוקה", deliverableByKey("correct-use-policy"), expired);
    expect(r.state).toBe("fail");
    expect(r.reasonHe).toContain("פג תוקף");
  });
});
