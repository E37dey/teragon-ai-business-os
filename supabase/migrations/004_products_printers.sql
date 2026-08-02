-- ============================================================================
-- 004_products_printers.sql — TERAGON AI BUSINESS OS
-- Catalog & installed base: products, printer_models, customer_printers.
-- Additive only. RLS enabled deny-by-default; policies are Gate S3.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- products (domain: Product)
-- ----------------------------------------------------------------------------
create table products (
  id               text primary key,
  organization_id  text not null references organizations(id),
  name             text not null,
  category         text not null
                     check (category in ('קורס', 'מדפסת', 'שירות', 'חומר גלם', 'אחר')),
  description      text not null default '',
  price            numeric(14,2) not null default 0 check (price >= 0),
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table products is 'domain: Product. policies: see 012_rls_policies.sql';

create trigger trg_products_updated_at
  before update on products for each row execute function set_updated_at();
alter table products enable row level security;
-- policies: see 012_rls_policies.sql

-- ----------------------------------------------------------------------------
-- printer_models (domain: PrinterModel). tags[] embedded as JSONB.
-- ----------------------------------------------------------------------------
create table printer_models (
  id               text primary key,
  organization_id  text not null references organizations(id),
  name             text not null,
  manufacturer     text not null default '',
  technology       text not null check (technology in ('FDM', 'רזין')),
  price            numeric(14,2) not null default 0 check (price >= 0),
  tags             jsonb not null default '[]'::jsonb,
  note             text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table printer_models is 'domain: PrinterModel. policies: see 012_rls_policies.sql';

create trigger trg_printer_models_updated_at
  before update on printer_models for each row execute function set_updated_at();
alter table printer_models enable row level security;
-- policies: see 012_rls_policies.sql

-- ----------------------------------------------------------------------------
-- customer_printers (domain: CustomerPrinter) — a printer a customer owns.
-- ----------------------------------------------------------------------------
create table customer_printers (
  id                        text primary key,
  organization_id           text not null references organizations(id),
  customer_id               text not null references customers(id),
  printer_model_id          text not null references printer_models(id),
  serial_number             text not null default '',
  purchased_at              date,
  under_warranty            boolean not null default false,
  notes                     text not null default '',
  -- Wave 6 m007 — null = unknown (module policy derivation stays the fallback).
  warranty_until            date,
  last_maintenance_at       date,
  maintenance_interval_days integer check (maintenance_interval_days is null or maintenance_interval_days >= 0),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

comment on table customer_printers is 'domain: CustomerPrinter. policies: see 012_rls_policies.sql';

create trigger trg_customer_printers_updated_at
  before update on customer_printers for each row execute function set_updated_at();
alter table customer_printers enable row level security;
-- policies: see 012_rls_policies.sql
