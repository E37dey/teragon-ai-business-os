-- ============================================================================
-- 012_rls_policies.sql — TERAGON AI BUSINESS OS — Gate S3
-- Deny-by-default RLS policies for EVERY tenant table + the identity tables.
--
-- ENFORCEMENT MODEL (every tenant table, every command):
--   USING / WITH CHECK = organization_id = auth_org_id()   -- tenant isolation
--                    AND is_active()                        -- inactive => deny
--                    AND has_capability(<required perm>)    -- capability gate
--   The org test uses auth_org_id() (derived from the caller''s server-owned
--   profiles row, NEVER a client value). Because INSERT/UPDATE carry a
--   WITH CHECK on organization_id = auth_org_id(), a caller can NEVER write a
--   row into another org — the classic cross-tenant write is structurally
--   impossible. SELECT/UPDATE/DELETE USING clauses make other-org rows
--   invisible, so cross-org reads and blind updates return zero rows.
--
-- CAPABILITY MAPPING: each table maps to the closest of the canonical 24
--   permissions (src/authorization/permissions.ts). read commands require the
--   domain''s read-most permission; write commands require its write/approve
--   permission. The mapping array below IS the per-table policy documentation.
--
-- SERVICE ROLE: has BYPASSRLS in Supabase, so it is not subject to any policy
--   here — it is the bootstrap / server path. The browser never uses it.
--
-- IDENTITY TABLES get bespoke policies (below the generator):
--   profiles     — self may read org roster but may NOT change own
--                  role_id/organization_id/active (column-guarded); admin/service only.
--   memberships  — mutations admin/service only (role-escalation protection).
--   roles        — global catalog; mutations admin/service only.
--   organizations— caller reads own org; settings.update to edit; create/drop = service.
--   audit_events — APPEND-ONLY: INSERT + SELECT only, NO update/delete policy.
--
-- Additive only. No drop/truncate/delete.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Uniform tenant-table policy generator.
-- Row shape: [ table, select_cap, insert_cap, update_cap, delete_cap ]
-- Covers all 43 domain tenant tables EXCEPT audit_events (append-only, handled
-- explicitly afterwards so it never gets an UPDATE/DELETE policy).
-- ----------------------------------------------------------------------------
do $gen$
declare
  spec  text[];
  specs text[][] := array[
    -- CRM (customer.*)
    array['customers',            'customer.read',   'customer.create', 'customer.update', 'customer.update'],
    array['contacts',             'customer.read',   'customer.update', 'customer.update', 'customer.update'],
    -- Sales pipeline (sales.read / quotation.create)
    array['leads',                'sales.read',      'quotation.create','quotation.create','quotation.create'],
    array['opportunities',        'sales.read',      'quotation.create','quotation.create','quotation.create'],
    array['quotations',           'sales.read',      'quotation.create','quotation.create','quotation.create'],
    -- Catalog (sales-managed) & installed base (service-managed)
    array['products',             'sales.read',      'quotation.create','quotation.create','quotation.create'],
    array['printer_models',       'sales.read',      'quotation.create','quotation.create','quotation.create'],
    array['customer_printers',    'service.read',    'service.update',  'service.update',  'service.update'],
    -- Service (service.read / service.update / service.close)
    array['service_tickets',      'service.read',    'service.update',  'service.update',  'service.close'],
    array['repair_actions',       'service.read',    'service.update',  'service.update',  'service.update'],
    -- Training / courses (course.manage is the only course capability)
    array['courses',              'course.manage',   'course.manage',   'course.manage',   'course.manage'],
    array['learning_paths',       'course.manage',   'course.manage',   'course.manage',   'course.manage'],
    array['students',             'course.manage',   'course.manage',   'course.manage',   'course.manage'],
    array['enrollments',          'course.manage',   'course.manage',   'course.manage',   'course.manage'],
    array['course_sessions',      'course.manage',   'course.manage',   'course.manage',   'course.manage'],
    array['assignments',          'course.manage',   'course.manage',   'course.manage',   'course.manage'],
    -- Work management
    array['tasks',                'customer.read',   'customer.update', 'customer.update', 'customer.update'],
    array['approvals',            'governance.review','automation.approve','automation.approve','automation.approve'],
    -- Knowledge / memory
    array['knowledge_notes',      'customer.read',   'knowledge.review','knowledge.review','knowledge.review'],
    array['documents',            'customer.read',   'knowledge.review','knowledge.review','knowledge.review'],
    array['memory_records',       'customer.read',   'memory.approve',  'memory.approve',  'memory.approve'],
    -- Agents / orchestration
    array['agents',               'governance.review','agent.disable',  'agent.disable',   'agent.disable'],
    array['agent_tasks',          'governance.review','automation.approve','automation.approve','automation.approve'],
    array['agent_messages',       'governance.review','automation.approve','automation.approve','automation.approve'],
    array['agent_handoffs',       'governance.review','automation.approve','automation.approve','automation.approve'],
    array['agent_conflicts',      'governance.review','automation.approve','automation.approve','automation.approve'],
    array['ai_recommendations',   'governance.review','automation.approve','automation.approve','automation.approve'],
    -- Governance / evidence / automation
    array['evidence',             'audit.read',      'governance.review','governance.review','governance.review'],
    array['automations',          'governance.review','automation.approve','automation.approve','automation.approve'],
    array['automation_runs',      'governance.review','automation.approve','automation.approve','automation.approve'],
    array['metric_definitions',   'governance.review','settings.update', 'settings.update', 'settings.update'],
    array['metric_observations',  'governance.review','settings.update', 'settings.update', 'settings.update'],
    array['risks',                'governance.review','policy.approve',  'policy.approve',  'policy.approve'],
    array['controls',             'governance.review','policy.approve',  'policy.approve',  'policy.approve'],
    array['personas',             'governance.review','settings.update', 'settings.update', 'settings.update'],
    array['training_materials',   'customer.read',   'knowledge.review','knowledge.review','knowledge.review'],
    array['stage_gates',          'governance.review','policy.approve',  'policy.approve',  'policy.approve'],
    array['implementation_stages','governance.review','policy.approve',  'policy.approve',  'policy.approve'],
    array['support_requests',     'service.read',    'service.update',  'service.update',  'service.update'],
    array['meetings',             'customer.read',   'customer.update', 'customer.update', 'customer.update'],
    array['activities',           'customer.read',   'customer.update', 'customer.update', 'customer.update'],
    array['app_notifications',    'customer.read',   'customer.update', 'customer.update', 'customer.update']
  ];
