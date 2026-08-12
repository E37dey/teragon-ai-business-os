# Phase 7 — Business Operations Command Center (evidence)

Turns the existing Command Center into a daily executive operating surface for the AI-operations
layer: a **Daily Operations Brief**, an **Action Inbox**, and **Business Signal → Workflow**. Every
count, card, badge, and signal derives from **real existing TERAGON state** — no fabricated urgency,
risk, activity, or KPIs. Honest empty states everywhere.

> **Command Center counts are derived from the same real records displayed to the user.** ·
> **Business Signals represent deterministic conditions derived from existing TERAGON state.** · **No
> synthetic urgency, customer risk, revenue risk, or workflow activity is fabricated.** · **Business
> Signals do not automatically start workflows.** · **Human approval boundaries remain unchanged.** ·
> **Workflow and proposal lineage is shown only when real lineage exists.** · **Runtime-only sources
> are not presented as persistent historical records.** · **No automatic synchronization is
> implemented.** · **HUMAN NATIVE CLICK PROOF = NOT PERFORMED · AUTOMATED NATIVE DECISION SIMULATION =
> PASS · HTTPS_TO_LOOPBACK = UNVALIDATED.**

## Audited signal sources (real only) + persistence truth

| Source | Class | Persistence | Read API |
|---|---|---|---|
| Phase-5 workflow states (WAITING_FOR_USER / FAILED) across runs | derivable | **runtime-only**, ≤20 runs, wiped on reload | `getAllWorkflowEvents()` grouped by `workflowRunId` |
| Phase-6 governed proposals (pending / conflict / verified) | derivable | **runtime-only** | event log (`PROPOSAL_*` / `ACTION_*`) |
| Obsidian connectivity | live | **live-derived** (one check on mount + explicit refresh, no polling) | `getConnectionInfo(token)` |
| Business notifications (leads/tasks/SLA/approvals/automations) | real | persistent (IndexedDB) | `deriveNotifications` / `useNotifications` — **already surfaced; not duplicated** |
| Pending memory proposals (`ממתין לאישור`) | real | persistent | `memoryProposals` repo — **already surfaced in `/memory`; not duplicated** |
| Agent action results / failure history | **unsupported** | ephemeral — no store | — (not shown) |
| Phase-3 WriteProposals as a queue | **unsupported** | ephemeral — no store | — (not shown) |
| Customer risk / churn / health / revenue-at-risk | **unsupported / deferred** | not present | — (**not invented**; see below) |

**Deferred / unsupported signals (stated honestly):**
- **Customer risk / churn / health / sentiment / revenue-at-risk** — no such deterministic source
  exists; **not invented, not shown** (§18). Real customer attention (`contactState`, open items) is
  already covered by the existing persistent business-notification surface, so it is not duplicated
  here.
- **Agent action failure history** and a **Phase-3 write-proposal queue** — ephemeral (no store), so
  no such inbox is claimed.

## Architecture (reuse only — no second dashboard)

- `src/integration/command-center/businessSignals.ts` — the pure, deterministic `BusinessSignal`
  model + `deriveBusinessSignals(input)` / `countSignals` / `actionableSignals` / `infoSignals`.
- `src/modules/command-center/OperationsBrief.tsx` — the brief + Action Inbox + recent activity,
  rendered **at the top of the existing** `CommandCenterPage.tsx` (the `/` home surface). Reuses
  `Panel`/`SectionTitle`/`StatusChip`/`OsButton`/`EmptyState` + `--os-*` tokens.
- `src/modules/ai-workspace/visual/WorkflowMode.tsx` — a minimal **read-only deep-link focus**
  (`/ai-workspace?run=<id>`) that shows a run's real recorded timeline; the AI Workspace itself is
  not redesigned.

No new dashboard, home page, AI workspace, workflow engine, proposal engine, or notification service
was created. **7 agents / 14 actions unchanged. No agent #8, no action #15.**

## BusinessSignal model + deterministic priority + dedup

`BusinessSignal { id, type, sourceType, sourceId, titleHe, detailHe (why), status, priority, at,
workflowRunId?, proposalId?, agentId?, notePath?, recommendedNextStepHe, deepLink }`. Types:
`workflow_waiting_for_user, workflow_failed, proposal_pending, proposal_conflict, action_verified,
obsidian_unavailable`. **Priority** reuses `NotificationSeverity` (`דחוף/אזהרה/מידע`) with its
canonical sort — deterministic, never LLM-decided. **Dedup:** exactly one signal per workflow run
(its dominant condition, terminal/gate-wins) + at most one system-wide Obsidian signal; deterministic
ids (`sig-<type>-<sourceId>`).

## Daily Brief + counts (no drift)

Counts (`ממתין להחלטה` / `נכשל־התנגשות` / `הושלם לאחרונה` / `דורש חיבור מחדש`) are computed by
`countSignals` from the **same** derived signals the inbox renders — clicking a count filters the
inbox to exactly those records. Zero renders muted (honest), never hidden or faked.

## Action Inbox + CTA truth

Only **actionable** signals appear (a human decision/step is genuinely valid): waiting-for-user,
proposal pending, workflow failed, proposal conflict, Obsidian unavailable. Verified actions are
**info** → recent activity, never the inbox (§21). CTA matches the real state: `פתח תהליך` /
`בדוק הצעה` / `בדוק שינוי וצור הצעה חדשה` / `התחבר מחדש`. No `אשר` is ever shown from the brief —
approval happens only in the real proposal/native flow (human boundaries unchanged).

