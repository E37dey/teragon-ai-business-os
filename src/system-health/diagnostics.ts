// W8-D — REDACTED diagnostic report (Phase 8.10).
//
// The report is a JSON document safe to hand to support:
// - secret-shaped strings are redacted with the SAME patterns the memory
//   exporter uses (single source of redaction truth) plus the bundle-scanner
//   shapes (sk-…, AKIA…, JWT-like, api_key=…, Bearer …)
// - env VALUES are never present by construction: the browser never has them
// - stack traces are never present: check details store one safe Hebrew line
// The whole serialized document passes through redaction as a final barrier.
import type { RuntimeDiagnostic, SystemHealthSnapshot } from "@/domain/system-health";
import { redactSecrets } from "@/memory/export/exporter";

export const DIAGNOSTIC_REPORT_VERSION = "teragon-diagnostic-report/1";
export const DIAGNOSTIC_REDACTED_HE = "[הושמט — דפוס סוד]";

/** extra key-shaped patterns aligned with scripts/scan-bundle-secrets.mjs */
const EXTRA_SECRET_PATTERNS: readonly RegExp[] = [
  /\bsk-\w{8,}/g,
  /\bAKIA[A-Z0-9]{12,}\b/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\b/g,
  /\bapi[_-]?key\s*[:=]\s*['"][^'"]{6,}['"]/gi,
  /\b[Bb]earer\s+[A-Za-z0-9._~+/=-]{16,}/g,
];

/** "at fn (file:1:2)" style stack lines must never survive into a report */
const STACK_TRACE_LINE = /^\s*at\s+.+\(?.*:\d+:\d+\)?\s*$/gm;

export function redactDiagnosticText(text: string): { text: string; redactionCount: number } {
  const base = redactSecrets(text);
  let out = base.text;
  let count = base.redactionCount;
  for (const re of EXTRA_SECRET_PATTERNS) {
    out = out.replace(re, () => {
      count += 1;
      return DIAGNOSTIC_REDACTED_HE;
    });
  }
  out = out.replace(STACK_TRACE_LINE, () => {
    count += 1;
    return DIAGNOSTIC_REDACTED_HE;
  });
  return { text: out, redactionCount: count };
}

export interface DiagnosticReport {
  reportVersion: string;
  generatedAt: string;
  generatedBy: string;
  /** honest note about what this report deliberately does NOT contain */
  exclusionsHe: string[];
  snapshot: SystemHealthSnapshot;
  runtime: RuntimeDiagnostic[];
  redactionCount: number;
}

export function collectRuntimeDiagnostics(): RuntimeDiagnostic[] {
  const nav = typeof navigator === "undefined" ? null : navigator;
  return [
    {
      key: "userAgent",
      labelHe: "דפדפן (User Agent)",
      value: nav?.userAgent ?? null,
    },
    {
      key: "language",
      labelHe: "שפת דפדפן",
      value: nav?.language ?? null,
    },
    {
      key: "online",
      labelHe: "מצב רשת מדווח",
      value: nav === null ? null : nav.onLine ? "מחובר" : "לא מחובר",
    },
    {
      key: "timezone",
      labelHe: "אזור זמן",
      value: (() => {
        try {
          return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
        } catch {
          return null;
        }
      })(),
    },
  ];
}

export const DIAGNOSTIC_EXCLUSIONS_HE = [
  "ללא ערכי משתני סביבה — הדפדפן מעולם אינו מחזיק אותם",
  "ללא מפתחות API או סודות — דפוסי סוד מושמטים אוטומטית",
  "ללא stack traces — פרטי שגיאה נשמרים כשורת עברית בטוחה בלבד",
  "ללא תוכן רשומות עסקיות — הדוח מכיל ספירות ומצבים בלבד",
] as const;

/** structural pass: redact every string field BEFORE serialization, so quote
 * escaping cannot hide a secret from the text patterns. */
function deepRedact(value: unknown, counter: { count: number }): unknown {
  if (typeof value === "string") {
    const { text, redactionCount } = redactDiagnosticText(value);
    counter.count += redactionCount;
    return text;
  }
  if (Array.isArray(value)) return value.map((v) => deepRedact(v, counter));
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = deepRedact(v, counter);
    return out;
  }
  return value;
}

/**
 * Build the redacted diagnostic report: a structural per-string redaction
 * first (escape-proof), then the whole serialization is passed through the
 * text patterns again as a final barrier. An injected secret inside a check
 * detail cannot survive into the exported JSON.
 */
export function buildDiagnosticReport(
  snapshot: SystemHealthSnapshot,
  generatedBy: string,
  now: () => string = () => new Date().toISOString(),
): { report: DiagnosticReport; json: string } {
  const draft: DiagnosticReport = {
    reportVersion: DIAGNOSTIC_REPORT_VERSION,
    generatedAt: now(),
    generatedBy,
    exclusionsHe: [...DIAGNOSTIC_EXCLUSIONS_HE],
    snapshot,
    runtime: collectRuntimeDiagnostics(),
    redactionCount: 0,
  };
  const counter = { count: 0 };
  const structurallyRedacted = deepRedact(draft, counter) as DiagnosticReport;
  const { text, redactionCount: finalPassCount } = redactDiagnosticText(
    JSON.stringify(structurallyRedacted, null, 2),
  );
  const redactionCount = counter.count + finalPassCount;
  // re-parse so report + json agree after redaction (redaction preserves JSON
  // string contexts: patterns match inside string values only)
  let redacted: DiagnosticReport;
  try {
    redacted = JSON.parse(text) as DiagnosticReport;
  } catch {
    // a redaction replacement broke JSON syntax (e.g. quote inside a value) —
    // fall back to the honest minimal document rather than leaking anything
    redacted = {
      ...structurallyRedacted,
      snapshot: { ...structurallyRedacted.snapshot, components: [] },
      exclusionsHe: [
        ...structurallyRedacted.exclusionsHe,
        "רכיבי snapshot הושמטו — ההשמטה שברה את מבנה ה-JSON",
      ],
    };
  }
  redacted.redactionCount = redactionCount;
  return { report: redacted, json: JSON.stringify(redacted, null, 2) };
}

export function diagnosticFileName(now: () => string = () => new Date().toISOString()): string {
  return `teragon-diagnostics-${now().slice(0, 19).replace(/[:T]/g, "-")}.json`;
}
