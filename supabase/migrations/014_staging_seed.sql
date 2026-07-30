-- ============================================================================
-- 014_staging_seed.sql — TERAGON AI BUSINESS OS — Gate S3
-- Deterministic, IDEMPOTENT (ON CONFLICT DO NOTHING) STAGING seed.
--
--   *** STAGING / LOCAL ONLY — PRODUCTION MUST NEVER RUN THIS FILE. ***
--   It seeds demo auth.users, demo tenants and demo business rows. It is safe
--   to re-run (every insert is ON CONFLICT DO NOTHING). The only non-negotiable
--   part is the `roles` catalog — those 9 rows are canonical and are required
--   by has_capability(); everything below the roles block is disposable demo
--   data used by the Gate S5 RLS tests (two tenants + active/inactive users).
--
-- The 9 role permission arrays below are DERIVED from the frozen role baselines
-- in src/domain/administration/roles.ts crossed with the permission→domain/level
-- map in src/authorization/permissions.ts (approve ⊃ write ⊃ read): a role holds
-- a permission iff its grant on that permission''s domain meets the minimum level.
--
-- Additive only. No drop/truncate/delete.
-- ============================================================================

-- Refuse to run when explicitly flagged as production; defaults to staging.
do $guard$
begin
  if coalesce(current_setting('app.environment', true), 'staging') = 'production' then
    raise exception 'REFUSING to run 014_staging_seed.sql: app.environment = production';
  end if;
end
$guard$;

-- ----------------------------------------------------------------------------
-- roles — canonical crole-* catalog (REQUIRED in every environment).
-- ----------------------------------------------------------------------------
insert into public.roles (id, key, label, description, permissions) values
  ('crole-sysadmin', 'crole-sysadmin', 'מנהל מערכת',
   'תצורה, הרשאות וניטור — מאשר שינויי הרשאות ומדיניות מערכת',
   '["customer.read","customer.create","customer.update","sales.read","quotation.create","service.read","service.update","service.close","course.manage","knowledge.review","learning.approve","agent.disable","automation.approve","governance.review","policy.approve","audit.read","user.manage","permission.approve","settings.update","health.diagnostics","submission.approve"]'::jsonb),
  ('crole-ceo', 'crole-ceo', 'מנכ"ל',
   'גישה מלאה — המאשר הבכיר לפעולות AI רגישות ולהתחייבויות כספיות',
   '["customer.read","customer.create","customer.update","sales.read","quotation.create","quotation.approve","discount.approve","service.read","knowledge.review","memory.approve","learning.approve","agent.disable","automation.approve","governance.review","policy.approve","audit.read","user.manage","permission.approve","settings.update","health.diagnostics","submission.approve"]'::jsonb),
  ('crole-bizmgr', 'crole-bizmgr', 'מנהל עסקי',
   'ניהול עסקי — מאשר מכירות והנחות, ללא ניהול הרשאות מערכת',
   '["customer.read","customer.create","customer.update","sales.read","quotation.create","quotation.approve","discount.approve","service.read","knowledge.review","governance.review"]'::jsonb),
  ('crole-sales', 'crole-sales', 'מכירות',
   'לידים, הצעות מחיר ולקוחות — הנחות דורשות אישור; ללא זיכרון טכני מוגבל',
   '["customer.read","customer.create","customer.update","sales.read","quotation.create","service.read"]'::jsonb),
  ('crole-service', 'crole-service', 'שירות',
   'קריאות שירות ותיקונים — לעולם אינו מאשר הנחות כספיות',
   '["customer.read","service.read","service.update","service.close"]'::jsonb),
  ('crole-instructor', 'crole-instructor', 'מדריך',
   'קורסים, תלמידים וחומרי הדרכה',
   '["customer.read","course.manage","knowledge.review"]'::jsonb),
  ('crole-champion', 'crole-champion', 'Champion',
   'שגריר האימוץ — מקדם שימוש ומעדכן ידע; לעולם אינו עורך מדיניות מערכת',
   '["customer.read","sales.read","service.read","knowledge.review","governance.review"]'::jsonb),
  ('crole-auditor', 'crole-auditor', 'מבקר',
   'ביקורת — קריאה בכל התחומים כולל ממשל וכספים, ללא כתיבה',
   '["customer.read","sales.read","service.read","governance.review","audit.read","health.diagnostics"]'::jsonb),
  ('crole-viewer', 'crole-viewer', 'צופה',
   'צפייה בלבד בתחומים העסקיים — לעולם אינו כותב',
   '["customer.read","sales.read","service.read"]'::jsonb)
on conflict (id) do nothing;

