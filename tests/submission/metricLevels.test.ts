// W7-E (7.16) — the three measurement levels: type separation, baseline rules,
// target ≠ measured, and the REAL computations over actual collections.
import { describe, expect, it } from "vitest";
import type { Approval, Quotation, ServiceTicket, SupportRequest } from "@/domain/types";
import {
  measureMetric,
  metricBoard,
  metricWithObservation,
  NO_BASELINE_HE,
  NOT_MEASURED_HE,
  SUBMISSION_METRICS,
  type MeasurementContext,
  type SubmissionMetricDef,
} from "@/domain/submission";
import { buildSources, TEST_NOW_ISO } from "./helpers";

function ctxFromSeed(overrides: Partial<MeasurementContext> = {}): MeasurementContext {
  const s = buildSources();
  return {
    leads: s.leads,
    activities: s.activities,
    quotations: s.quotations,
    serviceTickets: s.serviceTickets,
    approvals: s.approvals,
    supportRequests: s.supportRequests,
    enrollments: s.enrollments,
    metricObservations: s.metricObservations,
    nowMs: Date.parse(TEST_NOW_ISO),
    ...overrides,
  };
}

function byKey(key: string): SubmissionMetricDef {
  const def = SUBMISSION_METRICS.find((m) => m.key === key);
  if (!def) throw new Error(`metric missing: ${key}`);
  return def;
}

describe("metric catalogue — three levels, honest typing (7.16)", () => {
  it("covers all three groups with the mandated families", () => {
    const groups = { A: 0, B: 0, C: 0 };
    for (const m of SUBMISSION_METRICS) groups[m.group] += 1;
    expect(groups.A).toBeGreaterThanOrEqual(5);
    expect(groups.B).toBeGreaterThanOrEqual(6);
    expect(groups.C).toBeGreaterThanOrEqual(9);
  });

  it("every metric has definition, type, source, period and a NAMED owner", () => {
    for (const m of SUBMISSION_METRICS) {
      expect(m.definitionHe.length).toBeGreaterThan(0);
      expect(["מחושב", "יעד פיילוט", "מבני"]).toContain(m.type);
      expect(m.sourceHe.length).toBeGreaterThan(0);
      expect(m.periodHe.length).toBeGreaterThan(0);
      expect(["u-tzachi", "u-maya", "u-oren", "u-ran", "u-noa"]).toContain(m.ownerId);
    }
  });

  it("every מחושב metric is wired to at least one real collection", () => {
    for (const m of SUBMISSION_METRICS.filter((x) => x.type === "מחושב")) {
      expect(m.sourceCollections.length).toBeGreaterThan(0);
    }
  });

  it("baseline is null everywhere (no donor number imported) ⇒ 'לא הוגדר קו בסיס'", () => {
    for (const m of SUBMISSION_METRICS) {
      expect(m.baseline).toBeNull();
      expect(metricWithObservation(m, ctxFromSeed()).baselineHe).toBe(NO_BASELINE_HE);
    }
  });

  it("target is NEVER rendered as measured: יעד פיילוט metrics measure null", () => {
    for (const m of SUBMISSION_METRICS.filter((x) => x.type !== "מחושב")) {
      const obs = metricWithObservation(m, ctxFromSeed());
      expect(obs.measurement).toBeNull();
      expect(obs.currentHe).toBe(NOT_MEASURED_HE);
      // the target text (when numeric) exists SEPARATELY and never leaks into currentHe
      if (m.targetHe !== null) expect(obs.currentHe).not.toContain(m.targetHe);
    }
  });

  it("donor claims (ROI 3X, WAU 70%, NPS) exist only as labeled targets", () => {
    const roi = byKey("roi");
    expect(roi.type).toBe("יעד פיילוט");
    expect(measureMetric(roi, ctxFromSeed())).toBeNull();
    const wau = byKey("wau");
    expect(wau.type).toBe("מבני");
    expect(measureMetric(wau, ctxFromSeed())).toBeNull();
  });
});

