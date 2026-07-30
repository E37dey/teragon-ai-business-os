-- ============================================================================
-- 010_indexes.sql — TERAGON AI BUSINESS OS
-- Indexes: every organization_id, every foreign key, and common filter columns
-- (status/lifecycle, dates, owner_id). Additive only.
-- ============================================================================

-- identity & membership
create index idx_profiles_organization_id      on profiles (organization_id);
create index idx_profiles_role_id              on profiles (role_id);
create index idx_profiles_active               on profiles (active);
create index idx_memberships_organization_id   on memberships (organization_id);
create index idx_memberships_profile_id        on memberships (profile_id);
create index idx_memberships_role_id           on memberships (role_id);

-- crm
create index idx_customers_organization_id     on customers (organization_id);
create index idx_customers_owning_org_id       on customers (owning_org_id);
create index idx_customers_status              on customers (status);
create index idx_customers_type                on customers (type);
create index idx_contacts_organization_id      on contacts (organization_id);
create index idx_contacts_customer_id          on contacts (customer_id);
create index idx_leads_organization_id         on leads (organization_id);
create index idx_leads_owner_id                on leads (owner_id);
create index idx_leads_status                  on leads (status);
create index idx_leads_follow_up               on leads (follow_up);
create index idx_opportunities_organization_id on opportunities (organization_id);
create index idx_opportunities_lead_id         on opportunities (lead_id);
create index idx_opportunities_customer_id     on opportunities (customer_id);
create index idx_opportunities_owner_id        on opportunities (owner_id);
create index idx_opportunities_stage           on opportunities (stage);
create index idx_opportunities_expected_close  on opportunities (expected_close);
create index idx_quotations_organization_id    on quotations (organization_id);
create index idx_quotations_customer_id        on quotations (customer_id);
create index idx_quotations_owner_id           on quotations (owner_id);
create index idx_quotations_status             on quotations (status);
create index idx_quotations_valid_until        on quotations (valid_until);

-- products & printers
create index idx_products_organization_id          on products (organization_id);
create index idx_products_category                 on products (category);
create index idx_products_active                   on products (active);
create index idx_printer_models_organization_id    on printer_models (organization_id);
create index idx_printer_models_technology         on printer_models (technology);
create index idx_customer_printers_organization_id on customer_printers (organization_id);
create index idx_customer_printers_customer_id     on customer_printers (customer_id);
create index idx_customer_printers_model_id        on customer_printers (printer_model_id);
create index idx_customer_printers_warranty_until  on customer_printers (warranty_until);

-- service & repairs
create index idx_service_tickets_organization_id     on service_tickets (organization_id);
create index idx_service_tickets_customer_id         on service_tickets (customer_id);
create index idx_service_tickets_customer_printer_id on service_tickets (customer_printer_id);
create index idx_service_tickets_owner_id            on service_tickets (owner_id);
create index idx_service_tickets_status              on service_tickets (status);
create index idx_service_tickets_priority            on service_tickets (priority);
create index idx_service_tickets_fault_category      on service_tickets (fault_category);
create index idx_service_tickets_opened_at           on service_tickets (opened_at);
create index idx_repair_actions_organization_id      on repair_actions (organization_id);
create index idx_repair_actions_ticket_id            on repair_actions (ticket_id);
create index idx_repair_actions_performed_by_id      on repair_actions (performed_by_id);
create index idx_repair_actions_performed_at         on repair_actions (performed_at);

-- training
create index idx_courses_organization_id          on courses (organization_id);
create index idx_courses_instructor_id            on courses (instructor_id);
create index idx_courses_status                   on courses (status);
create index idx_courses_start_date               on courses (start_date);
create index idx_learning_paths_organization_id   on learning_paths (organization_id);
create index idx_learning_paths_course_id         on learning_paths (course_id);
create index idx_students_organization_id         on students (organization_id);
create index idx_students_user_id                 on students (user_id);
create index idx_students_status                  on students (status);
create index idx_enrollments_organization_id      on enrollments (organization_id);
create index idx_enrollments_student_id           on enrollments (student_id);
create index idx_enrollments_course_id            on enrollments (course_id);
create index idx_enrollments_payment              on enrollments (payment);
create index idx_course_sessions_organization_id  on course_sessions (organization_id);
create index idx_course_sessions_course_id        on course_sessions (course_id);
create index idx_course_sessions_scheduled_at     on course_sessions (scheduled_at);
create index idx_assignments_organization_id      on assignments (organization_id);
create index idx_assignments_course_id            on assignments (course_id);
create index idx_assignments_due                  on assignments (due);

-- tasks & approvals
create index idx_tasks_organization_id            on tasks (organization_id);
create index idx_tasks_owner_id                   on tasks (owner_id);
create index idx_tasks_status                     on tasks (status);
create index idx_tasks_work_state                 on tasks (work_state);
create index idx_tasks_due                        on tasks (due);
create index idx_tasks_source_recommendation_id   on tasks (source_recommendation_id);
create index idx_approvals_organization_id        on approvals (organization_id);
create index idx_approvals_requested_by_id        on approvals (requested_by_id);
create index idx_approvals_decided_by_id          on approvals (decided_by_id);
create index idx_approvals_status                 on approvals (status);

