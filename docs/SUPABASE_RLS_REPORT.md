# TERAGON — Supabase Auth & RLS Report (Gate S3)

Supabase Auth becomes the **future trusted identity boundary**. Deny-by-default Row Level Security enforces
same-organization isolation through **authenticated membership** — never client input. Source:
`supabase/migrations/011_rls_helpers.sql` … `014_staging_seed.sql`; tests `supabase/tests/**`.

## Identity mapping

`auth.users` (Supabase Auth) ↔ **`profiles`** (1:1, `profiles.id uuid → auth.users`), carrying the
server-owned `organization_id`, `role_id` (canonical `crole-*`), and `active`. `memberships` binds a profile
to an organization. **The browser never establishes or submits a trusted user id, organization, role, or
active state** — every trusted fact is derived server-side from `auth.uid()`.

## Helper functions (`011`, SECURITY DEFINER, `search_path` pinned, deny-by-default)

`current_profile()` (profile for `auth.uid()`) · `auth_org_id()` (caller's tenant — never a client
`organization_id`) · `auth_role_id()` · `is_active()` (`active AND status='פעיל'`) · `has_capability(cap)`
(role's permission array contains `cap`) · `is_org_member(org)` · `is_service_role()` (JWT `role` claim).
Each returns false/NULL when there is no authenticated active profile.

## Policies (`012`, all 47 tables)

- **Uniform tenant tables (42):** `select/insert/update/delete` permitted only when
  `organization_id = auth_org_id() AND is_active() AND has_capability(<perm>)`, generated from a reviewable
  `[table, sel, ins, upd, del]` capability map. Every insert/update carries a **`WITH CHECK`** pinning the
  row's `organization_id` to the caller's own org → **cross-tenant writes are structurally impossible**.
- **`audit_events`** — INSERT + SELECT only, **no update/delete policy** (immutable by omission).
- **`profiles`** — read own-org roster; **column-guarded self-update**: a non-admin cannot change their own
  `role_id`/`organization_id`/`active` (enforced by pre-update sub-selects); role/active/org changes require
  `user.manage` (admin) or the service role.
- **`memberships` / `roles`** — mutations require `user.manage` / `permission.approve` (admin/service only)
  → **role-escalation protection**.
- **`organizations`** — read own; `settings.update` to edit; create/drop = service only.
- Anon gets SELECT only; authenticated gets full DML — both **fully gated by the policies above** (RLS, not
  GRANTs, is the boundary).

## Storage, RPC, and service-only bootstrap (`013`)

Private `documents` + `evidence` storage buckets with org-scoped `storage.objects` policies (first path
segment must equal `auth_org_id()`). `close_service_ticket()` — an **atomic** RPC (ticket update + repair
action + audit event in one transaction; requires `service.close`). **`bootstrap_admin()` — service-role
ONLY** (self-refuses via `is_service_role()`, execute revoked from anon/authenticated, granted to
`service_role`), idempotently creating the first org + `crole-sysadmin` profile + membership.

## Staging seed (`014`)

Idempotent (`ON CONFLICT DO NOTHING`), **production-guarded** (refuses when `app.environment = production`).
Seeds the canonical 9 `crole-*` roles (permissions derived from `roles.ts` × `permissions.ts`), two staging
tenants **`org-staging-demo` / `org-staging-beta`** (never `org-teragon`), and 4 demo auth users/profiles/
memberships (incl. an inactive user and a cross-org user for isolation tests) + a little demo data.

## RLS isolation tests (`supabase/tests/`, executed against local Postgres in Gate S5)

Plain-SQL assertion tests (`set local role` + `request.jwt.claims` simulate real RLS; `RAISE EXCEPTION` on
failure; `ROLLBACK`):

| Test | Proves |
|------|--------|
| `01_anonymous_denial` | no `auth.uid()` → helpers deny, 0 rows, insert refused |
| `02_cross_org_read_denial` | org-A caller cannot see org-B rows (by filter or by id) |
| `03_cross_org_write_denial` | `WITH CHECK` blocks writing into org B; cross-org update/delete = 0 |
| `04_membership_change_denial` | non-admin cannot insert/alter membership; admin can |
| `05_role_escalation_denial` | a user cannot change their own `role_id`/`organization_id`/`active` |
| `06_inactive_user_denial` | an inactive profile resolves org but gets 0 rows / writes refused |
| `07_aggregate_non_leakage` | `count(*)` = 2 as org A, = 1 as org B (hidden rows never counted) |
| `08_service_only_bootstrap` | authenticated cannot execute bootstrap; service role succeeds + idempotent |

## Guarantees

Deny-by-default; tenant isolation from authenticated membership (never client input); no service-role key in
browser code; role-escalation blocked; `audit_events` immutable; bootstrap service-only; no destructive SQL.
**These policies are authored and statically reviewed; live enforcement is proven in Gate S5** by running
`supabase/tests/**` against the local Postgres — until then, RLS is verified by construction, not execution.
