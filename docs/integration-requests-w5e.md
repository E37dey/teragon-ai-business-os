# Integration requests — W5-E (AI QA, Security & Testing)

Requests to the integrator / other wave agents. W5-E touched ONLY its owned
paths (`tests/ai/security|integration`, `tests/agents/integration`, `e2e/ai`,
`e2e/agents`, `scripts/scan-bundle-secrets.mjs`, its three docs). Everything
below needs an owner outside that scope.

## 1. package.json — add the `scan:secrets` npm script (integrator)

`package.json` is outside W5-E's ownership. Please add:

```json
"scan:secrets": "node scripts/scan-bundle-secrets.mjs"
```

Recommended usage: `npm run build && npm run scan:secrets` as a CI gate (the
script exits 1 on findings, 2 when `dist/` is missing — it never builds by
itself). Consider appending it to the release checklist next to lint/typecheck.

## 2. Registry fallback audit hook (W5-A/W5-B owner)

`ProviderRegistry.select()` returns the fallback disclosure as DATA but nothing
persists an audit record when the local engine serves instead of remote
(`tests/ai/integration/fallbackFlow.test.ts` documents this honestly). Request:
an optional `onFallback`/audit sink in `ProviderRegistry` (or in the
orchestrator's provider-selection step) that writes a `provider.fallback` audit
event, so operators can count silent-degradation windows.

## 3. W5-D wiring needed for stage 2 (UI e2e) — W5-D

- Real screens for `/agents`, `/agents/collaboration`, `/automations` and the
  AI surfaces (currently lazy placeholders from `0f41cc0`).
- Stable `data-testid`s requested on: health-state badge, fallback-disclosure
  banner (must render `FALLBACK_MESSAGE_HE` verbatim), approval
  approve/edit/reject controls, conflict-resolution action buttons (5), run
  timeline entries, copilot stream output area.
- Once landed, W5-E stage 2 fills `e2e/ai/**` + `e2e/agents/**` per the
  READMEs and runs Phase 5.17 visual QA.

## 4. Restated open items from earlier waves (still relevant to security)

- **Shared store for rate limit / budget** (from w5b): per-instance in-memory
  state is a documented serverless caveat; a strict global limit needs
  Redis/Netlify Blobs.
- **Real identity provider**: demo auth validates claim shape only and always
  yields `trusted:false`; the `AuthVerifier` seam awaits a JWT verifier.

## 5. Optional (low priority): server idempotency keys

`tests/ai/security/duplicateRequests.security.test.ts` pins that duplicate AI
requests are processed independently (each billed against rate+budget). If
product wants retry-safe POSTs from flaky clients, add an idempotency-key
header + short-lived per-instance cache — with the same serverless honesty
note as the rate limiter. Not required for correctness today (mutations are
approval-gated and double-execution is blocked at the engine).

## 6. tests/** are not typechecked by the official gate (integrator / test owners)

`tsconfig.app.json` includes only `src` + `netlify`, so `npm run typecheck`
never sees `tests/**`. W5-E's own files are strict-clean (verified with a
temporary extended config). Two pre-existing files fail strict when included:

- `tests/cross-module.test.ts` — 6 errors (loose `Activity`/`Quotation` field
  access, string passed where a CollectionKey union is expected)
- `tests/ai/server/adapters.test.ts` — 1 error (tuple cast at line 84)

Request: add a `tsconfig.tests.json` (extends the app config, includes `tests`
+ `scripts`) wired into the typecheck script, and fix the 7 errors above
(owners: cross-module = Waves 2-4 integrator; adapters = W5-B).
