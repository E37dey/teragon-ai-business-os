# Phase 5 — Real Multi-Agent Knowledge Workflow + Live Trace Timeline (evidence)

One bounded, human-controlled, auditable multi-agent workflow over the existing Agent + Obsidian capabilities.
Every node, edge, status, and timeline entry corresponds to something that **actually happened at runtime** — no
fake reasoning, no fake agent activity, no fake handoffs, no fake note usage, no simulated "thinking".

> **Timeline events represent recorded runtime events only.** · **Agent handoff visualization represents real
> workflow transitions only.** · **Agent→Note relationships represent successful recorded reads only.** · **Workflow
> recommendations do not constitute approval.** · **Agents cannot directly mutate the Obsidian Vault.** · **No
> autonomous unbounded agent loop is implemented.** · **No automatic synchronization is implemented.** ·
> **HTTPS_TO_LOOPBACK = UNVALIDATED.**

## Architecture (reuse only)

```
User request (explicit Start)
  → startKnowledgeWorkflow → runKnowledgeWorkflowToGate   src/agents/workflow/knowledgeWorkflow.ts
      → Orchestrator (dispatch)   ─ real handoff → Wiki
      → Wiki  → AgentObsidianReadAdapter (Phase 4)  → vaultBridgeClient (Phase 1)  → bridge → app.vault
              → retrievalTrace (Agent→Note, Phase 4)
      → handoff → Orchestrator (deterministic synthesis)
      → recommendation → HUMAN decision (accept / cancel)
  → workflowEvents (bounded, sanitized, runtime-only)  src/agents/workflow/workflowEvents.ts
  → WorkflowMode UI ("תהליך חי")  → Timeline + reuses AgentNetworkPanel + KnowledgeGraphPanel + Phase-4 cross-highlight
```

Reused unchanged: the 7-agent registry, `runAgentAction` engine, Phase-4 `AgentObsidianReadAdapter` (the ONLY Vault
access), `retrievalTrace` + `deriveAgentNoteUsages`, the `LoopStatus`/terminal conventions (`agentLoop.ts` pattern),
the Visual Intelligence Workspace + `CrossViewRelations` + Phase-4 cross-selection props, and the Phase-2/Phase-3
governed import + approved-write chain. **No** second agent engine / registry / Obsidian client / approval engine /
knowledge graph / autonomous loop was created.

## The exact bounded workflow + actual agent sequence

Demo intent: **"בנה לי תקציר והמלצות על AI Operations לפי הידע ב-Obsidian"**. Audited against the real roles — only
**Wiki** (knowledge: "מחפש בידע מאושר") and **Orchestrator** (synthesis: "מתכנן, מנתב ומסנתז") are justified;
**Mentor/Nexa are not forced in** (their roles do not fit a business-knowledge summary).

`Orchestrator (start + dispatch) → Wiki (real bounded search → real single-note read → summarize) → handoff back →
Orchestrator (deterministic synthesis) → recommendation → WAITING_FOR_USER (human decision)`.

## Event model + workflowRunId + bounds

`WorkflowEvent { id, workflowRunId, type, at, actorAgentId?, source?, target?, notePath?, vaultName?,
correlationId?, detailHe, success }`. Types: `WORKFLOW_STARTED, USER_REQUEST_RECEIVED, AGENT_STARTED,
HANDOFF_REQUESTED, HANDOFF_ACCEPTED, VAULT_SEARCH_STARTED, VAULT_SEARCH_COMPLETED, VAULT_NOTE_READ, VAULT_UNAVAILABLE,
CAPABILITY_DENIED, AGENT_COMPLETED, RESULT_CREATED, USER_DECISION_REQUIRED, USER_CONTINUED, WORKFLOW_COMPLETED,
WORKFLOW_FAILED, WORKFLOW_CANCELLED`. Every execution gets a unique `workflowRunId`; the `correlationId` is preserved
and shared across the run's activity. **No event is emitted unless it actually occurred**; no fabricated timestamps.