-- ============================================================================
-- ===== EVERYTHING BELOW IS DEMO DATA — STAGING/LOCAL ONLY ===================
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Two demo tenants (org A + org B) for cross-org isolation tests.
-- Note the staging-labelled ids (NOT "org-teragon").
-- ----------------------------------------------------------------------------
insert into public.organizations (id, name, type, city, status) values
  ('org-staging-demo', 'Teragon Staging Demo (org A)', 'עסק', 'תל אביב', 'פעיל'),
  ('org-staging-beta', 'Teragon Staging Beta (org B)', 'עסק', 'חיפה',   'פעיל')
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- Demo auth.users (identity is owned by Supabase auth). Fixed uuids so profiles
-- and the RLS tests can reference them deterministically.
--   a1 = sales / org A / active
--   b1 = sales / org B / active
--   c1 = viewer / org A / INACTIVE (active=false) — inactive-denial fixture
--   d1 = sysadmin / org A / active — admin fixture
-- ----------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'sales.a@staging.local',  now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000b1', 'authenticated', 'authenticated', 'sales.b@staging.local',  now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000c1', 'authenticated', 'authenticated', 'viewer.c@staging.local', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000d1', 'authenticated', 'authenticated', 'admin.d@staging.local',  now(), now())
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- Demo profiles (application identity) — org + role + active state.
-- ----------------------------------------------------------------------------
insert into public.profiles (id, organization_id, role_id, name, email, active, status) values
  ('00000000-0000-0000-0000-0000000000a1', 'org-staging-demo', 'crole-sales',    'Sales A',  'sales.a@staging.local',  true,  'פעיל'),
  ('00000000-0000-0000-0000-0000000000b1', 'org-staging-beta', 'crole-sales',    'Sales B',  'sales.b@staging.local',  true,  'פעיל'),
  ('00000000-0000-0000-0000-0000000000c1', 'org-staging-demo', 'crole-viewer',   'Viewer C', 'viewer.c@staging.local', false, 'לא פעיל'),
  ('00000000-0000-0000-0000-0000000000d1', 'org-staging-demo', 'crole-sysadmin', 'Admin D',  'admin.d@staging.local',  true,  'פעיל')
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- Demo memberships (profile <-> org, effective role).
-- ----------------------------------------------------------------------------
insert into public.memberships (id, organization_id, profile_id, role_id, active) values
  ('mem-staging-a1', 'org-staging-demo', '00000000-0000-0000-0000-0000000000a1', 'crole-sales',    true),
  ('mem-staging-b1', 'org-staging-beta', '00000000-0000-0000-0000-0000000000b1', 'crole-sales',    true),
  ('mem-staging-c1', 'org-staging-demo', '00000000-0000-0000-0000-0000000000c1', 'crole-viewer',   false),
  ('mem-staging-d1', 'org-staging-demo', '00000000-0000-0000-0000-0000000000d1', 'crole-sysadmin', true)
on conflict (organization_id, profile_id) do nothing;

-- ----------------------------------------------------------------------------
-- Demo business rows. org A has 2 customers, org B has 1 (aggregate-leakage
-- test asserts org A member counts exactly 2).
-- ----------------------------------------------------------------------------
insert into public.customers (id, organization_id, name, type, city, status) values
  ('cust-a1', 'org-staging-demo', 'לקוח א1', 'עסק',   'תל אביב', 'פעיל'),
  ('cust-a2', 'org-staging-demo', 'לקוח א2', 'פרטי',  'רמת גן',  'פעיל'),
  ('cust-b1', 'org-staging-beta', 'לקוח ב1', 'עסק',   'חיפה',    'פעיל')
on conflict (id) do nothing;

insert into public.leads (id, organization_id, name, source, interest, status, owner_id) values
  ('lead-a1', 'org-staging-demo', 'ליד א1', 'אתר', 'מדפסת', 'חדש', '00000000-0000-0000-0000-0000000000a1'),
  ('lead-b1', 'org-staging-beta', 'ליד ב1', 'אתר', 'קורס',  'חדש', '00000000-0000-0000-0000-0000000000b1')
on conflict (id) do nothing;

insert into public.service_tickets (id, organization_id, customer_name, customer_id, issue, priority, status, opened_at, owner_id) values
  ('st-a1', 'org-staging-demo', 'לקוח א1', 'cust-a1', 'לא מדפיס', 'בינונית', 'חדש', current_date, '00000000-0000-0000-0000-0000000000a1')
on conflict (id) do nothing;

insert into public.products (id, organization_id, name, category, price, active) values
  ('prod-a1', 'org-staging-demo', 'מדפסת FDM דמו', 'מדפסת', 4990, true)
on conflict (id) do nothing;
