# TERAGON — Page & Action Audit (S11.1-A)

**Documentation-only.** No app code, routes, Supabase, migrations, or flags changed.
Date 2026-08-04 · Branch `feature/teragon-product-rationalization-audit` · Base
`feature/teragon-supabase-app-auth` @ `eade083`.

**Evidence base (corrected — S11.1-A2):** the harness now uses **deterministic route
readiness** (Suspense loader `.os-route-loading` detached → `main.os-workspace__canvas`
holds real content → `networkidle` + settle for data-driven widgets), and **fails** any
non-exempt route whose main stays empty. Full-route Playwright sweep re-captured **128
screenshots** (32 × 1440/1024/768/390 → `shots/audit/<w>/`) + per-route metrics
(`_metrics-<w>.json`): expected route, final URL, page heading, main-rendered, overflow,
sidebar mode, header controls, console errors. Action classes were read from **handlers**.
Key numbers were **independently re-verified** in a live browser (DOM measurement).

> ⚠️ **This supersedes the first (200ms) sweep, which was wrong.** That run under-rendered
> lazy routes at ≤1024 and reported *0 overflow at 390* and *only `/submission/presentation`
> at 768*. With content fully rendered the truth is the **opposite**: widespread narrow-
> viewport overflow (below). The corrected `mainRendered` gate is now `true` for all 31
> shell routes at every viewport (0 empty-main).

## Objective sweep results (corrected)

| Metric | 1440 | 1024 | 768 | 390 |
|--------|:----:|:----:|:---:|:---:|
| Main content rendered | 31/31 | 31/31 | 31/31 | 31/31 |
| Sidebar mode | **inline** | hamburger | hamburger | hamburger |
| Routes with overflow > 2px | **0** | **1** (`/automations`=6px) | **12** | **26** |
| Max overflow (route) | 0 | 6px | **238px** (`/submission/presentation`) | **616px** (`/submission/presentation`) |
| Routes with console errors | 0 | 0 | 0 | 0 |

- **Root-caused finding (independently verified):** the operational workspace
  `main.os-workspace__canvas` has an **~883px intrinsic minimum width** — its KPI /
  metrics grids are fixed **4-column** layouts (`~238px × 4 ≈ 952px`,
  `os-more-metrics__grid ~223px × 4`) that do **not** reduce column count on narrow
  screens. So overflow ≈ `883 − viewport`: **0 @ 1024** (977 canvas fits 1014), **137 @
  768**, **506 @ 390** on the dashboard, similar across content routes.
- **Overflow @ 768 (12 routes):** presentation 238, implementation 230, automations 156,
  personas 130, `/` 128, support 116, system-health 108, governance 69, stage-gates 37,
  administration 15, documents 6, learning 4.
- **Overflow @ 390 (26 routes):** presentation 616, implementation 608, personas 508, `/`
  506, support 494, system-health 486, governance 447, stage-gates 415, administration
  393, documents 384, learning 382, automations 376, quick-start 366, settings 325,
  agents 281, sales 275, memory 273, crm 243, submission 205, customers 183, faq 153,
  tasks 117, analytics 114, contacts 95, courses 91, knowledge 20.
- **`/submission/presentation`** overflows worst (238 @ 768, 616 @ 390) — it adds
  fixed-width slides on top of the canvas floor, and is the only **headerless** route
  (full-bleed slide mode, exempted explicitly).
- **Zero console errors** on any route at any viewport; **no dead links**; all shell
  routes render.
- **Sidebar (reassessed, NOT a defect):** the inline sidebar shows at 1440; ≤1024 uses
  the labelled hamburger drawer. This is **intentional and correct**: at 1024 the
  hamburger frees the workspace to ~1014px so the 977px canvas fits (0 overflow); an
  inline sidebar there would steal ~250px and push the 883px content floor into overflow
  *at 1024 too*. Navigation stays discoverable via the labelled toggle. Recorded as an
  **intentional responsive decision**, not H2.

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
