// W7-E (7.18+7.19) — deliverable readiness matrix: every "מלא" condition is
// INDIVIDUALLY blocking; overall readiness recalculates from blockers and is
// never green while one remains; the honest initial state is not 12/12.
import { describe, expect, it } from "vitest";
import type { Approval } from "@/domain/types";
import {
  approvalSubjectRef,
  buildAuditFindings,
  deliverableByKey,
  evaluateAllDeliverables,
  evaluateDeliverable,
  evaluationsCoverRegistry,
  overallReadiness,
  type SubmissionSources,
} from "@/domain/submission";
import { runQualityValidation, type QualityValidationResult } from "@/validation/submission/qualityValidator";
import { buildSources, TEST_NOW_ISO } from "./helpers";

function approvedFor(key: "quick-start" | "correct-use-policy"): Approval {
  return {
    id: `ap-test-${key}`,
    createdAt: TEST_NOW_ISO,
    updatedAt: TEST_NOW_ISO,
    subjectRef: approvalSubjectRef(key),
    requestedById: "u-tzachi",
    requestedAt: TEST_NOW_ISO,
    status: "אושר",
    decidedById: "u-tzachi",
    decidedAt: TEST_NOW_ISO,
    note: "אישור בדיקה",
  };
}

/** sources where quick-start satisfies EVERY מלא condition */
function readySources(): SubmissionSources {
  return buildSources({ approvals: [approvedFor("quick-start")] });
}

const NO_QUALITY: QualityValidationResult[] = [];

describe("deliverable readiness — each מלא condition individually blocking", () => {
  const def = deliverableByKey("quick-start");

  it("reaches מלא only when ALL conditions hold", () => {
    const ev = evaluateDeliverable(def, readySources(), NO_QUALITY);
    expect(ev.state).toBe("מלא");
    expect(ev.stateReasonsHe).toEqual([]);
  });

  it("without a valid approval → ממתין לבדיקה (approvals via canonical engine pending)", () => {
    const ev = evaluateDeliverable(def, buildSources(), NO_QUALITY);
    expect(ev.state).toBe("ממתין לבדיקה");
    expect(ev.approvalStatusHe).toBe("אין רשומת אישור");
  });

  it("owner that is a role (not a named user) blocks מלא", () => {
    const ev = evaluateDeliverable({ ...def, ownerId: "מטמיע" }, readySources(), NO_QUALITY);
    expect(ev.state).not.toBe("מלא");
    expect(ev.stateReasonsHe.join(" ")).toContain("לא הוקצה אחראי בשם");
  });

  it("unresolved evidence blocks מלא", () => {
    const src = readySources();
    const ev = evaluateDeliverable(def, { ...src, materials: [] }, NO_QUALITY);
    expect(ev.state).toBe("חלקי");
    expect(ev.evidence.some((e) => !e.resolved)).toBe(true);
  });

  it("a route missing from APP_ROUTES blocks מלא", () => {
    const ev = evaluateDeliverable({ ...def, route: "/no-such-route" }, readySources(), NO_QUALITY);
    expect(ev.state).not.toBe("מלא");
    expect(ev.routeExists).toBe(false);
  });

  it("printable=false blocks מלא", () => {
    const ev = evaluateDeliverable({ ...def, printable: false }, readySources(), NO_QUALITY);
    expect(ev.state).not.toBe("מלא");
  });

  it("a blocking quality fail forces חסום", () => {
    const fail: QualityValidationResult = {
      deliverableKey: "quick-start",
      criterion: "בטיחות",
      state: "fail",
      reasonHe: "כשל בדיקה",
      evidenceHe: [],
      missingFields: [],
      affectedRecord: null,
      recommendedFixHe: null,
      checkedAt: TEST_NOW_ISO,
      validatorVersion: "1.0.0",
    };
    const ev = evaluateDeliverable(def, readySources(), [fail]);
    expect(ev.state).toBe("חסום");
  });

  it("missing content forces חסר", () => {
    const ev = evaluateDeliverable(
      { ...def, contentExists: () => ({ exists: false, reasonHe: "אין תוכן" }) },
      readySources(),
      NO_QUALITY,
    );
    expect(ev.state).toBe("חסר");
  });

  it("an expired material review date forces פג תוקף", () => {
    const src = readySources();
    const expired = {
      ...src,
      materials: src.materials.map((m) => (m.id === "tm-3" ? { ...m, reviewDate: "2026-01-01" } : m)),
    };
    const ev = evaluateDeliverable(def, expired, NO_QUALITY);
    expect(ev.state).toBe("פג תוקף");
  });
});

