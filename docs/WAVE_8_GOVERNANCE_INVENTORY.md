# WAVE 8 — GOVERNANCE INVENTORY (Phase 8.0, W8-B)

23.07.2026 · בעלות: W8-B (AI Governance, Risk & Audit) · בדיקה אמיתית של הרשומות והקוד — לא תיאור רצוי.

## 1. סוגי אירועי ביקורת (auditEvents) — כפי שקיימים בקוד וב-seed

**מה-seed (8 רשומות, ae-1…ae-8), פעולות בעברית חופשית:**
`בקשת אישור נוצרה · ניתוב משימה · אישור התקבל · הצעה אושרה · סיכום בוקר נוצר · ליד נסגר כלקוח · גיבוי הושלם`

**מהקוד (פעולות מובנות, prefix.action):**

| מקור | פעולות |
|---|---|
| `src/agents/approvalEngine.ts` | `approval.request` · `approval.approved/edited/rejected/expired/cancelled` · `approval.execute` · `approval.execute-failed` · `approval.rollback` · `run.complete` |
| `src/agents/orchestrator.ts` | `run.create` · `run.cancel` + פעולות ניתוב |
| `src/agents/conflicts.ts` | `conflict.detect` · `conflict.resolve` |
| `src/learning/loop.ts` | `learning.rule-activated` · `learning.proposal-rejected` · `learning.rule-revised` · `learning.rule-rollback` |
| `src/memory/**` | `memory.export` · `memory.import.submit` · `memory.sensitive-reveal` |
| `src/knowledge/governance.ts` | `permanent-knowledge-update` |
| **חדש W8-B** (`src/governance/**`) | `governance.policy-submitted/approved/rejected/revised` · `governance.risk-transition` · `governance.incident-opened/assigned/contained/resolved/reviewed/closed` |

מבנה הרשומה (`AuditEvent`, domain/types): `at · actor · action · entityRef · details · correlationId`. **אין שדה severity** — חומרה ב-Audit Explorer היא נגזרת היוריסטית מוצהרת (`deriveAuditSeverity`).

## 2. זרימות אישור (approvals)

- מנוע קנוני יחיד: `src/agents/approvalEngine.ts`. מחזור חיים נגזר-אירועים: `pending → approved | edited | rejected (+expire/cancel) → executed / execution-failed / rolled-back`.
- רשומת Approval דור-1: 3 סטטוסים בלבד (ממתין/אושר/נדחה); המצב המורחב נגזר מ-agentEvents.
- 12 פעולות האישור הקנוניות: `customer-message · quotation-change · price-change · discount · external-notification · ticket-closure · record-deletion · permission-change · permanent-knowledge-update · permanent-memory-update · external-automation · financial-commitment`.
- ערובה: `execute()` ללא אישור מאושר/נערך זורק `AGENT_EXECUTION_WITHOUT_APPROVAL`.
- seed: ap-1 (ממתין, Hunter→פולואו-אפ), ap-2 (ממתין, Wiki→רשומת ידע), ap-3 (אושר, Flow→ברכות). צרכנים קיימים: learning loop (`LEARNING_RUN_ID`, action `permanent-knowledge-update`, payload null) — **הדפוס שאומץ ל-W8-B** (`GOVERNANCE_RUN_ID="governance-w8b"`).

## 3. טבלת הרשאות הסוכנים (מקור אמת: `src/agents/definitions.ts`, קפוא עמוק)

7 סוכנים: `ag-orchestrator · ag-hunter · ag-fixer · ag-mentor · ag-nexa · ag-wiki · ag-flow`. deny-by-default (`canAgent`). לכולם: providerPolicy `local-first`, תקציב 0 ₪, maxTaskDepth 3, maxHandoffs 3. `approvals/auditEvents/users/roles` אסורים לכולם. הטבלה המלאה: docs/AGENT_GOVERNANCE.md. **המטריצה ב-/governance נגזרת מההגדרות (same-reference, נבדק) — לא שוכפלה.**

## 4. גרסאות פרומפט (promptVersion בהגדרות הקפואות)

| סוכן | promptVersion |
|---|---|
| ag-orchestrator | v1.2 |
| ag-hunter | v1.4 |
| ag-fixer | v1.3 |
| ag-mentor | v1.1 |
| ag-nexa | v1.0 |
| ag-wiki | v1.2 |
| ag-flow | v1.1 |

- הטקסטים המוגנים עצמם: בצד השרת בלבד (שכבות `promptSecurity.ts`; שכבה 1 = `SYSTEM_POLICY_HE`).
- לפני W8-B האוסף `promptVersions` (IDB v6) היה ריק. W8-B מאכלס אותו ב-8 רשומות (7 סוכנים + שכבת מדיניות המערכת) עם **checksum sha-256 בלבד** — ללא אישור פורמלי (approvalId null, מוצג בכנות כממצא מבקר).

## 5. גרסאות כללי למידה (learningRules / learningRuleVersions)

- מנגנון W6-D: כלל נוצר רק מהצעה מאושרת בשם; `learningRuleVersions` append-only; rollback תמידי (`learningRollbacks`).
- seed בפועל: אין כללים ב-seed הסטטי — נוצרים על ידי `ensureLearningDemoData` (עמוד /learning): כלל פעיל אחד (rule-lp-service-warping, v1, מדגם 2, אפקטיביות "טרם נמדד") + הצעה ממתינה אחת (מקרה יחיד, חסומה).
- משטח האפקט סגור (`RuleEffect` union) — תחומים אסורים בלתי ניתנים לביטוי; מבקר הממשל צורך את השומר הזה (safeParse על כל כלל שמור).

## 6. סיכונים קיימים לפני Wave 8

- אוסף `risks` (דור-1, seed): risk-1…risk-4 (הודעה שגויה/המלצה ללא ראיות/תלות בספק/חריגת תקציב) עם סטטוסים פתוח/בטיפול/סגור ובקרות ctl-1…ctl-4 (אוסף `controls`).
- אוסף `governanceRisks` (IDB v6) היה ריק. W8-B מאכלס 10 סיכונים קנוניים (`gr-*`) במצב **פתוח** עם בעלים בשם, מפנים לבקרות ולמשטחי הקוד האמיתיים; מחזור חיים מלא: פתוח/בטיפול/התקבל/הופחת/נסגר/נפתח מחדש.

## 7. אוספים governance (IDB v6) — מצב בכניסה

`governancePolicies · governancePolicyVersions · governanceRisks · governanceIncidents · governanceReviews · promptVersions` — כולם קיימים וריקים בכניסת W8-B; מאוכלסים אידמפוטנטית על ידי `ensureGovernanceData` (bootstrap create-if-missing, ללא אישור אוטומטי).