begin
  foreach spec slice 1 in array specs loop
    -- SELECT
    execute format(
      'create policy %I on public.%I for select to authenticated using ('
      || 'organization_id = public.auth_org_id() and public.is_active() and public.has_capability(%L));',
      spec[1] || '_select', spec[1], spec[2]);
    -- INSERT (WITH CHECK pins the row into the caller''s own org)
    execute format(
      'create policy %I on public.%I for insert to authenticated with check ('
      || 'organization_id = public.auth_org_id() and public.is_active() and public.has_capability(%L));',
      spec[1] || '_insert', spec[1], spec[3]);
    -- UPDATE (USING hides other-org rows; WITH CHECK forbids moving a row cross-org)
    execute format(
      'create policy %I on public.%I for update to authenticated using ('
      || 'organization_id = public.auth_org_id() and public.is_active() and public.has_capability(%L)) '
      || 'with check (organization_id = public.auth_org_id() and public.has_capability(%L));',
      spec[1] || '_update', spec[1], spec[4], spec[4]);
    -- DELETE
    execute format(
      'create policy %I on public.%I for delete to authenticated using ('
      || 'organization_id = public.auth_org_id() and public.is_active() and public.has_capability(%L));',
      spec[1] || '_delete', spec[1], spec[5]);
  end loop;
end
$gen$;

-- ============================================================================
-- audit_events — APPEND-ONLY (immutable). INSERT + SELECT only. Deliberately
-- NO update/delete policy => under deny-by-default RLS, UPDATE and DELETE can
-- never succeed for any non-service caller. Any active org member may append an
-- event scoped to their own org (append is broad by design for a log); reading
-- the trail requires audit.read.
-- ============================================================================
create policy audit_events_select on public.audit_events
  for select to authenticated
  using (organization_id = public.auth_org_id() and public.is_active() and public.has_capability('audit.read'));

create policy audit_events_insert on public.audit_events
  for insert to authenticated
  with check (organization_id = public.auth_org_id() and public.is_active());
-- (no audit_events_update / audit_events_delete policy — immutability by omission)

-- ============================================================================
-- organizations — the tenant root (no organization_id column; it IS the tenant).
-- ============================================================================
create policy organizations_select on public.organizations
  for select to authenticated
  using (id = public.auth_org_id() and public.is_active());

create policy organizations_update on public.organizations
  for update to authenticated
  using (id = public.auth_org_id() and public.has_capability('settings.update'))
  with check (id = public.auth_org_id() and public.has_capability('settings.update'));
