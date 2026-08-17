# TERAGON — Presentation Outline (10–12 slides)

Each slide: **title · one-sentence message · ≤5 bullets · visual · speaker notes.**

---

### 1 · TERAGON AI Business OS
- **Message:** One governed AI workspace that adapts to each user's role.
- **Bullets:** Role-based · AI-native · Governed · Knowledge-grounded · Academic project, synthetic data.
- **Visual:** Title + logo / `01-login.png`.
- **Notes:** Set the frame: a product, not a pile of tech.

### 2 · The Problem
- **Message:** The tools people need to do their job are scattered and ungoverned.
- **Bullets:** Knowledge in wikis · tasks in PM tools · users in IAM · learning in an LMS · service in ticketing · AI bolted on · approvals ad-hoc.
- **Visual:** "fragmented systems" diagram.
- **Notes:** Context-switching, duplicated data, weak governance, unsupervised AI.

### 3 · The Solution
- **Message:** One governed workspace; a tailored experience per role; AI proposes, humans decide.
- **Bullets:** Unified modules · Portal per role · Deny-by-default access · Human approval gates · Real knowledge.
- **Visual:** System architecture (ARCHITECTURE §1).
- **Notes:** The thesis in one slide.

### 4 · Three Role-Based Experiences
- **Message:** The same system shows Manager, Student, and Technician different things.
- **Bullets:** Portal derived from role (not selectable) · only restricts · never escalates.
- **Visual:** three home screenshots side by side (`02/03/04`).
- **Notes:** Emphasize "derived from trusted role".

### 5 · Manager / Student / Technician
- **Message:** Each portal answers one primary question fast.
- **Bullets:** Manager → "what needs my attention?" · Student → "what should I do next?" · Technician → "which job now?"
- **Visual:** `02-manager-home.png` (or a 3-up).
- **Notes:** 3-second test; bizmgr ≠ sysadmin.

### 6 · AI Agent Ecosystem
- **Message:** Seven deterministic agents that recommend and orchestrate — never act alone.
- **Bullets:** Orchestrator · Wiki · Mentor · Hunter · Flow · Fixer · Nexa.
- **Visual:** `05-ai-workspace.png` / `06-agent-coordination.png`.
- **Notes:** Explainable, evidence-backed, local rules engine.

### 7 · Governed AI Workflows
- **Message:** AI stops at a human approval gate before anything consequential.
- **Bullets:** Recommend → propose → **WAITING_FOR_USER** → accept → complete · 0 automatic writes.
- **Visual:** `08-governed-workflow.png` / `09-human-approval.png`.
- **Notes:** This is the safety story.

### 8 · Knowledge + Obsidian
- **Message:** Knowledge is grounded in a real Obsidian vault, not a mock.
- **Bullets:** Trusted Device · local bridge · TERAGON OS vault · live Knowledge Map (63/147) · human-approved writes.
- **Visual:** `07-knowledge-map.png`.
- **Notes:** Real integration verified live.

### 9 · Architecture
- **Message:** A clean, layered React/TypeScript app with centralized authorization.
- **Bullets:** Presentation · Authorization · Domain/data (local-first) · AI · Integration.
- **Visual:** ARCHITECTURE §1 + §2 diagrams.
- **Notes:** Route scope → record scope.

### 10 · Security & Governance
- **Message:** Least-privilege by construction, honestly scoped.
- **Bullets:** 9-role RBAC · portal restriction · record scope (fail-closed) · Trusted Device · human gates.
- **Visual:** ARCHITECTURE §2 (role security flow) + `11-access-denied.png`.
- **Notes:** State the local-vs-production boundary honestly.

### 11 · Engineering Quality
- **Message:** A green, verifiable quality baseline.
- **Bullets:** 3041 unit tests · 611 E2E / 0 fail · Axe 0 serious/critical · build clean · live Obsidian & recovery verified.
- **Visual:** TEST_REPORT summary table.
- **Notes:** Distinguish automated vs human-verified.

### 12 · Results & Future Roadmap
- **Message:** A complete, demonstrable product with a clear path to production.
- **Bullets:** Per-user Supabase RLS · enterprise identity (SSO/OIDC) · deployment hardening · broader Supabase surfaces.
- **Visual:** roadmap timeline.
- **Notes:** Close on vision + honesty.
