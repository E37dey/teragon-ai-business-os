// W7-E (7.15) — the 3-tier support deliverable: SPEC targets separated from
// measured SLA; measurements only from real closed requests, else "טרם נמדד".
import { describe, expect, it } from "vitest";
import type { SupportRequest } from "@/domain/types";
import {
  buildSupportArtefact,
  measuredTierSla,
  NOT_MEASURED_HE,
  SUPPORT_TIER_ARTEFACTS,
} from "@/domain/submission";
import { TEST_NOW_ISO } from "./helpers";

const NOW = Date.parse(TEST_NOW_ISO);

function req(id: string, tier: 1 | 2 | 3, status: SupportRequest["status"], openedHoursAgo: number, closedHoursAgo?: number): SupportRequest {
  const createdAt = new Date(NOW - openedHoursAgo * 3_600_000).toISOString();
  const updatedAt =
    closedHoursAgo === undefined ? createdAt : new Date(NOW - closedHoursAgo * 3_600_000).toISOString();
  return { id, createdAt, updatedAt, subject: "ב", description: "ב", requesterId: "u-maya", channel: "מערכת", status, priority: "בינונית", resolution: "", tier };
}

describe("3-tier support artefact (7.15)", () => {
  it("SPEC ch.18 target SLAs exactly: מיידי / שעתיים / יום עבודה (C10)", () => {
    expect(SUPPORT_TIER_ARTEFACTS.map((t) => t.targetSlaHe)).toEqual([
      "מיידי",
      "שעתיים",
      "יום עבודה",
    ]);
    expect(SUPPORT_TIER_ARTEFACTS.map((t) => t.tier)).toEqual([1, 2, 3]);
    // escalation chain is complete
    expect(SUPPORT_TIER_ARTEFACTS[0]?.escalatesToTier).toBe(2);
    expect(SUPPORT_TIER_ARTEFACTS[1]?.escalatesToTier).toBe(3);
    expect(SUPPORT_TIER_ARTEFACTS[2]?.escalatesToTier).toBeNull();
  });

  it("owners are named seed users, never a role", () => {
    for (const t of SUPPORT_TIER_ARTEFACTS) {
      expect(["u-tzachi", "u-maya", "u-oren", "u-ran", "u-noa"]).toContain(t.ownerId);
    }
  });

  it("no closed requests ⇒ measured side is honestly 'טרם נמדד' (never a number)", () => {
    const open = [req("s1", 1, "פתוחה", 5), req("s2", 2, "בטיפול", 3)];
    const measured = measuredTierSla(open, NOW);
    for (const m of measured) {
      expect(m.medianResolutionHours).toBeNull();
      expect(m.compliancePercent).toBeNull();
      expect(m.measuredHe).toBe(NOT_MEASURED_HE);
    }
  });

  it("closed requests produce a real median + compliance per tier", () => {
    const requests = [
      req("s1", 2, "נסגרה", 4, 3), // 1h elapsed — within the 2h target
      req("s2", 2, "נסגרה", 10, 4), // 6h elapsed — breach
      req("s3", 2, "פתוחה", 1),
    ];
    const m = measuredTierSla(requests, NOW).find((x) => x.tier === 2);
    expect(m?.closedCount).toBe(2);
    expect(m?.openCount).toBe(1);
    expect(m?.medianResolutionHours).toBe(3.5);
    expect(m?.compliancePercent).toBe(50);
  });

  it("target and measured stay SEPARATED — measuring never mutates the targets", () => {
    const before = JSON.stringify(SUPPORT_TIER_ARTEFACTS);
    measuredTierSla([req("s1", 1, "נסגרה", 2, 1)], NOW);
    expect(JSON.stringify(SUPPORT_TIER_ARTEFACTS)).toBe(before);
  });

  it("the artefact links point to the REAL support surfaces", () => {
    const artefact = buildSupportArtefact([], NOW);
    const routes = artefact.links.map((l) => l.route);
    expect(routes).toContain("/support");
    expect(routes).toContain("/knowledge");
    expect(routes).toContain("/faq");
    expect(artefact.refreshCadenceHe.length).toBeGreaterThan(0);
  });
});
