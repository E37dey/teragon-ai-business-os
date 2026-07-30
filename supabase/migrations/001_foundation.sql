-- ============================================================================
-- 001_foundation.sql — TERAGON AI BUSINESS OS
-- Foundation: organizations (tenant root), shared helpers, cross-domain enums.
-- Additive only. No drop/truncate/delete anywhere in this migration set.
-- ============================================================================
--
-- PK STRATEGY (whole platform): TEXT primary keys preserve the app's
--   deterministic domain ids ("org-1", "cu-1", "t-1", ...). The single
--   exception is profiles.id (uuid -> auth.users) — see 002. Because the PK is
--   text, every tenant table's tenant column is `organization_id text not null
--   references organizations(id)` (text, to match the text PK target — not uuid).
--   User-reference columns (owner_id, instructor_id, ...) are uuid -> profiles(id),
--   inheriting the profiles uuid exception.
--
-- ENUM STRATEGY: cross-domain lifecycle enums are modelled as CHECK-constrained
--   text DOMAINs here (common enums, reused across tables, mirror types.ts
--   literals exactly). Single-domain lifecycle enums use inline CHECK
--   constraints on their own table. No native ENUM types (keeps future values
--   additive without ALTER TYPE juggling).
--
-- RLS: every table enables row level security (deny-by-default). Policies,
--   storage, and seed are authored in Gate S3 (files 011-014).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- shared helper: updated_at trigger function
-- ----------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function set_updated_at() is
  'Sets updated_at = now() on every UPDATE. Attached to every table via a BEFORE UPDATE trigger.';

-- ----------------------------------------------------------------------------
-- cross-domain enums (CHECK-constrained text domains) — mirror src/domain/types.ts
-- ----------------------------------------------------------------------------

-- EntityStatus
create domain entity_status as text
  not null
  constraint entity_status_values
  check (value in ('פעיל', 'לא פעיל', 'בארכיון'));

-- CustomerType
create domain customer_type as text
  not null
  constraint customer_type_values
  check (value in ('פרטי', 'עסק', 'בית ספר', 'ארגון'));

-- TicketPriority (shared by service_tickets, tasks, support_requests)
create domain ticket_priority as text
  not null
  constraint ticket_priority_values
  check (value in ('גבוהה', 'בינונית', 'נמוכה'));

-- ----------------------------------------------------------------------------
-- organizations — the tenant root. Intentionally has NO organization_id
-- (it IS the tenant). TEXT PK preserves seed ids "org-1".."org-5".
-- ----------------------------------------------------------------------------
create table organizations (
  id          text primary key,
  name        text not null,
  type        customer_type,
  phone       text not null default '',
  email       text not null default '',
  city        text not null default '',
  notes       text not null default '',
  status      entity_status default 'פעיל',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table organizations is
  'Tenant root (domain: Organization). No organization_id by design — it is the tenant. policies: see 012_rls_policies.sql';

create trigger trg_organizations_updated_at
  before update on organizations
  for each row execute function set_updated_at();

alter table organizations enable row level security;
-- policies: see 012_rls_policies.sql
