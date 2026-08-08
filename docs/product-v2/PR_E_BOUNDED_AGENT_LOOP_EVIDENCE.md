# PR E — Bounded, Human-Controlled Agent Loop (S13.5)

A safe, deterministic, **human-controlled** 4-step workflow on `/ai-workspace`, over the existing Agent
Action Engine. **This is NOT autonomous AI.**

> **The Agent Loop does not execute agents autonomously. Every transition requires a user action.**

**Scope honesty:** no remote LLM, no MCP, no vector DB, no Prime Agent, no dynamic planning, no new
agents, no new agent actions, no new persistence, no background/queue/worker execution. `AI_REMOTE_ENABLED`
unchanged. No Supabase/migration/Production/main changes. Same registry, `runAgentAction`, and approval gate.

## State-machine diagram

```
IDLE ──start──▶ PLANNED ──[click]Hunter──▶ WAITING_FOR_USER(1)
   ──[click]Fixer proposal──▶ WAITING_FOR_USER(2)
   ──[click]stage──▶ AWAITING_APPROVAL(3) ──approve──▶ WAITING_FOR_USER(3) ──[click]Orchestrator──▶ COMPLETED(4)
                                          └─reject──▶ REJECTED
   (any active state) ──[click]עצור תהליך──▶ STOPPED
   fail-closed ──▶ BLOCKED / FAILED
```
Terminal: COMPLETED · REJECTED · STOPPED · BLOCKED · FAILED (no further step possible).

## Exact four-step flow — "בדיקת והשלמת נתוני לקוח"

1. **Hunter** `hunter.incomplete-customers` (READ ONLY) → evidence (an incomplete demo customer). **STOP:** user clicks "המשך להצעת תיקון".
2. **Fixer proposal** `fixer.propose-correction` (PROPOSAL ONLY, no mutation), pre-filled from Hunter's recordId. **STOP:** "המשך לאישור".
3. **Fixer approval** `fixer.apply-correction` — staged returns `awaiting_approval` (no mutation); user **approves** (applies once, duplicate blocked) or **rejects** (loop ends, no mutation).
4. **Orchestrator** `orch.system-review` (READ ONLY) summary. **STOP:** user clicks "סכם תהליך" → COMPLETED. Not auto-run after approval.

## Execution-budget table

| Limit | Value |
|-------|-------|
| Max agent steps | **4** (`LOOP_MAX_STEPS`) |
| Max mutations | **1** (approval-gated) |
| Active loops | **1** |
| Dynamic step creation | none |
| Background/timer/recursive continuation | none |
| Network / remote AI | none |

Displayed: "4 שלבים לכל היותר" · "המערכת ממתינה לאישור שלך בין שלבים".

## Human-control points (every transition is an explicit click)

`המשך` (next step) · `אשר והחל` · `דחה` · `עצור תהליך` (available at every active non-terminal stage) ·
`תהליך חדש` (terminal). **Proven:** Hunter result does NOT invoke Fixer; Fixer proposal does NOT approve;
approval does NOT invoke Orchestrator; no hidden chaining, timers, or recursion.

## Fail-closed conditions

Missing organization context → BLOCKED; missing evidence/recordId → BLOCKED; agent action
`validation_error`/`execution_error` → FAILED; staged approval not `awaiting_approval` → FAILED; apply not
`applied` → FAILED; max-step guard; out-of-order calls are guarded no-ops. No failed step is silently
skipped; a safe Hebrew reason is shown.

## Approval evidence

Before approval the mutation store is untouched (`appliedCorrectionCount() === 0`); on approve it becomes
`1` (applies exactly once); a second approve is a no-op and the engine blocks duplicates (stays `1`);
reject never calls the engine (`0`). Stopping after an applied mutation does **not** roll it back (stays `1`).

## Stop evidence

`עצור תהליך` is present at IDLE-exclusive active states (PLANNED/WAITING/AWAITING). After stop: status
STOPPED, no `loop-next`, no further step executes, and an already-applied demo mutation is preserved
(honest, no false rollback).

## No-autonomy test evidence

`agentLoop.test.ts` (11) + `agentLoopPanel.test.tsx` (5): starting the loop runs no agent; each step runs
only on its explicit call; Fixer/approval/Orchestrator never chain; duplicate/out-of-order/terminal calls
are no-ops; correlationIds + evidence counts preserved; only registered `AGENT_ACTIONS` are used (no second
registry).

## Trace / explainability

A compact timeline (`agent · action · status · short result · evidence count · shortened correlationId ·
timestamp`) — one entry per completed step (Hunter → Fixer proposal → Human approval → Orchestrator).
Technical detail is minimal and structured; **no chain-of-thought**, only engine-produced evidence/summaries.

## Memory

Loop results are **not** auto-written to `/memory`. A user-confirmed "הצע שמירה בזיכרון" path is **deferred**
(memory stays read-only to agents; writes require explicit human action through the existing MemoryRepository).

## Responsive / a11y

`/ai-workspace` added to the **required** CI a11y Pilot. Verified locally (Chromium × 1440/390): route axe
**0 critical/serious**; the guided-loop states (idle → awaiting → completed) are **axe-clean**, keyboard-
operable, with distinct named controls and **0 horizontal overflow** (timeline readable at 390). Fixed three
pre-existing `/ai-workspace` axe defects surfaced by gating the route (aria-required-children, code-name
contrast, in-text link underline). Live: loop drives correctly at 390, **0 console errors**.

## Tests

Loop **16** (state machine 11 + UI 5) + **4** a11y Pilot (route + guided-loop × 2 viewports). build ✅ ·
typecheck ✅ · typecheck:tests ✅ · full `vitest` **2613/2613** (16 new) — only the 12 known
`tests/platform/*` Rolldown file-load failures remain. oxlint ✅. No `test.skip`/`test.fail`/weakened
assertions.

## Limitations

- One hardcoded demo workflow (customer data cleanup); no dynamic planning / agent-choosing-agents.
- No durable loop persistence — a browser reload resets the demo loop (by design; no new persistence added).
- Loop-result → memory save is deferred (documented above).

## Source files

- New: `src/modules/ai-workspace/agentLoop.ts`, `src/modules/ai-workspace/AgentLoopPanel.tsx`,
  `tests/ai-workspace/agentLoop.test.ts`, `tests/ai-workspace/agentLoopPanel.test.tsx`, this file.
- Edited: `src/modules/ai-workspace/AiWorkspacePage.tsx` (render loop panel + a11y fixes),
  `tests/ai-workspace/workspace.test.tsx` (AuthProvider), `e2e/pilot/a11y.pilot.ts` (/ai-workspace + loop).
