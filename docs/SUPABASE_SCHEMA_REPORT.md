# TERAGON — Supabase Schema Report (Gate S2)

Version-controlled PostgreSQL schema for the Teragon platform, authored from the **actual** domain model
(`src/domain/types.ts` / `schemas.ts`), not a generic template. Additive-only, deterministically ordered,
tenant-isolated. **No destructive operations** anywhere (verified). Every table is `enable row level
security` (deny-by-default; policies in Gate S3).

## Migrations (`supabase/migrations/`, deterministic order)

| File | Domain |
|------|--------|
| `config.toml` | Supabase project skeleton (`project_id = teragon`, `[db] major_version = 15`) |
| `001_foundation.sql` | `organizations` (tenant root), `set_updated_at()` trigger fn, cross-domain CHECK domains |
| `002_identity_membership.sql` | `profiles` (uuid PK → `auth.users`), `roles` (global crole-* catalog), `memberships` |
| `003_crm.sql` | customers, contacts, leads, opportunities, quotations |
| `004_products_printers.sql` | products, printer_models, customer_printers |
| `005_service_repairs.sql` | service_tickets (Phase-9 `customer_printer_id`+`fault_category`), repair_actions |
| `006_training.sql` | courses, learning_paths, students, enrollments, course_sessions, assignments |
| `007_tasks_approvals.sql` | tasks (Phase-9 `source_recommendation_id`), approvals |
| `008_knowledge_memory_learning.sql` | knowledge_notes, documents, memory_records |
| `009_governance_audit.sql` | agents/agent_*, ai_recommendations, evidence, audit_events (append-only), automations(+runs), metrics, risks, controls, personas, training_materials, stage_gates, implementation_stages, support_requests, meetings, activities, app_notifications |
| `010_indexes.sql` | indexes for every `organization_id`, every FK, and common filters (status/dates/owner) |

**47 tables · 45 with `organization_id text not null references organizations(id)`** (only `organizations`
[root] and `roles` [global] omit it, by design). Every table carries `created_at`/`updated_at` (+trigger);
`quotations` carries `version integer`.

## Design decisions

- **PK strategy: `text` primary keys** preserving the app's deterministic ids (`org-1`, `cu-1`, `t-1`).
  **Exception:** `profiles.id uuid references auth.users(id)`; all user-reference columns (`owner_id`,
  `decided_by_id`, `assignee_id`, …) are `uuid references profiles(id)`.
- **Tenant column type** is `text` (matches the text FK target), non-null on every tenant table.
- **StageProgress → EMBEDDED JSONB** on `enrollments.stages` (a value object with no id/timestamps/collection).
  Other value-object lists (`leads.history`, `quotations.lines`, `learning_paths.stages`,
  `course_sessions.attendance`, `agents.limits`, id-arrays) are EMBEDDED JSONB on their parent aggregate.
- **Polymorphic refs** (`subject_ref`, `entity_ref`, `related_ref`, `audit_events.actor`, …) are plain
  `text`, no FK (actor may be user/agent/system).
- **`audit_events`** append-only (immutability enforced by RLS in S3 — no update/delete policy).
- **CHECK constraints** mirror the domain unions exactly (Hebrew/English literals). Cross-domain unions are
  `CREATE DOMAIN`s (`entity_status` פעיל/לא פעיל/בארכיון, `customer_type`, `ticket_priority`); per-table
  status/lifecycle unions are inline CHECKs. Additive Phase-9/Wave-6 fields use `col is null or col in (…)`
  so legacy rows validate.

## 46-entity disposition (+ StageProgress) — nothing disappears silently

**All 46 typed `extends BaseEntity` entities → MIGRATED** (own table); **StageProgress → EMBEDDED** (JSONB on
`enrollments`). Full mapping:

Organization→`organizations` · User→`profiles` · Role→`roles` · Customer→`customers` · Contact→`contacts` ·
Lead→`leads` · Opportunity→`opportunities` · Quotation→`quotations` · Product→`products` ·
PrinterModel→`printer_models` · CustomerPrinter→`customer_printers` · Course→`courses` ·
LearningPath→`learning_paths` · Student→`students` · Enrollment→`enrollments` · CourseSession→`course_sessions` ·
Assignment→`assignments` · ServiceTicket→`service_tickets` · RepairAction→`repair_actions` · Task→`tasks` ·
Meeting→`meetings` · Activity→`activities` · Document→`documents` · KnowledgeNote→`knowledge_notes` ·
MemoryRecord→`memory_records` · Automation→`automations` · AutomationRun→`automation_runs` · Agent→`agents` ·
AgentTask→`agent_tasks` · AgentMessage→`agent_messages` · AgentHandoff→`agent_handoffs` ·
AgentConflict→`agent_conflicts` · AIRecommendation→`ai_recommendations` · Evidence→`evidence` ·
Approval→`approvals` · AuditEvent→`audit_events` · MetricDefinition→`metric_definitions` ·
MetricObservation→`metric_observations` · Risk→`risks` · Control→`controls` · Persona→`personas` ·
TrainingMaterial→`training_materials` · ImplementationStage→`implementation_stages` · StageGate→`stage_gates` ·
SupportRequest→`support_requests` · AppNotification→`app_notifications`.

**DEFERRED (documented, not silent):** untyped Wave-6/7/8 IndexedDB stores in `collections.ts` that are NOT
`interface … extends BaseEntity` (e.g. `knowledgeArticles`, `memoryProposals`, `learningRules`,
`implementationProgrammes`, `submissionPackages`, `governancePolicies`, `agentRuns`/`agentEvents`, `meta`) —
added in a later migration once their types are formalized. No entity is **LOCAL_ONLY** or **DERIVED** in
this cut.

Live `db lint` / `db reset` validation is Gate S5 (requires local Docker/Postgres).
