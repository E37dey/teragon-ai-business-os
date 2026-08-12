# TERAGON — Release Readiness Checklist (Phase 10, Release Candidate)

Base `cc5811355b1d57f09f7960eadacebb298635bb44` · every item is **PASS**, **KNOWN LIMITATION**, or
**BLOCKED**. No vague status.

## PRODUCT
- Routes resolve (33 routes; `/customers/:id`; `?run=`/`?pack=`/`?view=`/`?record=`) — **PASS**
- Exactly **7 agents** — **PASS** (test-asserted)
- Exactly **14 agent actions** — **PASS** (test-asserted)
- Exactly **2 workflow packs** (governed-knowledge-capture, operational-recovery) — **PASS**
- No Agent #8 / action #15 / pack #3 — **PASS**
- Command Center separates actionable / pending / verified / failed truthfully — **PASS**
- AI Workspace 3 modes; bounded graph metadata only (no note bodies) — **PASS**
- Follow-up Task ≠ workflow repair (original signal stays actionable) — **PASS** (intentional)

## SECURITY
- `AI_REMOTE_ENABLED=false` — **PASS**
- No secret in logs/URLs/committed fixtures/screenshots/evidence; `scan:secrets` CLEAN — **PASS**
- Origin allowlist (no `*`); loopback-only bridge — **PASS**
- No auth/approval bypass; no direct repo mutation from an Agent flow — **PASS**
- No `dangerouslySetInnerHTML`; 0 dead CTAs; 1 non-UI `console.log` (server redact util) — **PASS**
- `HTTPS_TO_LOOPBACK = UNVALIDATED` — **KNOWN LIMITATION**
- Trusted-origin XSS could invoke device signing (non-exportable key) — **KNOWN LIMITATION**

## GOVERNANCE
- recommendation ≠ proposal ≠ approval ≠ native Obsidian confirmation — **PASS**
- No auto-approval; explicit human decision required — **PASS**
- Approval audit shows true mutation ("יצירת משימה", never "אוטומציה חיצונית") — **PASS** (tested)
- ApprovalEngine executed-state guard + honest rollback — **PASS**

## DATA
- Local IndexedDB persistence; runtime-only signals/workflow log documented — **PASS**
- No production backup/restore guarantee — **KNOWN LIMITATION**
- No remote/server durability claimed — **KNOWN LIMITATION**

## OBSIDIAN
- Read (connection/notes/graph/search/note) bounded, fail-closed — **PASS**
- Governed write create/update/append only (no delete/rename/move) — **PASS**
- writeKey + HMAC capability + native confirm + read-back — **PASS**
- Trusted Device: pair once → restart → no new code (live-validated) — **PASS**
- ECDSA P-256 non-exportable key; public-only plugin registry; Origin/Vault binding; revocation;
  forget-device; single-flight 401 recovery — **PASS**

## CRM
- Governed Follow-up Task: `workflow_failed` → proposal → approve → CREATE ONE TASK → verified — **PASS**
- Deterministic id / exactly-one / allowlist / trusted owner / source unchanged / injection-safe — **PASS**
- Task has no `organizationId`; single-tenant pilot, no multi-org claim — **KNOWN LIMITATION**
- Lead/Quote/Ticket/Task-update/Customer mutations — **out of scope (roadmap)**

## A11Y
- Axe 0 critical / 0 serious on Phase-9 proposal/verified/rejected (live) — **PASS**
- CI Accessibility gate (axe, chromium 1440/390 on pilot pages) — **PASS**
- Keyboard-operable modals, focus management, labeled controls, status not color-only — **PASS**

## RESPONSIVE
- Full matrix **375 / 390 / 768 / 1024 / 1440** on `/`, `/ai-workspace`, `/memory`, `/tasks`,
  `/customers`, `/contacts`, `/customers/:id` + governed modal → **0 horizontal overflow** (live) — **PASS**
- CI offline UI-resilience gate (chromium 1440/390) — **PASS**

## CONTINUOUS DEMO WALKTHROUGH
- Fresh-load, product-controls-only E2E (Command Center → AI Workspace → governed workflow →
  `workflow_failed` → Governed Follow-up Task → verified → `/tasks`) — **PASS**
- `workflow_failed` produced via product UI ("התחל תהליך"), **no console dependency** — **PASS**
- Native Obsidian write confirmation: relied on prior separate live proof (not repeated this run) — **PASS (prior)**

## TESTING
- typecheck / typecheck:tests — **PASS**
- oxlint (4 pre-existing warnings only) — **PASS**
- Freeze-critical suites (phase5-9, obsidian, agents, command-center) 218/218 in isolation — **PASS**
- Full local vitest — **KNOWN LIMITATION** (0 assertion failures on an unloaded machine + CI; local
  runs on this heavily-loaded machine show timing flakes + the pre-existing `tests/platform/*`
  shebang transform errors — GitHub Static CI is authoritative and green)
- `scan:secrets` CLEAN; production build succeeds — **PASS**

## DEMO
- Real product story, synthetic data, no console step required — **PASS** (see demo script)
- Demo Mode fail-closed ON; side effects blocked; banner visible — **PASS**

## DOCUMENTATION
- Demo script, known limitations, product-freeze evidence, this checklist — **PASS**
- Phase audit/evidence docs retained (Phases 3–9 + Trusted Device) — **PASS**
