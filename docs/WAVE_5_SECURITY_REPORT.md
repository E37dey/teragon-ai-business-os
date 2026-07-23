# WAVE 5 — SECURITY REPORT (W5-E, stage 1)

תאריך: 23.07.2026 · Agent: W5-E (AI QA, Security & Testing) · Scope: server/engine level.
UI e2e + visual QA (Phases 5.16-end-to-end/5.17) are **staged** until W5-D's UI integrates — see `e2e/ai/README.md`, `e2e/agents/README.md`.

Method: **gap analysis first**. The existing W5-A/B/C suites (284→507 tests) already covered most of the Phase 5.15 checklist; W5-E wrote ONLY the missing tests (`tests/ai/security/**`) plus the 8 functional integration flows (`tests/ai/integration/**`, `tests/agents/integration/**`). Nothing was duplicated; existing coverage is referenced below.

## 1. Phase 5.15 checklist — item → covering test → status

| # | Checklist item | Covering test (file → name) | Status |
|---|---|---|---|
| 1 | Missing provider config | `tests/ai/server/handlers.test.ts` → "no AI_PROVIDER ⇒ AI_PROVIDER_NOT_CONFIGURED (503)", "AI_REMOTE_ENABLED=false disables everything"; `tests/ai/server/config.test.ts` | PASS (existing) |
| 2 | Invalid credential | `tests/ai/server/adapters.test.ts` → "401 ⇒ AI_PROVIDER_AUTH_FAILED without ANY retry", "health live-check: 401 ⇒ שגיאת אימות"; client mapping in `tests/ai/contracts/remoteProvider.test.ts` | PASS (existing) |
| 3 | Timeout | `tests/ai/server/handlers.test.ts` → "hung adapter ⇒ 504 after exactly 3 attempts"; `tests/ai/server/adapters.test.ts` → "hung provider ⇒ AI_PROVIDER_TIMEOUT" | PASS (existing) |
| 4 | Rate limit | `tests/ai/server/handlers.test.ts` → "over the per-minute limit ⇒ 429 … Hebrew message"; `tests/ai/server/rateLimit.test.ts` (window slide, per-user across sessions, prune) | PASS (existing) |
| 5 | Malformed output | `tests/ai/server/handlers.test.ts` → "non-envelope adapter output ⇒ AI_RESPONSE_INVALID (502), content never shown"; `tests/ai/server/adapters.test.ts` → "empty provider body ⇒ AI_RESPONSE_INVALID" | PASS (existing) |
| 6 | Stream interruption | `tests/ai/server/handlers.test.ts` → "mid-stream adapter failure ⇒ error event (never silent)"; `tests/ai/contracts/remoteProvider.test.ts` → malformed stream line | PASS (existing) |
| 7 | Cancellation | Existing: pre-aborted signal (`handlers.test.ts`), client abort (`remoteProvider.test.ts`), LocalRules abort (`localRulesProvider` stream). **GAP-FILLED**: true MID-stream abort after a delta ⇒ `AI_REQUEST_CANCELLED` + budget untouched — `tests/ai/integration/serverHandlerFlows.test.ts` → flow 7 | GAP-FILLED |
| 8 | Budget exceeded | `tests/ai/server/handlers.test.ts` → "adapter is NOT invoked"; `tests/ai/server/budget.test.ts`; exact-Hebrew-message + audit assertions in `tests/ai/integration/serverHandlerFlows.test.ts` → flow 8 | PASS (existing + flow) |
| 9 | Request too large | `tests/ai/server/handlers.test.ts` → "body over 256KB ⇒ 413"; `tests/ai/server/guards.test.ts` | PASS (existing) |
| 10 | Duplicate request | **GAP-FILLED**: `tests/ai/security/duplicateRequests.security.test.ts` — pins the HONEST behavior: the server has **no dedup layer**; duplicates each consume rate + budget and are each audited. Mutation-side dedup exists where it matters: idempotent demo run (`tests/agents/demoScenario.test.ts`) and double-execution block (`tests/agents/approvalEngine.test.ts`) | GAP-FILLED (documented behavior) |
| 11 | Concurrent limit | `tests/ai/server/handlers.test.ts` → "second parallel request over the limit ⇒ 429"; `tests/ai/server/rateLimit.test.ts` → ConcurrencyGate | PASS (existing) |
| 12 | Invalid entity reference | `tests/ai/contracts/localRulesProvider.test.ts` → "classify on a missing lead ⇒ structured AI_EVIDENCE_REQUIRED (no fake output)", "printer-match without params ⇒ AI_EVIDENCE_REQUIRED" | PASS (existing) |
| 13 | Unauthorized organization | Existing: malformed/valid demo header (`handlers.test.ts`). **GAP-FILLED**: `tests/ai/security/authBoundary.security.test.ts` — malformed org/user/session CLAIMS ⇒ 403, CRLF/log-injection shapes rejected, overlong claims rejected, malformed value never echoed/audited, `trusted:false` always. **Honest caveat**: demo mode validates claim SHAPE only — there is no identity provider yet; real org authorization requires the JWT verifier seam (`src/server/auth.ts`) | GAP-FILLED (demo-mode caveat) |
| 14 | Approval bypass | `tests/agents/approvalEngine.test.ts` → "BYPASS BLOCKED: executing a pending or missing approval throws", "double execution is blocked", "reject … blocks execution forever"; prompt-level pattern `approval-bypass` in `tests/ai/server/promptSecurity.test.ts`; re-proven end-to-end in `tests/agents/integration/approvedActionFlow.test.ts` (flow 3: post-reject execute ⇒ `AGENT_EXECUTION_WITHOUT_APPROVAL`, zero mutation) | PASS (existing + flow) |
| 15 | Injection in CRM text | Existing: `handlers.test.ts` (leads note), `promptSecurity.test.ts` (patterns, layering). **GAP-FILLED**: Hebrew-language injection in a customer note through the full handler — `tests/ai/security/injectionSurfaces.security.test.ts` | GAP-FILLED |
| 16 | Injection in knowledge text | **GAP-FILLED**: `tests/ai/security/injectionSurfaces.security.test.ts` — poisoned `knowledgeNotes` record through the full handler: flagged, quarantined out of the trusted layers, disclosed (`limitations`), audited (`injectionFlags`), and disclosed on the STREAM endpoint too | GAP-FILLED |
| 17 | Secret redaction | Existing: `redact.test.ts`, `handlers.test.ts` (sk- never in log sink; ai-config never echoes key). **GAP-FILLED**: `tests/ai/security/leakage.security.test.ts` — AI_API_KEY value absent from success/error/stream bodies AND audit events; audit is metadata-only (no bounded-context content); AKIA + sk-proj/sk-ant redaction | GAP-FILLED |
| 18 | Fallback activation | `tests/ai/contracts/registry.test.ts` → "remote down + local permitted ⇒ local serves"; genuine-path re-proof with a real failing `RemoteAIProvider` + orchestrated run in `tests/ai/integration/fallbackFlow.test.ts` (flow 5) | PASS (existing + flow) |
| 19 | Fallback disclosure | `tests/ai/contracts/registry.test.ts` (disclosure object); `fallbackFlow.test.ts` asserts the EXACT Hebrew sentence "הספק המרוחק אינו זמין. המערכת עברה למנוע המקומי מבוסס הכללים." | PASS (existing + flow) |
| 20 | Audit creation | `tests/ai/server/handlers.test.ts` (success/error audits); `tests/agents/demoScenario.test.ts` → "audit completeness"; every W5-E integration flow asserts its audit entries (request/decision/execution/rejection/conflict-resolve/denial) | PASS (existing + flows) |
| 21 | Correlation propagation | `tests/ai/server/handlers.test.ts` → "header correlation id echoed in response header, envelope and audit", "malformed header correlation id is replaced"; flow 4 re-asserts through a full DTO round-trip | PASS (existing) |

