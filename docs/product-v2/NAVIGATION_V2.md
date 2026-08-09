# Navigation V2 + Context-Rail Rationalization (S13.0)

## Current state (evidence)

- **32 routes** (`src/app/routes.ts:17-110`); `routes.ts` marks 30 as `inNav:true`, but the sidebar
  model (`navGroups.ts:22-85`) surfaces **28 items across 5 groups** — and `/customers` + `/contacts`
  are `inNav:true` yet **absent from the nav model** (reachable only via `/crm` or direct URL).
- Everyday-business and academic/submission/training content are **interleaved**: Analytics is buried in
  the "הטמעה והגשה" (Adoption & Submission) group; Governance sits inside a group **self-labeled**
  "מעבדת AI · דמו מקומי" (AI Lab · local demo).
- **Header** (`CompactTopHeader.tsx`): identity + ~5 action buttons + full-width search + a three-part
  date/clock meta strip. **No breadcrumbs, no org switcher.**

### Current 5 groups (28 items)

1. **ניהול העסק** (6): `/`, `/crm`, `/sales`, `/organizations`, `/tasks`, `/documents`
2. **שירות והדרכה** (4): `/courses`, `/service`, `/printers`, `/support`
3. **מעבדת AI · דמו מקומי** (7): `/agents`, `/agents/collaboration`, `/automations`, `/memory`, `/knowledge`, `/learning`, `/governance`
4. **הטמעה והגשה** (8): `/implementation`, `/personas`, `/stage-gates`, `/training-materials`, `/quick-start`, `/faq`, `/analytics`, `/submission`
5. **עוד** (3): `/administration`, `/system-health`, `/settings`

## Target information architecture — 6 primary groups

Everyday business first; academic/reference/training/submission **demoted** (still reachable, not
dominating). All 32 routes remain technically reachable.

| Group | Primary items (everyday) |
|-------|--------------------------|
| **1. מרכז הפיקוד (Command Center)** | `/` , `/analytics` *(promoted up — it is everyday-business, not "submission")* |
| **2. לקוחות ואנשי קשר (Customers & Contacts)** | `/crm`, `/customers`, `/contacts` *(surface in nav)*, `/organizations`, `/documents`, `/sales` |
| **3. סוכני AI וסביבת העבודה (AI Agents & Workspace)** | `/agents` → **AI Workspace**, `/agents/collaboration` *(fold into Workspace)*, `/automations` |
| **4. ידע וזיכרון (Knowledge & Memory)** | `/knowledge`, `/memory` *(rename off the "Obsidian" promise — see below)* |
| **5. תפעול (Operations)** | `/tasks`, `/service`, `/printers`, `/system-health` |
| **6. מערכת ומתקדם (System / Advanced)** | `/settings`, `/administration`, `/governance` + nested **Learning/Adoption** and **Submission** sub-menus |

Primary everyday nav shrinks from 28 interleaved items to **~13 business routes** across 6 clean groups.

### Demotions (out of everyday primary nav)

| Bucket | Routes |
|--------|--------|
| **Learning / Adoption** (nested under System/Advanced) | `/courses`, `/learning`, `/implementation`, `/personas`, `/stage-gates`, `/training-materials`, `/quick-start`, `/faq`, `/support` |
| **Submission** (nested; evidence artifacts) | `/submission`, `/submission/presentation` |
| **System / Advanced** | `/administration`, `/settings`, `/governance` *(move out of the "local demo" AI group)* |
| **AI-Lab honesty** | keep only operational AI surfaces (`/agents`, `/agents/collaboration`, `/automations`, `/memory`, `/knowledge`) in primary nav; move `/learning`, `/governance` out |

### Naming fixes

- `/memory` "זיכרון ארגוני · Obsidian" → **"זיכרון ארגוני (מקומי)"** until a real vault adapter exists
  (see OBSIDIAN_MEMORY_REALITY.md — corrected S13.7: a manual Obsidian import/export bridge is connected; no live vault sync).
- Rename `/agents` surface to **"סביבת עבודת AI" (AI Workspace)** and merge the collaboration room into it
  (see AI_WORKSPACE_V2.md) so agents feel like one live surface, not two disconnected pages.

## Context-rail audit (spec E) & decision

Mechanism: portal `RailProvider` (`rail.tsx:8-33`); pages publish `<PageRail>` or suppress with
`<HideShellRail/>`. When no page publishes, the shell renders **`DefaultRail`** — an honest placeholder
that prints filler text ("the contextual rail of «X» will be built with the screen") — `OsShell.tsx:45-61`.

| Route | Rail today | Unique value? | Decision |
|-------|-----------|---------------|----------|
| `/` Command Center | HideShellRail (none) | — | **Keep hidden** (correct) |
| `/memory` | Import/Export + sync controls | **Yes — actions not elsewhere** | **KEEP** (only clearly-justified rail) |
| `/agents` | Fleet rollup + link to collaboration | Semi-unique (cross-nav) | **KEEP as on-demand** insights panel |
| `/knowledge` | Aggregate rollups (`KnowledgeRail`) | Derived from page data | **MOVE_TO_DRAWER** |
| `/crm`, `/automations`, `/analytics` | Side summaries/filters | Partially duplicative | **MOVE_TO_DRAWER** |
| `/customers`, `/customers/:id`, `/system-health` | Restate on-page data | **Duplicated** | **REMOVE** (fold the one unique datum into the page) |
| `/contacts` + any route w/o PageRail | `DefaultRail` placeholder | **None** | **REMOVE** the placeholder entirely |

### Rail policy V2 (default: NO permanent rail)

> **A route renders no permanent rail unless the rail provides a contextual *action* or otherwise-
> unavailable value.** The main workspace must remain visually dominant.

- **Delete `DefaultRail`** — never show filler; absence of contextual value = no rail.
- Replace permanent rails with an **on-demand inspector/drawer** (an "AI insights / details" button in the
  page header) that slides over, keeping the canvas dominant.
- **Keep permanent** only: **Memory** (import/export controls). **Agents** insights become a drawer/panel.
- Net effect: from ~10 permanent rails to **≤1**, recovering large horizontal space (a top user complaint).

## Header V2

- Keep: identity, quick-add (+), notifications, search (⌘K), theme, logout.
- **Drop** the decorative clock; keep a single date. Consider a breadcrumb slot for detail routes
  (`/customers/:id`). Org switcher only when multi-org is real (not now).
