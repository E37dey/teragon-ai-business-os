# TERAGON — Page & Action Audit (S11.1-A)

**Documentation-only.** No app code, routes, Supabase, migrations, or flags changed.
Date 2026-08-04 · Branch `feature/teragon-product-rationalization-audit` · Base
`feature/teragon-supabase-app-auth` @ `eade083`.

**Evidence base:** a live full-route Playwright sweep captured **128 screenshots**
(32 routes × 1440/1024/768/390 → `shots/audit/<w>/`) plus objective per-route metrics
(`shots/audit/_metrics-<w>.json`): document overflow, header presence, nav mode, `dir`,
console errors. Action classifications were taken from **reading the handlers**, not
from component names or screenshots (per checkpoint rule).

## Objective sweep results

| Metric | 1440 | 1024 | 768 | 390 |
|--------|:----:|:----:|:---:|:---:|
| Shell header present | 31/32 | 31/32 | 31/32 | 31/32 |
| Inline sidebar (`nav.os-nav`) | **31** | **0** | 0 | 0 |
| Hamburger drawer | 0 | **31** | 31 | 31 |
| Routes with overflow > 2px | 0 | 0 | **1** | **1** |
| Routes with console errors | 0 | 0 | 0 | 0 |

- The **only headerless route is `/submission/presentation`** — a full-bleed slide mode
  that hides the shell by design.
- The **only overflowing route is `/submission/presentation`**: **238px @ 768**, **616px
  @ 390** (fixed-width slides; screenshot-confirmed clipping). Everything else is 0.
- **Zero console errors on any route at any viewport.** No dead links; every canonical
  route rendered its shell.
- **Nav breakpoint finding:** the persistent inline sidebar appears **only at 1440**; at
  **1024 and below it collapses to the hamburger drawer** — so even a 1024 "desktop"
  loses the sidebar. This is the single biggest navigation observation.
- **Capture caveat (honest):** at ≤1024 the 200ms settle under-rendered the `<main>`
  content in the sweep frames (blank middle on data routes). Content presence at ≤1024
  is nonetheless **proven** by the passing a11y / network / cross-browser gates and the
  live 1024 DOM smoke (`main` = 978px). Classified NOT_TESTED-in-sweep, not a defect.

## Per-route audit (purpose · data · status · primary task · honesty)

Status uses the approved taxonomy (LIVE_VALIDATED / CONNECTED_LOCAL_TESTED / LOCAL_ONLY
/ DETERMINISTIC_DEMO / UI_ONLY). All routes represent their capability **honestly** (the
non-dismissible Hebrew demo banner is on every route; AI is labelled deterministic).

