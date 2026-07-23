// W8-A — drilldown honesty: every chart point resolves to the ACTUAL records
// that produced it, with real ids from the seed collections.
import { describe, expect, it } from "vitest";
import { ANALYTICS_METRICS, computeBucket, drilldownRecords, wholeRange } from "@/analytics";
import { buildSources, TEST_NOW_ISO } from "./helpers";
import { LEADS, QUOTATIONS, SUPPORT_REQUESTS } from "@/repositories/seed";
import { effectiveSupport } from "@/modules/support/lib";

describe("drilldown record resolution", () => {
  const s = buildSources();
  const range = wholeRange(TEST_NOW_ISO, "365d");

  it("leads_new resolves to the very leads counted in the bucket", () => {
    const def = ANALYTICS_METRICS.find((m) => m.key === "leads_new")!;
    const bucket = computeBucket(def, s, range);
    const records = drilldownRecords(def, s, range);
    expect(records).toHaveLength(bucket.value as number);
    const seedIds = new Set(LEADS.map((l) => l.id));
    for (const r of records) {
      expect(r.collection).toBe("leads");
      expect(seedIds.has(r.id)).toBe(true);
      expect(r.route).toBe("/crm");
      expect(r.titleHe.length).toBeGreaterThan(0);
    }
  });

  it("quotation_conversion resolves to the decided quotations only", () => {
    const def = ANALYTICS_METRICS.find((m) => m.key === "quotation_conversion")!;
    const records = drilldownRecords(def, s, range);
    const decided = QUOTATIONS.filter((q) => ["אושרה", "נדחתה", "פג תוקף"].includes(q.status));
    expect(records.map((r) => r.id).sort()).toEqual(decided.map((q) => q.id).sort());
  });

  it("escalation_rate resolves EXACTLY to the Tier 2+ support requests (honest 0 allowed)", () => {
    const def = ANALYTICS_METRICS.find((m) => m.key === "escalation_rate")!;
    const records = drilldownRecords(def, s, range);
    const expected = SUPPORT_REQUESTS.filter((r) => effectiveSupport(r).tier >= 2).map((r) => r.id);
    expect(records.map((r) => r.id).sort()).toEqual(expected.sort());
    for (const r of records) {
      expect(r.route).toBe("/support");
      expect(r.detailHe).toMatch(/Tier [23]/);
    }
    // fixture with a real Tier-3 record resolves it
    const t3 = { ...SUPPORT_REQUESTS[0]!, id: "sr-t3", tier: 3 as const };
    const withT3 = drilldownRecords(def, { ...s, supportRequests: [...SUPPORT_REQUESTS, t3] }, range);
    expect(withT3.some((r) => r.id === "sr-t3" && r.detailHe === "Tier 3")).toBe(true);
  });

  it("unmeasured metrics resolve to an EMPTY record list (nothing invented)", () => {
    for (const key of ["nps", "wau", "downtime"]) {
      const def = ANALYTICS_METRICS.find((m) => m.key === key)!;
      expect(drilldownRecords(def, s, range)).toHaveLength(0);
    }
  });

  it("every computable metric's drilldown records reference a real collection route", () => {
    for (const def of ANALYTICS_METRICS.filter((m) => m.kind === "מחושב")) {
      for (const r of drilldownRecords(def, s, range)) {
        expect(r.route.startsWith("/")).toBe(true);
        expect(r.id.length).toBeGreaterThan(0);
      }
    }
  });
});
