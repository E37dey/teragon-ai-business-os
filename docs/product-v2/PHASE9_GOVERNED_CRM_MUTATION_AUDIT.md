# Phase 9 — Governed CRM Mutation (AUDIT + flagship selection · audit-only)

No production code changed. Invariants unchanged: **7 agents · 14 actions · no Agent #8 · no action
#15 · AI_REMOTE_ENABLED=false · no migration.**

## CRM write paths (all real + persistent, all UNGOVERNED)

Every CRM entity persists in IndexedDB and is mutated by **direct, ungoverned** `getRepository(k).update/create`
(no approval, no version/hash concurrency): Leads (`leads.update` status/owner, `CrmPage`), Quotations
(`quotations.create`+`changeStatus`, "send" is only a status flag — **no real send**), Service Tickets
(`serviceTickets.update` status/assign/resolve), Tasks (`tasks.update/create`), Customers/Contacts. **No
entity carries a usable concurrency guard** — `updatedAt` exists everywhere but is never read as a
precondition; `Quotation.version` is a display counter, not used for concurrency. `IndexedDBRepository.update`
is blind `{...current, ...patch}` **last-write-wins**.

## ApprovalEngine (skeleton SOUND; handlers unwired + unconstrained)

Reusable, real: `requestApproval`/`decide`/`execute`; **no execution without approval** (throws
`AGENT_EXECUTION_WITHOUT_APPROVAL` unless derived state ∈ approved/edited); persisted `approvals` collection;
full **audit trail** (`agentEvents` + `auditEvents`); **executed-state guard** (same `approvalId` cannot
execute twice); **real rollback** (`restore-field` / `delete-created`).

Three `ExecutionPayload` kinds. Only **`external`** (documentary Task/Activity + the memory `permanent-memory-update`
real write) is reached by product. The two real persisted CRM-capable handlers are **constructed by ZERO
product flows** (dead-but-tested branches):

| Handler | Real mutation | Verified | Idempotent | Rollback | Org-isolated | Stale-write guard |
|---|---|---|---|---|---|---|
| `record-field-change` (update any collection/field) | **Yes** | No | **No** (blind re-write) | Yes (scalar) | **No** | **No** (LWW) |
| `task-creation` (create tasks/agentTasks) | **Yes** | No | **Partial** (dup id → `DuplicateIdError`) | Yes (delete) | **No** | N/A (create) |

**Org isolation gap (biggest):** `Approval`/`AgentRun` carry **no organizationId**; `execute` scopes only by
`runId`/`approvalId`; a payload `recordId` is a global key → an *update* handler could target any org's record.
Only `Customer` carries `organizationId` today.

## Candidate support matrix

| | Signal | Record | Agent | Recommendation | Proposal engine | Human gate | Mutation | Stale-write | Idempotency | Read-back | Org isolation | Audit | CC lineage |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A Lead status | REAL | REAL | Hunter/Orch | SMALL GAP | REAL | REAL | REAL | **MAJOR GAP** | SMALL GAP | SMALL GAP | **MAJOR GAP** | REAL | REAL |
| B Lead owner | REAL | REAL | Hunter | SMALL GAP | REAL | REAL | REAL | MAJOR GAP | SMALL GAP | SMALL GAP | MAJOR GAP | REAL | REAL |
| C Quote status | REAL | REAL | Hunter | SMALL GAP | REAL | REAL | REAL | MAJOR GAP | SMALL GAP | SMALL GAP | MAJOR GAP | REAL | REAL |
| D Ticket closure | REAL | REAL | Fixer | SMALL GAP | REAL | REAL | REAL (2-field) | MAJOR GAP | SMALL GAP | SMALL GAP | MAJOR GAP | REAL | REAL |
| **E Task creation** | **REAL** | **REAL** | Orch/Flow | SMALL GAP | **REAL** | **REAL** | **REAL** | **N/A (create)** | **SMALL** (det. id) | SMALL GAP | **SMALL** (session-scoped create) | **REAL** | **REAL** |
| F Task update | REAL | REAL | Orch/Flow | SMALL GAP | REAL | REAL | REAL | MAJOR GAP | SMALL GAP | SMALL GAP | MAJOR GAP | REAL | REAL |

## Risk ratings
Task creation **LOW** (internal follow-up, reversible via delete). Lead status **MEDIUM**. Lead owner **MEDIUM**.
Quotation status **HIGH** (financial/commitment implications; "sent" is fake). Ticket closure **HIGH**
(customer-facing, ~irreversible, 2-field). Task update **MEDIUM–HIGH** (stale-write on existing record).