-- (no organizations_insert / organizations_delete policy — provisioning is a
--  service-role-only path; a normal caller can never create or drop an org)

-- ============================================================================
-- roles — GLOBAL catalog (no organization_id). Any active caller may read the
-- catalog; mutations are admin/service only (permission.approve) so a role''s
-- capability set cannot be edited to escalate anyone.
-- ============================================================================
create policy roles_select on public.roles
  for select to authenticated
  using (public.is_active());

create policy roles_insert on public.roles
  for insert to authenticated
  with check (public.has_capability('permission.approve'));

create policy roles_update on public.roles
  for update to authenticated
  using (public.has_capability('permission.approve'))
  with check (public.has_capability('permission.approve'));

create policy roles_delete on public.roles
  for delete to authenticated
  using (public.has_capability('permission.approve'));

-- ============================================================================
-- profiles — application identity. Careful, layered policies:
--   SELECT  : an active caller may read their own org''s roster.
--   INSERT  : admin (user.manage) within own org, or service role. A normal
--             user cannot mint a profile.
--   UPDATE  : two permissive policies OR-ed:
--             (a) self-update, COLUMN-GUARDED — the new role_id/organization_id
--                 /active MUST equal the currently-stored values (sub-selects
--                 read the pre-update snapshot), so a user can edit their own
--                 name/phone but can NEVER change their own role, org or active
--                 flag (self role-escalation is structurally blocked).
--             (b) admin-update (user.manage) within own org — may change
--                 role/active for managed users.
--   DELETE  : admin (user.manage) within own org, or service role.
-- ============================================================================
create policy profiles_select on public.profiles
  for select to authenticated
  using (organization_id = public.auth_org_id() and public.is_active());

create policy profiles_insert on public.profiles
  for insert to authenticated
  with check (organization_id = public.auth_org_id() and public.has_capability('user.manage'));

-- (a) self may update own row but NOT its role_id / organization_id / active
create policy profiles_self_update on public.profiles
  for update to authenticated
  using (id = auth.uid() and public.is_active())
  with check (
    id = auth.uid()
    and organization_id = (select p.organization_id from public.profiles p where p.id = auth.uid())
    and role_id         = (select p.role_id         from public.profiles p where p.id = auth.uid())
    and active          = (select p.active          from public.profiles p where p.id = auth.uid())
  );

-- (b) admin may manage profiles in their own org (may change role/active)
create policy profiles_admin_update on public.profiles
  for update to authenticated
  using (organization_id = public.auth_org_id() and public.has_capability('user.manage'))
  with check (organization_id = public.auth_org_id() and public.has_capability('user.manage'));

create policy profiles_delete on public.profiles
  for delete to authenticated
  using (organization_id = public.auth_org_id() and public.has_capability('user.manage'));

-- ============================================================================
-- memberships — profile<->org link carrying the effective role. Mutations are
-- admin/service only (user.manage): a normal user cannot insert/alter/delete a
-- membership, so nobody can grant themselves a role or a second tenant. Reads
-- are limited to the caller''s own org roster.
-- ============================================================================
create policy memberships_select on public.memberships
  for select to authenticated
  using (organization_id = public.auth_org_id() and public.is_active());

create policy memberships_insert on public.memberships
  for insert to authenticated
  with check (organization_id = public.auth_org_id() and public.has_capability('user.manage'));

create policy memberships_update on public.memberships
  for update to authenticated
  using (organization_id = public.auth_org_id() and public.has_capability('user.manage'))
  with check (organization_id = public.auth_org_id() and public.has_capability('user.manage'));

create policy memberships_delete on public.memberships
  for delete to authenticated
  using (organization_id = public.auth_org_id() and public.has_capability('user.manage'));

-- ============================================================================
-- Base table privileges. RLS — not GRANTs — is the security boundary, so the
-- anon/authenticated roles receive broad table privileges and every access is
-- then gated by the policies above. (Supabase grants USAGE on schema public by
-- default; repeated here idempotently.)
-- ============================================================================
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
-- anon gets SELECT only (so unauthenticated reads resolve to 0 rows via RLS
-- rather than a bare privilege error); it holds no write privilege at all.
grant select on all tables in schema public to anon;
-- service_role is the privileged server/back-end role (it also bypasses RLS in
-- Supabase). It must hold full table access so server-side code and the
-- service-only bootstrap path can read/write directly — RLS is the isolation
-- boundary for anon/authenticated, not a substitute for these grants.
grant select, insert, update, delete on all tables in schema public to service_role;
