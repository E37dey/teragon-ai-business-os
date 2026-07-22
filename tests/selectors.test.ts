// Selector tests — the no-hardcoded-KPI guarantee: every dashboard number derives
// from the seed arrays, verified against independently-computed expectations.
import { describe, expect, it } from "vitest";
import {
  automationSuccessRate,
  courseCompletion,
  dashboardKpis,
  funnelDistribution,
  globalSearch,
  leadsByStage,
  openLeadCount,
  openTicketsByPriority,
  pendingApprovals,
  quotationSubtotal,
  quotationTotal,
  recentActivity,
  revenuePipeline,
  salesFunnel,
  totalRevenue,
} from "@/domain/selectors";
import {
  ACTIVITIES,
  APPROVALS,
  AUTOMATION_RUNS,
  AUTOMATIONS,
  COURSES,
  CUSTOMERS,
  ENROLLMENTS,
  LEADS,
  QUOTATIONS,
  SERVICE_TICKETS,
} from "@/repositories/seed";

describe("leads KPIs derive from seed", () => {
  it("leadsByStage counts sum to the total number of leads", () => {
    const byStage = leadsByStage(LEADS);
    const sum = Object.values(byStage).reduce((a, b) => a + b, 0);
    expect(sum).toBe(LEADS.length);
  });

  it("matches independent per-status counts", () => {
    const byStage = leadsByStage(LEADS);
    expect(byStage["חדש"]).toBe(LEADS.filter((l) => l.status === "חדש").length);
    expect(byStage["נסגר כלקוח"]).toBe(LEADS.filter((l) => l.status === "נסגר כלקוח").length);
  });

  it("openLeadCount excludes closed-won and irrelevant", () => {
    const expected = LEADS.filter(
      (l) => l.status !== "נסגר כלקוח" && l.status !== "לא רלוונטי",
    ).length;
    expect(openLeadCount(LEADS)).toBe(expected);
  });
});

describe("ticket KPIs derive from seed", () => {
  it("openTicketsByPriority counts only non-closed tickets", () => {
    const byPriority = openTicketsByPriority(SERVICE_TICKETS);
    const openSeed = SERVICE_TICKETS.filter((t) => t.status !== "טופל" && t.status !== "נסגר");
    expect(byPriority["גבוהה"] + byPriority["בינונית"] + byPriority["נמוכה"]).toBe(openSeed.length);
    expect(byPriority["גבוהה"]).toBe(openSeed.filter((t) => t.priority === "גבוהה").length);
  });
});

describe("revenue pipeline derives from quotation lines", () => {
  it("quotation totals apply quantity, unit price and discount", () => {
    const q3 = QUOTATIONS.find((q) => q.id === "q-3");
    expect(q3).toBeDefined();
    if (!q3) return;
    // independent computation: 1×9800 + 6×95 = 10370, minus 10% = 9333
    expect(quotationSubtotal(q3)).toBe(10370);
    expect(quotationTotal(q3)).toBe(9333);
  });

  it("pipeline buckets reconcile with an independent pass over the seed", () => {
    const p = revenuePipeline(QUOTATIONS);
    const open = QUOTATIONS.filter((q) => q.status === "טיוטה" || q.status === "נשלחה");
    const approved = QUOTATIONS.filter((q) => q.status === "אושרה");
    expect(p.openCount).toBe(open.length);
    expect(p.approvedCount).toBe(approved.length);
    expect(p.openValue).toBe(open.reduce((s, q) => s + quotationTotal(q), 0));
    expect(p.approvedValue).toBe(approved.reduce((s, q) => s + quotationTotal(q), 0));
    const bucketCount = Object.values(p.byStatus).reduce((s, b) => s + b.count, 0);
    expect(bucketCount).toBe(QUOTATIONS.length);
  });

  it("totalRevenue is the sum of customer revenues", () => {
    expect(totalRevenue(CUSTOMERS)).toBe(CUSTOMERS.reduce((s, c) => s + c.revenue, 0));
  });
});

