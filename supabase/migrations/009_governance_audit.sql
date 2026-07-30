-- ============================================================================
-- 009_governance_audit.sql — TERAGON AI BUSINESS OS
-- Agents, governance, audit, metrics, adoption, comms.
-- Tables: agents, agent_tasks, agent_messages, agent_handoffs, agent_conflicts,
--   ai_recommendations, evidence, approvals(*see 007), audit_events, automations,
--   automation_runs, metric_definitions, metric_observations, risks, controls,
--   personas, training_materials, implementation_stages, stage_gates,
--   support_requests, app_notifications, meetings, activities.
-- Additive only. RLS enabled deny-by-default; policies are Gate S3.
--
-- Array-of-id fields (evidenceIds, controlIds, participantIds, allowedTools, ...)
-- are stored as JSONB arrays of ids — NOT as relational FKs — because the domain
-- treats them as ordered id lists on the parent aggregate.
-- Polymorphic ref fields (subjectRef, entityRef, relatedRef, actor, sourceRef)
-- are plain text with no FK.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- agents (domain: Agent). limits (AgentLimits) embedded as JSONB.
-- ----------------------------------------------------------------------------
create table agents (
  id                  text primary key,
  organization_id     text not null references organizations(id),
  name                text not null,
  purpose             text not null default '',
  allowed_tools       jsonb not null default '[]'::jsonb,
  allowed_domains     jsonb not null default '[]'::jsonb,
  prohibited_domains  jsonb not null default '[]'::jsonb,
  prompt_version      text not null default '',
  limits              jsonb not null default '{}'::jsonb,  -- AgentLimits
  status              text not null
                        check (status in ('פעיל', 'ממתין', 'דורש אישור', 'חסום', 'מושבת')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
comment on table agents is 'domain: Agent. limits embedded JSONB. policies: see 012_rls_policies.sql';
create trigger trg_agents_updated_at before update on agents for each row execute function set_updated_at();
alter table agents enable row level security;
-- policies: see 012_rls_policies.sql

-- ----------------------------------------------------------------------------
-- agent_tasks (domain: AgentTask). evidenceIds[] as JSONB.
-- ----------------------------------------------------------------------------
create table agent_tasks (
  id               text primary key,
  organization_id  text not null references organizations(id),
  agent_id         text not null references agents(id),
  title            text not null,
  description      text not null default '',
  status           text not null
                     check (status in ('בתור', 'רץ', 'ממתין לאישור', 'אושר',
                                       'נדחה', 'הושלם', 'נכשל')),
  evidence_ids     jsonb not null default '[]'::jsonb,
  approval_id      text references approvals(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table agent_tasks is 'domain: AgentTask. policies: see 012_rls_policies.sql';
create trigger trg_agent_tasks_updated_at before update on agent_tasks for each row execute function set_updated_at();
alter table agent_tasks enable row level security;
-- policies: see 012_rls_policies.sql

-- ----------------------------------------------------------------------------
-- agent_messages (domain: AgentMessage)
-- ----------------------------------------------------------------------------
create table agent_messages (
  id               text primary key,
  organization_id  text not null references organizations(id),
  task_id          text not null references agent_tasks(id),
  from_agent_id    text not null references agents(id),
  to_agent_id      text references agents(id),   -- null = broadcast
  role             text not null check (role in ('system', 'agent', 'human')),
  content          text not null,
  sent_at          timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table agent_messages is 'domain: AgentMessage. to_agent_id null = broadcast. policies: see 012_rls_policies.sql';
create trigger trg_agent_messages_updated_at before update on agent_messages for each row execute function set_updated_at();
alter table agent_messages enable row level security;
-- policies: see 012_rls_policies.sql

-- ----------------------------------------------------------------------------
-- agent_handoffs (domain: AgentHandoff)
-- ----------------------------------------------------------------------------
create table agent_handoffs (
  id               text primary key,
  organization_id  text not null references organizations(id),
  task_id          text not null references agent_tasks(id),
  from_agent_id    text not null references agents(id),
  to_agent_id      text not null references agents(id),
  reason           text not null default '',
  context_summary  text not null default '',
  at               timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table agent_handoffs is 'domain: AgentHandoff. policies: see 012_rls_policies.sql';
create trigger trg_agent_handoffs_updated_at before update on agent_handoffs for each row execute function set_updated_at();
alter table agent_handoffs enable row level security;
-- policies: see 012_rls_policies.sql

-- ----------------------------------------------------------------------------
-- agent_conflicts (domain: AgentConflict). agentIds[] as JSONB.
-- ----------------------------------------------------------------------------
create table agent_conflicts (
  id               text primary key,
  organization_id  text not null references organizations(id),
  task_id          text not null references agent_tasks(id),
  agent_ids        jsonb not null default '[]'::jsonb,
  description      text not null default '',
  resolution       text,
  resolved_by_id   uuid references profiles(id),
  resolved_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table agent_conflicts is 'domain: AgentConflict. policies: see 012_rls_policies.sql';
create trigger trg_agent_conflicts_updated_at before update on agent_conflicts for each row execute function set_updated_at();
alter table agent_conflicts enable row level security;
-- policies: see 012_rls_policies.sql

-- ----------------------------------------------------------------------------
-- ai_recommendations (domain: AIRecommendation). evidenceIds[] as JSONB.
-- ----------------------------------------------------------------------------
create table ai_recommendations (
  id                 text primary key,
  organization_id    text not null references organizations(id),
  agent_id           text not null references agents(id),
  title              text not null,
  reason             text not null default '',
  evidence_ids       jsonb not null default '[]'::jsonb,
  -- how confidence was derived — never an invented number; null => "טרם נמדד".
  confidence_method  text,
  next_action        text not null default '',
  approval_required  boolean not null default false,
  approval_id        text references approvals(id),
  entity_ref         text,   -- polymorphic, no FK
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
comment on table ai_recommendations is
  'domain: AIRecommendation. confidence_method null = טרם נמדד (never an invented number). policies: see 012_rls_policies.sql';
create trigger trg_ai_recommendations_updated_at before update on ai_recommendations for each row execute function set_updated_at();
alter table ai_recommendations enable row level security;
-- policies: see 012_rls_policies.sql

-- ----------------------------------------------------------------------------
-- evidence (domain: Evidence). subjectRef/sourceRef polymorphic (no FK).
-- ----------------------------------------------------------------------------
create table evidence (
  id               text primary key,
  organization_id  text not null references organizations(id),
  subject_ref      text not null,
  source_type      text not null check (source_type in ('entity', 'document', 'computation', 'external')),
  source_ref       text not null default '',
  claim            text not null,
  captured_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table evidence is 'domain: Evidence. policies: see 012_rls_policies.sql';
create trigger trg_evidence_updated_at before update on evidence for each row execute function set_updated_at();
alter table evidence enable row level security;
-- policies: see 012_rls_policies.sql

-- ----------------------------------------------------------------------------
-- audit_events (domain: AuditEvent) — APPEND-ONLY by design.
-- Immutability (no UPDATE/DELETE) is enforced by RLS policies in Gate S3
-- (only INSERT + SELECT granted). actor is polymorphic text (user/agent/system).
-- ----------------------------------------------------------------------------
create table audit_events (
  id               text primary key,
  organization_id  text not null references organizations(id),
  at               timestamptz,
  actor            text not null,          -- user id / agent id / "system"
  action           text not null,
  entity_ref       text,                    -- polymorphic, no FK
  details          text not null default '',
  correlation_id   text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table audit_events is
  'domain: AuditEvent. APPEND-ONLY — immutability enforced via INSERT/SELECT-only RLS in Gate S3. policies: see 012_rls_policies.sql';
create trigger trg_audit_events_updated_at before update on audit_events for each row execute function set_updated_at();
alter table audit_events enable row level security;
-- policies: see 012_rls_policies.sql

-- ----------------------------------------------------------------------------
-- automations (domain: Automation). steps[] as JSONB.
-- ----------------------------------------------------------------------------
create table automations (
  id                text primary key,
  organization_id   text not null references organizations(id),
  name              text not null,
  description       text not null default '',
  trigger           text not null,
  steps             jsonb not null default '[]'::jsonb,
  enabled           boolean not null default false,
  requires_approval boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
comment on table automations is 'domain: Automation. policies: see 012_rls_policies.sql';
create trigger trg_automations_updated_at before update on automations for each row execute function set_updated_at();
alter table automations enable row level security;
-- policies: see 012_rls_policies.sql

-- ----------------------------------------------------------------------------
-- automation_runs (domain: AutomationRun). stepsLog[] as JSONB.
-- ----------------------------------------------------------------------------
create table automation_runs (
  id               text primary key,
  organization_id  text not null references organizations(id),
  automation_id    text not null references automations(id),
  started_at       timestamptz,
  ended_at         timestamptz,
  outcome          text check (outcome is null or outcome in ('הצלחה', 'כישלון', 'בוטל')),
  steps_log        jsonb not null default '[]'::jsonb,
  triggered_by     text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table automation_runs is 'domain: AutomationRun. policies: see 012_rls_policies.sql';
create trigger trg_automation_runs_updated_at before update on automation_runs for each row execute function set_updated_at();
alter table automation_runs enable row level security;
-- policies: see 012_rls_policies.sql

-- ----------------------------------------------------------------------------
-- metric_definitions (domain: MetricDefinition)
-- ----------------------------------------------------------------------------
create table metric_definitions (
  id               text primary key,
  organization_id  text not null references organizations(id),
  key              text not null,
  name             text not null,
  level            text not null check (level in ('עסקי', 'תפעולי', 'AI')),
  description      text not null default '',
  unit             text not null default '',
  -- how the value is derived — a selector name, never a hardcoded number.
  derivation       text not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table metric_definitions is 'domain: MetricDefinition. policies: see 012_rls_policies.sql';
create trigger trg_metric_definitions_updated_at before update on metric_definitions for each row execute function set_updated_at();
alter table metric_definitions enable row level security;
-- policies: see 012_rls_policies.sql

-- ----------------------------------------------------------------------------
-- metric_observations (domain: MetricObservation). value null => "טרם נמדד".
-- metricKey references a MetricDefinition.key (business key, not id) — kept as
-- text to mirror the domain (definitions carry both id and key).
-- ----------------------------------------------------------------------------
create table metric_observations (
  id               text primary key,
  organization_id  text not null references organizations(id),
  metric_key       text not null,
  observed_at      timestamptz,
  value            numeric,   -- null => "טרם נמדד" (never invent a value)
  method           text not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table metric_observations is
  'domain: MetricObservation. value null = טרם נמדד. policies: see 012_rls_policies.sql';
create trigger trg_metric_observations_updated_at before update on metric_observations for each row execute function set_updated_at();
alter table metric_observations enable row level security;
-- policies: see 012_rls_policies.sql

-- ----------------------------------------------------------------------------
-- risks (domain: Risk). controlIds[] as JSONB.
-- ----------------------------------------------------------------------------
create table risks (
  id               text primary key,
  organization_id  text not null references organizations(id),
  title            text not null,
  description      text not null default '',
  severity         text not null check (severity in ('נמוכה', 'בינונית', 'גבוהה', 'קריטית')),
  control_ids      jsonb not null default '[]'::jsonb,
  owner_id         uuid not null references profiles(id),
  status           text not null check (status in ('פתוח', 'בטיפול', 'סגור')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table risks is 'domain: Risk. policies: see 012_rls_policies.sql';
create trigger trg_risks_updated_at before update on risks for each row execute function set_updated_at();
alter table risks enable row level security;
-- policies: see 012_rls_policies.sql

-- ----------------------------------------------------------------------------
-- controls (domain: Control). evidenceIds[] as JSONB.
-- ----------------------------------------------------------------------------
create table controls (
  id               text primary key,
  organization_id  text not null references organizations(id),
  name             text not null,
  description      text not null default '',
  kind             text not null default '',
  implemented      boolean not null default false,
  evidence_ids     jsonb not null default '[]'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table controls is 'domain: Control. policies: see 012_rls_policies.sql';
create trigger trg_controls_updated_at before update on controls for each row execute function set_updated_at();
alter table controls enable row level security;
-- policies: see 012_rls_policies.sql

-- ----------------------------------------------------------------------------
-- personas (domain: Persona). goals[]/painPoints[] as JSONB.
-- mappedRole references the UserRoleKey union (not a roles.id) — kept as text.
-- ----------------------------------------------------------------------------
create table personas (
  id               text primary key,
  organization_id  text not null references organizations(id),
  name             text not null,
  description      text not null default '',
  mapped_role      text check (mapped_role is null or mapped_role in (
                     'מנכ"ל', 'מכירות', 'מדריך', 'תמיכה', 'תלמיד', 'מנהל מערכת')),
  goals            jsonb not null default '[]'::jsonb,
  pain_points      jsonb not null default '[]'::jsonb,
  training_track   text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table personas is 'domain: Persona. policies: see 012_rls_policies.sql';
create trigger trg_personas_updated_at before update on personas for each row execute function set_updated_at();
alter table personas enable row level security;
-- policies: see 012_rls_policies.sql

-- ----------------------------------------------------------------------------
-- training_materials (domain: TrainingMaterial). audiencePersonaIds[] as JSONB.
-- ----------------------------------------------------------------------------
create table training_materials (
  id                   text primary key,
  organization_id      text not null references organizations(id),
  title                text not null,
  description          text not null default '',
  kind                 text not null default '',
  audience_persona_ids jsonb not null default '[]'::jsonb,
  url                  text,
  stage_id             text,   -- ImplementationStage id (soft ref)
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
comment on table training_materials is 'domain: TrainingMaterial. policies: see 012_rls_policies.sql';
create trigger trg_training_materials_updated_at before update on training_materials for each row execute function set_updated_at();
alter table training_materials enable row level security;
-- policies: see 012_rls_policies.sql

-- ----------------------------------------------------------------------------
-- stage_gates (domain: StageGate) — created before implementation_stages so the
-- implementation_stages.gate_id FK resolves. criteria[]/evidenceIds[] as JSONB.
-- ----------------------------------------------------------------------------
create table stage_gates (
  id               text primary key,
  organization_id  text not null references organizations(id),
  "order"          integer not null default 1 check ("order" >= 1),
  name             text not null,
  criteria         jsonb not null default '[]'::jsonb,
  evidence_ids     jsonb not null default '[]'::jsonb,
  status           text not null check (status in ('לא התחיל', 'בתהליך', 'עבר', 'נכשל')),
  decided_at       timestamptz,
  decided_by_id    uuid references profiles(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table stage_gates is 'domain: StageGate. policies: see 012_rls_policies.sql';
create trigger trg_stage_gates_updated_at before update on stage_gates for each row execute function set_updated_at();
alter table stage_gates enable row level security;
-- policies: see 012_rls_policies.sql

-- ----------------------------------------------------------------------------
-- implementation_stages (domain: ImplementationStage)
-- ----------------------------------------------------------------------------
create table implementation_stages (
  id               text primary key,
  organization_id  text not null references organizations(id),
  "order"          integer not null default 1 check ("order" >= 1),
  name             text not null,
  description      text not null default '',
  status           text not null check (status in ('לא התחיל', 'בתהליך', 'הושלם')),
  start_planned    date,
  end_planned      date,
  gate_id          text references stage_gates(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table implementation_stages is 'domain: ImplementationStage. policies: see 012_rls_policies.sql';
create trigger trg_implementation_stages_updated_at before update on implementation_stages for each row execute function set_updated_at();
alter table implementation_stages enable row level security;
-- policies: see 012_rls_policies.sql

-- ----------------------------------------------------------------------------
-- support_requests (domain: SupportRequest)
-- ----------------------------------------------------------------------------
create table support_requests (
  id               text primary key,
  organization_id  text not null references organizations(id),
  subject          text not null,
  description      text not null default '',
  requester_id     uuid not null references profiles(id),
  channel          text not null check (channel in ('מערכת', 'וואטסאפ', 'טלפון', 'מייל')),
  status           text not null check (status in ('פתוחה', 'בטיפול', 'נסגרה')),
  priority         ticket_priority,
  resolution       text not null default '',
  -- Wave 6 m002 additive fields.
  tier             integer check (tier is null or tier in (1, 2, 3)),
  assignee_id      uuid references profiles(id),
  category         text,
  feedback         text check (feedback is null or feedback in ('חיובי', 'שלילי')),
  legacy_marker    text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table support_requests is 'domain: SupportRequest. policies: see 012_rls_policies.sql';
create trigger trg_support_requests_updated_at before update on support_requests for each row execute function set_updated_at();
alter table support_requests enable row level security;
-- policies: see 012_rls_policies.sql

-- ----------------------------------------------------------------------------
-- meetings (domain: Meeting). participantIds[] as JSONB (user ids; no FK array).
-- ----------------------------------------------------------------------------
create table meetings (
  id               text primary key,
  organization_id  text not null references organizations(id),
  title            text not null,
  scheduled_at     timestamptz,
  duration_minutes integer not null default 0 check (duration_minutes >= 0),
  location         text not null default '',
  participant_ids  jsonb not null default '[]'::jsonb,
  agenda           text not null default '',
  related_ref      text,   -- polymorphic, no FK
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table meetings is 'domain: Meeting. policies: see 012_rls_policies.sql';
create trigger trg_meetings_updated_at before update on meetings for each row execute function set_updated_at();
alter table meetings enable row level security;
-- policies: see 012_rls_policies.sql

-- ----------------------------------------------------------------------------
-- activities (domain: Activity) — feed items. actorId/entityRef polymorphic.
-- actor_id kept as text (feed actor may be a user, an agent, or "system").
-- ----------------------------------------------------------------------------
create table activities (
  id               text primary key,
  organization_id  text not null references organizations(id),
  kind             text not null,
  text             text not null,
  actor_id         text not null,   -- polymorphic (user/agent/system), no FK
  entity_ref       text,             -- polymorphic, no FK
  at               timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table activities is 'domain: Activity. actor_id polymorphic (no FK). policies: see 012_rls_policies.sql';
create trigger trg_activities_updated_at before update on activities for each row execute function set_updated_at();
alter table activities enable row level security;
-- policies: see 012_rls_policies.sql

-- ----------------------------------------------------------------------------
-- app_notifications (domain: AppNotification, collection "notifications").
-- relatedEntity embedded as JSONB. ownerId nullable -> profiles.
-- ----------------------------------------------------------------------------
create table app_notifications (
  id               text primary key,
  organization_id  text not null references organizations(id),
  category         text not null check (category in (
                     'מכירות', 'משימות', 'שירות', 'מסמכים', 'למידה', 'סוכני AI', 'אוטומציות')),
  title            text not null,
  body             text not null default '',
  related_entity   jsonb not null default '{}'::jsonb,  -- NotificationRelatedEntity
  read             boolean not null default false,
  severity         text not null check (severity in ('מידע', 'אזהרה', 'דחוף')),
  owner_id         uuid references profiles(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table app_notifications is
  'domain: AppNotification (collection "notifications"). relatedEntity embedded JSONB. policies: see 012_rls_policies.sql';
create trigger trg_app_notifications_updated_at before update on app_notifications for each row execute function set_updated_at();
alter table app_notifications enable row level security;
-- policies: see 012_rls_policies.sql
