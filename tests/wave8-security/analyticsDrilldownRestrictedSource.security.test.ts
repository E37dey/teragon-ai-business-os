// W8-F (8.15) GAP-FILL — "unauthorized analytics drilldown" on a metric whose
// source collection is sensitivity-gated (memoryUsage → memory records with
// sensitivity רגיש/מוגבל), plus the cross-organization access model.
//
// GAP ANALYSIS (what already exists, NOT re-tested here):
//   tests/analytics/drilldown.test.ts  — record resolution correctness;
//   tests/wave7-security/*             — sensitivity-gated memory BODIES behind
//                                        projections (HIDDEN_SENSITIVITIES);
//   tests/wave6-security/*             — customer-360/export projections.
// NOT covered anywhere before this file:
//   (a) the analytics drilldown surface itself never carries a sensitive
//       memory BODY — memory_usage_count drilldown is a reference-only
//       projection (usage id + record id), even when the used record is רגיש;
//   (b) the DrilldownRecord shape is CLOSED — exactly 5 projection fields, so
//       no future source field can leak a payload through the drawer;
//   (c) cross-organization access: honest single-tenant pin — the analytics
//       filter has NO organization dimension; this is Teragon's own internal
//       OS (organizations in seed are CUSTOMER companies, not tenants), so
//       "cross-org metric isolation" does not exist BY DESIGN and is pinned
//       here as a documented limitation, not silently assumed.
import { describe, expect, it } from "vitest";
import type { MemoryUsage } from "@/domain/memory";
import { drilldownRecords, visibleMetrics, wholeRange } from "@/analytics";
import { ANALYTICS_METRICS } from "@/analytics/catalogue";
import { analyticsFilterSchema } from "@/domain/analytics";
import { APP_ROUTES } from "@/app/routes";
import { buildSources, TEST_NOW_ISO } from "../analytics/helpers";
import { SENSITIVE_BODY_SENTINEL } from "../wave7-security/helpers";

const NOW = TEST_NOW_ISO;

/** usage of a רגיש memory record — the usage row itself is NOT the body */
function makeSensitiveUsage(): MemoryUsage {
  return {
    id: "muse-w8f-1",
    createdAt: NOW,
    updatedAt: NOW,
    envelopeId: "env-w8f-1",
    operation: "summarize.customer",
    recordId: "mrec-w7g-sensitive",
    versionId: "mv-1",
    versionNumber: 1,
    usedAt: "2026-07-20T10:00:00.000Z",
  };
}

const defOf = (key: string) => {
  const def = ANALYTICS_METRICS.find((m) => m.key === key);
  if (!def) throw new Error(`metric ${key} missing from catalogue`);
  return def;
};

describe("W8-F 8.15 — restricted-source drilldown is a reference-only projection", () => {
  it("memory_usage_count drilldown carries ONLY id references — never the sensitive body", () => {
    const sources = buildSources({ memoryUsage: [makeSensitiveUsage()] });
    const period = wholeRange(NOW, "30d");
    const records = drilldownRecords(defOf("memory_usage_count"), sources, period);
    expect(records).toHaveLength(1);
    const serialized = JSON.stringify(records);
    // the projection may name the record ID; the BODY must never appear —
    // even though the referenced record's body is the sensitive sentinel
    expect(serialized).toContain("mrec-w7g-sensitive");
    expect(serialized).not.toContain(SENSITIVE_BODY_SENTINEL);
    // links into /memory, where the W6 sensitivity gate (reveal-with-reason)
    // owns body access — the drilldown never bypasses that gate
    expect(records[0]!.route).toBe("/memory");
  });

  it("EVERY drilldown record of EVERY metric exposes exactly the 5 closed projection fields", () => {
    const sources = buildSources({ memoryUsage: [makeSensitiveUsage()] });
    const period = wholeRange(NOW, "365d");
    for (const def of ANALYTICS_METRICS) {
      for (const rec of drilldownRecords(def, sources, period)) {
        expect(Object.keys(rec).sort()).toEqual([
          "collection",
          "detailHe",
          "id",
          "route",
          "titleHe",
        ]);
        expect(JSON.stringify(rec)).not.toContain(SENSITIVE_BODY_SENTINEL);
      }
    }
  });

  it("every drilldown route is a canonical APP_ROUTES path (no side-door surface)", () => {
    const sources = buildSources({ memoryUsage: [makeSensitiveUsage()] });
    const period = wholeRange(NOW, "365d");
    const canonical = new Set(APP_ROUTES.map((r) => r.path));
    for (const def of ANALYTICS_METRICS) {
      for (const rec of drilldownRecords(def, sources, period)) {
        // routes are either canonical or a canonical detail route (/customers/:id)
        const ok =
          canonical.has(rec.route) || /^\/customers\/[^/]+$/.test(rec.route) || rec.route === "/";
        expect(ok, `route ${rec.route} (metric ${def.key})`).toBe(true);
      }
    }
  });
});

describe("W8-F 8.15 — cross-organization access: honest single-tenant pin", () => {
  it("the analytics filter schema has NO organization dimension (documented limitation)", () => {
    // single-tenant BY DESIGN: Teragon's internal OS. Organizations in the
    // seed are Teragon's CUSTOMERS, not tenants — there is no per-org metric
    // isolation to test, and none is silently claimed. If this key set ever
    // grows an organizationId, this pin forces a real isolation decision.
    const keys = Object.keys(analyticsFilterSchema.shape).sort();
    expect(keys).toEqual([
      "comparePrevious",
      "entityType",
      "group",
      "ownerId",
      "rangePreset",
      "status",
    ]);
  });

  it("visibleMetrics narrows by group/entityType only — no hidden org filter to bypass", () => {
    const all = visibleMetrics({
      rangePreset: "30d",
      group: null,
      ownerId: null,
      entityType: null,
      status: null,
      comparePrevious: false,
    });
    expect(all.length).toBe(ANALYTICS_METRICS.length);
  });
});
