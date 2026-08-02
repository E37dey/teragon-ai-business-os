# Supabase Domain Integration Map (S9.0)

Read-only inventory of how the UI persists domain data today, and the target
wiring to the authenticated Supabase boundary. **Nothing is "CONNECTED" yet** —
the Supabase repository facade + table mappings exist, but no `src/modules/**`
component uses them. Every module reads/writes local IndexedDB via
`@/repositories` (`getRepository` → `IndexedDBRepository`).

## Architecture facts (evidence)
- **Local path (in use by all UI):** `src/repositories/factory.ts` → `getRepository(collection)` returns `IndexedDBRepository` (browser) / `InMemoryRepository` (tests). Boot seed: `src/main.tsx` → `seedIfEmpty()` (`factory.ts`) writes demo rows into IndexedDB `teragon-os`, and `runMigrationsAtBoot()` runs IndexedDB migrations — **both run regardless of `VITE_PERSISTENCE_PROVIDER`**.
- **Supabase path (exists, UNUSED by UI):** `src/persistence/boundary.ts` → `getPersistenceRepository(collection, override)` → in SUPABASE mode dynamically imports `src/persistence/supabase/index.ts` → `createSupabaseRepository()` (uses `getSupabaseClient()` publishable-key client + RLS). Table mappings: `src/persistence/supabase/domains/*` (8 domain files, `MAPPING_REGISTRY`). Imported by **nothing** in `src/modules/**`.
- **Auth (S8, live-proven):** `src/auth/*` — `useAuth()`, `SupabaseAuthProvider`, `resolveIdentity()` (canonical org/role from `current_profile()` + RLS). The shell (`OsShell`/`AppShell`/`CompactTopHeader`) shows a **local/demo** user, not the auth-context identity, and has **no logout control**.
- **Atomic RPCs:** `close_service_ticket(...)` SECURITY DEFINER (ticket+repair+audit in one transaction) exists (migration 013) — a **template**. **No approval→task atomic RPC exists.**
- **RLS/tables:** 14 migrations; every domain table has RLS scoped to `auth_org_id()` + `is_active()` (validated S7.1.2). `audit_events` immutable to normal callers.

## Boot-seed / init paths to gate OFF in SUPABASE mode (S9.1)
| Path | File | Action in SUPABASE mode |
| --- | --- | --- |
| `seedIfEmpty()` | `src/repositories/factory.ts` (called in `src/main.tsx`) | must NOT run (no demo rows in IndexedDB) |
| `runMigrationsAtBoot()` | `src/migrations` (called in `src/main.tsx`) | must NOT run (IndexedDB schema) |
| `getRepository()` singletons | `src/repositories/factory.ts` | domain repos must NOT be the IndexedDB factory; composition must route to Supabase |
| `syncNotifications()` | `src/app/notifications/syncNotifications` | must not seed/derive from IndexedDB in SUPABASE mode |

## Per-domain map (all 19)
Legend — Status: `NOT_CONNECTED` (UI uses IndexedDB; Supabase mapping may exist but unused). Interface target: provider-neutral `PersistenceRepository<T>` via `getPersistenceRepository(collection)`.

