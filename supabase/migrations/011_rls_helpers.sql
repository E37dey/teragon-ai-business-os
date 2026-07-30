-- ============================================================================
-- 011_rls_helpers.sql — TERAGON AI BUSINESS OS — Gate S3
-- SECURITY DEFINER helper functions that power every RLS policy (012).
--
-- WHY SECURITY DEFINER: these functions read profiles/roles/memberships. Those
--   tables are themselves RLS-protected. The helpers run as the function OWNER
--   (the migration role, which OWNS the tables) so they bypass RLS on the
--   identity tables — this is what prevents policy recursion (a profiles policy
--   that called a function which re-queried profiles under RLS would recurse).
--   The migrations use ENABLE (never FORCE) ROW LEVEL SECURITY, so the owner
--   bypasses RLS by design. Do NOT add FORCE ROW LEVEL SECURITY to these tables.
--
-- SEARCH_PATH IS PINNED on every function (set search_path = public, pg_catalog)
--   so a caller cannot shadow `profiles`/`roles` with objects in a hostile
--   schema — a required hardening for SECURITY DEFINER.
--
-- DENY-BY-DEFAULT: every helper returns FALSE / NULL when there is no
--   authenticated, active profile for auth.uid(). Identity is ALWAYS derived
--   from auth.uid() (the verified JWT subject) and the server-owned profiles
--   row — NEVER from client-supplied input. The browser cannot assert its own
--   org / role / active state anywhere in this system.
--
-- Additive only. No drop/truncate/delete.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- is_service_role() — true only for the Supabase service role / bypass context.
-- Detected from the verified JWT `role` claim (PostgREST sets request.jwt.claims
-- from the service key), with a fallback to a direct-session role GUC. The
-- service role additionally has BYPASSRLS in Supabase, so RLS policies are not
-- even evaluated for it; this helper exists for functions (bootstrap) that must
-- gate themselves explicitly.
-- ----------------------------------------------------------------------------
create or replace function public.is_service_role()
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select coalesce(
           nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
           ''
         ) = 'service_role'
      or coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role';
$$;

comment on function public.is_service_role() is
  'True only in the service-role / bypass context (verified JWT role claim = service_role). Used to gate service-only functions.';

-- ----------------------------------------------------------------------------
-- current_profile() — the profiles row for auth.uid(), or NULL row when there
-- is no authenticated user / no profile. Never trusts client input.
-- ----------------------------------------------------------------------------
create or replace function public.current_profile()
returns public.profiles
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select p.*
  from public.profiles p
  where p.id = auth.uid();
$$;

comment on function public.current_profile() is
  'The profiles row for auth.uid() (verified JWT subject), or NULL when unauthenticated. Identity is server-owned, never client-asserted.';

-- ----------------------------------------------------------------------------
-- auth_org_id() — the caller''s tenant, derived from their profiles row.
-- NEVER from a client-supplied organization_id. Returns NULL when there is no
-- authenticated profile (=> every "organization_id = auth_org_id()" comparison
-- is NULL => false => deny).
-- ----------------------------------------------------------------------------
create or replace function public.auth_org_id()
returns text
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select p.organization_id
  from public.profiles p
  where p.id = auth.uid();
$$;

comment on function public.auth_org_id() is
  'The caller''s tenant id, derived ONLY from their server-owned profiles row (never from client input). NULL when unauthenticated => deny.';

-- ----------------------------------------------------------------------------
-- auth_role_id() — the caller''s canonical role id (crole-*), or NULL.
-- ----------------------------------------------------------------------------
create or replace function public.auth_role_id()
returns text
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select p.role_id
  from public.profiles p
  where p.id = auth.uid();
$$;

comment on function public.auth_role_id() is
  'The caller''s canonical role id (crole-*) from their profiles row, or NULL when unauthenticated.';

-- ----------------------------------------------------------------------------
-- is_active() — true only when the caller has an authenticated profile that is
-- active (active = true AND status = 'פעיל'). Deny-by-default: NULL/absent
-- profile => false. Inactive users are denied on every table.
-- ----------------------------------------------------------------------------
create or replace function public.is_active()
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.active = true
      and p.status = 'פעיל'
  );
$$;

comment on function public.is_active() is
  'True only when auth.uid() maps to an active profile (active=true AND status=פעיל). Deny-by-default otherwise.';

-- ----------------------------------------------------------------------------
-- has_capability(cap) — true when the caller''s role''s permission array
-- contains `cap` AND the caller is active. `cap` is one of the canonical 24
-- permissions (src/authorization/permissions.ts); roles.permissions is a JSONB
-- array of those strings (seeded in 014, derived from src/domain/administration
-- /roles.ts). Uses the jsonb `?` membership operator. Deny-by-default.
-- ----------------------------------------------------------------------------
create or replace function public.has_capability(cap text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1
    from public.profiles p
    join public.roles r on r.id = p.role_id
    where p.id = auth.uid()
      and p.active = true
      and p.status = 'פעיל'
      and r.permissions ? cap
  );
$$;

comment on function public.has_capability(text) is
  'True when the caller''s role grants capability `cap` (one of the canonical 24 permissions) AND the caller is active. Inactive/unauthenticated => false.';

-- ----------------------------------------------------------------------------
-- is_org_member(org) — true when the caller holds an ACTIVE membership in `org`.
-- Tenant isolation is established through authenticated membership only.
-- ----------------------------------------------------------------------------
create or replace function public.is_org_member(org text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1
    from public.memberships m
    where m.profile_id = auth.uid()
      and m.organization_id = org
      and m.active = true
  );
$$;

comment on function public.is_org_member(text) is
  'True when auth.uid() has an active membership in `org`. Membership is the only source of tenant belonging (never client input).';

-- ----------------------------------------------------------------------------
-- EXECUTE grants — the helpers are callable by anon/authenticated (they are the
-- building blocks of the policies) and by the service role. They are STABLE and
-- read-only; they leak nothing beyond the caller''s own identity.
-- ----------------------------------------------------------------------------
grant execute on function public.is_service_role()        to anon, authenticated, service_role;
grant execute on function public.current_profile()        to anon, authenticated, service_role;
grant execute on function public.auth_org_id()            to anon, authenticated, service_role;
grant execute on function public.auth_role_id()           to anon, authenticated, service_role;
grant execute on function public.is_active()              to anon, authenticated, service_role;
grant execute on function public.has_capability(text)     to anon, authenticated, service_role;
grant execute on function public.is_org_member(text)      to anon, authenticated, service_role;
