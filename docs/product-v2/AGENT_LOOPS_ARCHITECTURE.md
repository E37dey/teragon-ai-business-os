# Bounded Agent-Loop Architecture (S13.0) — DESIGN ONLY

Design, not implementation. Defines a **bounded** loop controller and compares three ways to build it.

## Target loop (bounded, human-gated, auditable)

```
Trigger (user / schedule)
  → Orchestrator selects a specialist agent (capability-matched)
    → specialist executes ONE read-only step
      → attaches evidence (records touched, correlationId)
        → evaluate result:
            ├─ done               → finish, record run
            ├─ needs another step → loop (if within budget)   ┐ bounded
            └─ needs mutation     → request HUMAN APPROVAL     ┘ gate
```

### Required controls (all mandatory)

- **max steps** per loop · **max duration** · **max cost/token budget** (only meaningful once a remote
  provider exists; N/A for the free local engine).
- **cancellation** + **kill switch** (user can stop a running loop at any time).
- **explicit capability list** (deny-by-default; loop can only call allowlisted actions).
- **human approval before any mutation** (extends the existing `fixer.apply-correction` /
  `flow.automation-proposal` gates).
- **structured events** + **complete audit trail** (reuse `agentRuns`/`agentEvents`).
- **no infinite loops** (hard step/time ceiling; loop halts and reports on limit — reaching a limit is
  *not* success).
- **no direct unrestricted database access** (loop reads via repositories; writes only via approved,
  idempotent action handlers).

## Three alternatives compared

**A. Existing deterministic local engine + a local loop controller.**
Add a small orchestrator that chains the current 14 deterministic actions with step/time ceilings and the
existing approval gates. No new runtime, no provider, in-process, Windows-native.

**B. Prime-Agent-*inspired* architecture, implemented natively in TERAGON.**
Adopt Prime Agent's *ideas* — structured event stream (RPC-style), `AgentSession`-like lifecycle, bounded
autonomous budgets, quality gates — but implemented in TERAGON's own free/local code. No external process,
no provider required; can later accept an optional remote provider behind the existing flag.

**C. Real Prime Agent RPC integration.**
Embed the actual Prime Agent runtime over JSONL RPC / `AgentSession`, inside WSL2/Linux + the security
gate (see PRIME_AGENT_FEASIBILITY.md). Genuine autonomous coding/research agent; **requires a paid
provider** and a strict process/sandbox boundary.

### Scorecard (0–10)

| Axis | A. Local engine + loop | B. PA-inspired native | C. Real PA RPC |
|------|:---:|:---:|:---:|
| Academic demo value | 6 | **8** | 6 |
| Implementation complexity (10=easy) | **9** | 6 | 3 |
| Windows compatibility | **10** | **10** | 3 |
| Security | **9** | 8 | 4 |
| Maintainability | **9** | 7 | 5 |
| UI integration | 6 | **9** | 7 |
| No-cost operation | **10** | **10** | 2 |
| Production potential | 5 | 7 | **9** |
| **Total** | **64** | **65** | **39** |

## Recommendation

**Adopt B — a Prime-Agent-*inspired* bounded loop implemented natively in TERAGON — built on top of the
AI Workspace (PR C), reusing A's deterministic actions as the loop's steps.** It scores highest, keeps the
project **free, local, Windows-native, and honest**, and delivers the "agents that visibly reason step by
step" experience the user wants — *without* acquiring a paid-provider dependency or an unsandboxed runtime.

- **A** is the concrete substrate: the loop's steps are the existing deterministic actions with ceilings
  and approval gates. (A and B are complementary — A is the engine, B is the shape.)
- **C** stays **deferred / POC-only** (PR F), pursued only if a positive re-check and the security gate +
  provider cost are explicitly accepted. It is the only path with true autonomous code execution, but it
  contradicts the academic "trusted, deterministic, no-cost" thesis if made central.

**Sequence:** Loop controller (Option A/B) is **PR E**, after the AI Workspace (PR C) gives runs a home
and a visible timeline. Real Prime Agent (Option C) is **PR F**, last and conditional.
