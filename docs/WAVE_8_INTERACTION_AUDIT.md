# WAVE 8 — INTERACTION AUDIT (W8-F · Phase 8.16)

Every interactive control on the five new Wave-8 routes + the Command-Center
management band, classified and mapped to its handler (or its honest
disabled-reason) and the test that covers it. Classification legend:
**[ACT]** performs a real mutation · **[NAV]** navigates · **[VIEW]** toggles
view/filter state · **[DISABLED]** intentionally inert with a Hebrew reason.

No dead controls: every disabled control carries a Hebrew `disabledReason`
(enforced at the `OsButton` type level — `disabled:true` requires
`disabledReason`).

---

## /analytics (`AnalyticsPage.tsx`)

| Control | Class | Handler / disabled-reason | Covering test |
|---|---|---|---|
| Range-preset select (`aria-label="טווח תאריכים"`) | VIEW | sets `filter.rangePreset` → recompute | `w8f-analytics` filters |
| Group select (`aria-label="קבוצת מדדים"`) | VIEW | `visibleMetrics` narrows by group | `w8f-analytics` filters |
| Owner / entity / status selects | VIEW | `applyFilter` narrows sources | `tests/analytics/*` (unit) |
| "השוואה לתקופה קודמת" checkbox | VIEW | toggles `comparePrevious` | `tests/analytics/comparison` |
| Saved-views picker (`aria-label="תצוגות שמורות"`) | VIEW | applies a persisted `AnalyticsView.filter` | `w8f-analytics` saved-view |
| "שמירת תצוגה" → modal → "שמירה" | ACT | creates `analyticsViews` record | `w8f-analytics` saved-view (persists across reload) |
| "איפוס" | VIEW | resets filter to defaults | `w8f-analytics` filters |
| Metric-value card `<button>` | NAV/ACT | opens drilldown drawer for the latest point | `w8f-analytics` drilldown |
| Chart point (`role="button"` circle) | ACT | opens drilldown for that period | `tests/analytics/drilldown` |
| Metrics/Reports tabs | VIEW | `role="tab"` switch | `w8f-analytics` report flow |
| "הפקת דוח מנתוני אמת" | ACT | generates a `reportRuns` record from real data | `w8f-analytics` report flow |
| Report run row | NAV | opens the run drawer | `w8f-analytics` report flow |
| "CSV" (in run drawer) | ACT | real Blob download; sets `csvExportedAt` | `w8f-analytics` (reads + scans file) |
| "הדפסה / שמירה כ-PDF" | ACT | mounts `.an-print-root`, calls `window.print()`; sets `printedAt` | `w8f-analytics` + `w8f-print` |
| "הפקת דוח…" while busy | DISABLED | "הפקה קודמת עדיין רצה" | `AnalyticsPage` (busy guard) |
| Metric-audit finding button | NAV | opens the finding's drawer | `tests/analytics/audit` |

## /governance (`GovernancePage.tsx`)

| Control | Class | Handler / disabled-reason | Covering test |
|---|---|---|---|
| Policy row | NAV | selects policy → `policy-detail` (current append-only version) | `w8f-governance` policy detail |
| "הגשה לאישור" (`submit-policy`) | ACT | requests policy approval (canonical engine) | `tests/governance/policyVersions` |
| "אישור" / "דחייה" policy (`approve-policy`/`reject-policy`) | ACT | decides via ApprovalEngine | `tests/governance/*` |
| Permission-matrix table | VIEW | derived read-only from `AGENT_DEFINITIONS` | `w8f-governance` matrix |
| Audit free-text / actor / operation / correlation / severity / approvals-only filters | VIEW | `filterAuditEvents` | `w8f-governance` audit explorer |
| Audit row | NAV | `audit-detail` derivation | `w8f-governance` audit explorer |
| "ייצוא (redacted)" (`audit-export`) | ACT | `buildAuditExport` — redacted, summary-only | `tests/governance/auditExplorer` + `auditTampering` |
| Risk row → transition | ACT | state change requires reason (`risk-reason`/`risk-transition`) | `tests/governance/riskLifecycle` |
| Incident title/desc/severity inputs | VIEW | form state | `w8f-governance` incident |
| "פתח אירוע" (`incident-open`) | ACT/DISABLED | creates incident; disabled "אירוע מחייב כותרת ותיאור" | `w8f-governance` incident |
| Incident row → detail | NAV | `incident-detail` | `w8f-governance` incident |
| "הקצאה" (`incident-assign`) | ACT | assigns a named user | `w8f-governance` incident |
| "הכלה"/"פתרון"/"תחקיר" | ACT/DISABLED | each disabled with its "מחייב…" reason until text entered | `tests/governance/incidents` |
| "סגירה" (`incident-close`) | ACT/DISABLED | close requires a review (no close without lessons) | `tests/governance/incidents` |
| Health-incidents section + close | ACT | closes a `source:system-health` incident + audit | `w8f-governance` health section |

## /administration (`AdministrationPage.tsx`)

