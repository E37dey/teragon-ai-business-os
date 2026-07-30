-- ============================================================================
-- 003_crm.sql — TERAGON AI BUSINESS OS
-- CRM / sales: customers, contacts, leads, opportunities, quotations.
-- Additive only. RLS enabled deny-by-default; policies are Gate S3.
-- Every tenant table: organization_id text not null references organizations(id).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- customers (domain: Customer)
-- ----------------------------------------------------------------------------
create table customers (
  id               text primary key,
  organization_id  text not null references organizations(id),
  name             text not null,
  type             customer_type,
  phone            text not null default '',
  email            text not null default '',
  city             text not null default '',
  -- domain organizationId: optional owning org the customer belongs to.
  -- Distinct from the tenant organization_id above.
  owning_org_id    text references organizations(id),
  printer_summary  text not null default '',
  course_names     jsonb not null default '[]'::jsonb,
  revenue          numeric(14,2) not null default 0 check (revenue >= 0),
  contact_state    text not null default 'פעיל'
                     check (contact_state in ('פעיל', 'ממתין למענה', 'לא פעיל')),
  review           jsonb,  -- { rating: 1..5, text } | null
  status           entity_status default 'פעיל',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table customers is 'domain: Customer. policies: see 012_rls_policies.sql';
comment on column customers.owning_org_id is
  'domain Customer.organizationId — optional owning organization (NOT the tenant column).';

create trigger trg_customers_updated_at
  before update on customers for each row execute function set_updated_at();
alter table customers enable row level security;
-- policies: see 012_rls_policies.sql

-- ----------------------------------------------------------------------------
-- contacts (domain: Contact)
-- ----------------------------------------------------------------------------
create table contacts (
  id               text primary key,
  organization_id  text not null references organizations(id),
  customer_id      text not null references customers(id),
  name             text not null,
  role             text not null default '',
  phone            text not null default '',
  email            text not null default '',
  is_primary       boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table contacts is 'domain: Contact. policies: see 012_rls_policies.sql';

create trigger trg_contacts_updated_at
  before update on contacts for each row execute function set_updated_at();
alter table contacts enable row level security;
-- policies: see 012_rls_policies.sql

-- ----------------------------------------------------------------------------
-- leads (domain: Lead). history[] (LeadHistoryEntry) embedded as JSONB.
-- ----------------------------------------------------------------------------
create table leads (
  id               text primary key,
  organization_id  text not null references organizations(id),
  name             text not null,
  phone            text not null default '',
  email            text not null default '',
  source           text not null default '',
  interest         text not null default '',
  status           text not null
                     check (status in ('חדש', 'נוצר קשר', 'קיבל פרטים', 'ממתין לתשובה',
                                       'נשלחה הצעה', 'במשא ומתן', 'נסגר כלקוח', 'לא רלוונטי')),
  owner_id         uuid not null references profiles(id),
  follow_up        date,
  notes            text not null default '',
  history          jsonb not null default '[]'::jsonb,  -- LeadHistoryEntry[]
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table leads is 'domain: Lead. history[] embedded JSONB. policies: see 012_rls_policies.sql';

create trigger trg_leads_updated_at
  before update on leads for each row execute function set_updated_at();
alter table leads enable row level security;
-- policies: see 012_rls_policies.sql

-- ----------------------------------------------------------------------------
-- opportunities (domain: Opportunity)
-- ----------------------------------------------------------------------------
create table opportunities (
  id               text primary key,
  organization_id  text not null references organizations(id),
  name             text not null,
  lead_id          text references leads(id),
  customer_id      text references customers(id),
  stage            text not null
                     check (stage in ('זיהוי', 'אפיון צרכים', 'הצעה', 'משא ומתן',
                                      'נסגרה - זכייה', 'נסגרה - הפסד')),
  amount           numeric(14,2) not null default 0 check (amount >= 0),
  expected_close   date,
  owner_id         uuid not null references profiles(id),
  notes            text not null default '',
  -- Wave 6 m003 — fine journey step ("j1".."j10"); null => derived from stage.
  journey_step_id  text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table opportunities is 'domain: Opportunity. policies: see 012_rls_policies.sql';

create trigger trg_opportunities_updated_at
  before update on opportunities for each row execute function set_updated_at();
alter table opportunities enable row level security;
-- policies: see 012_rls_policies.sql

-- ----------------------------------------------------------------------------
-- quotations (domain: Quotation). lines[] (QuotationLine) embedded as JSONB.
-- version integer (Wave 6 m004 — edit counter, starts at 1).
-- ----------------------------------------------------------------------------
create table quotations (
  id               text primary key,
  organization_id  text not null references organizations(id),
  customer_name    text not null,
  customer_id      text references customers(id),
  title            text not null,
  lines            jsonb not null default '[]'::jsonb,  -- QuotationLine[]
  discount_percent numeric(5,2) not null default 0
                     check (discount_percent >= 0 and discount_percent <= 100),
  terms            text not null default '',
  valid_until      date,
  status           text not null
                     check (status in ('טיוטה', 'נשלחה', 'אושרה', 'נדחתה', 'פג תוקף')),
  owner_id         uuid not null references profiles(id),
  version          integer not null default 1 check (version >= 1),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table quotations is
  'domain: Quotation. lines[] embedded JSONB; version = edit counter (Wave 6 m004). policies: see 012_rls_policies.sql';

create trigger trg_quotations_updated_at
  before update on quotations for each row execute function set_updated_at();
alter table quotations enable row level security;
-- policies: see 012_rls_policies.sql
