// W8-A — 7 canonical reports: idempotent bootstrap + honest run generation.
import { describe, expect, it } from "vitest";
import { InMemoryRepository } from "@/repositories";
import type { ReportDefinition } from "@/domain/analytics";
import { reportDefinitionSchema, reportRunSchema } from "@/domain/analytics";
import { CANONICAL_REPORTS, bootstrapReportDefinitions, buildReportRun } from "@/analytics";
import { buildSources, TEST_NOW_ISO } from "./helpers";

const MANDATED_TITLES = [
  "דוח פעילות שבועי",
  "דוח מכירות חודשי",
  "דוח שירות ותקלות",
  "דוח התקדמות תלמידים",
  "דוח אימוץ והטמעה",
  "דוח ממשל AI",
  "דוח מוכנות להגשה",
];

describe("canonical reports", () => {
  it("defines exactly the 7 mandated reports (schema-valid)", () => {
    expect(CANONICAL_REPORTS).toHaveLength(7);
    expect(CANONICAL_REPORTS.map((r) => r.titleHe)).toEqual(MANDATED_TITLES);
    for (const def of CANONICAL_REPORTS) {
      const full: ReportDefinition = { ...def, createdAt: TEST_NOW_ISO, updatedAt: TEST_NOW_ISO };
      expect(reportDefinitionSchema.safeParse(full).success).toBe(true);
    }
  });

  it("bootstrap is idempotent — the second run creates NOTHING", async () => {
    const repo = new InMemoryRepository<ReportDefinition>("reportDefinitions", []);
    const first = await bootstrapReportDefinitions(repo, TEST_NOW_ISO);
    expect(first).toHaveLength(7);
    const second = await bootstrapReportDefinitions(repo, TEST_NOW_ISO);
    expect(second).toHaveLength(0);
    expect(await repo.list()).toHaveLength(7);
  });

  it("a run carries REAL engine rows, generatedBy, limitations and export state", () => {
    const s = buildSources();
    const def: ReportDefinition = {
      ...CANONICAL_REPORTS[1]!,
      createdAt: TEST_NOW_ISO,
      updatedAt: TEST_NOW_ISO,
    };
    const run = buildReportRun(def, s, "u-maya", "rrun-1");
    expect(reportRunSchema.safeParse(run).success).toBe(true);
    expect(run.generatedBy).toBe("u-maya");
    expect(run.rows.map((r) => r.metricKey)).toEqual(def.metricKeys);
    // real seed data: at least one measured sales metric
    expect(run.rows.some((r) => r.value !== null)).toBe(true);
    expect(run.exportState).toEqual({ csvExportedAt: null, printedAt: null });
  });

  it("the readiness report keeps unmeasured business outcomes null + states it", () => {
    const s = buildSources();
    const def: ReportDefinition = {
      ...CANONICAL_REPORTS[6]!,
      createdAt: TEST_NOW_ISO,
      updatedAt: TEST_NOW_ISO,
    };
    const run = buildReportRun(def, s, "u-tzachi", "rrun-1");
    for (const key of ["nps", "roi", "time_saved_hours", "customer_retention", "downtime"]) {
      const row = run.rows.find((r) => r.metricKey === key)!;
      expect(row.value).toBeNull();
      expect(row.displayHe).toBe("טרם נמדד");
    }
    expect(run.limitations.some((l) => l.includes("טרם נמדדו"))).toBe(true);
  });

  it("run generation is deterministic for a fixed clock", () => {
    const def: ReportDefinition = {
      ...CANONICAL_REPORTS[0]!,
      createdAt: TEST_NOW_ISO,
      updatedAt: TEST_NOW_ISO,
    };
    const a = buildReportRun(def, buildSources(), "u-tzachi", "rrun-1");
    const b = buildReportRun(def, buildSources(), "u-tzachi", "rrun-1");
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
