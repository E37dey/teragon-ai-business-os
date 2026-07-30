# TERAGON Business Graph — Headless Operator Authentication (Phase 11)

A real, headless, internal-operator **authentication** foundation that produces the exact
`TrustedAuthenticatedSession` the Phase-10 runtime resolver expects — **without a login UI, OFF by
default, and decoupled from graph access**. Source: `src/graph/auth/**`. It is the honest replacement for
`UnavailableTrustedSessionSource`: a credential-gated, active-user-checked session, never a fabricated
persona.

## Why this exists

Phase 10 proved the app has no real authentication, so runtime graph access sits on `IDENTITY_UNAVAILABLE`.
Phase 11 supplies the one missing dependency — a trustworthy authenticated session — as a minimal internal
operator credential. It does **not** enable graph access (see the decoupling proof below); it only makes a
genuine session *obtainable* for controlled internal rollout.

## Components

| File | Responsibility |
|------|----------------|
| `flag.ts` | `BUSINESS_GRAPH_OPERATOR_AUTH_ENABLED = false as const` + `resolveOperatorAuthEnabled(override?)` |
| `config.ts` | parse `OperatorAuthConfig` from an **injected** env record; degrade to `null` (unavailable) when absent/invalid; holds only a verifier, never the raw secret |
| `credential.ts` | `verifyOperatorSecret` — salted SHA-256 + **constant-time** compare |
| `random.ts` | injected RNG seam (default Web Crypto `getRandomValues`; never `Math.random`) |
| `sessionStore.ts` | issue / verify / revoke / expiry / bound; tokens hashed at rest |
| `authenticator.ts` | the only surface that mints a trusted session |
| `trustedSessionSource.ts` | `OperatorTrustedSessionSource implements TrustedSessionSource` |
| `users.ts` | `ActiveUserLookup` adapter over the canonical users repo |
| `composition.ts` | `createOperatorRuntimeComposition` — binds into the Phase-10 runtime |

## Flag behavior (OFF default)

`resolveOperatorAuthEnabled` mirrors the `= false as const` pattern; the only input is an explicit override
(no env/query/agent path). OFF ⇒ `authenticate` returns `{ denied: "AUTH_DISABLED" }` and issues nothing;
`OperatorTrustedSessionSource.lookup` returns `null` **even for a stored session**, so it is
indistinguishable from `UnavailableTrustedSessionSource` and the runtime stays `IDENTITY_UNAVAILABLE`.

## Config / verifier model

Parsed from an injected `Record<string, string | undefined>` (never `process.env`/`import.meta.env`),
following `src/server/config.ts`: never throws, degrades to `null` on absent/invalid/incomplete config. The
config carries `operatorUserId`, `organizationId`, `roleId`, a verifier `{ salt, hashHex }` =
`sha256Hex(salt + secret)`, `sessionTtlMs`, `maxActiveSessions`. The **raw operator secret is never stored
or configured** — only its salted digest. A missing field or a non-`/^[0-9a-f]{64}$/` hash nulls the whole
config, so the authenticator refuses rather than invent an operator.

## Authentication flow

`authenticate(presentedSecret)`: flag ON → config available → constant-time credential verify → operator
user confirmed **active** via `ActiveUserLookup` (`status === "פעיל"`; unknown/inactive/archived denied) →
issue a session → `{ sessionRef }`. Any failure → `{ denied: reason }` with a uniform shape. The resulting
`OperatorTrustedSessionSource.lookup(sessionRef)` (synchronous) returns
`TrustedAuthenticatedSession { authenticatedUserId, organizationId, roleId, actorKind: "HUMAN", sessionRef,
issuedAtIso }` for a live session, else `null`.

## Authentication ≠ graph access (the decoupling)

`createOperatorRuntimeComposition` binds the operator session source + real `ActiveUserLookup` into the
Phase-10 `RuntimeBusinessGraphComposition` but **omits** the facade/rollout overrides, so those guards keep
their OFF / NOT-approved defaults. Proven by tests: with operator-auth ON, `authenticate` succeeds and the
Phase-10 resolver **accepts** the session (resolves a HUMAN identity) — yet the access policy still returns
**`FEATURE_DISABLED`** (facade OFF), or **`ROLLOUT_NOT_APPROVED`** when the facade is forced on but rollout
is not. Only with facade **and** rollout deliberately enabled does the same session reach `ENABLED`.
Authentication makes a trustworthy identity available; enabling graph access remains a separate, deliberate
decision.

See [SESSION_SECURITY](BUSINESS_GRAPH_SESSION_SECURITY.md) ·
[RUNTIME_IDENTITY_DISCOVERY](BUSINESS_GRAPH_RUNTIME_IDENTITY_DISCOVERY.md) ·
[RUNTIME_ACCESS_POLICY](BUSINESS_GRAPH_RUNTIME_ACCESS_POLICY.md) ·
[PHASE11_TEST_REPORT](BUSINESS_GRAPH_PHASE11_TEST_REPORT.md).