**Bounds:** explicit user start; `WORKFLOW_MAX_STEPS = 10`; `WORKFLOW_MAX_VAULT_READS = 1`; **no** recursion, timers,
background execution, or self-dispatch; one pass to the next human gate (not "agents work until they decide to
stop"). Terminal states: `COMPLETED / FAILED / CANCELLED`; gates: `WAITING_FOR_USER / WAITING_FOR_APPROVAL`. The
event store is capped **drop-oldest** (`MAX_EVENTS_PER_RUN = 100`, `MAX_RUN_HISTORY = 20`).

## Persistence truth

The Phase-5 workflow state and event log are **runtime-only (in-memory)** by design — they do **not** persist across
a browser refresh, and Phase 5 adds **no** migration or persistence layer. The only durable side effect is a real
`retrievalTrace` (also runtime-only) that records the Agent→Note read. This is stated honestly; nothing is faked as
persistent.

## Live timeline + graph synchronization

The Timeline (`role="log"`) shows the real ordered events (time · action · detail) — actions/provenance only, never
hidden reasoning. The graphs react to the real workflow: the **current agent** is cross-highlighted while active;
the real **Wiki→AI Operations.md** relation appears from the retrieval trace; selecting a timeline event
cross-highlights the agent and note it actually touched (reusing the Phase-4 `highlightAgentId`/`highlightPaths`).
**No event ⇒ no edge/highlight**; completed activity returns to calm.

## Human gates

`Continue/accept ≠ approve a proposal ≠ approve an Obsidian write` — kept as distinct explicit actions. The workflow
ends at a **recommendation** (`WAITING_FOR_USER`); the human "אשר קבלה" acknowledges the knowledge result (read-only)
and does **not** write or approve any mutation. The workflow can never convert a recommendation into an approved
action by itself.

## Result / provenance

`WorkflowResult { answer, sources, contributingAgents }`. The **answer** is a **deterministic transform of the real
note** (title + first meaningful line + extracted `[[wikilinks]]`) — not an LLM answer, not fabricated reasoning.
`sources` carry `{ sourceType: obsidian, vaultName, path, title }`; `contributingAgents` are the real actors. Live
Vault content stays **untrusted** and is **not** `memoryRecords`/approved knowledge (Phase-2 governed import stays
separate). No private chain-of-thought is exposed. `AI_REMOTE_ENABLED=false` — no remote/paid LLM introduced.

## Prompt-injection defense across handoffs

Precedence **SYSTEM/SECURITY > AGENT CAPABILITIES > USER INTENT > UNTRUSTED VAULT CONTENT** holds across the
handoff. A hostile note read by Wiki flows as **bounded data** into the deterministic synthesis; it cannot escalate
because a second agent received it: permissions unchanged (Hunter still denied), no write, no approval, no secret in
the result or events, no instruction escalation. Context passed on handoff is bounded + provenance-aware (result
summary + source ref + ids) — never the whole Vault, never credentials.

## Failure / cancel

Real dependency failures become real events: Obsidian unavailable → `VAULT_UNAVAILABLE` → `WORKFLOW_FAILED` (no
`VAULT_NOTE_READ`, no Agent→Note edge, no fabricated recommendation); no search hit → honest failure; missing note /
timeout → fail closed. Cancel stops future steps, records `WORKFLOW_CANCELLED`, does **not** roll back an
already-completed read, and no agent continues afterward.

## Write security (Phase-3 A/B/C/D intact)

Agents have **zero** direct write authority in Phase 5 — no `POST /write/*`, no create/append/update, no auto native
confirmation, no approval bypass. Properties **A/B/C/D** remain true (regression suites green). A recommendation may
at most prefill the existing Phase-3 proposal path; it cannot self-approve.

## Tests (`tests/phase5`, 12) + regression

Workflow: explicit start, unique `workflowRunId`, bounded steps, terminal states, **not autonomous** (re-run at the
gate is a no-op), strict event order. Handoff: real transitions emit `HANDOFF_*` with source/target. Knowledge:
successful read records source + real Agent→Note relation; unavailable/no-hit fail closed with no relation. Human
gates: accept only at the gate, `Continue ≠ Approve`, cancel prevents future steps + no rollback. Prompt-injection:
hostile note cannot escalate across the handoff (no secret, no write event, permissions unchanged). Trace: events
carry metadata only (no body, no token/writeKey/HMAC/Authorization). UI: start → real timeline → recommendation +
source → accept; `תהליך חי` mode switch. Full regression (Phase 1/2/3/4 + Visual Workspace + Command Center) stays
green. `typecheck`, `typecheck:tests`, `oxlint`, `scan:secrets` all pass/CLEAN.

## Accessibility / mobile

Timeline is a semantic `role="log"` list understandable without the graph; keyboard flow (start/continue/cancel,
select event, inspect agent/note/source) works; state is not conveyed by color alone; reduced-motion keeps the
status understandable without pulses. **Axe 0 critical/serious** target retained; the workflow mode uses the same
narrow-safe split grid → **0 horizontal overflow** at 375/390; desktop valid.

## Limitations (honest)

The workflow is runtime-only (no persistence — stated above). The second synthesis agent is the Orchestrator (a
real, justified role); no third agent is forced. A one-click "route the recommendation into the Phase-3 proposal"
affordance is deferred; the security guarantee (agents cannot write) holds regardless. `HTTPS_TO_LOOPBACK =
UNVALIDATED`.
