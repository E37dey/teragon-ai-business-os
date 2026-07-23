# AGENT GOVERNANCE — TERAGON AI BUSINESS OS (Wave 5, W5-C)

23.07.2026 · בעלות: W5-C (Agent Orchestration Engine) · צריכה: W5-D (UI)

מסמך זה מגדיר את משטר הסוכנים הקנוני: 7 סוכני מוצר מנוהלים, מגבלות קשיחות,
קטלוג 19 האירועים, זרימת הקונפליקטים, מנוע האישורים הקנוני וכללי הכנות.

## עקרונות (לא ניתנים לעקיפה)

1. **Deny-by-default.** `canAgent(agentId, operation, domain)` מחזיר אמת רק
   להרשאה מפורשת שאינה אסורה. סוכן לא מוכר / פעולה לא מוענקת / תחום אסור ⇒ שקר.
2. **אין שינוי-עצמי.** ההגדרות (`AGENT_DEFINITIONS`) קפואות עמוק
   (`Object.freeze` רקורסיבי) — ניסיון שינוי בזמן ריצה זורק. נבדק בבדיקות.
3. **אין ביצוע אוטונומי.** פעולות אוטונומיות = קריאה/טיוטה בלבד
   (`summarize / classify / search / explain / identify-missing / draft /
   recommend`). כל פעולה משנה/יוצאת עוברת דרך מנוע האישורים — אין נתיב ביצוע
   בלי רשומת Approval במצב מאושר/נערך (נאכף בקוד + בבדיקות).
4. **כל לולאה חסומה.** אין `while` פתוח; חריגה ממגבלה זורקת
   `AgentGovernanceError` מובנה ומבטלת את הריצה עם אירוע `AgentRunCancelled`
   מסוג "מגבלה" ורשומת `agentErrors`.
5. **הגרף נגזר מרשומות בלבד.** ה-UI קורא אך ורק סלקטורים טהורים מעל
   agentRuns/agentEvents/agentTasks/agentMessages/agentHandoffs/agentConflicts/
   approvals/auditEvents.
6. **כנות.** מנוע הכללים המקומי לעולם אינו מתחזה למודל (`model:null`,
   `usage.measured:false`); הוצאה לא נמדדת אינה נספרת; rollback לא נתמך מוצהר
   במפורש ("rollback לא נתמך").

## 7 הסוכנים — טבלת הרשאות

המזהים זהים לרשומות ה-seed (`seedData.ts`). `providerPolicy` לכולם:
`local-first` (Mode A). תקציב לכולם: 0 ₪ (אין הוצאה מותרת).

| סוכן | id | פעולות מותרות | תחומים מותרים | איסורים מרכזיים | אישור נדרש עבור |
|---|---|---|---|---|---|
| מנהל התזמור (Teragon Orchestrator) | `ag-orchestrator` | plan · dispatch · synthesize **בלבד** | אוספי התזמור (agents, agentRuns, agentTasks, agentMessages, agentHandoffs, agentConflicts, agentEvents, agentErrors) | ביצוע פעולה עסקית ישירה; הכרעה שקטה בקונפליקט; שינוי הרשאות | — |
| סוכן מכירות (Hunter) | `ag-hunter` | read · search · summarize · classify · explain · identify-missing · draft · recommend | customers · leads · products · printerModels · quotations · activities | אישור הנחה; שליחת הודעה; שינוי מחיר; serviceTickets (תחום אסור) | הודעה ללקוח · שינוי הצעה · שינוי מחיר · הנחה |
| סוכן שירות (Fixer) | `ag-fixer` | read · search · summarize · classify · explain · draft · recommend | printerModels · customerPrinters · serviceTickets · repairActions · knowledgeNotes · aiRecommendations · evidence | סגירת קריאה; עקיפת טכנאי; הזמנת חלקים; quotations (אסור) | סגירת קריאה · הודעה ללקוח · התראה חיצונית |
| סוכן הדרכה (Mentor) | `ag-mentor` | read · search · summarize · classify · explain · recommend | courses · students · enrollments · learningPaths · courseSessions · assignments · trainingMaterials | אישור השלמה; פנייה ישירה לתלמיד; שינוי ציונים | הודעה · התראה חיצונית |
| סוכן שיווק וצמיחה (Nexa) | `ag-nexa` | read · search · summarize · classify · explain · draft · recommend · propose-campaign | leads · customers · activities · meetings · products | פרסום; שליחה; התחייבות תקציבית; serviceTickets (אסור) | הודעה · התראה חיצונית · התחייבות כספית |
| סוכן ידע (Wiki) | `ag-wiki` | read · search · summarize · classify · explain · flag-contradiction · propose-update | knowledgeNotes · memoryRecords · aiRecommendations · evidence · documents | אישור ידע; שינוי קבוע; מחיקה | עדכון ידע קבוע · עדכון זיכרון קבוע · מחיקת רשומה |
| סוכן אוטומציות (Flow) | `ag-flow` | read · search · summarize · classify · explain · draft · prepare-automation-plan | automations · automationRuns · tasks · notifications | הפעלת פעולה חיצונית; אוטומציה חדשה ללא אישור; customers (אסור) | אוטומציה חיצונית · התראה חיצונית |

