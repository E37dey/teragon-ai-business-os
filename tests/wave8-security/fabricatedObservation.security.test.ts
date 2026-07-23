// W8-F (8.15) GAP-FILL — fabricated-observation rejection.
//
// GAP ANALYSIS (existing, NOT re-tested): tests/analytics/audit.test.ts pins
// the 8 rail detections (structural_presented_as_measured,
// pilot_target_presented_as_outcome, observation_without_owner, …).
// NOT covered anywhere before this file:
//   (a) SCHEMA-level refusal: metricObservationSchema requires a non-empty
//       `method` — an observation cannot be persisted without saying HOW it
//       was produced (the "source" of the claim);
//   (b) engine invariant: every point the engine computes with measured=true
//       carries a non-empty `source` — a "measured" number with no source can
//       never come out of computeSeries;
//   (c) HONEST LIMITATION (pinned, not hidden): metricPointSchema alone does
//       NOT refuse measured:true with an empty source string — enforcement
//       lives in the engine (b) + the audit rail. Reported in
//       docs/WAVE_8_SECURITY_REPORT.md as a schema-hardening candidate.
import { describe, expect, it } from "vitest";
import { metricObservationSchema } from "@/domain/schemas";
import { metricPointSchema } from "@/domain/analytics";
import { computeSeries } from "@/analytics";
import { ANALYTICS_METRICS } from "@/analytics/catalogue";
import { buildSources } from "../analytics/helpers";

const NOW = "2026-07-23T12:00:00.000Z";

const baseObs = {
  id: "obs-w8f-1",
  createdAt: NOW,
  updatedAt: NOW,
  metricKey: "leads_new",
  observedAt: NOW,
  value: 7,
  method: "ספירת רשומות חדשות ב-CRM",
};

describe("W8-F 8.15 — fabricated observation is refused at the schema", () => {
  it("a valid observation (with method) parses", () => {
    expect(metricObservationSchema.safeParse(baseObs).success).toBe(true);
  });

  it("an observation with an EMPTY method (no source of the claim) is refused", () => {
    expect(metricObservationSchema.safeParse({ ...baseObs, method: "" }).success).toBe(false);
  });

  it("an observation with a MISSING method is refused", () => {
    const { method: _m, ...withoutMethod } = baseObs;
    expect(metricObservationSchema.safeParse(withoutMethod).success).toBe(false);
  });

  it("a value must be a number or null — never a fabricated string/NaN-carrier", () => {
    expect(metricObservationSchema.safeParse({ ...baseObs, value: "42" }).success).toBe(false);
    expect(metricObservationSchema.safeParse({ ...baseObs, value: null }).success).toBe(true);
  });
});

describe("W8-F 8.15 — engine invariant: measured ⇒ non-empty source", () => {
  it("every computed point with measured=true carries a non-empty source", () => {
    const sources = buildSources();
    for (const def of ANALYTICS_METRICS) {
      for (const preset of ["30d", "90d", "365d"] as const) {
        for (const p of computeSeries(def, sources, preset).points) {
          if (p.measured) {
            expect(p.source.length, `metric ${def.key}`).toBeGreaterThan(0);
            expect(p.value, `metric ${def.key} — measured must never be null`).not.toBeNull();
          }
        }
      }
    }
  });

  it("unmeasured kinds (יעד פיילוט / מבני) never come out measured", () => {
    const sources = buildSources();
    for (const def of ANALYTICS_METRICS.filter((m) => m.kind !== "מחושב")) {
      for (const p of computeSeries(def, sources, "90d").points) {
        expect(p.measured, `metric ${def.key}`).toBe(false);
        expect(p.value, `metric ${def.key} — never invents a number`).toBeNull();
      }
    }
  });
});

describe("W8-F 8.15 — HONEST LIMITATION pinned: metricPointSchema alone", () => {
  it("metricPointSchema currently ACCEPTS measured:true with an empty source (documented)", () => {
    // This pin is deliberate: if someone hardens the schema (recommended in
    // WAVE_8_SECURITY_REPORT.md), this test flips and the report gets updated.
    const point = {
      metricDefinitionId: "leads_new",
      periodStart: NOW,
      periodEnd: NOW,
      value: 5,
      unit: "רשומות",
      source: "",
      calculationMethod: "",
      measured: true,
      calculatedAt: NOW,
      limitations: [],
      sampleSize: 5,
      dataCompleteness: "מלא",
    };
    expect(metricPointSchema.safeParse(point).success).toBe(true);
  });
});