describe("course completion derives from enrollments", () => {
  it("approved / total stages match an independent pass", () => {
    const cc = courseCompletion(ENROLLMENTS);
    let total = 0;
    let approved = 0;
    for (const en of ENROLLMENTS) {
      total += en.stages.length;
      approved += en.stages.filter((s) => s.status === "אושר").length;
    }
    expect(cc.totalStages).toBe(total);
    expect(cc.approvedStages).toBe(approved);
    expect(cc.completionPercent).toBe(Math.round((approved / total) * 100));
  });

  it("honesty: zero stages ⇒ null, never an invented 0% or 100%", () => {
    expect(courseCompletion([]).completionPercent).toBeNull();
  });

  it("detects the blocked student from the seed", () => {
    expect(courseCompletion(ENROLLMENTS).blockedStudents).toBeGreaterThanOrEqual(1);
  });
});

describe("funnel derives from lead statuses", () => {
  it("cumulative funnel is monotonically non-increasing", () => {
    const funnel = salesFunnel(LEADS);
    for (let i = 1; i < funnel.length; i++) {
      const prev = funnel[i - 1];
      const cur = funnel[i];
      expect(prev).toBeDefined();
      expect(cur).toBeDefined();
      if (prev && cur) expect(cur.count).toBeLessThanOrEqual(prev.count);
    }
  });

  it("distribution sums to leads minus irrelevant", () => {
    const dist = funnelDistribution(LEADS);
    const sum = dist.reduce((s, f) => s + f.count, 0);
    expect(sum).toBe(LEADS.filter((l) => l.status !== "לא רלוונטי").length);
  });
});

describe("automation success + approvals", () => {
  it("success rate derives from runs; empty runs ⇒ null (טרם נמדד)", () => {
    const s = automationSuccessRate(AUTOMATIONS, AUTOMATION_RUNS);
    const finished = AUTOMATION_RUNS.filter((r) => r.outcome !== null);
    expect(s.totalRuns).toBe(finished.length);
    expect(automationSuccessRate(AUTOMATIONS, []).successPercent).toBeNull();
  });

  it("pendingApprovals filters by status", () => {
    expect(pendingApprovals(APPROVALS).every((a) => a.status === "ממתין")).toBe(true);
    expect(pendingApprovals(APPROVALS).length).toBe(
      APPROVALS.filter((a) => a.status === "ממתין").length,
    );
  });
});

describe("global search", () => {
  const data = { customers: CUSTOMERS, leads: LEADS, courses: COURSES, tickets: SERVICE_TICKETS };

  it("finds Hebrew names across collections", () => {
    const hits = globalSearch(data, "דגש");
    expect(hits.some((h) => h.kind === "לקוח")).toBe(true);
    expect(hits.some((h) => h.kind === "ליד")).toBe(true);
  });

  it("empty query returns nothing; respects limit", () => {
    expect(globalSearch(data, "  ")).toEqual([]);
    expect(globalSearch(data, "א", 3).length).toBeLessThanOrEqual(3);
  });
});

describe("recent activity", () => {
  it("returns newest first, capped", () => {
    const feed = recentActivity(ACTIVITIES, 5);
    expect(feed.length).toBe(5);
    for (let i = 1; i < feed.length; i++) {
      const prev = feed[i - 1];
      const cur = feed[i];
      if (prev && cur) expect(prev.at >= cur.at).toBe(true);
    }
  });
});

describe("composite dashboardKpis", () => {
  it("assembles all sections from data only", () => {
    const kpis = dashboardKpis({
      leads: LEADS,
      tickets: SERVICE_TICKETS,
      quotations: QUOTATIONS,
      customers: CUSTOMERS,
      enrollments: ENROLLMENTS,
      approvals: APPROVALS,
    });
    expect(kpis.openLeads).toBe(openLeadCount(LEADS));
    expect(kpis.pipeline.openValue).toBe(revenuePipeline(QUOTATIONS).openValue);
    expect(kpis.totalRevenue).toBe(totalRevenue(CUSTOMERS));
    expect(kpis.pendingApprovalCount).toBe(pendingApprovals(APPROVALS).length);
  });
});
