# TERAGON Business Graph — Operator Session Security (Phase 11)

The session-security model behind the headless operator authentication. Source:
`src/graph/auth/{credential,random,sessionStore}.ts`.

## Credential verification

- The raw operator secret is **never** stored, configured, logged, audited, or echoed. The config holds
  only a verifier `{ salt, hashHex }` where `hashHex = sha256Hex(salt + secret)` (the synchronous
  governance SHA-256).
- `verifyOperatorSecret(presented, verifier)` recomputes `sha256Hex(salt + presented)` and compares with
  **`constantTimeEqual`** — it folds any length difference in first, loops over the max length, accumulates
  a difference bitmask, and **never early-exits** on a mismatched character. A wrong secret denies with the
  same result shape and timing profile as any other denial.
- A high-entropy operator secret is assumed (this is a config verifier for an internal operator, not a
  user-password KDF); the salted digest defends the config at rest, and the constant-time compare defends
  the verification path.

## Session tokens

- `issue(identity)` mints an **opaque ≥256-bit** token from the **injected RNG** (default Web Crypto
  `getRandomValues`; never `Math.random`). The token is **not derived from the identity** and is not
  guessable.
- Tokens are stored **keyed by `sha256Hex(token)`** — the raw token is **never at rest**. Lookup hashes the
  presented ref and does a constant-time comparison against stored digests.
- `issuedAtIso` and expiry are computed from an **injected clock** (no hidden `Date.now`), so TTL is
  deterministic and testable.
- `safeSessionHandle` exposes at most a 12-char hash prefix for correlation — never the token.

## Lifecycle controls

- **Expiry** — `verify(sessionRef)` returns `null` once the injected clock passes the TTL.
- **Revocation** — `revoke(sessionRef)` drops a session; subsequent lookups return `null`.
- **Bounded sessions** — `maxActiveSessions` is enforced by evicting the oldest live session, so the store
  cannot grow unbounded.
- Repeated `issue` calls yield **distinct** tokens (injected RNG), never a reused or predictable value.

## Non-leakage & isolation

- No secret or token literal appears anywhere in source or tests (every secret/salt is generated at runtime
  via Web Crypto) — the bundle secret scanner stays CLEAN.
- The raw secret and raw token never appear in the session store at rest (only hashes) and never in any
  audit/log surface.
- The auth layer never touches the graph store — a denied path never invokes the store-provider factory,
  and the active snapshot is unaffected by authentication.
- No import-time work (construction mints no token and opens no store — proven with a throwing store factory
  and a counting RNG that stays at 0), no module-level singleton, no `window`/global exposure, injected
  clock + RNG throughout.

See [OPERATOR_AUTH](BUSINESS_GRAPH_OPERATOR_AUTH.md) · [PHASE11_TEST_REPORT](BUSINESS_GRAPH_PHASE11_TEST_REPORT.md).
