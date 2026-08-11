# Phase 8 — Business Workflow Packs (evidence)

Packages the proven TERAGON stack into two product-quality business workflows: the flagship
**תיעוד ידע מבוקר · Governed Knowledge Capture** and a minimal honest **התאוששות תפעולית ·
Operational Recovery**. This is a **tiny trusted configuration layer over the existing bounded
workflow + governed-action stack** — not a new engine.

> **Phase-8 workflow packs reuse the existing bounded workflow engine.** · **Selecting a workflow
> pack does not automatically start execution.** · **Governed Knowledge Capture uses real Obsidian
> knowledge and the existing governed write path.** · **Operational Recovery performs an explicit
> bounded retry, not a governed business mutation.** · **Lead Follow-up is excluded from governed
> execution because CRM mutation governance is not currently wired.** · **Workflow and proposal state
> remain runtime-only.** · **Verified Obsidian knowledge outcomes are persistent.** · **Workflow-pack
> configuration is trusted application configuration; Vault content cannot alter execution
> authority.** · **No Agent #8 or action #15 is introduced.** · **No automatic synchronization is
> implemented.** · **HUMAN NATIVE CLICK PROOF = NOT PERFORMED · AUTOMATED NATIVE DECISION SIMULATION =
> PASS · HTTPS_TO_LOOPBACK = UNVALIDATED.**

## Audit result → why Lead Follow-up was excluded

The Phase-8 audit established that **only the knowledge/Obsidian domain has a real end-to-end path to
a governed, human-approved, *persisted*, verified mutation** (Phase-3 write via Phase-6 governed
action). Every CRM mutation (lead/quote/ticket/task/customer) is real but **ungoverned** (direct
`repo.update`, no approval); every governed ApprovalEngine execution that runs in product is
**documentary-only** (a Task/Activity record, never a change to the target business entity, never a
real send). Therefore **Lead / Opportunity Follow-up is NOT presented as a governed workflow** — doing
so would require presenting an ungoverned write as governed, or inventing CRM execution capability.
Phase 8 stays within already-proven execution authority. CRM navigation/recommendation is possible
future work, not this phase.

## Architecture (reuse only — no new engine)

`src/agents/workflow/workflowPacks.ts` — a frozen, trusted `WorkflowPack` registry with **exactly
two** packs. It contains **no execution logic**; it only configures the existing stack:
- Phase-5 `knowledgeWorkflow` (bounded engine) + `workflowEvents`/Timeline
- Phase-4 `AgentObsidianReadAdapter` + retrieval traces
- Phase-6 `governedAction` + Phase-3 `obsidianWrite`
- `WorkflowMode` + `GovernedActionPanel` + Phase-7 `OperationsBrief`/BusinessSignals + `?run` deep-link.

No second workflow/proposal/approval/write engine and no new Agent registry were created. **7 agents /
14 actions unchanged.**

`WorkflowPack { id, nameHe, nameEn, descriptionHe, category, intentTemplate, allowedAgents,
knowledgeRequired, governedActionSupported, targetStrategy }`. Packs: `governed-knowledge-capture`
(knowledge; `governedActionSupported: true`; target `{verb:"append", path:"Decisions Log.md"}`;
agents `[ag-orchestrator, ag-wiki]`) and `operational-recovery` (operations;
`governedActionSupported: false`; `targetStrategy: null`).

## Flagship flow — Governed Knowledge Capture

`select pack (no auto-start) → editable business intent → explicit Start → Orchestrator → Wiki (real
Obsidian search + single-note read, real source attribution + Agent→Note trace + Timeline event) →
Orchestrator → recommendation → explicit "הפוך להצעה" → Phase-6 WriteProposal (target/verb from
TRUSTED pack config) → TERAGON approve (gate 1, no write) → native Obsidian confirmation (gate 2) →
one bounded APPEND to the trusted knowledge note → read-back verification → "תועד ואומת" + full
lineage`. The recommendation is a **business artifact** (a decision-record update), and remains a
recommendation until the user explicitly creates a proposal.

## Recovery flow — Operational Recovery (honest limits)

`workflow_failed / obsidian_unavailable (Phase-7 signal) → user opens the recovery pack → the exact
most-recent failed run + failure reason are shown → reconnect if needed → explicit "התחל מחדש" → a
genuinely NEW bounded run linked via retryOf (the original failed run is preserved as evidence) → real
success/failure`. **Retry is an explicit new workflow run, not a governed mutation** — stated in the
UI and evidence. No automatic retry.

## Deep links / precedence

`/ai-workspace?pack=<id>` opens workflow mode with the pack selected + intent prefilled, **not
started**. Phase-7 `?run=<id>` still focuses a recorded run read-only. **Precedence:** `?run` (focus)
wins over `?pack` for display (deterministic; the pack picker is hidden in focus view).

## Human authority + injection boundary (unchanged)