## Rejected / NO-GO for this phase
A/B/C/D/F all require closing the **stale-write** hole (expectedValue/version guard) AND the **cross-org
existing-record** hole on an existing global-id record — the two mandatory gates (§13/§16). C (quotation) also
risks implying financial commitment; "send" cannot be represented honestly. These are **NEXT/LATER**, not this
flagship.

## Selected flagship (ONE)
- **Hebrew:** משימת מעקב מבוקרת · **English:** Governed Follow-up Task
- **Real trigger:** a real Command Center BusinessSignal / persistent business notification (e.g. lead no-reply,
  overdue item, a Phase-7 workflow signal).
- **Real entity:** a NEW persisted `Task` (tasks collection), related via `relatedRef` to the source record.
- **Legit agent (recommendation only):** Orchestrator (`orch.action-plan`) or Flow (`flow.followup-sequence`) —
  recommends the follow-up; **the agent never executes**.
- **Proposal mechanism:** the existing **ApprovalEngine** `task-creation` payload (no second engine).
- **Human gate:** ApprovalPanel review → approve/reject (recommendation ≠ proposal ≠ approval ≠ executed ≠ verified).
- **Exact mutation:** create ONE task with an **allowlisted field set**; the task `id` is **deterministic**,
  derived from the trusted source-signal id (idempotency).
- **Verification:** after `execute`, **read the created task back by id** and compare key fields → VERIFIED.
- **Idempotency:** deterministic id → `DuplicateIdError` on replay ⇒ no duplicate.
- **Stale-write:** N/A (create — structurally avoids the LWW hole).
- **Org isolation:** the created task is **session-scoped** (trusted CEO fixture / session org, never from
  payload/Vault); no crossing into another org's existing record. Multi-org verification (bind `organizationId`)
  is a documented follow-up, not needed for the single-org pilot.
- **Audit / lineage:** the canonical ApprovalEngine `agentEvents`/`auditEvents` (no new history).
- **Command Center:** reuse Phase-7 — verified creation → **Recent Activity**.
- **Why it wins:** the **only** candidate that structurally sidesteps *both* mandatory gates (no stale-write, no
  cross-org existing-record), is reversible, LOW-risk, idempotent for free, and reuses the ApprovalEngine +
  Phase-7 surfaces with the fewest new moving parts.

## ApprovalEngine reuse decision
**Option B — small additive extension** to the existing ApprovalEngine (do NOT create a third engine): (1) a
narrow **allowlist/validation** for the `task-creation` payload (required task fields; deny-by-default), (2)
**read-back verification** after execute (in a thin trusted wrapper, keeping the shared engine otherwise
untouched). Everything else (approval gate, executed-state guard, dup-id idempotency, delete rollback, audit
log) is reused as-is.

## Minimum architecture (flagship only — NOT built)
- **REUSE AS-IS:** ApprovalEngine (`requestApproval`/`decide`/`execute` + `task-creation` handler + rollback +
  audit + executed-state guard), `tasks` repository, ApprovalPanel, Phase-7 BusinessSignals/OperationsBrief,
  Command Center Recent Activity.
- **SMALL EXTENSION:** a thin PURE trusted module `governedTaskProposal.ts` (build the allowlisted task record +
  deterministic id from the trusted signal + session org; then approve→execute→**read-back verify**).
- **NEW PURE MODULE:** the proposal-builder/verifier above (no engine, no registry, no write client).
- **UI CHANGE:** a "צור משימת מעקב" CTA on a real Command Center signal / record → proposal preview → existing
  ApprovalPanel approve/reject. No new dashboard.
- **SECURITY CHANGE:** deny-by-default field allowlist; **entityId/org/fields come only from trusted app/session,
  never from Vault/note/record content**; deterministic id from the trusted signal.
- **TEST CHANGE:** recommendation≠proposal; reject→zero task; approve→exactly one task; replay→no duplicate;
  read-back verified; injection cannot alter entityId/org/fields/id.

## Future roadmap
- **NEXT:** Lead status update (MEDIUM) — needs allowlist + `expectedValue`/`updatedAt` stale-write guard + org
  resolution via `Lead.ownerId`.
- **LATER:** Ticket closure (HIGH; two-field atomic write + resolution fields).
- **NO-GO (now):** Quotation status (financial/commitment; "send" cannot be honest); Task update / Lead owner
  (stale-write / side-effects).

## Verdict
Every stage of the Governed Follow-up Task flow is REAL or a SMALL, self-contained gap; no critical stage is
MISSING; none of the NO-GO conditions apply. `HUMAN NATIVE CLICK PROOF = NOT PERFORMED · AUTOMATED NATIVE
DECISION SIMULATION = PASS · HTTPS_TO_LOOPBACK = UNVALIDATED` carried forward.
