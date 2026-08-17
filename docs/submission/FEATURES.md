# TERAGON — Feature Summary

Organized by **business capability**. For each: **what it does**, **why it matters**, **who uses it**.

## Role-Based Experience
- **What:** A portal is derived from the user's canonical role and shows only the relevant modules, navigation, home, and search scope.
- **Why:** One system, many jobs — no user is drowned in features they don't need; access never escalates.
- **Who:** Everyone (Manager, Student, Technician; default operator = full).

### Manager Portal
- **What:** Decision-first home — governed OperationsBrief, pending approvals, KPI strip (approvals / open tasks / active runs), quick access to analytics, coordination, customers, automations.
- **Why:** Answers "what needs my attention?" in ~3 seconds; keeps leadership on decisions, not noise.
- **Who:** Business managers (`crole-bizmgr`). Broad, but **bizmgr ≠ sysadmin** — admin/system-health/settings stay denied.

### Student Portal
- **What:** Continue-learning hero (own enrollment + progress), stage-based "my tasks", Mentor, knowledge search, onboarding.
- **Why:** Answers "what should I do next?"; feels like a learning workspace, not a reduced admin console.
- **Who:** Learners (`crole-viewer`). Sees only their own learning records.

### Technician Portal
- **What:** Current priority job, assigned queue by priority, customer/job context, technical knowledge, the Fixer assistant, and status actions.
- **Why:** Answers "which job do I handle now?"; operational, not analytical.
- **Who:** Field/service staff (`crole-service`). Sees only their own assigned jobs.

## Customers & Contacts
- **What:** Real-time customer and contact management (the Supabase-backed, RLS-validated surface), with detail views.
- **Why:** The core operational record of the business; the one surface hardened to a real server boundary.
- **Who:** Managers, sales, service.

## Tasks
- **What:** Operational task tracking with owner/assignee scope; surfaced per portal (technician sees own).
- **Why:** Coordinates who does what; feeds the "what's open" signals.
- **Who:** Managers (all), technicians (own).

## Learning
- **What:** Enrollments, staged progress (approval-gated stages), course content, mentor.
- **Why:** Turns TERAGON into an LMS for onboarding/upskilling — inside the same governed workspace.
- **Who:** Students (own), instructors, managers.

## Knowledge & Memory
- **What:** Local memory records (notes/decisions/processes/lessons/agent-findings) with a governance layer (proposals, human-approved writes, immutable versions), plus the live Obsidian Knowledge Map.
- **Why:** Grounds AI and people in real, governed knowledge; every write to permanent memory passes a human gate.
- **Who:** Everyone; managers approve writes.

## Analytics
- **What:** KPI dashboards and reports over the demo data.
- **Why:** Turns operations into visible signals for decisions.
- **Who:** Managers.

## Automations
- **What:** Automation surfaces orchestrated by the Flow agent (governed).
- **Why:** Reduces manual work while keeping a human boundary on consequential actions.
- **Who:** Managers.

## AI Agents
- **What:** Seven deterministic agents (Orchestrator, Wiki, Mentor, Hunter, Flow, Fixer, Nexa) — each plans/retrieves/recommends; none mutates the business alone.
- **Why:** Explainable, governed AI assistance grounded in real data — recommendations carry evidence and a "why".
- **Who:** All portals, contextually (e.g., Mentor for students, Fixer for technicians).

## Agent Coordination
- **What:** A live agent-network view showing the orchestrator + specialists and real handoffs.
- **Why:** Makes the multi-agent orchestration transparent and inspectable.
- **Who:** Managers/operators.

## Governance & Approvals
- **What:** An approval engine + evidence trail; sensitive actions are "blocked · human-controlled" and become real only on explicit acceptance.
- **Why:** AI safety and auditability — nothing consequential happens without a human deciding.
- **Who:** Managers/approvers.

## Obsidian Integration
- **What:** Trusted-Device connection to a real Obsidian vault ("TERAGON OS") over a local bridge; live Knowledge Map (63 nodes / 147 links); governed reads; human-approved writes; **zero automatic writes**.
- **Why:** Grounds knowledge in the user's real notes without ceding write control to AI.
- **Who:** Everyone via knowledge/AI features; operators manage the connection.

## Operational Recovery
- **What:** A failed governed run is preserved as immutable evidence; `operational-recovery` starts an explicit new run linked by `retryOf`, human-gated to completion — never a silent rewrite.
- **Why:** Resilience with auditability; failures are evidence, retries are new records.
- **Who:** Operators.

## Accessibility & Responsive UX
- **What:** RTL Hebrew UI, keyboard-accessible command palette and navigation, Axe-clean new surfaces (0 serious/critical), true 390px mobile journeys with no horizontal overflow.
- **Why:** Professional, inclusive, presentable on any device.
- **Who:** Everyone.

## Security
- **What:** 9-role RBAC (deny-by-default), portal restriction (non-escalating), centralized record scope (fail-closed), Trusted-Device vault access, human approval gates.
- **Why:** Least-privilege by construction, honestly scoped.
- **Who:** Enforced for all; see [KNOWN_LIMITATIONS](KNOWN_LIMITATIONS.md) for the demo-vs-production boundary.

## Testing
- **What:** 3041 unit tests, 611 deterministic E2E, Axe, responsive, typecheck/lint/build/secret-scan, plus live Obsidian/workflow/recovery verification.
- **Why:** Engineering quality and confidence for a submission.
- **Who:** Reviewers/maintainers. See [TEST_REPORT](TEST_REPORT.md).
