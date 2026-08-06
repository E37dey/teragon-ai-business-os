# Final Route Acceptance Matrix (S12.0)

**Documentation-only acceptance review.** Branch `feature/teragon-final-product-qa` @
base `a6af99e`. No code changed. Academic scope: synthetic data only,
`AI_REMOTE_ENABLED=false`, Customers/Contacts are the validated persistence domains; all
others honestly represented.

**Evidence:** deterministic-readiness full-route sweep (`e2e/audit-screens.config.ts`),
32 routes × 1440/1024/768/390 — captured this checkpoint.

## Sweep totals (per viewport)

| Metric | 1440 | 1024 | 768 | 390 |
|--------|:----:|:----:|:---:|:---:|
| Routes | 32 | 32 | 32 | 32 |
| Shell header present | 31/32 | 31/32 | 31/32 | 31/32 |
| Main content rendered (non-headerless) | ✅ all | ✅ all | ✅ all | ✅ all |
| Document overflow > 2px | **0** | **0** | **0** | **0** |
| Console errors | **0** | **0** | **0** | **0** |
| RTL (`dir="rtl"`) | ✅ | ✅ | ✅ | ✅ |
| Sidebar mode | inline | hamburger | hamburger | hamburger |

The only headerless route is `/submission/presentation` — a full-bleed slide mode that
hides the shell chrome **by design** (exempted, content renders, 0 overflow).

## Per-route acceptance (all reachable · 0 overflow · 0 console error at all 4 viewports)

Status: **ACCEPTED** (live/tested), **ACCEPTED_DEMO_ONLY** (honest local/deterministic).

| # | Route | Hebrew heading | Data / capability | Verdict |
|--:|-------|----------------|-------------------|---------|
| 1 | `/` | מרכז השליטה | local aggregate + HITL approvals | ACCEPTED_DEMO_ONLY |
| 2 | `/crm` | ניהול לקוחות ולידים | IndexedDB, tested | ACCEPTED_DEMO_ONLY |
| 3 | `/customers` | לקוחות | **Supabase + RLS (LIVE_VALIDATED)** | **ACCEPTED** |
| 4 | `/contacts` | אנשי קשר | **Supabase + RLS (LIVE_VALIDATED)** | **ACCEPTED** |
| 5 | `/customers/:id` | כרטיס לקוח | **Supabase (LIVE_VALIDATED)** | **ACCEPTED** |
| 6 | `/sales` | מכירות והצעות מחיר | IDB, tested | ACCEPTED_DEMO_ONLY |
| 7 | `/courses` | קורסים ולמידה | IDB, tested | ACCEPTED_DEMO_ONLY |
| 8 | `/service` | שירות ותיקונים | IDB, tested | ACCEPTED_DEMO_ONLY |
| 9 | `/printers` | מדפסות ודגמים | IDB, tested | ACCEPTED_DEMO_ONLY |
| 10 | `/organizations` | ארגונים | IDB, tested | ACCEPTED_DEMO_ONLY |
| 11 | `/tasks` | משימות ופגישות | IDB, tested | ACCEPTED_DEMO_ONLY |
| 12 | `/documents` | מסמכים והצעות מחיר | IDB (LOCAL_ONLY) | ACCEPTED_DEMO_ONLY |
| 13 | `/automations` | אוטומציות | deterministic rules | ACCEPTED_DEMO_ONLY |
| 14 | `/agents` | סוכני AI | 7 agents · 14 actions · local rules | ACCEPTED_DEMO_ONLY |
| 15 | `/agents/collaboration` | חדר התיאום | deterministic orchestrator | ACCEPTED_DEMO_ONLY |
| 16 | `/memory` | זיכרון ארגוני · Obsidian | IDB, tested | ACCEPTED_DEMO_ONLY |
| 17 | `/knowledge` | מאגר ידע | IDB (LOCAL_ONLY) | ACCEPTED_DEMO_ONLY |
| 18 | `/learning` | מרכז למידה ושיפור | deterministic signals | ACCEPTED_DEMO_ONLY |
| 19 | `/analytics` | דוחות וניתוחים | computed from seed | ACCEPTED_DEMO_ONLY |
| 20 | `/governance` | ממשל ובקרת AI | IDB (LOCAL_ONLY) | ACCEPTED_DEMO_ONLY |
| 21 | `/implementation` | תכנית ההטמעה | curated content | ACCEPTED_DEMO_ONLY |
| 22 | `/personas` | פרסונות ומסלולי הדרכה | curated content | ACCEPTED_DEMO_ONLY |
| 23 | `/stage-gates` | Stage Gates · שערי מעבר | evidence index | ACCEPTED_DEMO_ONLY |
| 24 | `/training-materials` | מרכז חומרי ההדרכה | curated content | ACCEPTED_DEMO_ONLY |
| 25 | `/quick-start` | התחלה מהירה | curated content | ACCEPTED_DEMO_ONLY |
| 26 | `/faq` | FAQ והתנגדויות | curated + local sim rail | ACCEPTED_DEMO_ONLY |
| 27 | `/support` | תמיכה לאחר ההשקה | curated content | ACCEPTED_DEMO_ONLY |
| 28 | `/administration` | ניהול המערכת | IDB users/roles, tested | ACCEPTED_DEMO_ONLY |
| 29 | `/system-health` | בריאות המערכת | local diagnostics, tested | ACCEPTED_DEMO_ONLY |
| 30 | `/settings` | הגדרות | IDB, tested | ACCEPTED_DEMO_ONLY |
| 31 | `/submission` | מרכז ההגשה והראיות | evidence index | ACCEPTED_DEMO_ONLY |
| 32 | `/submission/presentation` | מצגת ההגשה | full-bleed deck (fluid) | ACCEPTED_DEMO_ONLY |

**Totals: 32/32 routes ACCEPTED — 3 ACCEPTED (LIVE_VALIDATED) + 29 ACCEPTED_DEMO_ONLY.**
0 BLOCKER. Every route resolves, renders, is RTL-correct, keyboard-reachable (a11y gate
18/18), overflow-free, and console-error-free at all four viewports. Local-demo screens
carry the persistent Demo-Mode banner and honest labels.
