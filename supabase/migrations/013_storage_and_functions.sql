-- ============================================================================
-- 013_storage_and_functions.sql — TERAGON AI BUSINESS OS — Gate S3
-- Storage buckets (org-scoped), atomic multi-record RPCs, and the service-role-
-- only admin bootstrap function.
--
-- STORAGE ORG-SCOPING CONVENTION: an object''s first path segment is its owning
--   organization_id, i.e. keys look like  "<organization_id>/<...>". Policies
--   compare (storage.foldername(name))[1] against auth_org_id(), so a caller can
--   only ever touch objects under their own tenant folder. Buckets are PRIVATE
--   (public = false) — nothing is world-readable.
--
-- TRUST BOUNDARY: the browser NEVER supplies a trusted user id / org / role /
--   active flag. bootstrap_admin() is the ONLY way to mint the first admin, it
--   is callable with the service role ONLY, and it derives nothing from client
--   input beyond the target auth.users id it is explicitly asked to promote.
--
-- Additive only. No drop/truncate/delete.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Buckets: documents (course / customer files) and evidence (audit evidence
-- artifacts). Private, idempotent.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('evidence', 'evidence', false)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- documents bucket policies — org-scoped by path prefix.
--   read  : customer.read (broad business read)   write: knowledge.review
-- ----------------------------------------------------------------------------
create policy documents_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = public.auth_org_id()
    and public.is_active()
    and public.has_capability('customer.read')
  );

create policy documents_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = public.auth_org_id()
    and public.is_active()
    and public.has_capability('knowledge.review')
  );

create policy documents_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = public.auth_org_id()
    and public.has_capability('knowledge.review')
  )
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = public.auth_org_id()
    and public.has_capability('knowledge.review')
  );

create policy documents_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = public.auth_org_id()
    and public.has_capability('knowledge.review')
  );

-- ----------------------------------------------------------------------------
-- evidence bucket policies — org-scoped by path prefix.
--   read  : audit.read           write: governance.review
-- ----------------------------------------------------------------------------
create policy evidence_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'evidence'
    and (storage.foldername(name))[1] = public.auth_org_id()
    and public.is_active()
    and public.has_capability('audit.read')
  );

create policy evidence_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'evidence'
    and (storage.foldername(name))[1] = public.auth_org_id()
    and public.is_active()
    and public.has_capability('governance.review')
  );

create policy evidence_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'evidence'
    and (storage.foldername(name))[1] = public.auth_org_id()
    and public.has_capability('governance.review')
  )
  with check (
    bucket_id = 'evidence'
    and (storage.foldername(name))[1] = public.auth_org_id()
    and public.has_capability('governance.review')
  );

create policy evidence_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'evidence'
    and (storage.foldername(name))[1] = public.auth_org_id()
    and public.has_capability('governance.review')
  );

-- ============================================================================
-- Atomic multi-record RPC — close_service_ticket()
-- The domain "close a ticket" is inherently multi-record: it updates the
-- ticket, records the repair action, and appends an immutable audit event. A
-- SECURITY DEFINER function makes those three writes ONE transaction (all-or-
-- nothing). It re-derives the caller''s org from auth_org_id() (never trusts a
-- client org), verifies the ticket belongs to that org, and requires the
-- service.close capability — RLS is not bypassed for the caller''s benefit, the
-- function simply guarantees atomicity + authorization in one place.
-- ============================================================================
create or replace function public.close_service_ticket(
  p_ticket_id           text,
  p_solution            text,
  p_repair_description  text default '',
  p_parts_cost          numeric default 0
)
returns public.service_tickets
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_org    text := public.auth_org_id();
  v_ticket public.service_tickets;
