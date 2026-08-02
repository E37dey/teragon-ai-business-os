# TERAGON — Supabase Repository Adapter Report (Gate S4)

A **provider-neutral persistence boundary** with two backends. `LOCAL_INDEXEDDB` remains the **default**;
the Supabase provider is **flag-gated and lazy-loaded** so it never enters the default bundle and the
existing app behaviour is unchanged. Source: `src/persistence/**`; tests `tests/persistence/**`.

## Provider selection (default LOCAL)

`src/persistence/provider.ts`: `PersistenceProvider = "LOCAL_INDEXEDDB" | "SUPABASE"`;
`DEFAULT_PERSISTENCE_PROVIDER = "LOCAL_INDEXEDDB"`; `resolvePersistenceProvider` returns `SUPABASE` **only**
on an exact `"SUPABASE"` opt-in (anything else → LOCAL). Documented: SUPABASE becomes default only after
staging acceptance (a later, separate approval). The existing `src/repositories/**` (IndexedDB/InMemory)
were **not modified** and remain the runtime default; **no imports were mechanically replaced**; the app
graph does not import the persistence layer at all (it is additive and unwired).

## Lazy-loading keeps Supabase out of the default bundle

`getPersistenceRepository` reaches the Supabase tree only via `await import("./supabase/index")` when the
flag is `SUPABASE`; `src/persistence/index.ts` re-exports nothing from `./supabase/**`. **Verified:**
`grep -ri supabase dist/assets/*.js` → **0 matches** (no `@supabase/supabase-js`, `createClient`, or
`SupabaseClient`); secret scan CLEAN; the anon-key envs are unset so absent.

## Domain adapters (8 groups)

identity (Organization; User/Role deferred — auth-owned uuid PK) · CRM (Customer/Contact/Lead/Opportunity/
Quotation) · products+printers · service (ServiceTicket + atomic `close_ticket_with_repair` RPC) · training
(Course/Student/Enrollment) · tasks+approvals · knowledge+memory (KnowledgeNote/Document/MemoryRecord) ·
governance+audit (Agent/AgentTask/…/AuditEvent/Automation/Metric*/Persona/…/AppNotification). Each is a
declarative `DomainMapping` (snake_case columns, text ids, tenant `organization_id` auto-injected;
`customers.organizationId → owning_org_id`; global tables carry no tenant column).

## Safety guarantees

- **Zod** parse on every read (bad row → `validation` SafeError, never trusted) and every write.
- **Safe errors** — PostgREST errors mapped to coarse `SafeError` codes, raw payloads dropped; the throwing
  surface raises only a typed `RepositoryRemoteError`.
- **Loading states** — async result contracts the UI can render.
- **Pagination** — range-based `listPage` with `hasMore`.
- **Duplicate-submit prevention** — idempotent `upsertSafe` keyed by deterministic id + an in-flight guard
  collapsing concurrent identical submits.
- **Deterministic IDs** — reuse the app's `nextId`/`allocateId`; never random when the domain has stable ids.
- **Atomic multi-row writes** — through a single Postgres RPC (`callRpc`/`closeTicketWithRepair`).
- **No silent local fallback** — a failed remote write returns/throws; it is never retried against local.
- **No automatic upload** — `src/persistence/migration/localExport.ts` export is read-only; import requires a
  snapshot-bound approval token + a named human and aborts on first failed write.
- **No service-role key** anywhere in browser code — anon key only.

## Tests (deterministic mocks — live integration is Gate S5)

`tests/persistence/**`, **33 tests** with an in-memory mock Supabase client: LOCAL-default (+ LOCAL never
imports the Supabase module — spy asserts it), row↔entity mapping + zod rejection, pagination, duplicate-
submit idempotency, deterministic ids, safe error mapping (no raw throw), no silent local fallback, atomic
RPC, and approval-gated export/import. **Full Vitest 2215 passed** (2182 + 33); oxlint 0, tsc 0,
typecheck:tests 0, build pass, secret CLEAN.

**Live integration against the real schema/RLS (running the adapters against local Postgres) is Gate S5** —
see the local-validation report. **S5.1:** relocated to CI
(`.github/workflows/supabase-live-validation.yml`); **S5 migrations/RLS PASS** (run `30609542600`).

## S5.2 — Live adapter validation — PASS (run `30615740566` @ `412541c`)

The real adapter was exercised against a live ephemeral Supabase stack (Postgres + GoTrue + PostgREST) over
the anon key + real authenticated JWT sessions (service_role only for user-mint/bootstrap/teardown):
**`files=10 executed=25 passed=25 failed=0 skipped=0`**, via the dedicated separate-discovery command
`npm run test:supabase:live`. Two real defects were found and root-caused (a test-setup fixture and a
schema/adapter **microsecond-timestamp** boundary bug — see `SUPABASE_CI_VALIDATION_REPORT.md` §S5.2).

**Boundary hardening added here:** `rowToEntityCandidate` normalizes DB-native `timestamptz`
(microsecond, `+00:00`) `created_at`/`updated_at` into the domain's canonical `toISOString()` form, so any
DB-generated timestamp (e.g. an `updated_at` trigger) satisfies the strict domain `isoDate` contract without
weakening it. Regression: `tests/persistence/adapter.test.ts` (default suite, no live DB required).
**Full Vitest now 2216 passed, 0 skipped**; oxlint 0, tsc 0, typecheck:tests 0.