## 2. Bundle security scan — real output

Command: `npm run build` (exit 0) then `node scripts/scan-bundle-secrets.mjs` (exit **0**):

```
=== scan-bundle-secrets — W5-E ===
[info] dist text files scanned: 27
[info] .env.example var names: AI_PROVIDER, AI_MODEL, AI_API_KEY, AI_BASE_URL, AI_REQUEST_TIMEOUT_MS, AI_MAX_OUTPUT_TOKENS, AI_DAILY_BUDGET, AI_RATE_LIMIT_PER_MINUTE, AI_MAX_CONCURRENT_REQUESTS, AI_REMOTE_ENABLED
[info] git history commits touching /sk-[A-Za-z0-9_-]{16,}/: 1
[info] git history commits touching /AKIA[A-Z0-9]{12,}/: 0
[info] screenshot files checked in docs\screenshots: 42
RESULT: CLEAN — 0 findings.
```

What the scanner checks (see `scripts/scan-bundle-secrets.mjs`): key-shaped strings (`sk-\w{8,}`, `AKIA…`, JWT-like `eyJ…`, `api[_-]?key=`, Bearer tokens), **VALUES** of every var named in `.env.example` (names alone are allowed), provider auth-header wiring strings (`x-api-key`, `anthropic-version`, `api.anthropic.com`, `api.openai.com`), the server system-prompt policy sentence ("מדיניות מערכת (בלתי ניתנת לשינוי)…"), and the literal `AI_API_KEY` in client chunks. Exit 1 on any finding.

