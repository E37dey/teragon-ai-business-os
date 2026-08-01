# Supabase Staging Dry-Run Report (Gate S7.0)

Captured from `npm run platform:staging:plan` on branch
`feature/teragon-supabase-platform`. **Remote mutations performed: ZERO.**

## What plan does

Fully read-only. It loads the unified credential provider, validates every
pipeline command by NAME + authorization kind, and reports readiness + intended
actions. The only outbound contact is a safe, read-only Supabase auth probe
(`supabase orgs list`, exit-code observed) to determine whether a CLI session
exists — no create, link, migrate, netlify-change, or deploy is ever performed.

## Captured output (this environment)

```
▸ STAGING PLAN — READ-ONLY. Safe status/auth probes only. No mutation. No credentials required to run.
  stage tracker: state=PLAN_READY completed=[PLAN_READY]

▸ [provision-staging]   READY (supabase authorization: ready via cli-session)
▸ [migrate]             NOT READY — missing SUPABASE_PROJECT_REF
▸ [bootstrap-admin]     NOT READY — missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY;
                        confirmation gate TERAGON_ADMIN_EMAIL_CONFIRMED: NOT confirmed (held)
▸ [configure-netlify]   NOT READY — missing SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
▸ [deploy-preview]      READY (netlify authorization present)
▸ [verify-preview]      READY (netlify authorization present)

▸ PLAN summary — all steps credential-ready: NO
  APPLY gated behind APPLY_STAGING=true; production behind DEPLOY_PRODUCTION=true. Neither is set here.
▸ STAGING PLAN complete — remote mutations performed: ZERO. (exit 0)
```

## Interpretation

- The pipeline **cannot apply** yet — `bootstrap-admin` and `configure-netlify`
  are NOT credential-ready, and `bootstrap-admin` is additionally **held** by the
  unconfirmed-email gate. This is the intended, safe state.
- The machine running this had an authenticated Supabase CLI session and a
  Netlify token in the environment; the provider correctly reports
  `supabase authorization: ready via cli-session` **without** any
  `SUPABASE_ACCESS_TOKEN` NAME being present — proving the "env-token OR
  cli-session" contract while remaining fail-closed for the missing plain NAMES.

## To reach an applyable state (operator, later)

1. Resolve `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` after
   provisioning the project (or provide `SUPABASE_PROJECT_REF` to reuse one).
2. Confirm the admin email and set `TERAGON_ADMIN_EMAIL_CONFIRMED=true`.
3. Set `APPLY_STAGING=true` and run `npm run platform:staging:apply`.