**כלל-על:** `approvals` ו-`auditEvents` אסורים לכל 7 הסוכנים — סוכן לעולם
אינו נוגע ברשומות אישור וביקורת בעצמו (נבדק על כל צירוף).

## מגבלות קשיחות (`src/agents/limits.ts`)

| מגבלה | ערך | אכיפה |
|---|---|---|
| maxSpecialists | 4 | נבדק לפני יצירת המשימות; חריגה ⇒ `AGENT_LIMIT_EXCEEDED` |
| maxHandoffDepth | 3 | לכל שרשרת העברות של משימה; חריגה ⇒ עצירה מובנית |
| maxModelCallsPerRun | 8 | הקריאה ה-9 נחסמת **לפני** שהיא קורית (כולל retries) |
| maxTransientRetries | 2 | רק לשגיאות `recoverable`; לא-recoverable נכשל מייד |
| maxRevisionCycles | 2 | ראיות לא מאומתות ⇒ סבבי תיקון חסומים, ואז עצירה |
| maxRunDurationMs | 60,000 (קונפיגורבילי) | שעון מוזרק, נבדק בין שלבים ⇒ `AGENT_TIMEOUT` |
| maxUsageBudgetILS | 0 (קונפיגורבילי) | רק הוצאה **נמדדת** נספרת (absent ≠ zero) ⇒ `AGENT_BUDGET_EXCEEDED` |

מניעת לולאות: סוכן שכבר הופיע בשרשרת ההעברות של משימה אינו יכול לקבל אותה
שוב (`AGENT_LOOP_DETECTED`; A→B→A נחסם).

## קטלוג 19 האירועים (`src/domain/agents/events.ts`)

`AgentRunCreated · AgentRunAuthorized · TaskClassified · ContextSelected ·
PlanCreated · SpecialistsSelected · SpecialistTaskStarted ·
SpecialistTaskCompleted · SpecialistTaskFailed · HandoffOccurred ·
EvidenceVerified · ConflictDetected · ConflictResolved · SynthesisCompleted ·
ApprovalRequested · ApprovalDecided · ExecutionCompleted · AgentRunCompleted ·
AgentRunCancelled`

- כל אירוע נשמר כ-`AgentEventRecord` (אוסף `agentEvents`) עם `runId`, `seq`
  מונוטוני, `ts` משעון מוזרק, `actor` ו-payload מלא.
- מעטפות המומחים (`AIResponseEnvelopeV2`) נשמרות **בתוך** אירוע
  `SpecialistTaskCompleted` — המקור היחיד למעטפות של ריצה.
- כשל ריצה = `AgentRunCancelled` עם `kind:"שגיאה"` + הפניה לרשומת
  `agentErrors`; חריגת מגבלה = `kind:"מגבלה"`; ביטול משתמש = `kind:"משתמש"`.
- הודעות סוכנים הן רשומות ממשיות ב-`agentMessages` (לא סוג אירוע) — הגרף גוזר
  מהן קשתות ישירות.

## זרימת קונפליקטים (`src/agents/conflicts.ts`)

זיהוי דטרמיניסטי מעל מעטפות המומחים:

1. **כלל הדגמה:** Hunter ממליץ על דגם X בעוד קיימת קריאת שירות **פתוחה** על X
   ו-Fixer משתתף בריצה ⇒ קונפליקט Hunter/Fixer (סיכון תמיכה חוזר).
2. **סתירת טענות גנרית:** שתי מעטפות מצטטות אותה רשומה עם עמדות מנוגדות
   (סמני המלצה מול סמני סיכון).

