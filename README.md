# TERAGON AI BUSINESS OS

**A role-based AI Business Operating System.** One governed workspace that unifies business operations, knowledge, learning, service, customers, tasks, AI agents, and automation — while giving each type of user a distinct, purpose-built experience.

> **Honesty statement (please read):** This is an academic project running on **synthetic demo data only**. There is no real company database, no paid service, and **no remote language model** (`AI_REMOTE_ENABLED=false`) — the AI layer is a **deterministic, local rules engine**. Persistence defaults to **`LOCAL_INDEXEDDB`** (in-browser). Only **Customers, Contacts, and Customer Detail** are Supabase-backed and RLS-validated; the remaining modules are **accepted demo surfaces** that demonstrate product flows, local modules, and deterministic AI. See [Known Limitations](docs/submission/KNOWN_LIMITATIONS.md).

---

## What TERAGON is

TERAGON is a single AI-native workspace for running a small business — a 3D-printing training-and-service company is the reference customer. It combines CRM, service tickets, a learning/LMS track, a knowledge base, task management, analytics, automation, and a governed AI-agent layer. Crucially, it does **not** show everyone the same screen: a **Manager**, a **Student**, and a **Technician** each log in to a portal tailored to their job.

## The problem

In most organizations, the things a person needs to do their job are scattered across disconnected systems:

- **business knowledge** lives in wikis and documents,
- **tasks** live in a project tool,
- **users and roles** live in an identity system,
- **learning** lives in an LMS,
- **service operations** live in a ticketing tool,
- **AI assistants** are bolted on separately, and
- **approvals** happen ad-hoc over chat and email.

The result is context-switching, duplicated data, weak governance, and AI that acts without oversight.

## The solution

TERAGON puts all of it in **one governed workspace** — but instead of drowning every user in every feature, it derives a **portal** from the user's role and shows only what that person needs. AI agents can read knowledge, plan, and recommend, but **any sensitive action stops at an explicit human approval gate**. Knowledge is grounded in a **real Obsidian vault** over a local Trusted-Device bridge, and **nothing is written back without a human approving it**.

## Role Portals

The 9 canonical RBAC roles are unchanged; a **portal** is *derived* from the role (never selectable) and only *further restricts* what the user sees.

| Portal | Who | Primary question it answers |
|---|---|---|
| **Manager** | business managers/leadership | "What needs my attention?" — decisions, approvals, KPIs, analytics |
| **Student** | learners | "What should I do next?" — continue learning, progress, mentor, knowledge |
| **Technician** | field/service staff | "Which job do I handle now?" — current job by priority, assigned queue, technical knowledge, Fixer |

## AI Agents

Seven canonical, deterministic agents (`src/agents/definitions.ts`). Each **plans, retrieves, or recommends** — none performs a business mutation on its own.

| Agent (code name) | Hebrew | Role |
|---|---|---|
| **Teragon Orchestrator** | מנהל התזמור | Plans, routes, and synthesizes — breaks a goal into tasks, picks specialists, merges their output. Never acts itself. |
| **Wiki** | סוכן ידע | Knowledge retrieval — searches the vault, reads notes, summarizes. |
| **Mentor** | סוכן הדרכה | Learning guidance for students. |
| **Hunter** | סוכן מכירות | Sales — reads customers/leads, drafts recommendations (never approves discounts or sends). |
| **Flow** | סוכן אוטומציות | Automation orchestration. |
| **Fixer** | סוכן שירות | Service diagnosis drafts (never closes tickets on its own). |
| **Nexa** | סוכן שיווק וצמיחה | Marketing & growth. |

## Governed AI

AI can **recommend and orchestrate**; it cannot silently change the business. Every consequential step is **blocked, human-controlled** (`חסום · בשליטת אנוש`): a recommendation becomes a proposal only on explicit user action, and a governed write reaches the vault only after a human approves it. The engine carries the honest label *"local rules engine — no remote model."*

## Obsidian integration

