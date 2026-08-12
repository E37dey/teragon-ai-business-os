# Agent Action Matrix (S11.3)

**Checkpoint.** Branch `feature/teragon-agent-actions` from base
`feature/teragon-supabase-app-auth` @ `5cfab29`. Every action is **deterministic and
local** (local rules engine, `AI_REMOTE_ENABLED=false`, no remote model, no external
side effect). Approval-gated actions mutate ONLY an isolated in-memory demo store — never
Customers/Contacts persistence. Every result shows *"מנוע חוקים מקומי — ללא מודל מרוחק"*.

- **Contract:** `src/agents/actions/contract.ts` · **Registry:** `registry.ts` ·
  **Engine + demo store:** `engine.ts` · **Synthetic data:** `demoData.ts`
- **UI:** `src/modules/agents-ui/AgentActionsPanel.tsx` (in the agent drawer, tab **פעולות**)
- **Tests:** `tests/agents/agentActions.test.ts` (17 tests, all green)
- **Execution modes:** `READ_ONLY_LOCAL` (RO) · `PROPOSAL_ONLY` (PO) ·
  `LOCAL_DEMO_MUTATION_WITH_APPROVAL` (AG)

## The 14 actions

| # | Agent | Action (id) | Input | Output | Data source | Mode | Approval | Mutation | Evidence | Status |
|--:|-------|-------------|-------|--------|-------------|:----:|:--------:|----------|---------|--------|
| 1 | Orchestrator | סקירת מצב המערכת `orch.system-review` | — | summary + findings + priorities | demo customers/contacts | RO | no | none | incomplete customers | **WORKING_DETERMINISTIC** |
| 2 | Orchestrator | בניית תוכנית פעולה `orch.action-plan` | — | prioritized plan (severity/owner/nav) | demo customers/contacts | PO | no | none | affected customers | **WORKING_DETERMINISTIC** |
| 3 | Hunter | איתור לקוחות חסרי מידע `hunter.incomplete-customers` | — | incomplete records + missing fields | demo customers | RO | no | none | customer refs | **WORKING_DETERMINISTIC** |
| 4 | Hunter | איתור אנשי קשר חסרים `hunter.missing-contacts` | — | no-primary + incomplete contacts | demo customers/contacts | RO | no | none | customer/contact refs | **WORKING_DETERMINISTIC** |
| 5 | Fixer | הצעת תיקון לרשומה `fixer.propose-correction` | recordId | before/after proposal | demo customers | PO | no | none | customer ref | **WORKING_DETERMINISTIC** |
| 6 | Fixer | החלת תיקון דמו מאושר `fixer.apply-correction` | recordId (+approval) | applied once / duplicate-blocked | demo store | AG | **yes** | idempotent local | customer ref | **WORKING_APPROVAL_GATED** |
| 7 | Flow | יצירת רצף המשך טיפול `flow.followup-sequence` | recordId | ordered steps + timing | demo customers | PO | no | none | customer ref | **WORKING_DETERMINISTIC** |
| 8 | Flow | הצעת אוטומציה מקומית `flow.automation-proposal` | trigger (+approval) | preview → saved once locally | demo store | AG | **yes** | idempotent local | automation ref | **WORKING_APPROVAL_GATED** |
| 9 | Mentor | הסבר המלצה `mentor.explain-recommendation` | recommendationId | why + cited evidence | demo recommendations | RO | no | none | based-on records | **WORKING_DETERMINISTIC** |
| 10 | Mentor | יצירת רשימת שיפור `mentor.improvement-checklist` | — | demo-task checklist (local tracking) | demo customers/contacts | PO | no | none | customer refs | **WORKING_DETERMINISTIC** |
| 11 | Nexa | שאלת מערכת `nexa.system-question` | query | answer + source + nav link | demo knowledge | RO | no | none | knowledge ref | **WORKING_DETERMINISTIC** |
| 12 | Nexa | הכוונה לפעולה `nexa.navigation-guidance` | query | safe canonical nav target | demo knowledge/routes | RO | no | none | route ref | **WORKING_DETERMINISTIC** |
| 13 | Wiki | חיפוש במאגר הידע `wiki.knowledge-search` | query | ranked results (title/category) | demo knowledge | RO | no | none | knowledge refs | **WORKING_DETERMINISTIC** |
| 14 | Wiki | סיכום ערך ידע `wiki.summarize-entry` | entryId | summary + source attribution | demo knowledge | RO | no | none | knowledge ref | **WORKING_DETERMINISTIC** |

**Totals:** 14 actions · **12 WORKING_DETERMINISTIC** · **2 WORKING_APPROVAL_GATED** ·
0 DISABLED_HONESTLY · 0 BLOCKED. Exactly **2 per agent** across all **7** agents.

## Safety & honesty (proven by tests)

- All read-only / proposal-only actions perform **0 mutations** (`appliedCorrectionCount()`
  / `savedAutomationCount()` stay 0).
- Approval-gated actions return **`awaiting_approval` and mutate nothing** until an
  explicit approval; an approved mutation happens **exactly once** and **duplicates are
  blocked** (idempotent store).
- Invalid / missing input → **safe Hebrew `validation_error`** (never a false success).
- Every result carries a **unique correlationId**, the **five "why" explanations**
  (מה נמצא / למה חשוב / על סמך מה / מה מומלץ / האם הצעה בלבד), and **evidence**.
- The **remote provider is never called** (spied: 0 calls); the local rules engine is the
  only engine; `AI_REMOTE_ENABLED` stays **false**.
- Running every action emits **no observability event** leaking names, emails, ids or
  payloads.
- All navigation targets resolve to **canonical routes**; no NO_OP buttons.
