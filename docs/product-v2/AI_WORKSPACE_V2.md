# AI Workspace V2 — Making Agents Visibly Alive (S13.0)

## The core problem (evidence)

TERAGON has **two disjoint agent subsystems that never touch each other**, and the one the user
naturally treats as "the agents" is the weaker one.

| | **A. Business Actions** (the 14 headline actions) | **B. Orchestration Runs** (graph + timeline) |
|---|---|---|
| Entry | `AgentActionsPanel.tsx` → `runAgentAction()` | `AgentCollaborationPage.tsx` → `runDemoScenario()` |
| Engine | `agents/actions/engine.ts` (pure fn) | `AgentOrchestrator` + `LocalRulesProvider` |
| Persistence | **None** — React `useState` only (`AgentActionsPanel.tsx:64-68`) | IndexedDB (`agentRuns`, `agentEvents`) |
| State model | ephemeral per-click chip | full lifecycle `רץ/ממתין לאישור/הושלם/נכשל` |
| Run history | **No** | **Yes** (persisted events/timeline) |
| Inter-agent graph | **No** | **Yes** (`runGraph`/`layoutRunGraph`, `selectors.ts:38-93`) |

The **14 actions** (12 deterministic + `fixer.apply-correction` & `flow.automation-proposal`
approval-gated) each return a well-structured, honest `AgentActionResult` (findings, evidence, 5-part
`why`, `correlationId`, `engineLabel="מנוע חוקים מקומי — ללא מודל מרוחק"`) — but they write to **no
repository**, produce **no run record**, and feed **nothing** into the collaboration graph. The
genuinely "alive" artifacts (lifecycle state machine, event narrative, orchestrator-dispatch graph) are
**real and record-derived** but sequestered on `/agents/collaboration`, **seeded empty**
(`seed/index.ts:90-91`), and only populate after a user manually fires **one hardcoded scenario**
(`demoScenario.ts`).

**AI-visibility verdict:** *As shipped, the agents do not visibly and continuously communicate that they
are doing useful, connected work — the strongest "AI is alive" evidence is one click away, disconnected
from the actions, and dark until explicitly summoned.* `RemoteAIProvider` is confirmed flag-gated off
(`engine.ts:31`, `demoScenario.ts:92`).

## Does the UI communicate IDLE / RUNNING / WAITING_APPROVAL / COMPLETED / FAILED?

Only partially, and split across three unlinked mechanisms:
- **Fleet StatusChip** (`AgentsPage.tsx:617`) shows only **פעיל / מושבת** (an admin toggle — not run-state).
- **Action result chip** (`AgentActionsPanel.tsx:16-23`) maps a *single* result → `הושלם/הוחל/ממתין לאישור/…`
  plus a transient "מריץ…" — ephemeral, per-click, cleared on re-select.
- **Run lifecycle chips** (`רץ/ממתין לאישור/הושלם/נכשל`) exist **only** for orchestration runs on the
  collaboration page, and only after the demo scenario runs.

There is **no unified, always-on per-agent state** reading live execution. That is the gap AI Workspace V2 closes.

## Target concept — one **AI Workspace** (`/agents`)

Merge the fleet page and the collaboration room into a single surface. Everything derives from **real
deterministic execution state** — no faked activity.

```
┌───────────────────────────────────────────── AI WORKSPACE ─────────────────────────────────────────┐
│ TOP BAR:  ● 7 agents   ▷ 0 running   ⏳ 2 awaiting approval   ✓ 12 actions today   (all record-derived)│
├──────────────────────────┬──────────────────────────────────────┬──────────────────────────────────┤
│ LEFT: agent list         │ MAIN: selected agent — action area    │ RIGHT (on-demand): inspector     │
│  Orchestrator  ● idle    │  [Run system review] [Action plan]    │  • Evidence (records touched)    │
│  Hunter        ● idle    │  ── result card (findings/why) ──     │  • Tools used (local-rules)      │
│  Fixer        ⏳ waiting  │  ── approval button when gated ──     │  • Memory recalled (or "none")   │
│  Flow         ⏳ waiting  │                                       │  • Run timeline (this agent)     │
│  Mentor/Nexa/Wiki ● idle │                                       │                                  │
├──────────────────────────┴──────────────────────────────────────┴──────────────────────────────────┤
│ ACTIVITY (record-derived, always visible — NOT faked):                                              │
│  Hunter    → scanned 5 customer records → found 3 incomplete → attached evidence → sent recommendation│
│  Fixer     → received finding → generated proposed correction → ⏳ waiting for human approval          │
│  Orchestrator → reviewed agent outputs → created prioritized next actions                            │
└─────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### What must change to make this real (not theatre)

1. **Unify the two subsystems.** Route the 14 business actions through a run/event recorder so each click
   produces a **persisted run record + structured events** (reuse the existing `agentRuns`/`agentEvents`
   IndexedDB collections that the collaboration page already reads). This is the single highest-leverage change.
2. **One live state per agent** — derive `IDLE / RUNNING / WAITING_APPROVAL / COMPLETED / FAILED` from the
   latest run record, shown as an always-on chip in the agent list. Keep `פעיל/מושבת` as a separate
   enable toggle.
3. **Always-visible activity feed** built from those events (`EVENT_LABELS_HE` already exists,
   `selectors.ts:108-128`) — no manual "run demo scenario" gate; it fills as the user actually uses actions.
4. **Inter-agent visibility** — surface the orchestrator→specialist dispatch and Hunter/Fixer handoff the
   `runGraph` already models, driven by real action runs rather than one hardcoded scenario.
5. **Inspector on demand** (right drawer): evidence, tools, memory-recalled (honestly "none" until memory
   is wired — see OBSIDIAN_MEMORY_REALITY.md), and this-agent run timeline.

### Honesty guardrails (non-negotiable)

- Activity events **derive from real deterministic execution state** — never synthesized for effect.
- Keep `engineLabel` on every result; keep `remoteEnabled:false`.
- Approval-gated mutations stay human-gated, idempotent, duplicate-blocked (existing behavior).
- "Memory recalled" shows the truth (currently none reaches the agent action engine).

### Sequencing

This is **PR C** (AI Workspace + visible execution timeline), and it depends on the unification in step 1.
It does **not** require a remote provider or Prime Agent — it is a free/local reorganization of surfaces
TERAGON already has. Agent *loops* (PR E) and any Prime Agent POC (PR F) build on top of this.