TERAGON connects to a **real Obsidian Desktop vault** ("TERAGON OS") through a local bridge:

- **Trusted Device** — a non-exportable device key in the browser; pairing is one-time, no code needed on reconnect.
- **Local bridge** — `http://127.0.0.1:5200` (the Obsidian `teragon-vault-bridge` plugin, v0.3.0-phase3).
- **Real Vault + Knowledge Map** — a live force-directed graph of the vault's notes (verified: 63 documents / 147 links / 6 clusters).
- **Governed reads / human-approved writes** — agents read the vault live; writes are **human-approval-only** with **zero automatic writes**.

## Architecture

React 19 + TypeScript SPA (Vite). Centralized RBAC (`src/authorization`) with route- and record-scope guards. Local-first persistence via IndexedDB (`idb`), with Supabase RLS for the org-scoped customer surfaces. A deterministic AI layer (`src/agents`, `src/ai`) with an orchestrator + 7 agents and a governed-workflow engine. Obsidian integration via a Trusted-Device bridge (`src/integration/obsidian`). See [ARCHITECTURE.md](docs/submission/ARCHITECTURE.md).

## Security model

- **RBAC** — 9 canonical roles, 24 capabilities, `can(role, permission)` deny-by-default; `RouteAccessGuard` wired into the router.
- **Portal restriction** — a portal only *further* restricts a role; it can never escalate (bizmgr ≠ sysadmin, enforced and tested).
- **Record-scoped demo** — students see only their own enrollment; technicians only their own assigned jobs; centralized in `src/authorization/recordScope.ts`.
- **Trusted Device** — device-bound Obsidian access, human-approved writes.
- **Human gates** — every sensitive AI action stops at explicit approval.

**Stated plainly:** `LOCAL_INDEXEDDB` record scoping is a **client-side least-privilege presentation policy, not a production server security boundary**. Supabase currently provides **organization-level** RLS. **Per-user / assignment-level RLS is future production hardening** (documented, not hidden).

## Testing

Final verified baseline (SHA `4a6aed7`): **Vitest 3041/3041**, **deterministic E2E 611 passed / 7 skipped / 0 failed**, Axe **0 serious / 0 critical** on new surfaces, typecheck / typecheck:tests / lint / build clean, secret-scan clean. Obsidian connection, governed-knowledge-capture, and operational-recovery verified live in the paired Chrome (the final recovery accept→completed was **human-verified** — see [TEST_REPORT.md](docs/submission/TEST_REPORT.md)).

## Demo

Run locally (see [QUICK_START.md](docs/submission/QUICK_START.md)) and open the welcome page:

| Portal | Email | Password |
|---|---|---|
| Manager | `manager@teragon.demo` | `TeragonManager2026!` |
| Student | `student@teragon.demo` | `TeragonStudent2026!` |
| Technician | `technician@teragon.demo` | `TeragonTech2026!` |

*Demo credentials only — not production secrets.*

## Future roadmap

- Production **per-user / assignment-level Supabase RLS** (the named next security phase).
- Enterprise identity (SSO/OIDC) and real authentication.
- Deployment hardening and multi-tenant operations.
- Broadening Supabase-backed surfaces beyond the customer domain.

---

### Submission package
`README.md` · [QUICK_START](docs/submission/QUICK_START.md) · [ARCHITECTURE](docs/submission/ARCHITECTURE.md) · [FEATURES](docs/submission/FEATURES.md) · [DEMO_SCRIPT](docs/submission/DEMO_SCRIPT.md) · [PRESENTATION_OUTLINE](docs/submission/PRESENTATION_OUTLINE.md) · [ONE_PAGER](docs/submission/TERAGON_ONE_PAGER.md) · [TECH_STACK](docs/submission/TECH_STACK.md) · [TEST_REPORT](docs/submission/TEST_REPORT.md) · [KNOWN_LIMITATIONS](docs/submission/KNOWN_LIMITATIONS.md) · [CHECKLIST](docs/submission/SUBMISSION_CHECKLIST.md)
