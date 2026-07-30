-- ============================================================================
-- 007_tasks_approvals.sql — TERAGON AI BUSINESS OS
-- Work management: tasks (incl. Phase-9 source_recommendation_id), approvals.
-- Additive only. RLS enabled deny-by-default; policies are Gate S3.
--
-- NOTE on the tasks -> ai_recommendations FK: ai_recommendations is created in
-- 009. source_recommendation_id is therefore left as a plain (indexed) text
-- column with NO db-level FK, to preserve the deterministic 001..010 ordering
-- without a forward reference. The rec<->task link is canonical-id based only
-- (never matched by title/text), exactly as the domain specifies.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- tasks (domain: Task)
-- ----------------------------------------------------------------------------
create table tasks (
  id                        text primary key,
  organization_id           text not null references organizations(id),
  title                     text not null,
  description               text not null default '',
  status                    text not null
                              check (status in ('פתוחה', 'בתהליך', 'הושלמה', 'בוטלה')),
  priority                  ticket_priority,
  due                       date,
  owner_id                  uuid not null references profiles(id),
  -- "customer:cu-3" style entity ref, or null (polymorphic — no FK).
  related_ref               text,
  -- Wave 6 m001 — canonical operational board state; null => derived from status.
  work_state                text
                              check (work_state is null or work_state in (
                                'לביצוע', 'בביצוע', 'ממתין ללקוח',
                                'ממתין לאישור', 'חסום', 'הושלם')),
  -- Wave 6 m001 — canonical ownership; null => 'אנושית'.
  ownership                 text
                              check (ownership is null or ownership in ('אנושית', 'משותפת')),
  -- Wave 6 m001 — original description preserved for rollback.
  legacy_marker             text,
  -- Phase 9 (additive, optional) — canonical id of the source AIRecommendation.
  -- Null => not recommendation-generated. No FK (ai_recommendations is in 009).
  source_recommendation_id  text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

comment on table tasks is
  'domain: Task. Phase-9 source_recommendation_id links to AIRecommendation by canonical id (no FK — forward ref to 009). policies: see 012_rls_policies.sql';

create trigger trg_tasks_updated_at
  before update on tasks for each row execute function set_updated_at();
alter table tasks enable row level security;
-- policies: see 012_rls_policies.sql

-- ----------------------------------------------------------------------------
-- approvals (domain: Approval)
-- subjectRef is a polymorphic ref ("agent-task:at-1", ...) — no FK.
-- ----------------------------------------------------------------------------
create table approvals (
  id               text primary key,
  organization_id  text not null references organizations(id),
  subject_ref      text not null,
  requested_by_id  uuid not null references profiles(id),
  requested_at     timestamptz,
  status           text not null check (status in ('ממתין', 'אושר', 'נדחה')),
  decided_by_id    uuid references profiles(id),
  decided_at       timestamptz,
  note             text not null default '',
  -- Wave 6 m005 — persisted extended approval workflow state.
  extended_state   text
                     check (extended_state is null or extended_state in (
                       'pending', 'approved', 'edited', 'rejected', 'expired',
                       'cancelled', 'executed', 'execution-failed', 'rolled-back')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table approvals is
  'domain: Approval. subject_ref polymorphic (no FK). policies: see 012_rls_policies.sql';

create trigger trg_approvals_updated_at
  before update on approvals for each row execute function set_updated_at();
alter table approvals enable row level security;
-- policies: see 012_rls_policies.sql