describe("honest initial state + overall readiness", () => {
  it("the real current state is NOT 12/12 מלא — approvals are pending", () => {
    const src = buildSources();
    const quality = runQualityValidation(src);
    const evaluations = evaluateAllDeliverables(src, quality);
    expect(evaluationsCoverRegistry(evaluations)).toBe(true);
    expect(evaluations.filter((e) => e.state === "מלא")).toHaveLength(0);
    // several are honestly חלקי / ממתין לבדיקה / חסר
    const states = new Set(evaluations.map((e) => e.state));
    expect(states.size).toBeGreaterThan(1);
  });

  it("overall readiness is NEVER green while a blocker exists", () => {
    const src = buildSources();
    const quality = runQualityValidation(src);
    const evaluations = evaluateAllDeliverables(src, quality);
    const findings = buildAuditFindings(src, evaluations);
    const readiness = overallReadiness(evaluations, findings);
    expect(readiness).not.toBe("מוכן להגשה");
  });

  it("blocker → readiness recalculation: removing the blocker changes the state", () => {
    const src = buildSources();
    const quality = runQualityValidation(src);
    const evaluations = evaluateAllDeliverables(src, quality).map((e) =>
      e.state === "מלא" ? e : { ...e, state: "מלא" as const, stateReasonsHe: [] },
    );
    // with a blocking finding — never ready
    const blocked = overallReadiness(evaluations, [
      {
        kind: "failed-route",
        severity: "חוסם",
        titleHe: "חוסם בדיקה",
        detailHe: "-",
        targetRoute: "/submission",
      },
    ]);
    expect(blocked).toBe("לא מוכן להגשה");
    // same evaluations, blocker resolved — ready
    expect(overallReadiness(evaluations, [])).toBe("מוכן להגשה");
  });

  it("the auditor reports the W7-F seams honestly (presenter notes, screenshots)", () => {
    const src = buildSources();
    const quality = runQualityValidation(src);
    const findings = buildAuditFindings(src, evaluateAllDeliverables(src, quality));
    expect(findings.some((f) => f.kind === "missing-presenter-note")).toBe(true);
    expect(findings.some((f) => f.kind === "stale-screenshot")).toBe(true);
    expect(findings.some((f) => f.kind === "missing-baseline")).toBe(true);
    for (const f of findings) expect(f.targetRoute.startsWith("/")).toBe(true);
  });

  it("timing overflow fires when presentationSections exceed 10 minutes", () => {
    const src = buildSources({
      presentationSections: [
        { id: "ps-1", createdAt: TEST_NOW_ISO, updatedAt: TEST_NOW_ISO, durationMinutes: 6 },
        { id: "ps-2", createdAt: TEST_NOW_ISO, updatedAt: TEST_NOW_ISO, durationMinutes: 6 },
      ],
    });
    const quality = runQualityValidation(src);
    const findings = buildAuditFindings(src, evaluateAllDeliverables(src, quality));
    expect(findings.some((f) => f.kind === "timing-overflow" && f.severity === "חוסם")).toBe(true);
  });

  it("wrong persona count is a blocking finding (consumes the exactly-7 guard)", () => {
    const src = buildSources();
    const six = { ...src, personas: src.personas.slice(0, 6) };
    const quality = runQualityValidation(six);
    const findings = buildAuditFindings(six, evaluateAllDeliverables(six, quality));
    expect(findings.some((f) => f.kind === "wrong-persona-count" && f.severity === "חוסם")).toBe(
      true,
    );
  });
});