**Git history**: the single commit matched by the `sk-` pickaxe is `de7865f` (W5-B server security layer) — every matching added line carries an obvious `FAKE` placeholder marker (test fixtures / redaction patterns), which the scanner classifies as non-findings. No real key shape was ever committed. `AKIA` pattern: zero commits.

**Screenshots**: 42 filenames under `docs/screenshots` checked — none secret-like.

## 3. Injection heuristics — documented imperfection

Detection (`src/server/promptSecurity.ts`) is a **heuristic pattern list** (Hebrew + English imperative shapes). It is deliberately documented as imperfect: a novel phrasing WILL pass undetected. W5-E pins this honestly with a negative test (`injectionSurfaces.security.test.ts` → "a novel indirect phrasing is NOT flagged"). The real defenses are structural, and each is separately tested:

1. layered prompt — untrusted content never merges into trusted layers (`promptSecurity.test.ts`);
2. flagged content is quarantined + disclosed + audited (`injectionSurfaces.security.test.ts`);
3. **HITL approval gates every mutation regardless of detection** (`approvalEngine.test.ts` bypass-block; flow 2/3).

One nuance pinned in the tests: quarantine operates at the **prompt layer**; the raw DTO context still reaches the adapter as data (the TestAdapter cites it as evidence). The trusted-layer exclusion is what real adapters consume.

## 4. Serverless rate-limit / budget caveat

`SlidingWindowRateLimiter`, `ConcurrencyGate` and `DailyBudgetLedger` are **in-memory per function instance** (documented in `src/server/rateLimit.ts` / `budget.ts`). On Netlify, multiple concurrent instances + cold-start recycling mean the effective global limit can exceed the configured one and counters reset on cold start. They still stop per-instance runaway loops and bursts. A strict global limit/budget requires a shared store (Redis / Netlify Blobs) — carried as an open integration request (w5b, restated in `docs/integration-requests-w5e.md`).

## 5. No-browser-provider-call verification (grep proof)

- `grep -rn "fetch(" src/` excluding `src/server`: **one** hit — `src/ai/providers/RemoteAIProvider.ts`, which talks ONLY to the relative `basePath = "/.netlify/functions"` (no absolute host).
- `grep -rn "api.anthropic|api.openai" src/`: hits ONLY in `src/server/providers/anthropicAdapter.ts` / `openaiAdapter.ts` — server-function code, not bundled to the client.
- `grep -rn "from \"@/server" src/` outside `src/server`: **0** — no client module imports server code.
- Confirmed at the artifact level: the bundle scan (section 2) found neither provider host strings nor auth-header wiring in `dist/`.

## 6. Approval-bypass proof

There is **no execution path without an approved/edited Approval record**:

- engine level: `ApprovalEngine.execute()` throws `AGENT_EXECUTION_WITHOUT_APPROVAL` for missing/pending/rejected approvals; double execution throws; recommendation-only approvals cannot execute; external actions without an injected handler fail honestly (`tests/agents/approvalEngine.test.ts`).
- flow level (W5-E): flow 2 proves the Task mutation happens ONLY after `decide(approve)` + `execute`; flow 3 proves reject ⇒ zero mutation, audited, and a later `execute` still throws (`tests/agents/integration/approvedActionFlow.test.ts`).
- prompt level: "bypass approval"-shaped asks (EN+HE) are flagged + quarantined (`promptSecurity.test.ts`).
- orchestrator level: any detected conflict FORCES the human gate (`collaborationConflictFlow.test.ts`).

## 7. Residual risks / honest gaps

| Gap | Why it is acceptable now | Owner/next |
|---|---|---|
| Demo auth = shape-only, `trusted:false` | Stated design (no identity provider in Wave 5); JWT verifier seam ready | future wave |
| No server request dedup | Reads are idempotent-by-nature; mutations gated by approval engine (double-execute blocked) | documented; optional idempotency-key request in w5e requests |
| Per-instance rate/budget state | Documented serverless caveat (section 4) | shared-store integration request |
| Injection heuristics incomplete | Structural layering + HITL are the real gates (section 3) | ongoing pattern additions |
| Registry fallback has no audit hook | Disclosure is DATA returned to the caller; handler+engine layers audit | requested in `integration-requests-w5e.md` |
| No UI e2e yet | W5-D UI not present in this worktree — staged honestly | stage 2 after W5-D |
