# ADR 0002 — Fail closed, with no silent local fallback

**Status:** Accepted · **Context:** S9.1–S9.3 (domain composition, customers + contacts)

## Context

The app has two persistence providers: `LOCAL_INDEXEDDB` and `SUPABASE`. When an
authenticated remote read or write fails, the tempting behaviour is to fall back to local
data so the screen still shows something.

That behaviour is worse than an error. Falling back means showing **another tenant's or a
stale user's data** after an authorization failure, and reporting success for a write that
never reached the server. A silent fallback converts a security event into a UI that looks fine.

## Decision

**In SUPABASE mode there is no local fallback, ever.** The composition boundary
(`domainComposition.ts`, `loadSupabaseDomainRepository.ts`) fails closed with typed errors —
`AUTH_REQUIRED`, `IDENTITY_INVALID`, `DOMAIN_NOT_CONNECTED`, `REMOTE_REPOSITORY_LOAD_FAILED`,
`PROVIDER_BYPASS_FORBIDDEN` — and never calls `getRepository`.

Supporting rules:
- A domain not on the connected list renders a "not connected" notice; its IndexedDB page
  never mounts.
- A failed read shows a safe Hebrew message and **no rows**.
- A write resolving after logout or an identity change does **not** repopulate protected cache.
- An **empty** successful result is a success, not a failure — "no rows visible" is a working
  read path, and treating it as an error would make an empty tenant look broken.

## Consequences

**Positive** — an error is visible and typed, so it can be observed (S10.0-C emits denial and
failure events) rather than hidden behind stale data. No cross-tenant bleed via cache.

**Negative** — users see honest failure states instead of stale content, and every connected
domain must supply loading/empty/error UI. Accepted.

**Rejected** — read-through fallback to IndexedDB, and optimistic success on unconfirmed writes.
