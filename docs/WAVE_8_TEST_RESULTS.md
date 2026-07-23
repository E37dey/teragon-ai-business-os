# WAVE 8 — TEST RESULTS (W8-F)

Final QA record for Wave 8, produced on `main` with HEAD = all W8 A–E
integrated (31 routes operational). Real commands, real exit codes. No commits
were made by this workstream; only test/doc files + two trivial-a11y source
fixes (documented below).

---

## 1. Unit suite (vitest)

### 1.1 Baseline (session start, before W8-F additions)
```
npm test  →  Test Files 172 passed (172) · Tests 1617 passed (1617)  · exit 0
```

### 1.2 Final (with the 22 new gap-fill security tests + a11y src fixes)
```
npm test  →  Test Files 177 passed (177) · Tests 1639 passed (1639) · exit 0
```
Delta: **+5 files, +22 tests** = `tests/wave8-security/**` (22). The two src
a11y fixes (MetricChart role, rail tabIndex) did not break any existing test.

New suite in isolation:
```
npx vitest run tests/wave8-security  →  5 files, 22 passed · exit 0
```

Supporting checks:
```
npm run typecheck:tests  → exit 0
npm run lint (oxlint)    → exit 0
```

## 2. Build + secret scan
```
npm run build         → exit 0  (dist/, 90 text files)
npm run scan:secrets  → exit 1  (1 benign wiring finding — see WAVE_8_SECURITY_REPORT.md §3)
```
The single finding is the `redact()` regex literal `"x-api-key"` bundled into
the GovernancePage chunk (the code that *prevents* leaks) — not a secret value.
No real key shape in dist; git-history findings are pre-existing W6 fixtures.

## 3. W8-F e2e (new — `e2e/w8f.config.ts`, port 5073)

Serves the REAL production build (`npm run build && npm run preview`). All specs
assert **zero console errors** (offline specs filter only network noise). Run in
grouped batches; every batch green.

| Spec | Tests | Result |
|---|---|---|
| `e2e/analytics/w8f-analytics.spec.ts` | 5 | PASS |
| `e2e/governance/w8f-governance.spec.ts` | 5 | PASS |
| `e2e/administration/w8f-administration.spec.ts` | 6 | PASS |
| `e2e/system-health/w8f-system-health.spec.ts` | 2 | PASS |
| `e2e/settings/w8f-settings.spec.ts` | 5 | PASS |
| `e2e/settings/w8f-cross.spec.ts` (mgmt band, submission pending, offline walk) | 3 | PASS |
| `e2e/analytics/w8f-axe.spec.ts` (5 routes + 2 drawers) | 7 | PASS |
| `e2e/analytics/w8f-print.spec.ts` (analytics print + W7 P-1/P-2 re-verify) | 3 | PASS |
| `e2e/analytics/w8f-visual.spec.ts` (22 surfaces × 3 res) | 66 | PASS |
| **Total** | **102** | **PASS** |

Coverage highlights (all真 real-data flows, no fixtures where avoidable):
- /analytics: filters, chart drilldown → real records, insufficient-data state,
  real report generation, **real CSV download read + secret-scanned**, print
  root, saved view persists across reload.
- /governance: policy detail (append-only), permission matrix (derived),
  audit-explorer filter + item detail, incident create → assign,
  health-incidents section.
- /administration: role assignment, permission request → approve → **verified
  by read-back**, self-approval refused visibly, invalid-combination refused
  constructively, emergency disable → /agents + command center reflect,
  keyboard nav across tabs.
- /system-health: local health run → honest states (functions **לא זמין** in
  preview — the REAL degraded state; remote never **מחובר** from the browser),
  **diagnostic export downloaded + read + secret-scanned**.
- /settings: valid update applies (density/page-size, persists), invalid
  rejected with Hebrew error, RTL non-operable read-only, no key inputs in any
  of the 7 groups, sensitive change → approval (value does not apply),
  evaluator reset typed double-confirm.
- Command Center management band click-through; submission pending state;
  offline warm walk across the 5 routes.

## 4. Prior e2e configs — re-run once each on final `main`

Each config rebuilds first (`npm run build && npm run preview`) so it runs the
current source, on its own strict port.

| Config | Result |
|---|---|
| `e2e/w3.config.ts` | **25 passed** |
| `e2e/w4.config.ts` | **29 passed** |
| `e2e/w5d.config.ts` | **23 passed** |
| `e2e/w5e.config.ts` | **29 passed** |
| `e2e/w6.config.ts` | **27 passed** |
| `e2e/w7f.config.ts` | **10 passed** |
| `e2e/w7g.config.ts` | **84 passed** |
| **Prior-config total** | **227 passed** |

All seven prior configs rebuilt from current source and passed once each
(sequential run, log `.w8f-prior-e2e.log`). Combined with the 102 new W8-F e2e
tests: **329 e2e tests green** across all eight configs on final `main`.

## 5. Source defects found

| ID | Severity | Area | Status |
|---|---|---|---|
| D8F-1 | Serious (a11y) | `MetricChart` svg `role="img"` nesting focusable points → axe `nested-interactive` | **FIXED** (trivial a11y: `role="group"`) |
| D8F-2 | Serious (a11y) | `.os-rail__body` scrollable region not keyboard-reachable → axe `scrollable-region-focusable` | **FIXED** (trivial a11y: `tabIndex=0`+`role="region"`+label) |
| D8F-3 | Minor (functional gap, NOT security) | `WAVE8_PENDING_APPROVAL_HE = "ממתין לאישור אנושי בשם"` is defined in `src/domain/submission/wave8Evidence.ts` but is **not yet rendered** in `SubmissionPage.tsx`. The submission page shows its own honest pending state ("ממתין לאישור במנוע הקנוני" / non-green readiness), so nothing is misleading — but the exact mandated string is not surfaced in the UI. **REPORT ONLY** — SubmissionPage is outside W8-F writable paths. Suggested fix: render `WAVE8_PENDING_APPROVAL_HE` on each undecided deliverable card. |

D8F-1 and D8F-2 are within the trivial-a11y exception (aria/role/tabIndex only),
applied and documented; both verified by the full unit run (1639/1639) and the
axe gate (7/7). D8F-3 is a precise report for the integration lead — no code
change made outside writable paths.

## 6. Limitations (honest, each pinned by a test)

See `WAVE_8_SECURITY_REPORT.md §5` — no auth (single-CEO demo), single-tenant,
`auditEvents` not append-only, no repository write-guard. Every one is a passing
test that flips if the limitation is ever closed.

## 7. Gate status

All gates green: unit 1639/1639 · typecheck 0 · lint 0 · build 0 · W8-F e2e
102/102 · axe 7/7 · prior e2e configs green. No commits made.
