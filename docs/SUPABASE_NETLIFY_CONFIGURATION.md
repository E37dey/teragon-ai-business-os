# Supabase → Netlify Configuration (Gate S7.0)

`scripts/platform/configure-netlify.mjs` sets the linked Netlify site's env vars
by **context/scope**, with a hard rule that privileged values never reach the
browser bundle. Unrelated existing vars are preserved.

## Variable scope map

| Variable | Scope | Secret | `VITE_`? ships to browser | Purpose |
| --- | --- | --- | --- | --- |
| `VITE_SUPABASE_URL` | builds + runtime | no | yes (browser-safe) | staging project URL |
| `VITE_SUPABASE_ANON_KEY` | builds + runtime | no | yes (publishable/anon) | client key |
| `VITE_SUPABASE_ORG` | builds + runtime | no | yes | org id (not a secret) |
| `VITE_PERSISTENCE_PROVIDER` | builds + runtime | no | yes | explicit preview persistence-provider selector (`SUPABASE`) |
| `SUPABASE_SERVICE_ROLE_KEY` | **functions only** | **yes** | **never `VITE_`** | server-only privileged key |

## Invariants (enforced in code + tests)

- `assertScopeInvariants()` **throws** if any privileged/secret value is assigned
  to a `VITE_`-prefixed key, if a secret is build/runtime-scoped, or if a
  non-`VITE_` key is marked browser-safe.
- The service-role key is **Functions-scoped, secret, and never `VITE_`** — so it
  cannot enter the client bundle. The bundle scanner
  (`scripts/scan-bundle-secrets.mjs`) + the S7.0 gate
  `grep -riE "service_role|SUPABASE_SERVICE_ROLE" dist/assets/*.js` both confirm
  absence (0 findings in this task).
- **No replace-all.** The core reads existing env first, upserts only the known
  keys, then verifies our keys are present at their scopes AND that no unrelated
  key was dropped. A dropped unrelated var is treated as a failure.
- **Site identity.** The linked site must be the existing Teragon site (id match
  or teragon-named); an unrelated site is rejected and nothing is set.

## Preview persistence provider

The preview sets `VITE_PERSISTENCE_PROVIDER=SUPABASE` so the Deploy Preview
genuinely talks to the staging Supabase project (the acceptance harness fails if
it silently falls back to IndexedDB). This does **not** change the source default
(`DEFAULT_PERSISTENCE_PROVIDER = LOCAL_INDEXEDDB` in `src/persistence/provider.ts`)
— the local runtime default is untouched.

## S7.0 status

Not executed. In S7.0 the core runs in plan mode only (a fake Netlify adapter is
used in tests). No real site was contacted or mutated.
