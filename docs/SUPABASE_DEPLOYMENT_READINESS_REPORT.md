# TERAGON AI BUSINESS OS — Supabase Deployment Readiness Report (Gate 1, discovery only)

Read-only discovery. **No Supabase or Netlify resource was created, no migration applied, no env configured.**
Designed from the **actual Teragon repositories** — not the Learn-Aid sample schema/AuthContext.

## 1. Current persistence architecture

- **Provider:** browser-local only. `src/repositories/factory.ts` chooses `IndexedDBRepository` in the
  browser and falls back to a pre-seeded `InMemoryRepository`. No server database. No network persistence.
- **Repositories:** per-collection lazy singletons over `Repository<BaseEntity>` (`Repository.ts`), with an
  in-process `subscribe`/`ChangeEvent` bus. Collections defined in `collections.ts` (+ `agentStores`,
  `analyticsStores`, `governanceStores`, `implementationStores`).
- **Canonical entities:** **46** interfaces `extends BaseEntity` in `src/domain/types.ts` (zod in
  `schemas.ts`): Organization, User, Role, Customer, Contact, Lead, Opportunity, Quotation, Product,
  PrinterModel, CustomerPrinter, Course, LearningPath, Student, Enrollment, CourseSession, Assignment,
  ServiceTicket, RepairAction, Task, Meeting, Activity, Document, KnowledgeNote, MemoryRecord, Automation,
  AutomationRun, Agent, AgentTask, AgentMessage, AgentHandoff, AgentConflict, AIRecommendation, Evidence,
  Approval, AuditEvent, MetricDefinition, MetricObservation, Risk, Control, Persona, TrainingMaterial,
  ImplementationStage, StageGate, SupportRequest, AppNotification. (`StageProgress` is embedded in
  `Enrollment`, not a table.)
- **Organization scoping — CRITICAL GAP:** `organizationId` appears on essentially **one** entity
  (`Customer.organizationId: string | null`). The data model is **effectively single-tenant**; there is no
  per-user org membership and no tenant column on the other ~45 entities.
- **Migrations already present:** **none** (no `supabase/` dir, no `supabase` dependency, no SQL migrations).

## 2. Required Supabase model (to be designed, not yet built)

- **Tenancy:** an `organizations` table + a **non-null `organization_id`** foreign key added to **every**
  tenant table (customers, leads, opportunities, quotations, products, printer_models, customer_printers,
  courses, enrollments, tasks, service_tickets, approvals, audit_events, …). This is new schema — the
  current model does not carry it.
- **Identity:** `profiles` (1:1 with `auth.users`) carrying `organization_id`, canonical `role_id`, and
  active status; `roles` (+ optional `memberships`) mirroring the canonical `crole-*` set. Never store a
  password; identity comes from Supabase Auth.
- **Core tables:** customers, contacts, leads, opportunities, quotations, products, printer_models,
  customer_printers, service_tickets, repair_actions, courses, learning_paths, students, enrollments (+
  embedded stage progress as JSONB or a child `enrollment_stages` table), course_sessions, assignments,
  tasks, approvals, audit_events, plus supporting (meetings, activities, documents, knowledge_notes,
  memory_records, metrics, risks, controls, notifications).
- **Foreign keys:** customer→organization; contact/lead/opportunity/quotation→customer(+organization);
  customer_printer→customer & printer_model; service_ticket→customer(+ optionally customer_printer, per the
  Phase-9 `customerPrinterId` field); enrollment→student & course; task→(relatedRef target); approval→
  subject + decided_by(profile); audit_event→actor(profile). Every FK indexed.
- **Audit tables:** `audit_events` (append-only; insert-only RLS; no client update/delete).
- **Indexes:** every `organization_id`, every FK, and common filters (status, dates, owner).
- **Sensitive columns:** contact email/phone, quotation figures, service-ticket descriptions, memory-record
  bodies, audit payloads, approval notes → RLS-restricted; never exposed to anon; never returned to a
  cross-org viewer.

## 3. RLS design

- **Deny-by-default** on every table (RLS enabled, no permissive default).
- **Tenant isolation:** every policy predicated on `organization_id = (SELECT organization_id FROM profiles
  WHERE id = auth.uid())` — derived from the **authenticated session**, **never** a client-supplied
  `organizationId`.
- **Role-based policies:** read/write scoped by the profile's canonical role (mirroring the Phase-10
  authorization map); mutations gated per role.
- **Service-role-only operations:** admin bootstrap, cross-org maintenance, and audit writes that must
  bypass RLS run only via the **service-role key in a server context** (Netlify Functions / bootstrap
  script) — **never** in the browser.
- **Required tests (cross-org denial):** an authenticated user of org A cannot `select`/`insert`/`update`/
  `delete` org B rows; anon is denied on all tenant tables; a normal user cannot change their own
  `role_id`/`organization_id`; append-only audit rejects update/delete.

## 4. Authentication gap

- **Current:** no login. `src/authorization/roleStore.ts` is an **honest demo** — a localStorage role
  selector (`teragon.w9b.demoRole`, default `crole-sysadmin`) + a hardcoded `u-tzachi` persona. The
  authorization *simulation* (matrix/guards/permissions) is real; **authentication is not**.
- **Supabase Auth replaces:** the localStorage role + persona with a real authenticated `auth.uid()`; the
  demo role becomes a server-controlled `profiles.role_id`; org/role/active come from the profile, never
  the client.
