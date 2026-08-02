-- ============================================================================
-- staging_seed.sql — TERAGON AI BUSINESS OS — Gate S7.2 staging seed.
--
--   *** STAGING / CANONICAL ADMIN ORG ONLY. NOT a migration. NOT production. ***
--
-- Deterministic, IDEMPOTENT (ON CONFLICT DO NOTHING) demo business data for the
-- CANONICAL staging org `org-teragon` (the org created by bootstrap_admin for
-- the approved admin). Run by the seed-staging stage AFTER admin bootstrap is
-- verified. Safe to re-run: every insert is ON CONFLICT DO NOTHING; there is no
-- update / delete / truncate / reset, and no cross-org relationship.
--
-- Owner/instructor/requester references resolve to the canonical admin PROFILE
-- (crole-sysadmin in org-teragon) by lookup — no hard-coded auth.users id, no
-- credentials, no personal/production data. FK order: parents before children.
-- ============================================================================

-- Guard: refuse unless the canonical admin profile exists (bootstrap ran first).
do $seedguard$
begin
  if not exists (
    select 1 from public.profiles
    where organization_id = 'org-teragon' and role_id = 'crole-sysadmin'
  ) then
    raise exception 'SEED_GUARD: canonical admin profile for org-teragon not found — run admin bootstrap first';
  end if;
end
$seedguard$;

-- The canonical admin profile id (owner for tenant rows that need a uuid owner).
-- Materialized once so every insert references the same identity deterministically.

-- --- CRM --------------------------------------------------------------------
insert into public.customers (id, organization_id, name, type, city, status) values
  ('seed-teragon-cust-1', 'org-teragon', 'לקוח דמו 1', 'עסק',  'תל אביב', 'פעיל'),
  ('seed-teragon-cust-2', 'org-teragon', 'לקוח דמו 2', 'פרטי', 'חיפה',    'פעיל')
on conflict (id) do nothing;

insert into public.leads (id, organization_id, name, source, interest, status, owner_id)
select 'seed-teragon-lead-1', 'org-teragon', 'ליד דמו 1', 'אתר', 'מדפסת', 'חדש',
       p.id
from public.profiles p
where p.organization_id = 'org-teragon' and p.role_id = 'crole-sysadmin'
order by p.created_at limit 1
on conflict (id) do nothing;

-- --- products / printers ----------------------------------------------------
insert into public.products (id, organization_id, name, category, price, active) values
  ('seed-teragon-prod-1', 'org-teragon', 'מדפסת FDM דמו', 'מדפסת', 4990, true)
on conflict (id) do nothing;

insert into public.printer_models (id, organization_id, name, manufacturer, technology, price, note) values
  ('seed-teragon-pm-1', 'org-teragon', 'Teragon One', 'Teragon', 'FDM', 4990, 'דגם דמו')
on conflict (id) do nothing;

-- --- service / repairs ------------------------------------------------------
insert into public.service_tickets (id, organization_id, customer_name, customer_id, issue, priority, status, opened_at, owner_id)
select 'seed-teragon-st-1', 'org-teragon', 'לקוח דמו 1', 'seed-teragon-cust-1', 'לא מדפיס', 'בינונית', 'חדש', current_date,
       p.id
from public.profiles p
where p.organization_id = 'org-teragon' and p.role_id = 'crole-sysadmin'
order by p.created_at limit 1
on conflict (id) do nothing;

-- --- training / enrollments -------------------------------------------------
insert into public.courses (id, organization_id, name, type, price, status, instructor_id, is_ai, blurb)
select 'seed-teragon-course-1', 'org-teragon', 'קורס דמו', '', 0, 'פעיל',
       p.id, false, 'קורס הדגמה'
from public.profiles p
where p.organization_id = 'org-teragon' and p.role_id = 'crole-sysadmin'
order by p.created_at limit 1
on conflict (id) do nothing;

insert into public.students (id, organization_id, name, status) values
  ('seed-teragon-student-1', 'org-teragon', 'תלמיד דמו', 'פעיל')
on conflict (id) do nothing;

insert into public.enrollments (id, organization_id, student_id, student_name, course_id, payment) values
  ('seed-teragon-enroll-1', 'org-teragon', 'seed-teragon-student-1', 'תלמיד דמו', 'seed-teragon-course-1', 'ממתין')
on conflict (id) do nothing;

-- --- tasks / approvals ------------------------------------------------------
insert into public.tasks (id, organization_id, title, description, status, priority, due, owner_id)
select 'seed-teragon-task-1', 'org-teragon', 'משימת דמו', '', 'פתוחה', 'בינונית', current_date,
       p.id
from public.profiles p
where p.organization_id = 'org-teragon' and p.role_id = 'crole-sysadmin'
order by p.created_at limit 1
on conflict (id) do nothing;

insert into public.approvals (id, organization_id, subject_ref, requested_by_id, requested_at, status, note)
select 'seed-teragon-approval-1', 'org-teragon', 'task:seed-teragon-task-1',
       p.id, now(), 'ממתין', 'אישור דמו'
from public.profiles p
where p.organization_id = 'org-teragon' and p.role_id = 'crole-sysadmin'
order by p.created_at limit 1
on conflict (id) do nothing;

-- --- knowledge / memory -----------------------------------------------------
insert into public.knowledge_notes (id, organization_id, title, category, content, approved) values
  ('seed-teragon-kn-1', 'org-teragon', 'פתק ידע דמו', 'כללי', 'תוכן הדגמה', false)
on conflict (id) do nothing;

insert into public.memory_records (id, organization_id, title, markdown, folder) values
  ('seed-teragon-mem-1', 'org-teragon', 'זיכרון דמו', 'תוכן', 'staging')
on conflict (id) do nothing;

-- --- governance / audit (append-only) ---------------------------------------
insert into public.audit_events (id, organization_id, at, actor, action, entity_ref, details) values
  ('seed-teragon-audit-1', 'org-teragon', now(), 'system', 'staging.seed', 'organization:org-teragon', 'S7.2 deterministic staging seed')
on conflict (id) do nothing;
