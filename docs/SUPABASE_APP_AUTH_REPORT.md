# Supabase Application Authentication — Implementation Report (S8)

Application-layer authentication for TERAGON AI BUSINESS OS. Backend staging
(project, migrations, RLS, admin bootstrap, seed, Netlify preview env) is owned
by PR #1 (`feature/teragon-supabase-platform`) and is **not** modified here.

- **Branch:** `feature/teragon-supabase-app-auth` (cut from S7.3A checkpoint `d73f55c`)
- **Draft PR:** #2 — base `feature/teragon-supabase-platform`, head `feature/teragon-supabase-app-auth`
- **Validated commit:** `63ee27c`
- **Status:** application Auth development only. No deployment, no merge, no RC, no production.

## Architecture

### Provider-neutral Auth boundary (`src/auth/`)
- `AuthBoundary` — one interface the app talks to: initialize/restore, signIn,
  signOut, refresh, currentUser, subscribe, plus loading/error/identity state and
  a differentiated internal error taxonomy.
- `composition.ts` — explicit selector from the resolved persistence provider:
  `VITE_PERSISTENCE_PROVIDER=SUPABASE` → `SupabaseAuthProvider`; anything else →
  `LocalAuthProvider`. **No silent fallback** — a Supabase build is never quietly
  downgraded to a local identity.
- `SupabaseAuthProvider` — real Supabase Auth over the single browser-safe client
  (`getSupabaseClient`, public anon/publishable key + persisted, auto-refreshed
  JWT session). Never handles a service_role / secret / db-password / admin key.
- `LocalAuthProvider` — preserves the default LOCAL_INDEXEDDB experience: always
  authenticated as a local operator, no login gate, no network.

### Canonical identity (`src/auth/identity.ts`) — fail closed
Resolved from server-controlled records only, never from browser input:
1. `current_profile()` SECURITY DEFINER RPC → the caller's own profile (returned
   even when inactive, so "inactive" is distinguishable from "missing"); a
   null/absent id (null composite, e.g. after logout) ⇒ `MISSING_PROFILE`.
2. `memberships` (RLS) → exactly one active membership, consistent org + role.
3. `roles` / `organizations` (RLS) → role label + capabilities + org name.

All records are zod-validated. Fails closed on: missing profile, inactive
account, missing / duplicate / inconsistent membership, unresolvable role/org, or
malformed data. The browser never supplies org/role/active/membership/capabilities.

### Login, session, route protection (`src/auth/`)
- `LoginPage` + `login.css` — Hebrew RTL, Enterprise Light + Quiet Dark via design
  tokens (no neon/glow, system Hebrew font stack, visible focus rings, natural tab
  order, responsive). States: init / signed-out / signing-in / error.
- `RequireAuth` — pass-through in LOCAL; in SUPABASE it shows a neutral loader
  while restoring (no protected-content flash), redirects unauthenticated users to
  `/login` preserving the intended route, and never loops (login route is public).
- `AuthProvider` / `useAuth` — central context exposing only safe user info
  (name/email, org, role label, logout); never a JWT, refresh token, raw session,
  or claims.

## Security guarantees
- Browser key is publishable/anon only; a bundle/source scan
  (`tests/auth/no-privileged-material.test.ts`) fails if any auth/supabase source
  reads a service_role/secret/password/token or embeds a literal secret/JWT.
- A failed Supabase Auth or authenticated write never falls back to a local
  identity or IndexedDB. A valid session whose identity cannot be resolved is
  signed out (no half-auth).
- LOCAL_INDEXEDDB remains the default outside Preview; the Phase-11 prototype
  stays disabled.

## Test surface
- Deterministic unit/component matrix under `tests/auth/` (45 tests): identity
  fail-closed matrix, provider lifecycle, composition, safe error mapping, route
  guard, login states.
- Dedicated live staging Auth suite (`npm run test:auth:live`) — see
  `docs/SUPABASE_LIVE_AUTH_VALIDATION.md`.

## Gate results (validated commit `63ee27c`)
| Gate | Result |
| --- | --- |
| oxlint (src tests e2e scripts) | pass (0 errors) |
| typecheck / typecheck:tests | pass |
| default vitest | 2469 passed / 0 failed / 0 skipped |
| build | pass |
| secret scanner | CLEAN |
| privileged-material bundle scan | pass |
| accessibility (axe, all routes + overlays) | 44 passed, 0 serious/critical |
| live staging Auth suite | 8 passed / 0 failed / 0 skipped |