- **Canonical user/profile mapping:** each `auth.users` row ↔ one `profiles` row (organization_id, role_id,
  active). The Phase-10 `RuntimeBusinessGraphIdentityResolver` already expects exactly this shape (a trusted
  session → HumanUserId + org + role + active) — Supabase Auth is the real `TrustedSessionSource`.
- **Admin bootstrap:** create the initial admin via the **server-side Supabase Admin API** (service-role),
  **not** by inserting into `auth.users`; the browser chooses no id/org/role/active. Idempotent + repeatable.
- **Migration risk for `u-tzachi`/demo roles:** the demo persona and localStorage role must **not** become
  trusted identities. Either map `u-tzachi` to a real seeded profile in **staging only**, or retire it;
  production must not carry demo identities.

## 5. Data migration

- **Existing data:** browser-local IndexedDB **synthetic seed** only (no real customer data). There is no
  authoritative server dataset to preserve.
- **Strategy:** treat Supabase as the new system of record; (re)generate canonical seed **server-side** for
  staging; production gets only required bootstrap records (no demo seed). A browser→Supabase import path is
  **not required** for real data (it's synthetic) but could be offered as an optional export for continuity.
- **Deterministic IDs:** the domain already uses stable ids; migrations should preserve them (duplicate-safe
  upserts).
- **Rollback/compatibility:** because the shipped release stays **local-first** (Supabase not wired), a
  rollback to `38cfbaa` needs **no DB migration** — the two persistence worlds are independent until the
  adapter is switched on behind a flag.

## 6. Automation prerequisites

- **Supabase CLI:** pin as a dev dependency; drive via `npx supabase` (init/link/db lint/db push/gen types).
  **Not installed today.**
- **Netlify CLI:** for `env:set`, `deploy --build` (Draft Preview), and provenance. Site is **linked**
  (`b8b2f3c5-851a-4631-bb7c-1a4b533a3a88`).
- **Required credential variables (names only) — all currently UNSET except `NETLIFY_AUTH_TOKEN`:**
  `SUPABASE_ACCESS_TOKEN`, `SUPABASE_ORG_ID`, `SUPABASE_DB_PASSWORD`, `TERAGON_ADMIN_EMAIL`,
  `TERAGON_ADMIN_PASSWORD` (optional: `SUPABASE_PROJECT_REF`, `SUPABASE_REGION` [default eu-central-1],
  `NETLIFY_SITE_ID`). `NETLIFY_AUTH_TOKEN`: **present**.
- **Identifiers:** Netlify site `b8b2f3c5…`; no Supabase project ref yet.
- **Staging vs production:** two separate Supabase projects (or branches); staging gets demo seed +
  Draft Preview; production is credential- + `DEPLOY_PRODUCTION=true`-gated, no demo seed.

## 7. Environment-variable inventory

- **Public browser (`VITE_`-prefixed, safe to bundle):** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (or
  the publishable-key equivalent). *(Today only `VITE_APP_VERSION`/`VITE_BUILD_COMMIT` exist — both public.)*
- **Server-only (Netlify Functions scope, no `VITE_`):** `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_PASSWORD`,
  and existing `AI_*`. Stored as Netlify secrets, Functions-scoped, **never in the bundle**.
- **Must NEVER receive a `VITE_` prefix:** `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_PASSWORD`,
  `SUPABASE_ACCESS_TOKEN`, `NETLIFY_AUTH_TOKEN`, `TERAGON_ADMIN_PASSWORD`, `AI_API_KEY`.

## 8. Proposed automated pipeline (design)

`plan (no remote changes)` → `local validation (oxlint, tsc, typecheck:tests, Vitest, build, secret scan,
bundle-key scan)` → `Supabase staging provisioning (CLI create/link when ref absent; verify identity when
present)` → `migration dry-run (db lint + db push --dry-run)` → `RLS tests (cross-org denial, anon denial,
no self role-escalation)` → `staging seed (demo, idempotent)` → `Netlify Draft Preview (env:set staging +
deploy --build, no prod)` → `remote acceptance (auth, RLS isolation, CRUD, routes, theme/RTL, console/network)`
→ `EXPLICIT production approval (DEPLOY_PRODUCTION=true)` → `production migration (backup/recovery point first;
never db reset --linked)` → `Netlify production deploy (exact reviewed commit; verify checksum/commit)` →
`verification (production-safe smoke)` → `rollback readiness (previous deploy id + commit + fwd-migration note)`.

Every remote step **fails closed** on a missing credential and **halts on any failed validation**.

## Readiness verdict

- **Supabase migration readiness:** **NOT READY.** This is a **greenfield backend** — no Supabase project,
  no CLI, no migrations, no RLS, no auth, and the domain model lacks the `organization_id` tenancy column on
  ~45 of 46 entities. Substantial new schema + RLS + auth + repository-adapter design is required.
- **Automated staging deployment currently possible?** **No** — blocked on (a) absent credentials
  (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_ORG_ID`, `SUPABASE_DB_PASSWORD`, `TERAGON_ADMIN_EMAIL/PASSWORD`) and
  (b) the not-yet-built migrations/RLS/adapter/auth.
- **Netlify demo preview (local-first, no Supabase):** possible now (separate track; see the QA report).
- **Overall Supabase readiness verdict: FAIL (not ready).** Design is understood and captured here;
  execution awaits credentials + the schema/RLS/adapter build.

No resource was created; no migration applied; no variable configured. Stop after Gate 1.