begin
  if v_org is null then
    raise exception 'close_service_ticket: no authenticated tenant' using errcode = '42501';
  end if;
  if not public.has_capability('service.close') then
    raise exception 'close_service_ticket: caller lacks service.close' using errcode = '42501';
  end if;

  select * into v_ticket
  from public.service_tickets
  where id = p_ticket_id and organization_id = v_org
  for update;

  if not found then
    raise exception 'close_service_ticket: ticket % not found in tenant %', p_ticket_id, v_org
      using errcode = 'P0002';
  end if;

  update public.service_tickets
     set status = 'נסגר',
         solution = p_solution,
         closed_at = current_date
   where id = p_ticket_id and organization_id = v_org
   returning * into v_ticket;

  insert into public.repair_actions (id, organization_id, ticket_id, description, performed_by_id, performed_at, parts_cost)
  values (
    'ra-' || p_ticket_id || '-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS'),
    v_org, p_ticket_id, coalesce(p_repair_description, ''), auth.uid(), current_date, coalesce(p_parts_cost, 0)
  );

  insert into public.audit_events (id, organization_id, at, actor, action, entity_ref, details)
  values (
    'ae-close-' || p_ticket_id || '-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS'),
    v_org, now(), coalesce(auth.uid()::text, 'system'),
    'service_ticket.closed', 'service-ticket:' || p_ticket_id, p_solution
  );

  return v_ticket;
end
$$;

comment on function public.close_service_ticket(text, text, text, numeric) is
  'Atomic ticket close: updates ticket + inserts repair_action + appends audit_event in one transaction. Re-derives org from auth_org_id() and requires service.close.';

grant execute on function public.close_service_ticket(text, text, text, numeric) to authenticated, service_role;

-- ============================================================================
-- bootstrap_admin() — SERVICE-ROLE-ONLY first-admin bootstrap.
-- Creates (idempotently) the org, the first admin profile (crole-sysadmin) for a
-- given auth.users id, and the matching membership. This is THE ONLY sanctioned
-- way to establish a trusted identity — and it exists off the browser path
-- entirely: it self-refuses unless is_service_role() is true, AND execute is
-- granted to service_role only (revoked from anon/authenticated). The client
-- can never call it, and can never assert its own role/org/active through it.
-- Idempotent via ON CONFLICT DO NOTHING (safe to re-run).
-- ============================================================================
create or replace function public.bootstrap_admin(
  p_user_id  uuid,
  p_org_id   text,
  p_org_name text default '',
  p_name     text default '',
  p_email    text default ''
)
returns public.profiles
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_role    text := 'crole-sysadmin';
  v_profile public.profiles;
begin
  if not public.is_service_role() then
    raise exception 'bootstrap_admin: requires the service role' using errcode = '42501';
  end if;

  -- org (idempotent create-if-absent)
  insert into public.organizations (id, name)
  values (p_org_id, coalesce(nullif(p_org_name, ''), p_org_id))
  on conflict (id) do nothing;

  -- admin profile (idempotent create-if-absent)
  insert into public.profiles (id, organization_id, role_id, name, email, active, status)
  values (p_user_id, p_org_id, v_role, coalesce(p_name, ''), coalesce(p_email, ''), true, 'פעיל')
  on conflict (id) do nothing;

  -- membership (idempotent create-if-absent; unique on (organization_id, profile_id))
  insert into public.memberships (id, organization_id, profile_id, role_id, active)
  values ('mem-boot-' || p_org_id || '-' || p_user_id::text, p_org_id, p_user_id, v_role, true)
  on conflict (organization_id, profile_id) do nothing;

  select * into v_profile from public.profiles where id = p_user_id;
  return v_profile;
end
$$;

comment on function public.bootstrap_admin(uuid, text, text, text, text) is
  'SERVICE-ROLE-ONLY. Idempotently creates the org + first admin profile (crole-sysadmin) + membership for an auth.users id. Self-refuses without the service role; execute granted to service_role only.';

-- Lock the bootstrap down to the service role exclusively.
revoke all on function public.bootstrap_admin(uuid, text, text, text, text) from public;
revoke all on function public.bootstrap_admin(uuid, text, text, text, text) from anon, authenticated;
grant execute on function public.bootstrap_admin(uuid, text, text, text, text) to service_role;
