# Wave 5 — AI-Surface Interaction Audit · W5-E stage 2

תאריך: 23.07.2026 · main. Classification: **act** (does a real thing), **nav** (navigation), **display** (read-only), **disabled+reason** (OsButton honesty contract — disabled MUST carry a Hebrew `disabledReason`, enforced at the type level in `src/design-system/OsButton.tsx`).
"Covering test" = w5e (this stage, `e2e/w5e.config.ts`), w5d (`e2e/w5d.config.ts`), or unit (`tests/**`).

## 1. Copilot (app-wide, `src/modules/ai-copilot/CopilotWorkspace.tsx` + OsShell)

| Control | Class | Handler / disabled reason | Covering test |
|---|---|---|---|
| Shell nav card `shell-open-copilot` | act | `useCopilot().openCopilot` (CopilotProvider in OsShell) | w5e copilot open-from-/crm + keyboard tests |
| Drawer close (X) / ESC / overlay click | act | `closeCopilot` via design-system Drawer | w5e keyboard test (ESC) |
| Provider badge + health ("· מחובר") | display | registry `select()` → local provider `health()` | w5e provider-state (copilot test) |
| Context chips: לקוח / ליד / קריאת שירות (3 selects) | act | `setChips` — biases `pickLead` / course-fit binding | unit `tests/` copilot command tests (chips branch); UI render in w5e copilot flows |
| 8 quick-command buttons | act (disabled+reason "פקודה רצה…" while busy) | `runCommand(textHe)` | w5d copilot test; w5e provider-state + screens |
| Free-text input `copilot-input` + שלח | act (שלח disabled+reason while busy) | `runCommand(input)`; unmapped ⇒ honest refusal, injection ⇒ warning, never forwarded | w5e copilot flows (typed command + refusal) |
| בטל בקשה (busy row) | act | `AbortController.abort()` on the in-flight command | w5e cancellation test (visibility + flow completes honestly) |
| נסה שוב (on Hebrew error card) | act (disabled+reason while busy) | re-runs the failed command text | unit (error path); not e2e-reachable without forcing a provider error — honest gap, noted |
| Proposed action "בקש אישור לשליחת ההודעה ל-…" | act (disabled+reason while busy) | `startGuardedRun` → ApprovalRequested → inline compact ApprovalPanel | w5d flows (approval creation path); panel itself w5e approvals |
| נקה היסטוריה | act / disabled+reason "אין היסטוריה למחוק" | clears localStorage history | render verified in w5e copilot flows |
| Injection warning card | display | `detectInjection` findings | unit `tests/ai` injection suites |

## 2. /agents (`src/modules/agents-ui/AgentsPage.tsx`)

| Control | Class | Handler / disabled reason | Covering test |
|---|---|---|---|
| Agent card title button `agent-card-open` (×7) | act | opens the detail drawer | w5d /agents test |
| Detail drawer 7 tabs (סקירה/משימות/הרשאות/כלים/ריצות/שגיאות/Audit) | act | `setTab` — each renders records-derived tables | w5d /agents test (all 7 asserted) |
| Emergency disable `agent-disable` / re-enable `agent-enable` | act (disabled+reason "פעולה נשמרת…" while busy) | persists `status` to the agents repository; `assertAgentsEnabled` then refuses new runs | unit (`assertAgentsEnabled`); button render on fleet cards (w5d page test); full disable-then-refuse flow is engine-covered in `tests/agents/**` |
| Rail link "לחדר התיאום ←" | nav | Link → /agents/collaboration | rendered in w5e provider-state test (also an axe finding — see VISUAL_QA) |
| Provider health area (rail) | display | registry select → health | w5e provider-state test |
| KPI cards / fleet stats / "טרם נמדד" usage | display | derived from records only | w5d (+w5e screenshots) |

## 3. /agents/collaboration (`AgentCollaborationPage.tsx`)

| Control | Class | Handler / disabled reason | Covering test |
|---|---|---|---|
| הפעל תרחיש הדגמה `run-demo` | act (disabled+reason "התרחיש רץ…") | `runDemoScenario()` — real engine, idempotent | w5d flow; w5e command-center + screens |
| Run selector `run-selector` | act | selects the displayed run | w5d/w5e (used implicitly); render asserted |
| Status filter / מנוע (provider) filter selects | act | filter the run list (provider derived from persisted envelopes) | render in w5e screenshots; selector logic unit-covered in `src/agents/selectors` tests |
| Graph nodes `graph-node` (button per node) | act | select node → rail "נבחר: …" card + edge highlight | w5e command-center conflict-selection test |
| Conflict note input "הערת הכרעה (רשות)" | act | optional note recorded with the resolution | w5d resolve flow (note optional) |
| 5 conflict actions `conflict-action` (בקש ראיות נוספות / בקש חלופה / העבר למומחה אנושי / אשר חריגה / דחה את ההמלצה) | act (disabled+reason "הכרעה נשמרת…") | `resolveConflict` — audited engine function | w5d (אשר חריגה path + count=5); w5e asserts count=5; all 5 actions unit-covered in `tests/agents` conflicts |
| Compact ApprovalPanel (rail) | see §6 | — | w5e approvals (demo recommendation-only test) |

