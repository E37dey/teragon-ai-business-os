# e2e/ai — STAGED (waiting on W5-D UI integration)

**Status: skeletons only. No UI e2e tests run from this directory yet — honestly.**

W5-E (server/engine QA) was built in parallel with W5-D (product UI). The AI
screens these specs need (`/ai` surfaces, copilot input, health/capabilities
indicators, fallback disclosure banner, Hebrew error toasts) did not exist in
this worktree at authoring time, and writing UI selectors against screens we
cannot see would produce fake coverage.

## What runs TODAY instead

Server/engine behavior is fully covered headlessly (no browser, no real keys):

- `tests/ai/server/**` — handler pipeline (DTO validation, guards, rate limit,
  budget, concurrency, timeout, malformed output, streaming, CORS, auth shape)
- `tests/ai/security/**` — W5-E gap-fill (auth claims, injection surfaces,
  secret/policy leakage, duplicate-request behavior)
- `tests/ai/integration/**` — W5-E functional flows 1/4/5/7/8

## Planned specs (to be written AFTER W5-D lands, as stage 2)

| Planned file | Covers |
|---|---|
| `ai-health-status.spec.ts` | health states rendered honestly: מחובר / לא הוגדר / מושבת |
| `ai-copilot-flow.spec.ts` | prompt → streamed reply → envelope fields (evidence, limitations, confidence "טרם נמדד") |
| `ai-fallback-disclosure.spec.ts` | remote down ⇒ the exact Hebrew fallback sentence is VISIBLE |
| `ai-error-states.spec.ts` | rate-limit / budget / cancelled — Hebrew messages, no raw errors |
| `ai-approval-gate.spec.ts` | outbound draft shows approval-pending UI, never auto-sends |

All will run against the Vite preview server with `AI_PROVIDER=test` semantics
(TestAdapter / LocalRulesProvider) — never a real provider key.
