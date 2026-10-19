# Teragon AI Business OS

[![ci](https://github.com/E37dey/teragon-ai-business-os/actions/workflows/ci.yml/badge.svg)](https://github.com/E37dey/teragon-ai-business-os/actions/workflows/ci.yml)

A browser-based operations system for Teragon Technologies, a 3D-printing business that sells printers, runs courses and repairs machines. It puts CRM, quotations, service tickets and course management in one app, and adds seven AI agents that can read, summarize, classify and draft, but cannot send a message, change a price, close a ticket or delete a record until a person approves it. The UI is Hebrew (RTL). It was built as a course project: `docs/EVALUATOR_GUIDE.md` is written for the course evaluator. All customers, leads, tickets and students are synthetic demo data from `src/repositories/seed/seedData.ts`, labeled "נתוני הדגמה" (demo data) in the UI. No real customer data ships.

Live demo (remote AI off): https://teragon-os-demo.netlify.app (recorded in `docs/FINAL_DEPLOYMENT_REPORT.md`)

## What it does

- 31 routes (`src/app/routes.ts`): command center, CRM, customers, sales and quotations, service and printers, courses, tasks, documents, automations, agents, organizational memory, knowledge base, analytics, governance, administration, system health and settings, plus adoption screens (personas, implementation plan, stage gates, training materials, FAQ, support).
- Seven agents, defined in `src/agents/definitions.ts`:

| Agent | id | Role |
|---|---|---|
| Teragon Orchestrator | `ag-orchestrator` | Plans, dispatches and synthesizes only. Never takes a business action. |
| Hunter | `ag-hunter` | Sales: reads leads, customers, products, quotations; drafts offers. |
| Fixer | `ag-fixer` | Service: reads tickets and approved knowledge; drafts a diagnosis. |
| Mentor | `ag-mentor` | Training: reads courses, students and progress; recommends exercises. |
| Nexa | `ag-nexa` | Marketing: proposes campaigns and follow-up text. |
| Wiki | `ag-wiki` | Knowledge: searches approved knowledge, flags contradictions, proposes updates. |
| Flow | `ag-flow` | Automations: prepares automation plans and monitors runs. |

- A run (`src/agents/orchestrator.ts`) classifies the request, picks up to 4 specialists, collects their answers with evidence that cites real record ids, checks for conflicts between agents, and stops at a human approval gate. The built-in scenario (`src/agents/demoScenario.ts`): Hunter recommends a printer model, Fixer finds an open service ticket on that model, the conflict is raised, and the run waits for a person.
- Every AI answer uses one envelope: recommendation, reason, evidence, confidence, limitations, next step, approval state, usage. Unmeasured confidence is shown as "טרם נמדד" (not measured), never as a number.
- Memory import from Obsidian-style Markdown files or ZIP. Each imported note becomes a proposal that needs human approval; nothing is written to memory automatically (`src/memory/`).

## How the agents are governed

- **Deny by default.** `canAgent(agentId, operation, domain)` returns true only for an operation and data collection the agent was explicitly granted. No agent may touch `approvals`, `auditEvents`, `users` or `roles`. The definitions are deep-frozen, so changing them at runtime throws.
- **12 actions always need approval** (`APPROVAL_REQUIRED_ACTIONS` in `src/domain/agents/types.ts`): customer message, quotation change, price change, discount, external notification, ticket closure, record deletion, permission change, permanent knowledge update, permanent memory update, external automation, financial commitment.
- **Approval engine** (`src/agents/approvalEngine.ts`): pending, then approved, edited or rejected (or expired or cancelled), then execute and audit. `execute()` throws `AGENT_EXECUTION_WITHOUT_APPROVAL` unless the approval is in the approved or edited state. A rejection requires a reason. An edit executes the edited payload, not the original. Rollback exists only for task creation and field changes; other kinds throw `AGENT_ROLLBACK_UNSUPPORTED`. The UI for this is `src/components/approval/ApprovalPanel.tsx`.
- **Hard limits** (`src/agents/limits.ts`): 4 specialists per run, handoff depth 3, 8 model calls per run, 2 retries, 2 revision cycles, 60 second run time, budget 0. An agent cannot receive a task it already handled in the same chain (A to B to A is blocked).
- **Audit log.** Each run step is stored as one of 19 event types, and every state change writes an audit record (`src/agents/runlog.ts`). The governance screen (`src/governance/`) adds 10 policies that stay in draft until approved by name, a risk register, incidents that cannot close without a review, a prompt registry that stores only sha-256 checksums, and an audit export that redacts secrets.

## Architecture

- React 19, TypeScript (strict), Vite, React Router, TanStack Query, zod.
- Data lives in the browser: IndexedDB through `idb` (schema v6, `src/repositories/IndexedDBRepository.ts`), one repository per collection, seeded on first load. There is no server database.
- `AIProvider` interface (`src/ai/contracts/AIProvider.ts`) with two implementations: `LocalRulesProvider` (deterministic rules, no network, reports `model: null` so it never poses as an LLM) and `RemoteAIProvider` (calls only `/.netlify/functions/ai-*`). `ProviderRegistry` falls back to local rules with a visible notice when the server is not healthy.
- Server side: 9 Netlify Functions in `netlify/functions/` are one-line wrappers around `src/server/handlers.ts`. Each request goes through a size limit, zod validation, the `AI_REMOTE_ENABLED` kill switch, a per-user and per-session rate limit, a concurrency gate and a daily budget before any provider call. The prompt is built in layers with user input fenced off, plus English and Hebrew prompt-injection heuristics. Adapters: Anthropic Messages API, OpenAI-compatible Chat Completions, and a deterministic test adapter (`src/server/providers/`). The model name comes only from `AI_MODEL`.
- API keys live only in server environment variables (Functions scope), never in `VITE_*` variables. `npm run scan:secrets` checks the built `dist/` for key-shaped strings, server env values, provider auth headers and the server system-prompt text.
- `netlify.toml` sets an SPA fallback, a CSP with `script-src 'self'`, `X-Frame-Options: DENY` and cache headers.

## Run locally

Node 22 or newer.

```bash
npm ci
npm run dev                 # Vite dev server
npm run build               # tsc -b && vite build
npm run preview             # serve the build
npm run lint                # oxlint
npm run typecheck           # tsc -b --noEmit
npm run typecheck:tests
npm test                    # vitest run
npm run test:e2e            # Playwright; build first, needs `npx playwright install chromium`
npm run format:check        # prettier
npm run scan:secrets        # run after npm run build
```

The AI functions only run under the Netlify runtime (`netlify dev` from Netlify CLI, or a deploy). Without it the System Health screen reports them as unavailable and the app keeps working on the local rules engine. Server variables are listed in `.env.example`; `docs/AI_PROVIDER_SETUP.md` explains them.

## Tests and CI

- Unit and integration: 1,706 tests in 187 files in `tests/` (Vitest, jsdom, fake-indexeddb), all passing. Tests that depend on the date pin the clock, so the suite gives the same result on any day.
- End to end: 57 Playwright spec files in `e2e/`, including axe accessibility checks. Each development wave has its own config (for example `npx playwright test -c e2e/w3.config.ts`), and `e2e/live.config.ts` runs against a deployed URL. The last full run recorded in `docs/FINAL_TEST_RESULTS.md` was 558 of 558 passing. They are not part of CI.
- CI (`.github/workflows/ci.yml`) runs on every push to `main` and every pull request: lint, test type-check, the unit and integration tests, the production build (which includes `tsc -b`) and the secrets scan of the build.
- A second workflow, `customer-live-acceptance.yml`, is manual (`workflow_dispatch`) and calls scripts that are not defined in this repo's `package.json`, so it does not run as committed.

## Limitations

- Demo only. All records are synthetic, stored in one browser's IndexedDB, for one organization. Clearing site data resets it to the seed.
- No real authentication. Identity is a set of unverified claims (`trusted: false` in `src/server/auth.ts`). A role model of 9 roles and 24 permissions exists in `src/authorization/` with unit tests, but it is not yet wired into the router (`docs/integration-requests-w9b.md`), so the demo user sees every screen.
- No LLM in the UI yet. The agent engine in the browser is set to `remoteEnabled: false` (`src/components/ai/engine.ts`), so agents and the copilot always use the local rules engine. The Anthropic and OpenAI adapters are unit-tested with mocked HTTP but not connected to the UI, and the deployed site runs with `AI_REMOTE_ENABLED=false`.
- Nothing is sent externally. An approved "send" creates a local task and activity record that a person must act on (`src/components/approval/externalHandlers.ts`).
- Rate limit and budget counters are in memory per function instance, so they reset on cold start.
- Prompt-injection detection is pattern matching and will miss new phrasings; human approval is the backstop.
- Business metrics have no baseline and show "טרם נמדד" (not measured).
- Hebrew UI only.