-- knowledge & memory
create index idx_knowledge_notes_organization_id  on knowledge_notes (organization_id);
create index idx_knowledge_notes_approved         on knowledge_notes (approved);
create index idx_documents_organization_id        on documents (organization_id);
create index idx_documents_course_id              on documents (course_id);
create index idx_documents_customer_id            on documents (customer_id);
create index idx_documents_owner_id               on documents (owner_id);
create index idx_memory_records_organization_id   on memory_records (organization_id);

-- agents
create index idx_agents_organization_id           on agents (organization_id);
create index idx_agents_status                     on agents (status);
create index idx_agent_tasks_organization_id       on agent_tasks (organization_id);
create index idx_agent_tasks_agent_id              on agent_tasks (agent_id);
create index idx_agent_tasks_approval_id           on agent_tasks (approval_id);
create index idx_agent_tasks_status                on agent_tasks (status);
create index idx_agent_messages_organization_id    on agent_messages (organization_id);
create index idx_agent_messages_task_id            on agent_messages (task_id);
create index idx_agent_messages_from_agent_id      on agent_messages (from_agent_id);
create index idx_agent_messages_to_agent_id        on agent_messages (to_agent_id);
create index idx_agent_handoffs_organization_id    on agent_handoffs (organization_id);
create index idx_agent_handoffs_task_id            on agent_handoffs (task_id);
create index idx_agent_handoffs_from_agent_id      on agent_handoffs (from_agent_id);
create index idx_agent_handoffs_to_agent_id        on agent_handoffs (to_agent_id);
create index idx_agent_conflicts_organization_id   on agent_conflicts (organization_id);
create index idx_agent_conflicts_task_id           on agent_conflicts (task_id);
create index idx_agent_conflicts_resolved_by_id    on agent_conflicts (resolved_by_id);
create index idx_ai_recommendations_organization_id on ai_recommendations (organization_id);
create index idx_ai_recommendations_agent_id        on ai_recommendations (agent_id);
create index idx_ai_recommendations_approval_id     on ai_recommendations (approval_id);
create index idx_evidence_organization_id           on evidence (organization_id);
create index idx_evidence_subject_ref               on evidence (subject_ref);

-- audit
create index idx_audit_events_organization_id      on audit_events (organization_id);
create index idx_audit_events_actor                on audit_events (actor);
create index idx_audit_events_at                   on audit_events (at);
create index idx_audit_events_correlation_id       on audit_events (correlation_id);
create index idx_audit_events_entity_ref           on audit_events (entity_ref);

-- automations
create index idx_automations_organization_id       on automations (organization_id);
create index idx_automations_enabled               on automations (enabled);
create index idx_automation_runs_organization_id   on automation_runs (organization_id);
create index idx_automation_runs_automation_id     on automation_runs (automation_id);
create index idx_automation_runs_outcome           on automation_runs (outcome);
create index idx_automation_runs_started_at        on automation_runs (started_at);

-- metrics & governance
create index idx_metric_definitions_organization_id  on metric_definitions (organization_id);
create index idx_metric_definitions_key              on metric_definitions (key);
create index idx_metric_definitions_level            on metric_definitions (level);
create index idx_metric_observations_organization_id on metric_observations (organization_id);
create index idx_metric_observations_metric_key      on metric_observations (metric_key);
create index idx_metric_observations_observed_at     on metric_observations (observed_at);
create index idx_risks_organization_id               on risks (organization_id);
create index idx_risks_owner_id                      on risks (owner_id);
create index idx_risks_status                        on risks (status);
create index idx_risks_severity                      on risks (severity);
create index idx_controls_organization_id            on controls (organization_id);
create index idx_controls_implemented                on controls (implemented);

-- adoption / implementation
create index idx_personas_organization_id                on personas (organization_id);
create index idx_training_materials_organization_id      on training_materials (organization_id);
create index idx_training_materials_stage_id             on training_materials (stage_id);
create index idx_stage_gates_organization_id             on stage_gates (organization_id);
create index idx_stage_gates_status                      on stage_gates (status);
create index idx_implementation_stages_organization_id   on implementation_stages (organization_id);
create index idx_implementation_stages_gate_id           on implementation_stages (gate_id);
create index idx_implementation_stages_status            on implementation_stages (status);
create index idx_support_requests_organization_id        on support_requests (organization_id);
create index idx_support_requests_requester_id           on support_requests (requester_id);
create index idx_support_requests_assignee_id            on support_requests (assignee_id);
create index idx_support_requests_status                 on support_requests (status);
create index idx_support_requests_priority               on support_requests (priority);

-- comms
create index idx_meetings_organization_id            on meetings (organization_id);
create index idx_meetings_scheduled_at               on meetings (scheduled_at);
create index idx_activities_organization_id          on activities (organization_id);
create index idx_activities_actor_id                 on activities (actor_id);
create index idx_activities_at                       on activities (at);
create index idx_app_notifications_organization_id   on app_notifications (organization_id);
create index idx_app_notifications_owner_id          on app_notifications (owner_id);
create index idx_app_notifications_read              on app_notifications (read);
create index idx_app_notifications_category          on app_notifications (category);
create index idx_app_notifications_severity          on app_notifications (severity);