| Control | Class | Handler / disabled-reason | Covering test |
|---|---|---|---|
| Tabs (users/roles/permissions/orgs/reviews/requests/emergency/audit) | VIEW | `role="tab"` switch | `w8f-administration` keyboard nav |
| "יצירת משתמש" (`create-user-button`) → modal | ACT | creates a demo user | `tests/administration/page` |
| "הקצאת תפקיד" (`assign-role-*`) → modal → "הקצאה" | ACT | `assignRole` (resets overrides + audit) | `w8f-administration` role assignment |
| "בקשת שינוי" (`request-change-*`) → modal | ACT | opens the request modal | `w8f-administration` self-approval + invalid-combo |
| Request approver select | VIEW | **excludes** the current actor (self-approval structurally impossible) | `w8f-administration` self-approval |
| "שליחה לאישור" | ACT/guarded | `requestPermissionChange`; refuses without a named approver + refuses invalid combinations at request time | `w8f-administration` self-approval + invalid-combo |
| "אישור"/"דחייה" request (`approve-request-*`) | ACT | `approveChangeRequest` → decide+execute+**verify by read-back** | `w8f-administration` approve→verified |
| "הכרעה" (locked) | DISABLED | "אישור עצמי חסום…" / "רק המאשר בשם… רשאי" | `w8f-administration` self-approval |
| Access-review approve/reject | ACT/DISABLED | decide; disabled "משתמש אינו סוקר את הגישה של עצמו" | `tests/administration/page` |
| Emergency "השבתה" (`emergency-disable-*`) | ACT | `activateEmergencyControl('agent-disable')` + audit | `w8f-administration` emergency → /agents + CC |
| Emergency "הפעלה" (`emergency-activate-*`) | ACT | activates a flag control + reason + audit | `tests/administration/emergency` |
| Emergency "ביטול" (`deactivate-emergency-*`) | ACT | deactivates + audit | `tests/administration/emergency` |
| Confirm modal (`confirm-modal-confirm`) | ACT/DISABLED | runs the guarded action; requires reason where mandated | `w8f-administration` (all ACT flows) |

## /system-health (`SystemHealthPage.tsx`)

| Control | Class | Handler / disabled-reason | Covering test |
|---|---|---|---|
| "הרצת בדיקת בריאות מקומית" | ACT | `runAllChecks` → honest states + snapshot | `w8f-system-health` run |
| "אימות Repositories/מיגרציות/אינדקס החיפוש" | ACT | single-check reruns | `tests/system-health/checks` |
| "ייצוא דוח אבחון (מושמט-סודות)" | ACT/DISABLED | downloads redacted JSON; disabled "אין עדיין תצלום בריאות…" before first run | `w8f-system-health` export |
| "פתיחת תקרית" (per degraded component) | ACT | opens a `source:system-health` incident | `tests/cross-module-wave8/wiring` |
| Snapshot-history rows | VIEW | expand/inspect | `tests/system-health/snapshot` |

## /settings (`SettingsPage.tsx`)

| Control | Class | Handler / disabled-reason | Covering test |
|---|---|---|---|
| Group tabs (7) | VIEW | `role="tab"` switch | `w8f-settings` (all) |
| Editable toggle/select/number controls | ACT | `setSetting` → validate → apply + `lastChanged` | `w8f-settings` valid update |
| RTL toggle | DISABLED | disabled+checked; "RTL אינו ניתן לכיבוי — זהו חוזה המוצר" | `w8f-settings` RTL |
| Read-only settings (currency, ai.*, digest, budget…) | DISABLED | each with its `readOnlyReasonHe` | `tests/settings/page` |
| Sensitive setting (`security.slaResponseTargetHours`) | ACT | `setSetting` → **pending-approval**, value does NOT apply | `w8f-settings` sensitive→approval |
| Invalid value save | ACT (rejected) | Hebrew range error, nothing applies | `w8f-settings` invalid |
| "איפוס נתוני הדגמה דטרמיניסטי" → confirm modal | ACT/DISABLED | double-typed "אפס" confirm; "איפוס עכשיו" disabled until typed | `w8f-settings` reset confirm |
| "מצב הדגמה לבוחן (מצגת)" | NAV | → `/submission/presentation` | `tests/settings/page` |
| No key/secret input anywhere | (absence) | AI keys are server-side only — stated on the AI tab | `w8f-settings` no-key + `settingsStore` |

## Command Center — management band (`ManagementBand.tsx`)

| Control | Class | Handler | Covering test |
|---|---|---|---|
| `operational-risks` card | NAV | → `/governance` | `w8f-cross` management band |
| `critical-incidents` card | NAV | → `/governance` | `w8f-cross` |
| `pending-access-reviews` card | NAV | → `/administration` | `w8f-cross` |
| `health-attention` card | NAV | → `/system-health`; count is **"טרם נבדק"** (null, never 0) before any snapshot | `w8f-cross` (asserts טרם נבדק) |
| `missing-baselines` card | NAV | → `/analytics` | `w8f-cross` |
| `expiring-policies` card | NAV | → `/governance` | `w8f-cross` |
| `submission-approvals` card | NAV | → `/submission` | `w8f-cross` |

Every band count is derived from real records (`deriveManagementBand`) and the
whole card is a `<Link>` — no fake numbers, honest null rendering.

## Trivial a11y fixes applied (documented)

| File | Fix | Why |
|---|---|---|
| `src/modules/analytics/MetricChart.tsx` | svg `role="img"` → `role="group"` | atomic image role nesting focusable point controls = axe `nested-interactive` (serious) |
| `src/layout/LeftIntelligenceRail.tsx` | `.os-rail__body` given `tabIndex=0` + `role="region"` + aria-label | scrollable region needs keyboard access = axe `scrollable-region-focusable` (serious) |

Both are pure aria/role/tabIndex changes (within the trivial-a11y exception),
verified by the full unit run (1639/1639) and the axe gate (§ VISUAL_QA).
