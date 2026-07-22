// Wave 4 — support module: tier markers, SLA timers, recurring-issue detection.
import { describe, expect, it } from "vitest";
import type { SupportRequest } from "@/domain/types";
import {
  categorize,
  championLoad,
  parseSupport,
  recurringIssues,
  slaCompliancePercent,
  supportSla,
  TIER_SLA_HOURS,
  withSupportMarkers,
} from "@/modules/support/lib";

const NOW = new Date("2026-07-22T12:00:00.000Z").getTime();

function req(patch: Partial<SupportRequest>): SupportRequest {
  return {
    id: "sr-x",
    subject: "שאלה",
    description: "",
    requesterId: "u-maya",
    channel: "מערכת",
    status: "פתוחה",
    priority: "בינונית",
    resolution: "",
    createdAt: "2026-07-22T10:00:00.000Z",
    updatedAt: "2026-07-22T10:00:00.000Z",
    ...patch,
  };
}

describe("support markers", () => {
  it("round-trips tier, assignee and feedback", () => {
    const d = withSupportMarkers("תיאור הפנייה", 3, "u-ran", "חיובי");
    const p = parseSupport(d);
    expect(p.tier).toBe(3);
    expect(p.assigneeId).toBe("u-ran");
    expect(p.feedback).toBe("חיובי");
    expect(p.clean).toBe("תיאור הפנייה");
  });
  it("defaults to Tier 1 with no markers", () => {
    const p = parseSupport("סתם תיאור");
    expect(p.tier).toBe(1);
    expect(p.assigneeId).toBeNull();
    expect(p.feedback).toBeNull();
  });
});

describe("supportSla — real elapsed vs tier target", () => {
  it("Tier 1 target is 1 hour; 2h elapsed is a breach", () => {
    const s = supportSla(req({ createdAt: "2026-07-22T10:00:00.000Z" }), NOW);
    expect(s.targetHours).toBe(TIER_SLA_HOURS[1]);
    expect(s.elapsedHours).toBe(2);
    expect(s.level).toBe("חריגה");
  });
  it("Tier 3 target is 8h; 2h elapsed is fine", () => {
    const s = supportSla(req({ description: withSupportMarkers("קשה", 3, null, null) }), NOW);
    expect(s.targetHours).toBe(8);
    expect(s.level).toBe("תקין");
  });
  it("closed request stops the clock at updatedAt", () => {
    const s = supportSla(
      req({
        status: "נסגרה",
        createdAt: "2026-07-20T10:00:00.000Z",
        updatedAt: "2026-07-20T10:30:00.000Z",
      }),
      NOW,
    );
    expect(s.closed).toBe(true);
    expect(s.elapsedHours).toBe(0.5);
    expect(s.level).toBe("תקין");
  });
});

describe("slaCompliancePercent", () => {
  it("is null (unmeasured) with no closed requests — never invented", () => {
    expect(slaCompliancePercent([req({})], NOW)).toBeNull();
  });
  it("computes % of closed requests inside target", () => {
    const list = [
      req({
        id: "a",
        status: "נסגרה",
        createdAt: "2026-07-20T10:00:00.000Z",
        updatedAt: "2026-07-20T10:30:00.000Z",
      }), // met (0.5h/1h)
      req({
        id: "b",
        status: "נסגרה",
        createdAt: "2026-07-20T10:00:00.000Z",
        updatedAt: "2026-07-20T13:00:00.000Z",
      }), // missed (3h/1h)
    ];
    expect(slaCompliancePercent(list, NOW)).toBe(50);
  });
});

describe("categorize — deterministic classifier", () => {
  it("keyword rules are stable", () => {
    expect(categorize("איך מוסיפים משתמש חדש?", "")).toBe("הרשאות ומשתמשים");
    expect(categorize("הסוכן Hunter לא מציע פולואו-אפים", "")).toBe("סוכני AI");
    expect(categorize("בקשה: ייצוא לידים ל-CSV", "")).toBe("דוחות וייצוא");
    expect(categorize("סתם", "")).toBe("כללי");
  });
});

describe("recurringIssues — same category ≥3 in period", () => {
  it("flags a category with 3 recent requests", () => {
    const list = [
      req({ id: "a", subject: "בעיה בהרשאות", createdAt: "2026-07-20T10:00:00.000Z" }),
      req({ id: "b", subject: "משתמש לא מצליח להתחבר", createdAt: "2026-07-21T10:00:00.000Z" }),
      req({ id: "c", subject: "איפוס סיסמה", createdAt: "2026-07-22T09:00:00.000Z" }),
      req({ id: "d", subject: "ייצוא דוח", createdAt: "2026-07-22T09:00:00.000Z" }),
    ];
    const rec = recurringIssues(list, NOW);
    expect(rec).toHaveLength(1);
    expect(rec[0]?.category).toBe("הרשאות ומשתמשים");
    expect(rec[0]?.count).toBe(3);
  });
  it("ignores requests outside the period", () => {
    const old = "2026-05-01T10:00:00.000Z";
    const list = [
      req({ id: "a", subject: "הרשאות", createdAt: old }),
      req({ id: "b", subject: "הרשאות", createdAt: old }),
      req({ id: "c", subject: "הרשאות", createdAt: "2026-07-22T09:00:00.000Z" }),
    ];
    expect(recurringIssues(list, NOW)).toHaveLength(0);
  });
});

describe("championLoad", () => {
  it("counts open assigned requests only", () => {
    const list = [
      req({ id: "a", description: withSupportMarkers("x", 2, "u-ran", null) }),
      req({ id: "b", description: withSupportMarkers("y", 2, "u-ran", null) }),
      req({ id: "c", status: "נסגרה", description: withSupportMarkers("z", 2, "u-ran", null) }),
      req({ id: "d" }), // unassigned
    ];
    const load = championLoad(list);
    expect(load.get("u-ran")).toBe(2);
    expect(load.size).toBe(1);
  });
});