## Business Signal → Workflow (explicit only)

Each CTA is an explicit human navigation into the real deep context (`/ai-workspace?run=<id>` or
`/memory`). **No signal auto-starts a workflow.** The AI Workspace shows the run's real recorded
timeline read-only; interactive continuation requires a live in-session run.

## Persistence truth (critical)

The workflow/proposal/action signals are **runtime-only (current session, ≤20 runs, wiped on reload)**
— the UI states this explicitly (footnote) and does **not** present them as a persistent historical
daily report. Obsidian connectivity is checked once on mount + on explicit Refresh (no polling). **No
migration was added.**

## Tests (`tests/phase7`, 14)

`businessSignals.test.ts` (10): no state ⇒ no signals; each type from its real event pattern;
dominant-state dedup (one per run); deterministic ids; priority sort; counts equal displayed items;
verified ⇒ info not actionable; accepted read-only recommendation ⇒ no signal; Obsidian signal only
when `connected===false`, none when unknown. `operationsBrief.test.tsx` (4): honest empty state +
persistence-truth footnote; actionable inbox item with CTA + real run id; verified ⇒ recent activity
not inbox; count-filter.

## Accessibility / mobile

**Axe (WCAG 2.0/2.1 A/AA)** on the populated Operations Brief: **0 critical, 0 serious.** The inbox
is a semantic list; each CTA is a keyboard-focusable `<button>` (verified focus); count filters are
buttons; priority carries a text label (`דחוף/אזהרה/מידע`), not color alone. **Mobile** at **375px
and 390px** with the populated brief: **0** horizontal overflow; counts, inbox items, CTAs, and the
provenance/lineage lines are all reachable within the viewport.

## Live runtime evidence (paired vault, current session)

Verified live on the Command Center, driven only by real recorded workflow events + live Obsidian
connectivity (in-app client-side navigation preserves the runtime event log):

- **Recommendation/decision → inbox (§19)** — four real runs produced: one left at the human gate
  → one `workflow_waiting_for_user` inbox item; one with a created proposal → `proposal_pending`;
  one with a **rejected** proposal → **absent** from the inbox (no count drift); one approved+verified.
  The Action Inbox showed exactly the **2 actionable** items; counts `awaiting=2` matched.
- **Deep link (§13)** — clicking the waiting item's CTA opened `/ai-workspace?run=<id>` (client-side)
  in workflow mode showing that exact run's **real recorded 16-event timeline** read-only (banner:
  "תצוגת ציר-זמן בלבד עבור התהליך …").
- **Verified action → recent activity (§21)** — the approved+verified run appeared in **recent
  activity** (`count-completed=1`), **not** the Action Inbox.
- **Failure → recovery (§20)** — with Obsidian stopped, a real workflow failed
  (`VAULT_UNAVAILABLE → WORKFLOW_FAILED`, no fabricated recommendation). The Command Center showed a
  `workflow_failed` item (CTA "התחבר מחדש ונסה שוב") and, after an explicit Refresh, a system-wide
  `obsidian_unavailable` item (CTA "התחבר מחדש") — the connectivity signal correctly requires the
  mount/Refresh check (no polling). No auto-retry.
- **Counts = displayed items** — every count equalled the exact underlying records (awaiting=2,
  completed=1, failed/reconnect updated truthfully on the failure).
- **Persistence truth** — the runtime-only footnote is shown; a full page reload clears the session
  signals (not presented as history).

## Regression results

Full `vitest` **2784 passing** (Phase-7 suite 15; +15 over Phase 6's 2770); typecheck +
typecheck:tests clean; `oxlint` 4 pre-existing warnings; `scan:secrets` CLEAN. Phase-3 A/B/C/D
(`obsidian-write`/`bridge`/`security`), Phase-4 (`obsidian-phase4`), Phase-5 (`phase5`), Phase-6
(`phase6`), Command Center + Visual Workspace suites all green. **7 agents / 14 actions unchanged.**

**GitHub CI (Draft PR #47, head `7c6adeb`): all green** — Static PASS, Accessibility PASS,
Detect-persistence PASS, Network-resilience PASS, Live ephemeral Supabase skipping (expected). A
first CI run surfaced one real `aria-required-children` (critical) on the **empty** home inbox (a
`role="list"` with no `listitem` children); fixed by rendering `role="list"` only around actual item
cards (heading + empty state moved outside), reproduced locally and covered by a regression test.

## Limitations (honest)

1. Workflow/proposal/action signals are runtime-only (session, ≤20 runs); they disappear on reload.
   This is stated in the UI and is not presented as history. No migration was added to manufacture
   history.
2. Deep-linking to a run shows its **recorded timeline** read-only; the interactive workflow state is
   not reconstructable from the metadata-only event log, so interactive continuation needs a live run.
3. Customer-risk signals are deferred (no deterministic source exists); business/customer attention
   remains on the existing persistent notification surface.
4. `HUMAN NATIVE CLICK PROOF = NOT PERFORMED` · `AUTOMATED NATIVE DECISION SIMULATION = PASS` ·
   `HTTPS_TO_LOOPBACK = UNVALIDATED`.
