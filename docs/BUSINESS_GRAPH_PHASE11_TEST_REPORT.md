# TERAGON Business Graph — Phase 11 Test Report (Operator Authentication)

**Scope:** `src/graph/auth/**`, `tests/graph/auth/**`, one barrel export block in `src/graph/index.ts`.
Phase-10 runtime contracts + the governance `sha256Hex` imported read-only; nothing else modified. No
UI/route/nav, no `window` global, no import-time work. Operator-auth, facade, indexing, and rollout guards
all default OFF.

## Gate (full, green)

| Check | Result |
|-------|--------|
| `oxlint src tests` | 0 errors / 0 warnings |
| `tsc` strict (`typecheck`) | 0 errors |
| `typecheck:tests` | 0 errors |
| `vitest run tests/graph` | 460 passed |
| **`vitest run` (full suite)** | **2176 passed** (was 2127; **+49**) |
| `vite build` | pass |
| `scan-bundle-secrets` | **CLEAN — 0 findings** |
| Playwright `e2e/shell.spec.ts` | 14 / 14 |

## Files

- `src/graph/auth/{flag,config,credential,random,sessionStore,authenticator,trustedSessionSource,users,composition,index}.ts`
- `src/graph/index.ts` — barrel re-export only (the sole existing file edited)
- `tests/graph/auth/{flag,config,credential,sessionStore,authenticator,trustedSessionSource,composition,invariants}.test.ts` + `helpers.ts` (**49 tests**)

## What the 49 tests prove

- flag OFF → `authenticate` denied **and** session-source lookup `null` **and** the bound runtime stays
  `IDENTITY_UNAVAILABLE`;
- a valid credential (flag ON) issues a session whose lookup returns the trusted session **and** the
  Phase-10 resolver accepts it — yet the access policy still returns **`FEATURE_DISABLED`** /
  **`ROLLOUT_NOT_APPROVED`** (authentication ≠ graph access); the positive control (facade + rollout forced
  on) reaches `ENABLED`;
- wrong secret denied (constant-time; no session issued);
- unknown / inactive / archived operator user denied;
- expired session → lookup `null`; revoked session → lookup `null`;
- `maxActiveSessions` enforced (oldest live session evicted);
- the raw secret and raw token never appear in the session store at rest (only hashes) or any audit/log;
- the opaque token is not equal to / derivable from the identity; repeated issues yield distinct tokens;
- absent / invalid / incomplete config → unavailable (never invents an operator);
- the injected clock drives expiry deterministically;
- no import-time work (throwing store factory + counting RNG at 0); no `window` global; no module singleton;
- existing application behavior unchanged; the graph active snapshot is untouched by authentication.

Deterministic injected clock, RNG, config, and users; all secrets/salts generated at runtime via Web
Crypto (no literals). See [OPERATOR_AUTH](BUSINESS_GRAPH_OPERATOR_AUTH.md) and
[SESSION_SECURITY](BUSINESS_GRAPH_SESSION_SECURITY.md).
