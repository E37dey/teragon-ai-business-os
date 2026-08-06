# Architecture Overview (S12.1)

Concise architecture for evaluators. Three diagrams: (A) the application today,
(B) the agent-action engine today, (C) the **future** production AI architecture — which
is **not** implemented and is shown only to contrast with the current demo.

## A. Application architecture (current)

React UI → hooks/domain composition → repositories → LOCAL or Supabase adapter →
Auth/org scope → RLS. The composition boundary is **fail-closed** (no silent IndexedDB
fallback in Supabase mode — ADR 0002).

```mermaid
flowchart TD
  UI[React UI · RTL shell · 32 routes] --> Q[TanStack Query hooks<br/>useDomainCollection / mutations]
  Q --> C{domainComposition<br/>SUPABASE_CONNECTED_DOMAINS}
  C -->|customers, contacts| S[Supabase adapter]
  C -->|all other domains| L[LOCAL adapter · IndexedDB seed]
  S --> A[Auth identity + organizationId]
  A --> RLS[(Postgres · RLS tenant isolation)]
  L --> IDB[(IndexedDB · deterministic seed)]
  Q --> OBS[observability · errorSink 6-field whitelist · correlationId]
  DM[demoMode · fail-closed · VITE_DEMO_MODE] --> UI
```

## B. Agent-action architecture (current — Local Demo Action Engine)

Agent UI → action registry → deterministic engine → structured result (evidence, why) →
approval gate → **isolated synthetic in-memory store**. No remote model, no external
side effect. Local demo mutations reset on reload.

```mermaid
flowchart TD
  AUI[Agent UI · פעולות tab] --> REG[Action registry · 14 actions]
  REG --> ENG[Deterministic engine · LocalRulesProvider]
  ENG --> RES[Structured AgentActionResult<br/>status · findings · evidence · why · correlationId]
  RES -->|READ_ONLY / PROPOSAL| DONE[Display only · no mutation]
  RES -->|LOCAL_DEMO_MUTATION| GATE{Explicit human approval?}
  GATE -->|no| WAIT[awaiting_approval · store unchanged]
  GATE -->|yes| STORE[(In-memory demo store<br/>idempotent · duplicate-blocked)]
  STORE -.reset on reload.-> STORE
  ENG -.never.-> REMOTE[Remote LLM / MCP / external API]
```

## C. Future production AI architecture (NOT implemented — target only)

A real production action layer must route every effect through the platform's real
seams. This is the **target**, explicitly out of scope for the academic submission.

```mermaid
flowchart TD
  AG[Agent action request] --> CAP{Capability / RBAC check}
  CAP -->|denied| STOP[Reject · audit]
  CAP -->|allowed| REPO[Repository / domain boundary]
  REPO --> ORG[Organization scope]
  ORG --> RLS[(RLS-enforced database)]
  RLS --> AUDIT[(Durable audit log · who/what/when/why)]
  AG -.optional, flag+creds.-> PROV[Production AI provider<br/>content filters · allow-list · rate/budget]
  AUDIT --> HITL[Persisted human-in-the-loop approval]
```

## Current vs. future — the honest distinction

| Aspect | Current (this submission) | Future production (target) |
|--------|---------------------------|----------------------------|
| AI engine | Deterministic local rules | Optional real provider behind a flag |
| Agent mutations | Isolated in-memory demo store | Repositories + RLS + audit log |
| Persistence | Customers/Contacts live; rest demo | All domains durable |
| Approval | In-memory HITL gate | Persisted approvals + capability checks |
| Side effects | None (no email/webhook/MCP) | Allow-listed, audited, rate-limited |

The current implementation is a **demonstration of behaviour and safety posture**; it
does not claim the production seams above. See
[src/agents/actions/README.md](../../src/agents/actions/README.md) and ADRs 0001–0004.
