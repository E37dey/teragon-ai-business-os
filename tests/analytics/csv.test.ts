// W8-A — CSV: content matches the rows exactly, null exports as an EMPTY cell
// (never 0), and no secrets/PII fields leak into the export.
import { describe, expect, it } from "vitest";
import {
  ANALYTICS_METRICS,
  computeSeries,
  seriesToCsv,
  reportRunToCsv,
  buildReportRun,
  CANONICAL_REPORTS,
} from "@/analytics";
import { buildSources } from "./helpers";

describe("CSV export", () => {
  it("series CSV rows match the computed points one-to-one", () => {
    const s = buildSources();
    const series = [computeSeries(ANALYTICS_METRICS.find((m) => m.key === "leads_new")!, s, "90d")];
    const csv = seriesToCsv(series);
    const lines = csv.split("\r\n");
    expect(lines).toHaveLength(1 + series[0]!.points.length);
    expect(lines[0]).toContain("metricKey");
    for (let i = 0; i < series[0]!.points.length; i += 1) {
      const p = series[0]!.points[i]!;
      const line = lines[i + 1]!;
      expect(line.startsWith("leads_new,")).toBe(true);
      if (p.value !== null) expect(line).toContain(`,${p.value},`);
    }
  });

  it("null values export as EMPTY cells with measured=false — never 0", () => {
    const s = buildSources();
    const nps = computeSeries(ANALYTICS_METRICS.find((m) => m.key === "nps")!, s, "90d");
    const csv = seriesToCsv([nps]);
    const dataLine = csv.split("\r\n")[1]!;
    const cells = dataLine.split(",");
    // header: metricKey,titleHe,group,periodStart,periodEnd,value,...
    expect(cells[0]).toBe("nps");
    expect(cells[5]).toBe("");
    expect(dataLine).toContain("false");
    expect(cells[5]).not.toBe("0");
  });

  it("exports contain no PII/secret fields (emails, phones, keys)", () => {
    const s = buildSources();
    const csv = seriesToCsv(ANALYTICS_METRICS.map((m) => computeSeries(m, s, "90d")));
    expect(csv).not.toMatch(/@teragon\.co\.il/);
    expect(csv).not.toMatch(/050-\d{7}/);
    expect(csv).not.toMatch(/api[_-]?key/i);
    expect(csv).not.toMatch(/password|token|secret/i);
  });

  it("report-run CSV matches the run rows and keeps null as empty", () => {
    const s = buildSources();
    const def = { ...CANONICAL_REPORTS[6]!, createdAt: s.nowISO, updatedAt: s.nowISO };
    const run = buildReportRun(def, s, "u-tzachi", "rrun-1");
    const csv = reportRunToCsv(run);
    const lines = csv.split("\r\n");
    expect(lines).toHaveLength(1 + run.rows.length);
    const npsLine = lines.find((l) => l.startsWith("nps,"))!;
    expect(npsLine.split(",")[2]).toBe("");
    expect(npsLine).toContain("טרם נמדד");
  });
});
