# Supabase Staging Dry-Run Report (Gate S7.0)

Captured from `npm run platform:staging:plan` on branch
`feature/teragon-supabase-platform`. **Remote mutations performed: ZERO.**

## What plan does

Fully read-only. It loads the unified credential provider, validates every
pipeline command by NAME + authorization kind, and reports readiness + intended
actions. The only outbound contact is a safe, read-only Supabase auth probe
(`supabase orgs list`, exit-code observed) to determine whether a CLI session
exists — no create, link, migrate, netlify-change, or deploy is ever performed.

## Captured output (this environment, S7.0.1)

```
▸ STAGING PLAN — READ-ONLY. Safe status/auth probes only. No mutation. No credentials required to run.
  stage tracker: state=PLAN_READY completed=[PLAN_READY]

▸ Pipeline readiness (S7.0.1)
  state: APPLY_READY (post-provision values will be fetched during apply)
  PRE_PROVISION_READY (can create/select a project): YES
  POST_PROVISION_PENDING (project-derived URL/keys not yet existing — EXPECTED before creation): YES
  APPLY_READY (orchestrator can fetch post-provision values during the same apply): YES

▸ [provision-staging]  READY (supabase authorization: ready via cli-session)
▸ [migrate]            NOT READY — missing SUPABASE_PROJECT_REF (fetched during apply)
▸ [bootstrap-admin]    NOT READY — missing SUPABASE_URL, SUPABASE_SERVER_KEY (fetched during apply);
                       confirmation gate TERAGON_ADMIN_EMAIL_CONFIRMED: confirmed
▸ [configure-netlify]  NOT READY — missing SUPABASE_URL, SUPABASE_BROWSER_KEY, SUPABASE_SERVER_KEY (fetched during apply)
▸ [deploy-preview]     READY (netlify authorization present)
▸ [verify-preview]     READY (netlify authorization present)

▸ PLAN summary
  ✓ APPLY_READY — the pipeline can acquire the post-provision connection values (URL + browser/server keys)
    automatically during apply. It is NOT blocked by their pre-creation absence.
  APPLY gated behind APPLY_STAGING=true; production behind DEPLOY_PRODUCTION=true. Neither is set here.
▸ STAGING PLAN complete — remote mutations performed: ZERO. (exit 0)
```

## Interpretation

- The plan now reports **APPLY_READY**: the pre-provision credentials exist (CLI
  session + org + DB password), the admin email is **confirmed**
  (`soundcloudillusion@gmail.com`, `TERAGON_ADMIN_EMAIL_CONFIRMED=true`), and the
  Netlify target is resolved. The `NOT READY` per-command lines for `migrate` /
  `bootstrap-admin` / `configure-netlify` reflect **project-derived** values
  (ref / URL / browser+server keys) that **only exist after creation** — the
  orchestrator fetches them automatically during the same apply. This is
  **POST_PROVISION_PENDING**, not blocked.
- The machine still has an authenticated Supabase CLI session and Netlify token;
  the provider reports authorization via `cli-session` with no
  `SUPABASE_ACCESS_TOKEN` present. **Remote mutations performed: ZERO.**

## S7.0.2 — live read-only API-key probe

After the live apply created the real project it failed at key classification
(`type: "default"` non-semantic metadata). The classifier was hardened and a
reproducible read-only probe (`scripts/platform/probe-keys.mjs`, no APPLY_STAGING,
no mutation) verifies it against the existing project. Safe result ONLY:

```
project identity verified: YES
returned record count: 4
browser classification source: PUBLISHABLE
server classification source: SECRET
classification result: PASS
remote mutations: ZERO
```

Sanitized response shape (no values): the `api-keys` response is an array of
records, each with `name`/`type` fields (the value `default` for the modern
keys) and an `api_key` field; the two selected records had `api_key` values in
the modern `sb_publishable_…` / `sb_secret_…` format, chosen over the coexisting
legacy pair. Project count is unchanged (5 before and after); the tracker remains
`FAILED` with `completed:[PLAN_READY, PROJECT_READY]` — resumable from
PROJECT_READY (the next apply re-fetches keys, it does not re-create the project).

## To actually apply (operator, later — not done here)

1. Set `APPLY_STAGING=true` and run `npm run platform:staging:apply`. The
   orchestrator provisions/selects the project, discovers the connection values,
   injects them into the runtime context, and continues through migrate →
   bootstrap → netlify → preview → acceptance.
2. Nothing further is needed for the admin email — it is already confirmed.