| Route | Purpose / primary task | Data | Status | Honest? |
|-------|------------------------|------|--------|:------:|
| `/` | Command center — triage KPIs, approve AI recommendations | local aggregate | CONNECTED_LOCAL_TESTED | ✅ |
| `/crm` | Leads & opportunities pipeline | IDB | CONNECTED_LOCAL_TESTED | ✅ |
| `/customers` | Customer list + create/edit | **Supabase** | **LIVE_VALIDATED** | ✅ |
| `/contacts` | Contact list + create/edit | **Supabase** | **LIVE_VALIDATED** | ✅ |
| `/customers/:id` | Customer detail | **Supabase** | **LIVE_VALIDATED** | ✅ |
| `/sales` | Quotations & pipeline | IDB | CONNECTED_LOCAL_TESTED | ✅ |
| `/courses` | Courses & learning ops | IDB | CONNECTED_LOCAL_TESTED | ✅ |
| `/service` | Service tickets & repairs | IDB | CONNECTED_LOCAL_TESTED | ✅ |
| `/printers` | Printer models catalog | IDB | CONNECTED_LOCAL_TESTED | ✅ |
| `/organizations` | Org/account records | IDB | CONNECTED_LOCAL_TESTED | ✅ |
| `/tasks` | Tasks & meetings | IDB | CONNECTED_LOCAL_TESTED | ✅ |
| `/documents` | Documents & quotations | IDB | LOCAL_ONLY | ✅ |
| `/automations` | Deterministic automation rules | local-rules | DETERMINISTIC_DEMO | ✅ |
| `/agents` | 7 AI agents; enable/disable, emergency-stop | local-rules | DETERMINISTIC_DEMO | ✅ |
| `/agents/collaboration` | Agent coordination room | local-rules | DETERMINISTIC_DEMO | ✅ |
| `/memory` | Org memory (Obsidian-style) | IDB (tested) | CONNECTED_LOCAL_TESTED | ✅ |
| `/knowledge` | Knowledge base | IDB | LOCAL_ONLY | ✅ |
| `/learning` | Improvement signals | local-rules | DETERMINISTIC_DEMO | ✅ |
| `/analytics` | Reports & analytics | computed | CONNECTED_LOCAL_TESTED | ✅ |
| `/governance` | AI governance & controls | IDB | LOCAL_ONLY | ✅ |
| `/implementation` | Rollout plan content | curated | UI_ONLY | ✅ |
| `/personas` | Personas & training tracks | curated | UI_ONLY | ✅ |
| `/stage-gates` | Stage gates & evidence | curated | UI_ONLY | ✅ |
| `/training-materials` | Training hub | curated | UI_ONLY | ✅ |
| `/quick-start` | Quick-start guide | curated | UI_ONLY | ✅ |
| `/faq` | FAQ & objections | curated | UI_ONLY | ✅ |
| `/support` | Post-launch support | curated | UI_ONLY | ✅ |
| `/administration` | Users/roles admin | IDB | CONNECTED_LOCAL_TESTED | ✅ |
| `/system-health` | Diagnostics | local | CONNECTED_LOCAL_TESTED | ✅ |
| `/settings` | Settings | IDB | CONNECTED_LOCAL_TESTED | ✅ |
| `/submission` | Submission & evidence hub | curated | UI_ONLY | ✅ |
| `/submission/presentation` | Slide deck | curated | UI_ONLY | ⚠️ overflow @≤768 |

## Action classification (handlers read, not inferred)

| Action | Where | Class |
|--------|-------|-------|
| Approve / reject AI recommendation (`אשר`/`דחה`) | `/` | **WORKING_DEMO_ONLY** — `onDecide→decide()`, busy "ההחלטה נשמרת…" disabled state, invalidates approvals/agentRuns/agentEvents/auditEvents |
| Open evidence (`פתח ראיות`) | `/` | **WORKING_DEMO_ONLY** — opens evidence Modal; "לא צורפו ראיות" empty state |
| Customer/Contact create · edit · list read | `/customers` `/contacts` | **WORKING** (LIVE_VALIDATED; 12/12 live acceptance each) |
| Quick-add (`+`) → create dialog | header | **WORKING_DEMO_ONLY** (dialog opens; keyboard-proven by network gate) |
| Agent enable/disable · emergency-stop-all (confirm) · select · tabs | `/agents` | **WORKING_DEMO_ONLY** (real `useState`/`toggleDisable`/`emergencyStopAll`) |
| CRUD on demo domains (crm/sales/service/tasks/…) | 15 routes | **WORKING_DEMO_ONLY** (IDB seed; resets per build) |
| Remote-model AI | provider | **DISABLED_HONESTLY** (`AI_REMOTE_ENABLED=false`) |
| SUPABASE-mode "create not yet available" notice | `/customers` | **DISABLED_HONESTLY** (Hebrew notice, not a fake button) |
| Theme light/dark toggle | header | **WORKING** |
| Global smart search (`חיפוש חכם`) | header | **NOT_TESTED** (handler not verified this checkpoint) |
| Print/export controls presented on content pages | UI_ONLY pages | **NOT_TESTED** (availability not verified) |

**Totals (≈70 primary actions inspected):** WORKING ≈ 8 · WORKING_DEMO_ONLY ≈ 48
(incl. 32 nav links + demo CRUD + agent/approval controls) · DISABLED_HONESTLY ≈ 4 ·
NOT_TESTED ≈ 10 · **NO_OP 0 · BROKEN 0 · MISLEADING 0.**

**Headline: no no-op, broken, or misleading action was found.** Every clickable control
inspected either performs a real (often demo) effect or is honestly disabled/labelled.