## 4. /automations (`AutomationsPage.tsx`)

| Control | Class | Handler / disabled reason | Covering test |
|---|---|---|---|
| Automation row select (name button, ×4) | act | selects; clears plan envelopes | w5e approvals (auto-3 selection) |
| הפעל/כבה toggle per automation | act | persists `enabled` to the repository + toast | render verified; repository update is trivial passthrough (unit-covered repo) |
| 6 planning ops `plan-op-*` (classify/missing/conditions/draft/next/failures) | act | deterministic local ops → full envelopes | w5d (classify+draft); w5e (draft); all 6 ops unit-covered in `tests/` planOps |
| בקש אישור לביצוע `request-execution` (on envelope) | act (disabled+reason "בקשה נשלחת…") | `approvalEngine.requestApproval` with the drafted text | w5d + w5e approvals |
| בקש אישור להרצה `request-run-approval` | act (disabled+reason while busy) | same engine call without draft | w5e fix-request test (same panel path) |
| הרץ עכשיו (internal automations) | disabled+reason "אוטומציה פנימית רצה לפי הטריגר המוגדר; הרצה ידנית … אינה נתמכת עדיין" | honestly disabled — no fake manual run | render on auto-1/2/4 selection |
| שליחה חיצונית אמיתית | disabled+reason "שליחה חיצונית אמיתית (מייל/SMS/רשת) אינה נתמכת במצב הדגמה המקומי" | honestly disabled — Mode A has no real send | render in w5e approvals flows |
| Runs table "ספק / מעטפת" column | display | scheduler runs honestly labeled "ריצת מתזמן — ללא מעטפת AI" | w5e fix-request test asserts the label |
| ApprovalPanel(s) under הרצה ואישורים | see §6 | — | w5e approvals (edit/reject/fix/keyboard) |

## 5. Command Center (`CommandCenterPage.tsx` + `AgentNetworkLive.tsx`)

| Control | Class | Handler / disabled reason | Covering test |
|---|---|---|---|
| `open-copilot` panel button | act | `openCopilot` (same provider as the shell card) | w5d copilot flow |
| Decision cards `decision-open-details` → `decision-details-modal` | act | opens the evidence/details modal | w4/w5d command-center coverage |
| `followup-lead` action | act | creates the follow-up flow record | w3/w4 flows (pre-existing coverage, unchanged) |
| Live band `agent-network-live` (counts, conflicts, messages, handoffs) | display | selectors over live records (`pendingApprovals`, `agentQueueSizes`) | w5e command-center test (delta +1 after demo, survives refresh) |
| "לחדר התיאום ←" / "להכרעה ←" links | nav | Links to /agents/collaboration | rendered in w5e command-center test |
| `engine-approvals` ApprovalPanels | see §6 | — | w5d + w5e command-center test |
| Activity feed | display | `recentActivity` — shows the honest "אושר ובוצע מקומית: …" execution records | w5e approvals edit test (edited text asserted in the feed) |

## 6. ApprovalPanel — the canonical 6 buttons (`src/components/approval/ApprovalPanel.tsx`)

| Button | Enabled when | Disabled reason otherwise | Covering test |
|---|---|---|---|
| אשר | state=pending, not busy | "פעולה נשמרת…" / "האישור כבר הוכרע (…)" | w5d approve; w5e keyboard (Enter approves) |
| ערוך ואשר | pending + payload kind=external | busy/decided reason, or "אישור המלצה בלבד — אין נוסח לביצוע שניתן לערוך" / "עריכה נתמכת כרגע רק לפעולות חיצוניות (external)" | w5e edit test (edited payload executes); w5e demo test (recommendation-only ⇒ disabled + reason) |
| בקש תיקון | pending, not busy | same decided/busy reasons | w5e fix-request test (empty note refused; recorded as reasoned rejection) |
| דחה | pending, not busy | same | w5e reject test (mandated reason; no mutation) |
| פתח ראיות | always | — (never disabled) | opens evidence+audit modal; exercised in w5e keyboard tab-order |
| בטל פעולה / בטל פעולה (rollback) | pending OR executed | "אין מה לבטל במצב הנוכחי (…)" | unit `tests/agents` (cancel + rollback engine paths); tab-order presence in w5e keyboard test |
| נסה ביצוע שוב (7th, conditional) | state=execution-failed only | "פעולה נשמרת…" | unit `tests/agents` retry tests — an execution failure is not honestly reachable from the UI with the injected handlers (they succeed), so e2e coverage is N/A by design |

## Honest gaps (not covered by any UI e2e, by design)

- Copilot "נסה שוב" and the Hebrew error card require a provider error; the local deterministic engine doesn't fail on demand and injecting failures would need src hooks — covered at unit level only.
- ApprovalPanel "נסה ביצוע שוב" requires `execution-failed`, unreachable with the shipped handlers — unit level only.
- Remote-provider states (badge/model/fallback) — see the N/A section of `docs/WAVE_5_VISUAL_QA.md`.