describe("real computations over actual collections", () => {
  it("quotation conversion: אושרה ÷ decided over the real quotations", () => {
    const ctx = ctxFromSeed();
    const decided = ctx.quotations.filter((q) =>
      ["אושרה", "נדחתה", "פג תוקף"].includes(q.status),
    );
    const m = measureMetric(byKey("quotation_conversion"), ctx);
    if (decided.length === 0) {
      expect(m).toBeNull();
    } else {
      expect(m).not.toBeNull();
      expect(m?.sampleSize).toBe(decided.length);
    }
  });

  it("quotation conversion is exact on synthetic data (2 of 3 decided approved)", () => {
    const q = (id: string, status: Quotation["status"]): Quotation =>
      ({ id, createdAt: TEST_NOW_ISO, updatedAt: TEST_NOW_ISO, customerName: "בדיקה", customerId: null, title: "ה", lines: [], discountPercent: 0, terms: "", validUntil: "2026-08-01", status, ownerId: "u-maya" });
    const m = measureMetric(
      byKey("quotation_conversion"),
      ctxFromSeed({ quotations: [q("q1", "אושרה"), q("q2", "אושרה"), q("q3", "נדחתה"), q("q4", "טיוטה")] }),
    );
    expect(m?.value).toBe(67);
    expect(m?.sampleSize).toBe(3);
  });

  it("lead response: null (טרם נמדד) when no lead has a follow-up activity", () => {
    const m = measureMetric(byKey("lead_response_hours"), ctxFromSeed({ activities: [] }));
    expect(m).toBeNull();
  });

  it("service resolution: median days over closed tickets with closedAt", () => {
    const t = (id: string, openedAt: string, closedAt: string | null): ServiceTicket =>
      ({ id, createdAt: openedAt, updatedAt: TEST_NOW_ISO, customerName: "ב", customerId: null, printer: "", issue: "", description: "", priority: "בינונית", status: "נסגר", openedAt, ownerId: "u-ran", solution: "", closedAt });
    const m = measureMetric(
      byKey("service_resolution_days"),
      ctxFromSeed({
        serviceTickets: [
          t("t1", "2026-07-01T08:00:00.000Z", "2026-07-03T08:00:00.000Z"),
          t("t2", "2026-07-01T08:00:00.000Z", "2026-07-05T08:00:00.000Z"),
          t("t3", "2026-07-01T08:00:00.000Z", null),
        ],
      }),
    );
    expect(m?.value).toBe(3);
    expect(m?.sampleSize).toBe(2);
  });

  it("recommendation rates: approved/edited/rejected from real approvals", () => {
    const a = (id: string, status: Approval["status"], extendedState?: Approval["extendedState"]): Approval =>
      ({ id, createdAt: TEST_NOW_ISO, updatedAt: TEST_NOW_ISO, subjectRef: `agent-task:${id}`, requestedById: "u-tzachi", requestedAt: TEST_NOW_ISO, status, decidedById: "u-tzachi", decidedAt: TEST_NOW_ISO, note: "", ...(extendedState ? { extendedState } : {}) });
    const ctx = ctxFromSeed({
      approvals: [a("a1", "אושר"), a("a2", "אושר", "edited"), a("a3", "נדחה"), a("a4", "ממתין")],
    });
    expect(measureMetric(byKey("rec_approved_rate"), ctx)?.value).toBe(67);
    expect(measureMetric(byKey("rec_edited_rate"), ctx)?.value).toBe(33);
    expect(measureMetric(byKey("rec_rejected_rate"), ctx)?.value).toBe(33);
  });

  it("recommendation rates are null (טרם נמדד) with no decided approvals", () => {
    const ctx = ctxFromSeed({ approvals: [] });
    expect(measureMetric(byKey("rec_approved_rate"), ctx)).toBeNull();
  });

  it("escalation rate reads the real /support tier model", () => {
    const sr = (id: string, tier: 1 | 2 | 3): SupportRequest =>
      ({ id, createdAt: TEST_NOW_ISO, updatedAt: TEST_NOW_ISO, subject: "ב", description: "ב", requesterId: "u-maya", channel: "מערכת", status: "פתוחה", priority: "בינונית", resolution: "", tier });
    const ctx = ctxFromSeed({ supportRequests: [sr("s1", 1), sr("s2", 2), sr("s3", 3), sr("s4", 1)] });
    expect(measureMetric(byKey("escalation_rate"), ctx)?.value).toBe(50);
  });

  it("the board groups A/B/C in catalogue order and is deterministic", () => {
    const b1 = metricBoard(ctxFromSeed());
    const b2 = metricBoard(ctxFromSeed());
    expect(b1).toEqual(b2);
    expect(b1.A.length + b1.B.length + b1.C.length).toBe(SUBMISSION_METRICS.length);
  });
});