כל קונפליקט נשמר כרשומת `AgentConflict` + אירוע `ConflictDetected` עם
`ConflictDetail` מלא: participants, claims (טענה+ראיות לכל צד),
missing evidence, severity, suggestedResolutionPath, humanDecisionState.

**מנהל התזמור לעולם אינו מכריע לבד** — קונפליקט ⇒ שער אישור אנושי. 5 פעולות
ההכרעה (כל אחת פונקציית מנוע מתועדת-ביקורת):
`בקש ראיות נוספות · בקש חלופה · העבר למומחה אנושי · אשר חריגה · דחה את ההמלצה`.

## מנוע האישורים הקנוני (`src/agents/approvalEngine.ts`)

פעולות המחייבות אישור (12): הודעה ללקוח · שינוי הצעת מחיר · שינוי מחיר ·
הנחה · התראה חיצונית · סגירת קריאה · מחיקת רשומה · שינוי הרשאות · עדכון ידע
קבוע · עדכון זיכרון קבוע · אוטומציה חיצונית · התחייבות כספית.

מחזור חיים: `pending → approved | edited | rejected` (+ expire / cancel) →
ביצוע → אימות → ביקורת. דחייה **מחייבת נימוק**; עריכה מחייבת את ה-payload
הערוך — והוא (ולא המקורי) מה שמבוצע.

- רשומת ה-Approval של דור 1 נושאת 3 סטטוסים בלבד; המצב המורחב
  (edited/expired/cancelled/executed/execution-failed/rolled-back) נגזר
  מאירועים שמורים (`workflowState`). מיפוי הרשומה: approved+edited ⇒ "אושר";
  rejected+expired+cancelled ⇒ "נדחה" (ה-note מציין מה בדיוק).
- **Rollback (כנות):** ממומש בפעולות הפוכות עבור `task-creation` (מחיקת
  הרשומה שנוצרה) ו-`record-field-change` (החזרת הערך הקודם שנלכד בזמן
  הביצוע). כל payload אחר: "rollback לא נתמך" — מוצהר מראש וזריקת
  `AGENT_ROLLBACK_UNSUPPORTED` בניסיון.
- **Handlers חיצוניים מוזרקים** (W5-D): ללא handler — הביצוע נכשל בכנות
  (אין הצלחה מזויפת). ביצוע כושל ניתן ל-retry (`retryFailedExecution`).
- **הערובה:** `execute()` על אישור חסר / ממתין / נדחה זורק
  `AGENT_EXECUTION_WITHOUT_APPROVAL` (מקביל ל-AI_PERMISSION_DENIED).

## תרחיש ההדגמה (`src/agents/demoScenario.ts`)

"לקוח עסקי מבקש מדפסת לחומרים הנדסיים" — ריצה אמיתית דרך
`LocalRulesProvider` + `ProviderRegistry` (Mode A): Hunter מתאים דגם
(P1S, pm-3), Wiki מצליב ידע מאושר (rec-2), Fixer בודק היסטוריית שירות —
הקריאה הפתוחה t-3 על הדגם המומלץ מציתה את הקונפליקט, והריצה נעצרת באישור
אנושי ממתין. אידמפוטנטי (מזהים יציבים בקידומת `demo-w5c-`), מסומן `demo:true`.

## מדריך הרחבה

1. **סוכן חדש:** רשומת seed באוסף `agents` + `AgentDefinition` קפוא ב-
   `definitions.ts` (אותו id!). אין להעניק `approvals`/`auditEvents` לעולם.
   הוסיפו את הסוכן למטריצת ההרשאות בבדיקות.
2. **פעולה חדשה:** הוסיפו ל-`AgentOperation`; אם היא משנה/שולחת — הוסיפו
   פעולת-אישור ל-`APPROVAL_REQUIRED_ACTIONS` (ולעדכן את הטבלה כאן).
3. **אירוע חדש:** הרחיבו את האיחוד ב-`events.ts` + תווית עברית ב-
   `selectors.ts` + בדיקת הקטלוג (הספירה תיאכף בבדיקה).
4. **handler ביצוע חדש:** הזריקו `ExternalExecutionHandler`; אם אין פעולה
   הפוכה אמיתית — החזירו inverse "unsupported". אסור לזייף rollback.
5. **ספק חדש:** דרך `ProviderRegistry` בלבד; המנוע צורך `AIProvider` ואינו
   תלוי בספק קונקרטי.
