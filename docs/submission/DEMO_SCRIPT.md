# TERAGON — Live Demo Script (7–10 minutes)

**Setup:** run `npm run preview` → open `http://localhost:4173/welcome`. *(Optional: Obsidian Desktop open with the TERAGON OS vault for the knowledge segment.)* Each step lists **what I click**, **what I say**, and **what the reviewer should notice**.

---

### 00:00–00:45 · The problem
- **Click:** Show `/welcome` (three role cards + credentials).
- **Say:** "Businesses run on scattered tools — knowledge, tasks, learning, service, AI, approvals all live in different systems. TERAGON puts them in one governed workspace, and gives each user a portal built for their job."
- **Notice:** One product, three clearly-labeled role entrances.

### 00:45–02:00 · Three role experiences (login)
- **Click:** Click the **Manager** card → submit. Land on `/home`.
- **Say:** "The same system, but the experience is derived from your role. The credential doesn't choose your access — your trusted role does."
- **Notice:** Header identity **צחי זוסטייהם / מנהל**, workspace chip **סביבת מנהל**, curated navigation.

### 02:00–03:00 · Manager Portal
- **Click:** Point to the OperationsBrief (decisions), the KPI strip (approvals / open tasks / active runs), then a quick link to **Analytics**.
- **Say:** "The manager's first question is 'what needs my attention?' — decisions first, then indicators, then quick access. And broad ≠ admin: a business manager is not a system admin."
- **Notice:** Decisions on top; try a denied admin route to show `AccessDenied` if desired.

### 03:00–04:00 · Student Portal
- **Click:** Header **יציאה** → log in as **Student** → `/home`. Show continue-learning hero, "my tasks" (course stages), Mentor.
- **Say:** "A student sees a learning workspace, not a shrunken admin console. Continue learning, your next step, your mentor, your progress."
- **Notice:** Header **תלמיד דמו / תלמיד**, `סביבת תלמיד`, onboarding, beginner-friendly wording, no manager data.

### 04:00–05:00 · Technician Portal
- **Click:** Log in as **Technician** → `/home`. Show current priority job, assigned queue, Fixer.
- **Say:** "A technician needs one answer: which job now? Current job by priority, the assigned queue, technical knowledge, and the Fixer assistant."
- **Notice:** Header **טכנאי דמו / טכנאי**, `סביבת טכנאי`, only their own assigned jobs.

### 05:00–07:00 · AI Workspace & the agent ecosystem
- **Click:** Navigate to **AI Workspace** (`/ai-workspace`). Show the agent network (Orchestrator + 6 specialists) and the "what needs attention now" findings.
- **Say:** "Seven deterministic agents. The Orchestrator plans and routes; Wiki, Mentor, Hunter, Flow, Fixer, Nexa recommend. They explain *why*, cite evidence, and never act on their own."
- **Notice:** Real agent handoffs; "local rules engine — no remote model".

### 07:00–08:30 · Obsidian: real knowledge
- **Click:** Open `/memory` — show **מחובר**, Vault **TERAGON OS**, bridge `127.0.0.1:5200`. Load the Knowledge Map.
- **Say:** "This is a *real* Obsidian vault over a local Trusted-Device bridge — not a mock. A live knowledge graph of 63 notes and 147 links."
- **Notice:** Connected badge, live force-directed graph, "write: human-approval only".

### 08:30–09:30 · Governance: human approval
- **Click:** In AI Workspace live-process, run **governed-knowledge-capture** on *AI Operations*. Let it reach **WAITING_FOR_USER**, then click **אשר קבלה**.
- **Say:** "The agent searched the real vault, read the note, and produced a recommendation — then it *stopped* and waited for me. Nothing is written automatically."
- **Notice:** `WAITING_FOR_USER → הושלם`, source `Obsidian · TERAGON OS · AI Operations.md`, **0 automatic vault writes**.

### 09:30–10:00 · Close — architecture, security, roadmap
- **Say:** "Under the hood: React 19 + TypeScript, centralized RBAC with route and record scope, a deterministic governed AI layer, and Trusted-Device Obsidian. Honestly scoped: local record-scoping is presentation-grade; org-level Supabase RLS is live; per-user RLS is the next production step. Thank you."
- **Notice:** Confidence, honesty, a clear roadmap.

---

**Fallbacks:** if Obsidian isn't available, skip 07:00–09:30 live and show the verified evidence in [TEST_REPORT](TEST_REPORT.md) + screenshots; the portals (00:45–05:00) never depend on Obsidian.