| # | Domain | Routes / screens | Current UI capabilities | Current repo impl | IndexedDB store(s) | Target Supabase table | Supabase mapping exists? | Required authenticated ops | Pagination / idempotency / txn-RPC / audit | Missing UI capabilities | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | customers | `/customers`, `/customers/:id` | list, detail, edit (save) | getRepository | `customers` | `customers` | yes | read/list/create/update (org-scoped) | pagination: yes · idempotency: create · txn: no · audit: on write | create form (quick-create exists) persisting to staging | NOT_CONNECTED |
| 2 | contacts | `/crm`, customer detail | list; create via quick-create | getRepository | `contacts` | `contacts` | yes | create linked to customer, read/update | pagination: yes · idempotency: create · audit: on write | linked-contact create persisting to staging | NOT_CONNECTED |
| 3 | leads | `/crm` | list; convert | getRepository | `leads` | `leads` | yes | read/list/create/update | pagination: yes · idempotency: create | persist to staging | NOT_CONNECTED |
| 4 | opportunities | `/crm` | list; stage change | getRepository | `opportunities` | `opportunities` | yes | read/list/create/update | pagination: yes · idempotency: stage update | persist to staging | NOT_CONNECTED |
| 5 | quotations | `/sales` | list; create | getRepository | `quotations` | `quotations` | yes | read/list/create/update | idempotency: create · audit | persist to staging | NOT_CONNECTED |
| 6 | products | `/sales` | list | getRepository | `products` | `products` | yes | read/list/create/update | pagination | persist to staging | NOT_CONNECTED |
| 7 | printer_models | `/printers` | list | getRepository | `printerModels` | `printer_models` | yes | read/list | pagination | persist to staging | NOT_CONNECTED |
| 8 | customer_printers | `/printers` | list per customer | getRepository | `customerPrinters` | `customer_printers` | mapping present in productsPrinters domain (verify) | read/list/create | idempotency: assign | persist to staging | NOT_CONNECTED |
| 9 | service_tickets | `/service` | list; open/close | getRepository | `serviceTickets` | `service_tickets` | yes | read/list/create/update; **close = atomic RPC** | txn: `close_service_ticket` RPC (exists) · audit | close-ticket UI → RPC on staging | NOT_CONNECTED |
| 10 | repairs | `/service` | via ticket close | getRepository | `repairActions` | `repair_actions` | via service RPC | insert within close RPC | txn (part of close RPC) · audit | persist via RPC | NOT_CONNECTED |
| 11 | courses | `/courses` | list; detail; workflow | getRepository | `courses` | `courses` | yes | read/list/create/update | pagination | persist to staging | NOT_CONNECTED |
| 12 | enrollments | `/courses` | enroll | getRepository | `enrollments` | `enrollments` | yes | create (student↔course), read | idempotency: enroll · audit | enroll UI persisting to staging | NOT_CONNECTED |
| 13 | stage_progress | `/stage-gates` | view stages/gates | getRepository | `implementationStages`, `stageGates` | `implementation_stages`, `stage_gates` | yes (governanceAudit domain) | read/list/update stage | idempotency: gate advance · audit | gate-advance persisting to staging | NOT_CONNECTED |
| 14 | tasks | `/tasks` | list; status change | getRepository | `tasks` | `tasks` | yes | read/list/create/update; **created by approval RPC** | idempotency: one-task-per-approval · txn · audit | task-from-approval on staging | NOT_CONNECTED |
| 15 | recommendations | `/agents` | list AI recs | getRepository | `aiRecommendations` | `ai_recommendations` | yes (governanceAudit) | read/list/create | idempotency: create · audit | recommendation→approval UI on staging | NOT_CONNECTED |
| 16 | approvals | `/governance` | list; approve/reject | getRepository | `approvals` | `approvals` | yes (tasksApprovals) | read/list/create; approve/reject → **atomic task RPC** | txn: **NEW approval→task RPC required (does not exist)** · named-human identity · audit | approve flow → atomic task creation on staging | NOT_CONNECTED |
| 17 | knowledge | `/knowledge` | list notes/articles | getRepository | `knowledgeNotes`, `documents`, `knowledge*` | `knowledge_notes`, `documents` | partial (notes, documents) | read/list/create/update | pagination · audit | persist to staging | NOT_CONNECTED |
| 18 | memory | `/memory` | list records | getRepository | `memoryRecords`, `memory*` | `memory_records` | partial (records) | read/list/create | pagination · audit | persist to staging | NOT_CONNECTED |
| 19 | governance / audit | `/governance` | list audit; approvals | getRepository | `auditEvents`, `approvals`, `evidence` | `audit_events`, `approvals`, `evidence` | yes | read audit (immutable), create evidence | audit immutability (RLS: no update/delete) | read audit from staging | NOT_CONNECTED |

## S9.2 slice targets (first vertical slice)
- **A — CRM customer+contact** (domains 1,2): create/read/update customer + linked contact via the real UI, org server-controlled, cross-org denied, deterministic pagination, duplicate-submit idempotency.
- **B — recommendation→approval→task** (domains 15,16,14): create recommendation → named-human approval → on approve, an **atomic** RPC creates exactly one task (retry-safe, rollback on partial failure) with audit + approval identity.

### Blocking constraint for S9.2.B (must be resolved by the coordinator)
The atomic approval→task transaction requires a **new SECURITY DEFINER RPC** (e.g. `approve_and_create_task(...)`) modeled on `close_service_ticket`. That is a **schema/migration change deployed to live teragon-staging**, which conflicts with the S9 constraint "**preserve the 14 migrations/schema/RLS**". Connecting the approval workflow atomically therefore needs an **explicit authorized migration window** (add migration 015 + apply to staging) — it cannot be done under a "schema frozen at 14" rule without silently mutating the live backend. (A non-atomic two-write fallback is rejected by S9.2.B's atomicity + rollback requirement, so it is not a substitute.)

## Migration status summary
- **NOT_CONNECTED: 19 / 19.** No UI module uses the authenticated Supabase boundary.
- Supabase table mappings exist for ~all domains; the CRM + tasks/approvals + governance mappings are present. The gap is **composition + module wiring**, plus the **missing approval→task RPC** for S9.2.B.
