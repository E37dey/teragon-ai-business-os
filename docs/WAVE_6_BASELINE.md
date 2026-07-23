# WAVE 6 — BASELINE (Phase 6.0)

תאריך: 23.07.2026 04:00 · HEAD: **3bb230b** · Working tree: נקי · ענף בטיחות: `backup/pre-wave6-20260723-0400`

## שערים על ה-baseline (ריצות אמת)
oxlint 0/0 · tsc 0 · typecheck:tests 0 · Vitest **587/587** · build ✓ · (e2e 106/106 אומתו בסגירת Wave 5, אותו HEAD)

## אחסון
- IndexedDB: DB **`teragon-os`**, גרסה **3** (v3 = +agentRuns/agentEvents/agentErrors), store לכל אחת מ-**49 collections**.
- גיבוי דטרמיניסטי: `docs/backups/wave6-baseline-seed-snapshot.json` (**283 רשומות seed**, נבדק parse) + `wave6-baseline-counts.json` (ספירות לכל collection).
- הערת כנות: רשומות runtime בדפדפן (IndexedDB של המשתמש) אינן ניתנות לייצוא מה-CLI; המיגרציות ייבדקו מול snapshots ב-fake-indexeddb + מול רשומות malformed (Phase 6.16).

## מלאי עקיפות זמניות (מועמדות לנורמליזציה ב-6.16)
| מקור | עקיפה | יעד |
|---|---|---|
| W3 sales | צעד-מסע עדין ב-localStorage (`Opportunity.journeyStepId` חסר) | שדה domain + מיגרציה |
| W3 documents | `Quotation.version` כ-counter ב-localStorage | שדה domain |
| W3 | `Document.customerId` חסר | שדה domain |
| W4 | מרקרי `⟦…⟧` ב-description: Task workState/ownership, SupportRequest tier/assignee/category/feedback | שדות domain + מיגרציית פירוק מרקרים |
| W4 | ServiceTicket שדות טכניים+closedAt, CustomerPrinter אחריות/תחזוקה, CourseSession נוכחות מובנית, kinds חדשים ל-Activity | שדות domain |
| W5 | Approval extended states (edited/expired/cancelled) נגזרים מאירועים | הרחבת union + מיגרציה |
| W5 | 5 פעולות Copilot + 6 פעולות תכנון במודולים | איחוד ל-LocalRulesProvider |
| W5 | emergency-disable בשכבת UI guard | העברה ל-orchestrator.startRun |
| W5 | Copilot history ב-localStorage | החלטה: להשאיר (session-scoped) או repository — יוחלט ב-E |
| W5 | Nexa seed purpose שגוי | יישור seed |

## Placeholders שהגל מפעיל
/memory · /knowledge · /learning (16 placeholders סה"כ נותרו; הגל סוגר 3).

## זהות קנונית (ללא שינוי)
טרגון טכנולוגיות · צחי זוסטייהם · "ערב טוב, צחי" · לעולם לא איליה נודלמן. Mode A נשמר: `AI_REMOTE_ENABLED=false`.
