// TERAGON AI BUSINESS OS — CSV formula-injection guard (Wave 9, W9-B, 9.6).
//
// FINDING (9.6 security review): src/analytics/csv.ts escapes CSV STRUCTURE
// (quotes / commas / newlines) but does NOT neutralize FORMULA INJECTION — a
// cell whose text starts with = + - @ (or the tab/CR lead-ins Excel also
// treats as formula starts) is executed as a formula when the file is opened
// in Excel / Google Sheets / LibreOffice. Today the exported columns are
// system-controlled metric metadata, so the live risk is LOW — but titleHe /
// group / calculationMethod / limitations are human-authored strings that a
// future edit could make attacker-influenced, so the exporter MUST neutralize
// every cell. This util is that neutralizer; the exporter adoption is REQUESTED
// in docs/integration-requests-w9b.md.
//
// Neutralization strategy (OWASP CSV-injection guidance): prefix a leading
// single quote (') so spreadsheet apps treat the cell as text, never a formula.
// The visible value is preserved; only the formula trigger is defused.

/** characters that, as the FIRST char of a cell, trigger formula evaluation */
const FORMULA_LEAD = /^[=+\-@\t\r]/;

/**
 * Make a single cell value safe against spreadsheet formula injection.
 * - Non-strings and empty strings pass through unchanged (numbers are never
 *   formulas; an empty cell must STAY empty — never becomes 0 or a quote).
 * - A string starting with = + - @ TAB or CR is prefixed with a single quote.
 * Structural CSV escaping (quotes/commas/newlines) is a SEPARATE concern and
 * still handled by the exporter's own `esc()`; call this BEFORE that.
 */
export function csvSafeCell(value: string | number | null): string | number | null {
  if (typeof value !== "string") return value;
  if (value.length === 0) return value;
  if (FORMULA_LEAD.test(value)) return `'${value}`;
  return value;
}

/** True when a string would be interpreted as a formula by a spreadsheet app. */
export function isFormulaInjection(value: string): boolean {
  return FORMULA_LEAD.test(value);
}
