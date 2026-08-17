# TERAGON AI Business OS — One-Pager

**Project:** TERAGON AI Business OS — a role-based, AI-native business operating system (academic final project; synthetic data).

**Problem:** The tools a person needs — knowledge, tasks, learning, service, customers, AI, approvals — live in separate systems, causing context-switching, duplicated data, weak governance, and unsupervised AI.

**Solution:** One governed workspace that unifies these modules and derives a **portal** from each user's role, so every user gets a purpose-built experience. AI agents read knowledge, plan, and recommend, but every consequential action stops at an explicit **human approval gate**. Knowledge is grounded in a **real Obsidian vault** with **zero automatic writes**.

**Target users:** Business managers, students/learners, and field technicians (with a full operator/admin baseline).

**Key features:**
- Manager / Student / Technician **role portals** (derived from role, non-escalating).
- Role-based navigation, **route + record scope**, role-scoped search, onboarding.
- **AI Workspace** with 7 deterministic agents + governed workflows.
- **Real Obsidian** integration (Trusted Device, live Knowledge Map, human-approved writes).
- **Operational recovery** (failed runs preserved, human-gated retry).
- Accessible (Axe-clean) and **responsive** (true 390px).

**AI architecture:** A local, deterministic rules engine (no remote model) with an **Orchestrator** (plan/route/synthesize) and six specialists — **Wiki, Mentor, Hunter, Flow, Fixer, Nexa** — each recommending with evidence; no agent mutates the business alone.

**Technology:** React 19 + TypeScript (Vite), React Router, TanStack Query/Table, D3 (force/zoom) for graphs, IndexedDB (`idb`), Zod, Supabase (RLS for customer surfaces). Tests: Vitest, Playwright, Axe, oxlint.

**Security/governance:** 9-role RBAC (deny-by-default), portal restriction, centralized **record scope** (fail-closed), Trusted-Device vault access, human approval gates. *Honest note:* local `LOCAL_INDEXEDDB` record scoping is presentation-grade, not a server boundary; Supabase provides **org-level** RLS today; **per-user RLS is future production hardening**.

**Testing / status:** Verified baseline at SHA `4a6aed7` — **3041 unit tests**, **611 E2E / 0 failed**, Axe **0 serious/critical**, clean typecheck/lint/build/secret-scan; Obsidian connection, governed-knowledge-capture, and operational-recovery **verified live** (final recovery accept→completed **human-verified**).

**Current status:** Feature-complete, demonstrable, reviewed. On branch `chore/teragon-submission-package` (from `4a6aed7`), not merged.

**Future roadmap:** Production per-user/assignment-level Supabase RLS · enterprise identity (SSO/OIDC) · deployment hardening · broader Supabase-backed surfaces.
