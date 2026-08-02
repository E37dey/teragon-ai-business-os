# Supabase Remote Acceptance Plan (Gate S7.0)

The complete remote-acceptance harness for the staging Deploy Preview backed by
the real staging Supabase project. **Wired but guarded off — it does not run in
S7.0.**

## Location + gating

- Spec: `e2e/acceptance/staging-acceptance.accept.ts`
- Guard: `e2e/acceptance/_guard.ts`
- Config: `e2e/acceptance.config.ts` (no webServer; drives an already-deployed
  preview; `testMatch: /.*\.accept\.ts/` so the **default** Playwright suite —
  which matches `*.spec.ts` — never picks it up).

It never runs headless/local here and requires explicit env:

```
STAGING_ACCEPTANCE=1 \
STAGING_PREVIEW_URL=https://<preview>.netlify.app \
STAGING_SUPABASE_PROJECT_REF=<ref> \
INTENDED_COMMIT=<sha> \
npx playwright test -c e2e/acceptance.config.ts
```

Absent/misconfigured env ⇒ the guard **throws at import** (fails hard, never a
green skip).

## Hard failure contract — the suite MUST fail (never skip / never green) when:

| Condition | Mechanism |
| --- | --- |
| No tests execute | `afterAll` executed-count guard throws on `executed === 0` |
| Any test is skipped | `forbidOnly: true` + no `test.skip` used; guard throws instead of skipping |
| App silently falls back to IndexedDB | `assertConnectedToSupabase`: provider marker must be `SUPABASE` **and** ≥1 request hits the Supabase host |
| Preview connected to WRONG Supabase project | every observed `*.supabase.co` host must equal `${STAGING_SUPABASE_PROJECT_REF}.supabase.co` |
| Deployed commit ≠ intended commit | provenance test asserts the served build exposes `INTENDED_COMMIT` |

## Coverage inventory (one test each)

login/session/logout · inactive-user denial · org isolation · CRM CRUD ·
quotations · printers/service/repairs · courses/enrollments · tasks/approvals ·
knowledge/memory/governance · pagination · idempotency · refresh + deep links ·
Light/Dark/RTL · widths ≥ 1024 (two viewport projects: 1920 + 1024) · console
errors (zero) · failed required requests (zero) · CSP/security headers ·
privileged-key bundle absence · Business Graph / Auth prototype flags OFF.

## S7.0 note

Several domain-interaction bodies are wired as structural placeholders with
explicit operator notes (real selectors + seeded fixture users are finalized when
a live preview first exists). The **load-bearing guards** — provider/fallback,
wrong-project, commit provenance, executed-count, CSP, prototype-flags-off — are
implemented concretely. Unit tests in `tests/platform/acceptance-harness.test.ts`
assert the guard throws when unconfigured and that the spec encodes each required
failure condition.
