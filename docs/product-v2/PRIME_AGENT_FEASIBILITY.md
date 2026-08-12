# Prime Agent — Feasibility, Security Gate & Windows/Cost (S13.0)

Upstream researched from the current repository and docs (not assumptions):
`github.com/PrimeIntellect-ai/prime-agent`, `/packages/coding-agent/docs/{index,usage,rpc,rlm}.md`,
and the Prime Intellect launch blog. Fetched August 2026.

## What Prime Agent actually is

Prime Agent is **not a React component** — it is a **self-improving RLM agent runtime**: a
CLI + TUI + daemon-backed service built on a **persistent IPython kernel**, recursive subagents,
durable branching sessions, and a **multi-process local runtime**. Harness written in
**TypeScript/Node.js**; code execution runs through a **Python IPython kernel**.

| Dimension | Finding | Source |
|-----------|---------|--------|
| License | **MIT** (permissive; embedding legally fine) | README |
| Runtime | Daemon-backed sessions survive terminal disconnect; reattach via `prime-agent attach <agent>` | docs/index |
| Persistence | "Continual Harness" stores prompts/memories/skills/subagent specs as durable state; JSONL sessions; snapshots support rollback | docs/index |
| Subagents | `rlm(...)` spawns real child agents (parallel/background), returns results programmatically | docs/rlm |
| Agent-to-agent | Running agents exchange messages and orchestrate one another without routing through the user | docs/index |
| Autonomy | `/autonomous` runs within turn/token/time budgets, can run user-defined quality gates; `/goal`, `/heartbeat`, `prime-agent schedule` | docs/usage |
| **RPC mode** | **JSONL over stdin/stdout**: `prime-agent --mode rpc`; commands `{"id","type":"prompt","message":…}`, streamed events (`agent_start`, `message_update` deltas, `tool_execution_*`, `agent_end`); session commands `new_session/switch_session/fork/clone`; steering/follow-up queue modes | docs/rpc |
| Embedding | Docs explicitly: *"useful for embedding the agent in other applications, IDEs, or custom UIs."* For Node/TS they recommend using **`AgentSession` directly** instead of spawning a subprocess | docs/rpc |
| Provider | On first launch `/login` selects a **subscription or API-key provider** — Claude Pro/Max, ChatGPT Plus/Pro via Codex, or GitHub Copilot; or set an API key | docs/usage |

## (J) Security gate — MANDATORY, and it is strict

Upstream states plainly: **"Prime Agent executes model-generated Python and project commands with
your user permissions."** Worker/kernel processes give *lifecycle* isolation only — **"they are not a
security sandbox."** The README instructs: *"Run untrusted code in an external sandbox or restricted
environment."*

**Therefore, no direct connection between an autonomous Prime Agent and the TERAGON business database
is permissible.** Any integration MUST define, before a single line of code:

- Isolated **service/process boundary** (separate OS process, ideally a separate VM/WSL2/container).
- Restricted **working directory** — a scratch repo path only; never the TERAGON source or user home.
- **Allowlisted operations** — an explicit capability list; deny-by-default.
- **No Supabase service-role key**, **no production credentials**, **no real business DB handle** in the agent process.
- **No shell access exposed through the browser UI.**
- **Organization/capability checks** before any repository operation.
- **Human approval before every mutation** (extends TERAGON's existing approval-gate doctrine).
- **Complete run audit** + a **kill switch** (Prime Agent's daemon can be stopped; TERAGON must own that control).

This is the same fail-closed posture as ADR 0002 — extended to a process boundary.

## (K) Windows & cost feasibility

- **Native Windows: NOT officially supported.** Upstream install targets **macOS or Linux only**
  (`curl … install.sh | sh`); README references "separate Windows and Termux guidance" but the stable
  path is Unix. TERAGON runs from a **Windows** workspace → a real integration needs one of:
  - **WSL2 isolated runtime** (recommended for a POC — Linux userland on the same machine, natural process/FS boundary).
  - **Docker/Linux container** (strongest isolation; heavier setup).
  - **Remote isolated runtime** (a Linux host/VM the gateway talks to over RPC).
- **Cost: `REQUIRES PROVIDER/COST`.** Prime Agent **requires a configured LLM provider/login** to run at
  all. TERAGON today is `AI_REMOTE_ENABLED=false` with **no paid dependency**. Introducing Prime Agent
  would add a provider/subscription requirement — a material change to the academic project's cost/
  dependency profile.

| Capability | Classification |
|------------|----------------|
| Current TERAGON local-rules engine | **FREE / LOCAL** — no provider, no cost, Windows-native |
| Prime-Agent-*inspired* native loop in TERAGON | **FREE / LOCAL POSSIBLE** — deterministic, no provider |
| Real Prime Agent RPC integration | **REQUIRES PROVIDER/COST** + WSL2/Linux + sandbox |

## Integration shape (only if pursued later)

```
TERAGON UI  →  TeragonAgentGateway  →  Prime Agent RPC service (WSL2/Linux, scratch dir, no DB key)
                     │                         │
              capability allowlist        AgentSession (JSONL events)
              + human-approval gate        provider (paid, /login)
              + full audit + kill switch
```
vs. the existing, shipped:
```
TERAGON UI  →  Agent Action Registry  →  Local Demo Action Engine (deterministic, no provider, in-process)
```

## Feasibility score

| Axis | Score (0–10) | Note |
|------|:---:|------|
| Academic demo value | 6 | Impressive, but the academic story is "trusted, deterministic, no-cost"; a paid autonomous coder cuts against that thesis |
| Implementation complexity | 3 | RPC + WSL2 + gateway + sandbox + approval bridge is a large build |
| Windows compatibility | 3 | No native Windows; needs WSL2/Docker/remote |
| Security | 4 | Powerful but explicitly **not sandboxed**; safe only behind a strict boundary |
| No-cost operation | 2 | Requires a provider/login (paid) |
| Maintainability | 5 | External runtime + version drift to track |
| UI integration | 7 | RPC/AgentSession + streamed events map cleanly onto an AI Workspace timeline |
| Production potential | 8 | This is a genuine production-grade agent runtime |

**Weighted feasibility for THIS academic project: ~4.5 / 10 — POC-only, deferred, and last in sequence
(PR F), gated on a positive re-check.** For a future *product*, potential is high (8/10) if the security
boundary and provider cost are accepted.

**Recommendation:** Do **not** integrate Prime Agent now. Adopt its *architecture ideas* (RPC-style
structured events, AgentSession lifecycle, bounded autonomous budgets, quality gates) natively in
TERAGON's free/local engine first (see AGENT_LOOPS_ARCHITECTURE.md, Option B). Revisit a real RPC POC
(Option C) only after the free path proves the UX and only inside WSL2 + the security gate above.
