// W9-B / Phase 9.6 — CSV FORMULA-INJECTION.
//
// FINDING (real): the W8-A analytics CSV exporter (src/analytics/csv.ts)
// escapes CSV STRUCTURE only. A cell whose text starts with = + - @ is exported
// verbatim and executes as a formula in Excel / Sheets / LibreOffice. This test
// PROVES the exposure exists in the current exporter, then proves the W9-B
// csvSafeCell() util neutralizes it. Exporter adoption of csvSafeCell is
// REQUESTED in docs/integration-requests-w9b.md (W9-B does not edit W8-A files).
import { describe, expect, it } from "vitest";
import { seriesToCsv } from "@/analytics/csv";
import type { MetricSeries } from "@/domain/analytics";
import { csvSafeCell, isFormulaInjection } from "@/security";

// no CSV-special chars (quote/comma/newline) so structural esc() leaves it
// intact — isolating the FORMULA-injection concern from CSV structure escaping.
const INJECTION_TITLE = "=2+3+cmd|calc";

function seriesWithMaliciousTitle(titleHe: string): MetricSeries {
  return {
    metricKey: "m-x",
    titleHe,
    group: "א",
    unit: "count",
    betterWhen: "higher",
    kind: "מחושב",
    temporality: "series",
    sourceCollections: [],
    ownerId: null,
    points: [
      {
        metricDefinitionId: "m-x",
        periodStart: "2026-07-01",
        periodEnd: "2026-07-31",
        value: 1,
        unit: "count",
        source: "test",
        calculationMethod: "test",
        measured: true,
        calculatedAt: "2026-07-31T00:00:00.000Z",
        limitations: [],
        sampleSize: 1,
        dataCompleteness: "מלא",
      },
    ],
  };
}

describe("W9-B 9.6 — FINDING: current CSV exporter does not neutralize formulas", () => {
  it("exports a =formula title verbatim (the vulnerability, pinned honestly)", () => {
    const csv = seriesToCsv([seriesWithMaliciousTitle(INJECTION_TITLE)]);
    // the raw formula reaches the cell — a spreadsheet would EXECUTE it
    expect(csv).toContain(INJECTION_TITLE);
    // and it is NOT text-guarded (no leading single quote)
    expect(csv).not.toContain(`'${INJECTION_TITLE}`);
  });
});

describe("W9-B 9.6 — FIX: csvSafeCell neutralizes formula injection", () => {
  it("prefixes a single quote to every formula-leading value", () => {
    for (const lead of ["=", "+", "-", "@", "\t", "\r"]) {
      const payload = `${lead}cmd|' /C calc'!A0`;
      expect(isFormulaInjection(payload)).toBe(true);
      expect(csvSafeCell(payload)).toBe(`'${payload}`);
    }
  });

  it("leaves safe strings, numbers and empty/null cells untouched", () => {
    expect(csvSafeCell("שם רגיל")).toBe("שם רגיל");
    expect(csvSafeCell("2026-07-01")).toBe("2026-07-01");
    expect(csvSafeCell(42)).toBe(42);
    expect(csvSafeCell(null)).toBe(null); // an empty cell must STAY empty, never become 0/'
    expect(csvSafeCell("")).toBe("");
  });

  it("a formula title routed through csvSafeCell FIRST is defused", () => {
    const guarded = csvSafeCell(INJECTION_TITLE);
    expect(guarded).toBe(`'${INJECTION_TITLE}`);
    const csv = seriesToCsv([seriesWithMaliciousTitle(String(guarded))]);
    // now the cell can never be parsed as a formula
    expect(csv).toContain(`'${INJECTION_TITLE}`);
  });
});
