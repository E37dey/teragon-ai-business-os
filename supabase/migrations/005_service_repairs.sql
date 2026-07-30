-- ============================================================================
-- 005_service_repairs.sql — TERAGON AI BUSINESS OS
-- Service: service_tickets (incl. Phase-9 customer_printer_id + fault_category),
-- repair_actions.
-- Additive only. RLS enabled deny-by-default; policies are Gate S3.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- service_tickets (domain: ServiceTicket)
-- ----------------------------------------------------------------------------
create table service_tickets (
  id                  text primary key,
  organization_id     text not null references organizations(id),
  customer_name       text not null,
  customer_id         text references customers(id),
  printer             text not null default '',   -- free-text printer summary (legacy)
  issue               text not null,
  description         text not null default '',
  priority            ticket_priority,
  status              text not null
                        check (status in ('חדש', 'בבדיקה', 'ממתין ללקוח',
                                          'ממתין לחלק', 'טופל', 'נסגר')),
  opened_at           date,
  owner_id            uuid not null references profiles(id),
  solution            text not null default '',
  -- Wave 6 m007 — set for closed tickets; null = not closed / unknown.
  closed_at           date,
  -- Phase 9 (additive, optional) — canonical link to the specific CustomerPrinter.
  -- Null => not linked to a printer; cannot contribute to per-model recurrence.
  customer_printer_id text references customer_printers(id),
  -- Phase 9 (additive, optional) — typed fault classifier. Null => uncategorized.
  fault_category      text
                        check (fault_category is null or fault_category in (
                          'הידבקות שכבה ראשונה', 'סתימת אקסטרודר', 'כיול',
                          'תקלת חשמל', 'תוכנה', 'מכני', 'אחר')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table service_tickets is
  'domain: ServiceTicket. Phase-9 customer_printer_id + fault_category are additive/nullable. policies: see 012_rls_policies.sql';

create trigger trg_service_tickets_updated_at
  before update on service_tickets for each row execute function set_updated_at();
alter table service_tickets enable row level security;
-- policies: see 012_rls_policies.sql

-- ----------------------------------------------------------------------------
-- repair_actions (domain: RepairAction)
-- ----------------------------------------------------------------------------
create table repair_actions (
  id               text primary key,
  organization_id  text not null references organizations(id),
  ticket_id        text not null references service_tickets(id),
  description      text not null default '',
  performed_by_id  uuid not null references profiles(id),
  performed_at     date,
  parts_cost       numeric(14,2) not null default 0 check (parts_cost >= 0),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table repair_actions is 'domain: RepairAction. policies: see 012_rls_policies.sql';

create trigger trg_repair_actions_updated_at
  before update on repair_actions for each row execute function set_updated_at();
alter table repair_actions enable row level security;
-- policies: see 012_rls_policies.sql
