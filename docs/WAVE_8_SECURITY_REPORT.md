# WAVE 8 — SECURITY REPORT (W8-F · Phase 8.15)

Workstream **W8-F** — QA / Security / Accessibility / Documentation, the final
Wave-8 stream. Method: **gap-analyze first, fill only genuine gaps.** Existing
security coverage was inventoried before writing a single new test; the new
`tests/wave8-security/**` suite adds ONLY what no prior suite pinned. Every
honest limitation (no-auth demo, single-tenant, non-append-only stores) is
**pinned as a test**, never silently assumed.

- Full unit run (final `main`): **1639/1639 passed, 177 files** (`npm test`,
  exit 0) — baseline was 1617; the 22 new tests are the delta.
- New gap-fill suite: `npx vitest run tests/wave8-security` → **5 files, 22/22
  passed**.
- Build + bundle secret scan: `npm run build` (exit 0) → `npm run scan:secrets`
  (exit 1 — one benign wiring finding, analysed in §3).

---

## 1. Gap analysis — what already existed (NOT re-tested)

| Existing suite | What it already pins |
|---|---|
| `tests/wave7-security/**` (5 files, 22 tests) | no-auth honest model, closed route table, draft/rejected evidence unusable, sensitivity-gated memory BODY never leaks through projections, presenter-note access, submission/print personal-data scan |
| `tests/wave6-security/**` | derived-surface leakage, export projections, import injection, usage survival |
| `tests/governance/auditExplorer.test.ts` | redacted export (masking, truncation, summary-only fields), full seeded trail exports clean |
| `tests/governance/checksum.test.ts` + `policyVersions.test.ts` | SHA-256 tamper-evidence, append-only **policy** versions |
| `tests/administration/guards.test.ts` | self-approval blocked, AI-as-approver blocked, invalid-combination refused, no grant-all, exactly-9 roles |
| `tests/settings/settingsStore.test.ts` | typed validation, RTL immutable, sensitive→approval, no-secret-shaped settings |
| `tests/system-health/diagnostics.test.ts` | diagnostic redaction of injected secrets + stack traces |
| `tests/analytics/csv.test.ts` + `audit.test.ts` | CSV has no PII/secrets, null→empty (never 0), 8 metric-audit detections |

## 2. Gaps filled — `tests/wave8-security/**` (22 tests)

| File | Tests | Genuine gap it closes |
|---|---|---|
| `analyticsDrilldownRestrictedSource.security.test.ts` | 5 | drilldown of a sensitivity-gated-source metric (`memory_usage_count`) is a **reference-only** projection — never the רגיש body; the `DrilldownRecord` shape is CLOSED (5 fields); every drilldown route is canonical; **cross-org** access pinned as an honest single-tenant limitation (filter has no org dimension) |
| `fabricatedObservation.security.test.ts` | 7 | schema **refuses** an observation with empty/missing `method` (no source-of-claim) or a non-number value; engine invariant: `measured:true ⇒ non-empty source` and non-`מחושב` kinds never come out measured; **LIMITATION pinned**: `metricPointSchema` alone still accepts `measured:true` + empty source |
| `auditTampering.security.test.ts` | 3 | a tampered audit event (secrets in every field) still redacts at export; export stays summary-only; **LIMITATION pinned**: `auditEvents` store is NOT append-only (`update`/`remove` succeed) |
| `settingsAuditBypass.security.test.ts` | 4 | deleting the approval record never applies the pending change; a forged approvalId keeps it pending; a schema-invalid direct meta-tamper never becomes effective (read-side re-validation); **LIMITATION pinned**: a schema-valid direct meta-tamper applies without audit (no repo write-guard) |
| `submissionRestrictedEvidence.security.test.ts` | 3 | submission evidence refs are reference-only (closed `{collection, recordId, route}`); Wave-8 reviewer refs likewise; no deliverable evidence ever references a sensitivity-gated memory collection |

## 3. Scan outputs (real commands, real exit codes)

### 3.1 `npm run build` → exit **0**
Clean production build of `dist/` (90 text files).

### 3.2 `npm run scan:secrets` → exit **1** — ONE benign finding
```
[info] dist text files scanned: 90
[info] git history commits touching /sk-.../: 5   (pre-existing test fixtures, W6-documented)
[info] git history commits touching /AKIA.../: 3  (pre-existing test fixtures)
[info] screenshot files checked: 162
RESULT: 1 FINDING(S):
  [provider-auth-wiring] dist/assets/GovernancePage-*.js — "x-api-key" present
```
**Analysis — benign, accepted.** The flagged string is the **redaction regex
literal** from `src/server/redact.ts` (`x-api-key)\b(\s*[=:]\s*)(...`), pulled
into the GovernancePage chunk because the Audit Explorer imports `redact()` for
its redacted export. It is the code that **prevents** secret leakage, not a
secret value. Verified: `grep sk-|AKIA|Bearer` over that chunk = only the one
regex-pattern occurrence, no live key shape. New to Wave-8 only because W8-B
first bundled `redact()` into a page chunk. No real key was ever committed.

