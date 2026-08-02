-- ============================================================================
-- 002_identity_membership.sql — TERAGON AI BUSINESS OS
-- Identity & membership: roles (global), profiles (auth-linked), memberships.
-- Additive only. RLS enabled deny-by-default; policies + seed are Gate S3.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- roles — canonical, GLOBAL reference table (shared across all tenants), so it
-- has NO organization_id. TEXT PK holds the canonical crole-* ids. The row set
-- itself (sysadmin/ceo/bizmgr/sales/service/instructor/champion/auditor/viewer
-- with their permission arrays) is SEEDED in Gate S3 (014_seed.sql).
--
-- Canonical ids expected by the platform:
--   crole-sysadmin   — full system administration
--   crole-ceo        — executive; approves sensitive AI actions
--   crole-bizmgr     — business / operations manager
--   crole-sales      — leads, quotations, customers
--   crole-service    — service tickets, repairs
--   crole-instructor — courses, students, stage approvals
--   crole-champion   — adoption champion (implementation programme)
--   crole-auditor    — read + audit log / evidence
--   crole-viewer     — read-only
-- ----------------------------------------------------------------------------
create table roles (
  id           text primary key,
  key          text not null,
  label        text not null default '',
  description  text not null default '',
  permissions  jsonb not null default '[]'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table roles is
  'Canonical global role catalog (domain: Role). No organization_id — shared across tenants. Rows seeded in Gate S3. policies: see 012_rls_policies.sql';

create trigger trg_roles_updated_at
  before update on roles
  for each row execute function set_updated_at();

alter table roles enable row level security;
-- policies: see 012_rls_policies.sql

-- ----------------------------------------------------------------------------
-- profiles — application identity (domain: User). EXCEPTION to the text-PK rule:
-- id is a uuid FK to auth.users(id) (identity is owned by Supabase auth).
-- Carries organization_id (tenant anchor) + role_id.
-- ----------------------------------------------------------------------------
create table profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  organization_id  text not null references organizations(id),
  role_id          text not null references roles(id),
  name             text not null default '',
  email            text not null default '',
  phone            text not null default '',
  active           boolean not null default true,
  status           entity_status default 'פעיל',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table profiles is
  'Application identity (domain: User). id = auth.users(id) uuid (the one PK exception). policies: see 012_rls_policies.sql';

create trigger trg_profiles_updated_at
  before update on profiles
  for each row execute function set_updated_at();

alter table profiles enable row level security;
-- policies: see 012_rls_policies.sql

-- ----------------------------------------------------------------------------
-- memberships — profile <-> organization link (carries the effective role in
-- that org). Supports a profile belonging to multiple tenants over time.
-- ----------------------------------------------------------------------------
create table memberships (
  id               text primary key,
  organization_id  text not null references organizations(id),
  profile_id       uuid not null references profiles(id) on delete cascade,
  role_id          text not null references roles(id),
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, profile_id)
);

comment on table memberships is
  'Profile<->organization membership with effective role. policies: see 012_rls_policies.sql';

create trigger trg_memberships_updated_at
  before update on memberships
  for each row execute function set_updated_at();

alter table memberships enable row level security;
-- policies: see 012_rls_policies.sql
