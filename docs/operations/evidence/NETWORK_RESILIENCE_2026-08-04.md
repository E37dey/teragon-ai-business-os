# Network resilience — Demo Pilot — 2026-08-04

**Verdict: NETWORK RESILIENCE PASS.** Safe behaviour on connectivity loss during
domain reads/writes is proven, and a required CI gate enforces the offline UI
contract on every PR to `feature/teragon-supabase-app-auth`.

Synthetic/local data only. No staging, no Production, no service-role, no real
data, no customer/contact live acceptance.

## Split by layer (honest scope)

The LOCAL demo app uses IndexedDB and makes **no domain network calls**, so the
read/write *failure semantics* are proven at the **integration** layer with
injected failing seams (deterministic), while the **UI-under-offline** contract
is proven with Playwright `context.setOffline`.

### Integration — `tests/app/network-resilience.test.tsx` (8 tests, all green)

**Read interruption**
- A rejected read ends loading (`isLoading:false`), fails closed with a typed
  `DomainReadError` (safe Hebrew), the LOCAL factory is **never** called (no
  silent IndexedDB fallback), no stale/phantom rows, and **one** sanitized event.
- **Retry after reconnection** via `refetch()` succeeds; success reports nothing
  new; the failed attempt carried a real correlationId.

**Write interruption**
- A network failure **resets `isSubmitting`**, returns not-ok (**no false success
  toast**), and caches **no phantom row**; one `domain_write_failed` event.
- **Retry after failure succeeds exactly once** (`upsertSafe` called twice: one
  fail + one successful retry — no auto-retry, no infinite loop).
- **Duplicate concurrent submit** (same submission id) collapses to **one** write.
- A write resolving **after logout** does not repopulate protected cache.

**Observability**
- **Distinct correlationId per operation.**
- Events carry **only** the six whitelisted fields; a rich error string
  (`row id=cu-9 user=a@b.co Bearer eyJtok secret`) leaks **nothing** — no id,
  email, token, payload or message.

### UI offline — `e2e/pilot/network.pilot.ts` (chromium × {1440, 390}, 3 × 2 green)

- The loaded shell **survives going offline**: header + `main` + banner intact,
  `dir="rtl"` preserved, **no unexpected console/page error**.
- The **quick-add primary action stays keyboard reachable** offline (focus →
  Enter opens the dialog); after an empty offline submit, an assertive
  validation message appears and **focus is not lost** (the field re-focuses).
- **Mobile 390px stays usable** offline: zero horizontal overflow, and navigation
  stays reachable via the hamburger drawer.

## CI integration

New `network-resilience-gate` job in `supabase-live-validation.yml`: **no `needs`,
no `if`** — required for every PR (same pattern as static/accessibility gates).
Node 22, chromium only, builds the LOCAL synthetic app, runs `e2e/network.config.ts`.
The integration tests run inside the existing static gate's `npx vitest run`.

## Defects found / fixed

**None** — the existing fail-closed reads (ADR 0002), idempotent writes and
S10.0-C observability already behaved correctly; this checkpoint adds enforcement,
not fixes. No production-only retry behaviour was added for tests.

## Honest limitation

Navigating to an **unvisited lazy-loaded route while offline** cannot fetch its
JS chunk — a standard SPA constraint, not a crash. The offline suite therefore
exercises the already-loaded shell and in-page interactions rather than forcing
such a navigation. A future service-worker/offline-cache is out of scope here.