Create Proposal ≠ Approve; TERAGON Approve ≠ native Obsidian confirmation; Recommendation ≠ approved
knowledge. Agents cannot auto-create a proposal, approve, call native confirmation, write directly, or
mint capability. **Pack id / target / verb come from trusted frozen application config** — untrusted
Vault content cannot change them (the Phase-6 injection regression proves a hostile note cannot alter
`operation`/`path`/authority; the pack registry is frozen). Conflict/idempotency reuse Phase-6
(ACTION_CONFLICT no-clobber; same mutationId → no duplicate; new intent → new mutationId + new
approval boundary).

## Persistence truth

Workflow, proposal, and Timeline state are **runtime-only** (session, bounded, wiped on reload). The
**written Obsidian knowledge note is persistent**. Command Center session signals are runtime/
live-derived (Phase 7). A knowledge pack shows its live Obsidian dependency (one check on mount, no
polling); a recovery pack whose original run was lost to reload shows an honest "no failed run"
state. **No migration was added.**

## Command Center integration

The Command Center adds one launch CTA ("תעד ידע מבוקר" → `?pack=...`, does not auto-start). Phase-8
workflows reuse the Phase-7 derivation: WAITING_FOR_USER → Action Inbox; proposal pending → proposal
signal; ACTION_VERIFIED → recent activity; failed → failure signal. **No duplicate Phase-8 signal
types were added.**

## Tests (`tests/phase8`, 9)

`workflowPacks.test.ts` (5): exactly two frozen packs, deterministic/unique ids, flagship governed
config, recovery non-governed, unknown id → null, **no Agent #8 / action #15** (`AGENT_IDS`=7,
`AGENT_ACTIONS`=14). `workflowPacksUI.test.tsx` (4): `?pack` selects + prefills intent WITHOUT
starting; picker click prefills; `?run` focuses (no picker); recovery surfaces the real failed run +
reason + "התחל מחדש". The governed-execution / injection-boundary / conflict / idempotency guarantees
are covered by the Phase-6 suite the packs reuse unchanged.

## Accessibility / mobile

**Axe (WCAG 2.0/2.1 A/AA)**: the pack-picker (initial) state and the populated flagship state both
**0 critical / 0 serious**. The two pack cards are keyboard-focusable `<button>`s (first card focused);
availability is conveyed by text, not color alone. **Mobile** at **375px and 390px**: **0** horizontal
overflow; pack cards, intent input, Start, proposal preview, diff, and Approve/Reject all usable.

## Live runtime evidence (paired vault + AUTOMATED native-decision simulation)

Verified live against the real paired vault (native decision driven by the dev-only flag — see
Limitations):

- **Deep link `?pack=governed-knowledge-capture`** — opened workflow mode, flagship **selected**,
  intent **prefilled** from the trusted template, **0 events (NOT auto-started)**.
- **Flagship run** — explicit Start → Wiki read the real **`AI Operations.md`** (source knowledge,
  real attribution) → recommendation → explicit "הפוך להצעה" → proposal targeting **`Decisions
  Log.md`** (from **trusted pack config**, not the source note) → TERAGON approve → native
  confirmation → one bounded **append** → read-back verified ("בוצעה כתיבה אחת ואומתה בקריאה חוזרת",
  `ACTION_VERIFIED` after `ACTION_EXECUTED`). Provenance: run `wf-msou3xij-1`, proposal `owp-3bc00da6…`,
  mutation `mut-e4c3c546…`.
- **On-disk truth** — `Decisions Log.md` received **exactly one** governed append (this run's block);
  **`AI Operations.md` was untouched**. The pack config (target/verb) drove the write, not the note.
- **Command Center** — the verified action appears in **recent activity** (completed count=1), **not**
  the Action Inbox (reuses Phase-7 derivation; no duplicate Phase-8 signal). The "תעד ידע מבוקר"
  launch CTA is present.
- **Recovery** — Obsidian stopped → a real workflow **failed** (`WORKFLOW_FAILED`, no fabricated
  result) → opening `?pack=operational-recovery` showed the exact failed run `wf-msou5sbm-2` + reason
  ("Obsidian אינו זמין…") + "התחל מחדש", **not auto-started** → reconnect → explicit retry created a
  NEW run `wf-msou8alw-3` linked via **`retryOf=wf-msou5sbm-2`** (original preserved) that reached the
  gate. No governed mutation for the retry.

## Regression results

Full `vitest` **2793 passing** (Phase-8 suite 9; +9 over Phase 7's 2784); typecheck + typecheck:tests
clean; `oxlint` 4 pre-existing warnings; `scan:secrets` CLEAN. Phase-3 A/B/C/D, Phase-4, Phase-5,
Phase-6, Phase-7, Command Center + Visual Workspace suites all green. **7 agents / 14 actions
unchanged.**

## Limitations (honest)

1. Governed execution exists **only** in the knowledge/Obsidian domain; CRM packs are excluded (see
   audit). Phase-8 packs are knowledge-centric.
2. Workflow/proposal/Timeline state is runtime-only; the written note is persistent. Not a historical
   report.
3. The positive native-approve path is dev-only-simulated: **HUMAN NATIVE CLICK PROOF = NOT PERFORMED
   · AUTOMATED NATIVE DECISION SIMULATION = PASS**. `HTTPS_TO_LOOPBACK = UNVALIDATED`.
