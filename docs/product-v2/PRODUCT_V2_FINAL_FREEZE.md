# Product V2 — Final Freeze + Prime Agent Go/No-Go (S13.6)

**Final base SHA:** `7834878bd6121f00807ea1b956f71580f5637cca` (`feature/teragon-supabase-app-auth`).
Docs/evidence only — no source changes; no regression justified one.

## PR A–E summary

| PR | Title | Delivered |
|----|-------|-----------|
| **A** | Visual Declutter + Nav V2 + Rail reduction | 6 calm nav groups; permanent rail → Memory + Agents only (~25 pages full-width); Command Center −27%; honest memory label; header clock removed |
| **B** | Analytics + Governance restructuring | Governance progressive disclosure (@1440 4,773→961px −80%; @390 −84%); Analytics filter compaction; **required a11y fix** (table scroll region focusable) |
| **C** | Central AI Workspace | `/ai-workspace` — attention · 7-agent selector (reuses engine) · approval queue (**only real `awaiting_approval`**) · recent activity; user-triggered handoff (never auto-executes) |
| **D** | Real Local Memory | New `memoryEntries` IndexedDB collection (IDB v6→7, non-destructive); org-scoped CRUD/search/filter/archive, fail-closed; reload-persistent; read-only agent adapter; `/memory` in required a11y gate |
| **E** | Bounded Agent Loop | 4-step human-controlled state machine (Hunter→Fixer proposal→approval→Orchestrator); no autonomy; max 4 steps / 1 mutation; `/ai-workspace` in required a11y gate |

## Final architecture (frozen — exactly one execution path)

```
UI (AI Workspace · Agent Loop · agent panels)
  → AGENT_ACTIONS registry            [ONE — src/agents/actions/registry.ts]
  → runAgentAction deterministic engine [ONE — src/agents/actions/engine.ts]
  → approval gate (ctx.approved)       [ONE — engine only, 2 gated actions]
  → synthetic/local demo state
```
- **AI Workspace** — orchestration/presentation only (no engine of its own).
- **Bounded Agent Loop** — a pure state machine that *coordinates* explicit calls into the same engine.
- **MemoryRepository** — the single local-persistence boundary (`memoryEntries`), org-scoped, fail-closed.

**Confirmed:** no duplicate registry · no duplicate execution engine · no hidden autonomous scheduler
(no `setInterval`/worker/cron in AI/loop/memory code) · no second approval system · no direct agent
persistence bypass (agents read memory only via the bounded adapter; never write).

## Final product inventory

**Routes:** **33 canonical routes total**, all with explicit fail-closed `ROUTE_PERMISSIONS` guards.
- **3 LIVE_VALIDATED** (actual Supabase-backed, RLS-validated domains): `/customers`, `/contacts`, `/customers/:id`.
- **30 non-LIVE_VALIDATED routes** — local/demo/supporting product surfaces, each retaining its **existing
  individual classification** (per the merged S12.0 acceptance matrix and per-route audits). These are a mix
  of local-persistent, deterministic-demo, and supporting/UI surfaces; they are **not** collapsed into one
  technical class here and are **not** represented as backend-connected.

**AI:** 7 governed agents · **exactly 14** business actions (2 per agent) · **2** approval-gated
(`fixer.apply-correction`, `flow.automation-proposal`) · 1 bounded 4-step loop · 1 central Workspace ·
read-only local-memory adapter for agents.

**Data taxonomy (distinct categories — not conflated):**
- **LIVE_VALIDATED** = actual Supabase-backed, RLS-validated domains: Customers / Contacts / Customer-Detail.
- **Local persistent** = IndexedDB (`memoryEntries` v7 real local-memory CRUD; governed `memoryRecords`).
- **Deterministic demo** = local synthetic agent/action behaviour (the 14 actions run on frozen demo data).
- **Supporting / UI surfaces** = presentation/reference screens; **not** represented as backend-connected.

(105 registered collections total; only the LIVE_VALIDATED domains are Supabase-backed.)

**Trust boundaries:** no remote AI (`AI_REMOTE_ENABLED=false`) · no real customer data (synthetic only) ·
no autonomous execution (human click between every step) · human approval before every mutation ·
organization isolation (memory) · fail-closed route/security + repository behavior.

## Final regression check (authoritative)

build ✅ · typecheck ✅ · typecheck:tests ✅ · **vitest 2,613/2,613** ✅ · oxlint ✅ · router/nav/RBAC ✅ ·
agent-action + AI Workspace + bounded loop + MemoryRepository + IDB-upgrade suites ✅. CI (merged PRs,
authoritative): Accessibility ✅ (covers `/memory` + `/ai-workspace` incl. awaiting/completed loop states
@1440/390) · Network-resilience ✅ · Detect-persistence ✅ · cross-browser ✅ · Live-DB skipping. **0
serious/critical Axe · 0 document overflow · 0 console errors · 0 NO_OP primary controls · no
`test.skip`/`test.fail`/weakened assertions.** Only the 12 known `tests/platform/*` Rolldown **file-load**
failures remain (pre-existing local limitation; CI-authoritative). **No BLOCKER/HIGH regression found.**

## Known limitations

- 12 `tests/platform/*` fail to load locally (Rolldown parse/load, not logic) — CI-authoritative.
- LOCAL identity has no real org (`""`); memory UI uses a stable demo org (isolation enforced in the boundary).
- Agent loop is one hardcoded demo workflow; a browser reload resets it (no new durable loop persistence).

## Deferred capabilities (intentional — not failed, not missing)

- Agent-engine memory retrieval (wire `noopMemorySearchPort` to `memoryEntries`) + user-confirmed
  "הצע שמירה בזיכרון".
- Relocating governed memory behind a tab (needs its e2e updated).
- Chart redesign (Gantt, KpiCard delta/sparkline).

## Prime Agent — GO / NO-GO decision

**Decision: NO-GO / DEFERRED (post-academic).**

**Rationale (based only on the demonstrated Product V2 architecture):**

> Prime Agent POC was intentionally deferred because the existing Orchestrator, AI Workspace,
> user-triggered handoffs, and bounded Agent Loop already provide the required planning, routing, and
> controlled multi-agent coordination.
>
> A Prime Agent at this stage would largely introduce another orchestration layer over capabilities
> already present, increasing architectural complexity and demo surface without sufficient incremental
> academic or product value.

Measured against the acceptance test — "adds a clearly distinct capability not already covered by
Orchestrator / AI Workspace / agent selector / user-triggered handoff / bounded Agent Loop" — it does not
clear the bar, so NO-GO is the correct default. (No external-runtime, licensing, platform, or sandbox
claims are relied upon for this decision.)

## Roadmap

Future Prime Agent remains a **valid post-academic concept** — **DEFERRED / POST-ACADEMIC**, not failed and
not missing. If ever implemented, it should initially be **planner/router only**:

```
user request → proposed plan → recommended existing agent/action → explicit human confirmation → existing action engine
```

It must **not** bypass any of:
- `AGENT_ACTIONS` (the single action registry)
- `runAgentAction` (the single deterministic engine)
- the approval gates (human approval before mutation)
- the organization / security boundaries (org isolation + fail-closed route/repository behaviour)

## Verdict

**PRIME AGENT — NO-GO / DEFERRED POST-ACADEMIC. PRODUCT V2 — FEATURE FROZEN.**