### 3.3 Real CSV export scan (runtime, e2e) — CLEAN
`e2e/analytics/w8f-analytics.spec.ts` generates a REAL report, triggers the
actual Blob download, **reads the downloaded file**, and asserts it matches
none of `sk-`, `AKIA`, JWT, `api_key=`, `Bearer`, `password:`, nor any email
pattern. Passed.

### 3.4 Real diagnostic export scan (runtime, e2e + planted fixtures) — CLEAN
`e2e/system-health/w8f-system-health.spec.ts` runs the real health check,
downloads the diagnostic JSON, **reads it back**, asserts `reportVersion`,
declared exclusions (`משתני סביבה`, stack traces), and zero secret/email
shapes. Planted-fixture redaction (injected `sk-`, `api_key`, `Bearer`,
`password`, stack lines) is covered by `tests/system-health/diagnostics.test.ts`.

### 3.5 Print-output personal-data scan — CLEAN (existing + extended)
`tests/wave7-security/personalDataScan.security.test.ts` scans the submission
A4 print + one-pager + presentation content against the synthetic seed set.
The analytics report print carries only metric aggregates (no record bodies) —
verified via the CSV scan (§3.3) which shares the same `ReportRun` rows.

## 4. The 20-item security checklist

| # | Control / threat | Covering test | Verdict |
|---|---|---|---|
| 1 | Unauthorized analytics drilldown on a restricted-source metric | `analyticsDrilldownRestrictedSource` t1 | **GAP-FILLED — PASS** |
| 2 | Drilldown projection cannot carry a record body (closed shape) | `analyticsDrilldownRestrictedSource` t2 | **GAP-FILLED — PASS** |
| 3 | Every drilldown route is a canonical app route (no side door) | `analyticsDrilldownRestrictedSource` t3 | **GAP-FILLED — PASS** |
| 4 | Cross-organization metric access isolation | `analyticsDrilldownRestrictedSource` t4–t5 | **LIMITATION (pinned)** — single-tenant by design; filter has no org dimension |
| 5 | Fabricated observation refused at schema (no source-of-claim) | `fabricatedObservation` t1–t3 | **GAP-FILLED — PASS** |
| 6 | Observation value must be number\|null (no fabricated type) | `fabricatedObservation` t4 | **GAP-FILLED — PASS** |
| 7 | Engine invariant `measured ⇒ non-empty source` | `fabricatedObservation` t5 | **GAP-FILLED — PASS** |
| 8 | Non-מחושב kinds never emitted as measured | `fabricatedObservation` t6 | **GAP-FILLED — PASS** |
| 9 | `metricPointSchema` measured+empty-source hardening | `fabricatedObservation` t7 | **LIMITATION (pinned)** — enforced at engine+audit, not schema |
| 10 | Audit-event tampering cannot leak secrets through export | `auditTampering` t1 | **GAP-FILLED — PASS** |
| 11 | Export stays summary-only for a tampered event | `auditTampering` t2 | **GAP-FILLED — PASS** |
| 12 | Audit store immutability / append-only | `auditTampering` t3 | **LIMITATION (pinned)** — store allows update/remove (no-auth demo) |
| 13 | Policy-version tamper evidence (SHA-256) + append-only | `governance/checksum` + `policyVersions` (existing) | **PASS (existing)** |
| 14 | Settings approval bypass — deleted approval record | `settingsAuditBypass` t1 | **GAP-FILLED — PASS (fail-closed)** |
| 15 | Settings approval bypass — forged approvalId | `settingsAuditBypass` t2 | **GAP-FILLED — PASS (fail-closed)** |
| 16 | Settings tamper — schema-invalid value never effective | `settingsAuditBypass` t3 | **GAP-FILLED — PASS (read-side guard)** |
| 17 | Settings tamper — schema-valid direct meta write | `settingsAuditBypass` t4 | **LIMITATION (pinned)** — no repo write-guard |
| 18 | Restricted record cannot be attached as submission evidence | `submissionRestrictedEvidence` t1,t3 | **GAP-FILLED — PASS** |
| 19 | Wave-8 reviewer refs are reference-only (no content field) | `submissionRestrictedEvidence` t2 | **GAP-FILLED — PASS** |
| 20 | Diagnostic export secret scan (planted fixtures) | `diagnostics.test` + `w8f-system-health` e2e | **PASS (existing + e2e)** |

**Summary:** 14 GAP-FILLED-PASS, 2 PASS (existing), 4 LIMITATION (all pinned as
honest tests). Zero silent assumptions; zero fake-success.

## 5. Honest limitations (each is a passing test that will flip if fixed)

1. **No authentication** — single-CEO demo identity; every route is
   directly reachable (deliberate, W7-documented). Guards are constructive
   (self-approval, AI-approver, invalid-combination) not identity-based.
2. **Single-tenant** — organizations in the seed are Teragon's *customers*,
   not tenants; there is no per-org metric isolation and none is claimed.
3. **`auditEvents` store is not append-only** — `update`/`remove` succeed.
   Policy versions DO carry tamper-evidence; the general audit log does not.
4. **No repository write-guard** — a schema-valid direct store write bypasses
   the settings audit. Enforcement lives in the service layer, not the store.

All four are covered by explicit pins; hardening any of them flips its test and
this report's verdict for that row.
