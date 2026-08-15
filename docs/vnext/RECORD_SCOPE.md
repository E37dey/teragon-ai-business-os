# TERAGON vNext — Record-Scope (Row-Level) Authorization

**Status:** enforced as a centralized policy across all portal data surfaces.
**Honesty note (read first):** this document states exactly *where* record scope is a
**trusted boundary** and where it is **best-effort client presentation**. It does not
overstate the guarantee.

## The model

```
AUTHENTICATED IDENTITY → CANONICAL ROLE → CAPABILITY → PORTAL SCOPE → RECORD SCOPE → RESULT
```

- **Canonical role / capability** — the 9-role RBAC (`can(role, permission)`), unchanged.
- **Portal scope** — which *modules/routes* a portal may open (`canAccessRoute`,
  `RouteAccessGuard`). Deny-by-default, wired into the router.
- **Record scope** — which *rows* inside those modules a portal may see. This document.

Record scope is one policy: [`src/authorization/recordScope.ts`](../../src/authorization/recordScope.ts)
(`scopeRecords` / `canSeeRecord`). Every surface calls it; **no component
re-implements a predicate**, so scope cannot drift between the homes and search.

## The scope identity

The identity comes from the **trusted authenticated session**, never from the URL or a
form field. Each demo account carries a fixed `scope` (`src/auth/demoAccounts.ts`):

| Account | Portal | Scope identity | Sees |
|---|---|---|---|
| `manager@teragon.demo` | manager | `null` (broad) | full org-scoped set |
| `student@teragon.demo` | student | `{ studentId: "st-1" }` | only st-1's enrollment/progress |
| `technician@teragon.demo` | technician | `{ ownerId: "u-ran" }` | only u-ran's assigned jobs/tasks |

`useScopeContext()` resolves `(portal, scope)` from the active account; with no demo
account the default operator is the broad manager.

## Surface inventory & enforcement

| Surface | Store | Owner/subject field | Student | Technician | Manager | Enforcement layer |
|---|---|---|---|---|---|---|
| Enrollments / Progress | `enrollments` | `studentId` | own only | — (none) | all | `scopeRecords` (StudentHome) |
| Learning stages ("my tasks") | derived from own enrollment | `studentId` | own only | — | — | derived from scoped enrollment |
| Operational Tasks | `tasks` | `ownerId` | — (none) | own only | all | `scopeRecords` (Tech/Manager home + search) |
| Service tickets / Jobs | `serviceTickets` | `ownerId` | — | own only | all | `scopeRecords` (TechnicianHome + search) |
| Approvals | `approvals` | `requestedById` | — | — | all | `scopeRecords` (ManagerHome) |
| Customers (search) | `customers` | ticket relation | — | only on own tickets | all | `useGlobalSearchData` scope |
| Student roster (search) | `students` | — | — | — | all | `useGlobalSearchData` scope |
| Leads/Quotes/Orgs/Docs/Memory (search) | various | — | — | — | all | `useGlobalSearchData` scope |
| Knowledge / Courses | `knowledgeNotes` / `courses` | shared reference | all | all | all | shared (route-gated only) |
| Global search | (all above) | per collection | scoped at source | scoped at source | broad | `useGlobalSearchData` + palette route filter |

"—" = the portal receives an **empty set** for that surface (least privilege), never
"all rows then hope a component filters."

## Enforcement reality — where the boundary actually is

This is the part that must stay honest.

1. **Tenant / organization isolation — TRUSTED (server) in a Supabase build.**
   Migrations `011_rls_helpers.sql` + `012_rls_policies.sql` enforce
   `organization_id = auth_org_id()` at the database, derived from `auth.uid()`.
   A client cannot read another organization's rows regardless of UI. This is a real
   server boundary.

2. **Per-user record scope (this policy) — BEST-EFFORT PRESENTATION in the default
   build.** The default provider is `LOCAL_INDEXEDDB` (`src/persistence/provider.ts`):
   the entire dataset lives in the browser and there is no server to refuse a request.
   `scopeRecords` is therefore a **least-privilege presentation** layer — it guarantees
   an unauthorized row is never *surfaced* (never rendered, ranked, or returned to a
   component), but it is **not** a cryptographic/server boundary: someone with devtools
   can read IndexedDB directly. This is inherent to a local-first demo and is **not**
   hidden behind a fake guarantee.

3. **Per-user record scope as a TRUSTED boundary — NOT YET.** The current RLS is
   org-level, **not** per-owner. Making "technician A cannot read technician B's job" a
   *server* guarantee requires **new per-owner RLS policies** (e.g.
   `owner_id = auth.uid()` on `service_tickets`/`tasks`, `student_id = auth.uid()` on
   `enrollments`) plus a real auth session. That is the documented next step. It is
   **deliberately not faked** here.

### One-line summary

> Record-level authorization is a **centralized least-privilege policy** enforced
> consistently across every portal surface and pinned by IDOR tests. In the default
> local-first build it is trusted **presentation**; org-tenant isolation is trusted at
> the DB (RLS 012); trusted **per-user** enforcement needs per-owner RLS + a server and
> is the named next step. It is **not** claimed to be production per-user security.

## Tests

- [`tests/rbac/recordScope.rbac.test.ts`](../../tests/rbac/recordScope.rbac.test.ts) —
  IDOR / direct-object-access at the policy level: own → PASS, another subject → DENY,
  missing scope → fail-closed (empty, never "all"), manager → broad.
- [`tests/rbac/portalAccess.rbac.test.ts`](../../tests/rbac/portalAccess.rbac.test.ts) —
  the route-scope layer (which modules a portal may open).
- [`e2e/vnext/portals.spec.ts`](../../e2e/vnext/portals.spec.ts) — live direct-URL RBAC.
