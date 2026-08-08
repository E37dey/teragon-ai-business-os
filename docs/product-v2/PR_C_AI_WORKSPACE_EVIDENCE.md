# PR C — Central AI Workspace (S13.3)

Third Product V2 build. Turns the existing seven-agent **Local Demo Action Engine** into one coherent
work experience at `/ai-workspace` ("מרחב AI"). **Not seven dashboards** — one calm page answering four
questions: what needs attention · which agent helps · what did agents find · what needs approval.

**Scope honesty:** presentation/orchestration layer only. Reuses the SAME `src/agents/actions` registry,
`runAgentAction`, result schema, approval gate, demo-mutation protection and `correlationId`. No remote
LLM, no MCP, no vector DB, no real memory, no Agent Loop, no new agents, no new persistence,
`AI_REMOTE_ENABLED` unchanged. No Customers/Contacts/Supabase/migration/Production/main changes.

## Workspace structure (IA)

- **A. Top summary — 4 KPIs**, all derived from real local demo state: *דורש טיפול* (attention count),
  *ממתין לאישורך* (pending approvals), *תוצאות סוכנים אחרונות* (recent results this session), *סוכנים זמינים*
  (7, from the frozen definitions). No fabricated "online" values.
- **B. Primary work area** — one dominant panel "מה דורש טיפול עכשיו?" showing a **≤5** prioritized list
  derived from Hunter + Orchestrator read-only scans (severity · title · source agent · evidence count ·
  recommended action · canonical target).
- **C. Agent quick actions** — a **compact 7-agent selector** (not seven big cards); selecting an agent
  renders the existing `AgentActionsPanel` (≤2 actions/agent) which reuses the engine.
- **D. Approval queue** — real approval-gated Fixer proposals (before/after, why, evidence collapsed);
  Approve reuses the gate (applies once, blocks duplicates); Reject removes without any engine call.
- **E. Recent activity** — **≤5** deterministic results (agent · action · status · time · shortened
  correlationId); detail lives in the action/approval cards (progressive disclosure).

One honest engine line at the top (not repeated per card): `מנוע חוקים מקומי — ללא מודל מרוחק · נתוני דמו
סינתטיים · ההמלצות ניתנות להסבר · כתיבה מחייבת אישור.`

## Seven-agent representation & handoffs

All 7 agents appear in the selector (Orchestrator, Hunter, Fixer, Flow, Mentor, Nexa, Wiki) with purpose +
code name. The workflow is understandable and **user-triggered only**: a Hunter attention finding offers
"העבר ל-Fixer" → selects Fixer and **pre-fills** the `recordId` input → the user explicitly runs it.
**No autonomous chaining; no auto-execution** (proven by test).

## Actions reused / no duplicate registry

`workspaceActionCount() === AGENT_ACTIONS.length === 14` (exactly 2 per agent × 7). The Workspace defines
**zero** new actions — it imports the single registry and calls `runAgentAction`.

## Approvals result

Approve → `runAgentAction("fixer.apply-correction", {recordId}, {approved:true})` → `applied`;
`appliedCorrectionCount()` increments exactly once; the item leaves the queue (no re-approval from UI);
duplicate application is blocked by the engine. Reject → **no engine call** → `appliedCorrectionCount()`
stays 0. Rendering the page applies nothing (approvals require explicit user action).

## Page-density metrics (live)

| Viewport | Doc height | Overflow | Notes |
|---------|---:|:---:|------|
| 1440 | 1,617px | 0 | 4 KPIs · 5 attention · 7-agent selector · 3 approvals · recent empty |
| 1024 | 1,649px | 0 | |
| 768 | 1,738px | 0 | |
| 390 | 2,420px | 0 | one column · 0 unfocusable scrollable regions |

Lighter than the old agent/coordination surfaces: one title, one primary area, ≤4 KPIs, ≤5 attention,
≤5 recent, evidence collapsed, rail hidden, semantic colours only, no glow/neon, RTL-first, dark-mode
preserved.

## Responsive / a11y

0 document overflow and 0 console errors at all four widths; one-column at 390; agent selector is a
keyboard-operable button row (`aria-pressed`); inputs are labelled; approval/reject/handoff are real
buttons with accessible names; `<details>` disclosures are native/keyboard-operable; honest
loading/empty/error states (empty attention → "אין משימות סוכן פעילות כרגע"). 0 NO_OP controls. CI
a11y / network-resilience / cross-browser gates are authoritative and run on this PR.

## Tests

- **AI Workspace suite: 7/7** — single 14-action registry reused (no duplicate); 7 agents; counters
  derive from real state; title + 4 KPIs + 7 agents render; ≤5 attention / ≤5 recent; approval requires
  explicit action, applies once, blocks duplicates; reject never mutates; handoff pre-fills Fixer without
  auto-executing.
- typecheck ✅ · typecheck:tests ✅ · agents + agents-ui + ai-workspace + router/nav **137/137** ✅ ·
  full `vitest` executable **2578/2578** (7 new) — only the 12 known `tests/platform/*` Rolldown
  file-load failures remain (pre-existing, CI-authoritative). oxlint ✅. No `test.skip`/`test.fail`/
  weakened assertions.

## Source files

- New: `src/modules/ai-workspace/AiWorkspacePage.tsx`, `src/modules/ai-workspace/workspaceModel.ts`,
  `tests/ai-workspace/workspace.test.tsx`, `docs/product-v2/AI_WORKSPACE_CONSOLIDATION_MAP.md`, this file.
- Edited: `src/app/routes.ts`, `src/app/router.tsx`, `src/app/nav/navGroups.ts`, `tests/router.test.tsx`,
  `src/modules/agents-ui/AgentActionsPanel.tsx` (optional `initialInputs` + `onResult`, backward compatible).

## Consolidation recommendations (see AI_WORKSPACE_CONSOLIDATION_MAP.md)

KEEP primary `/ai-workspace`; KEEP secondary `/agents`, `/automations`, `/memory`, `/knowledge`;
MERGE_INTO_WORKSPACE (later) `/agents/collaboration`; FUTURE_REMOVE/demote `/learning`. No routes removed.

**No AI Workspace successor work (Agent Loop / Prime Agent) is in this PR.**
