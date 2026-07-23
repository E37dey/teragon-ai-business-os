# WAVE 8 — METRIC INVENTORY (Phase 8.0, W8-A)

נכתב מתוך **בדיקת קוד אמיתית** (לא ממסמכים): `src/repositories/seed/seedData.ts`,
`src/domain/submission/metricLevels.ts` (W7-E), `src/domain/selectors/**`,
`src/agents/**`, `src/knowledge/**`, `src/memory/**`, `src/learning/**`, `src/ai/**`.
תאריך: 23.07.2026 · HEAD בסיס: d2b948a.

## 1. MetricDefinition records (seed — אוסף `metricDefinitions`, md-1..md-9)

| id | key | רמה | יחידה | derivation (כמות שהוא בקוד) | נמדד היום? |
|----|-----|-----|-------|------------------------------|------------|
| md-1 | pipeline_value | עסקי | ₪ | `selectors/revenuePipeline` | כן — מחושב |
| md-2 | leads_new_week | עסקי | לידים | `selectors/leadsByStage` | כן — ספירה לפי createdAt |
| md-3 | revenue_total | עסקי | ₪ | `selectors/totalRevenue` | כן |
| md-4 | open_tickets | תפעולי | קריאות | `selectors/openTicketsByPriority` | כן |
| md-5 | course_completion | תפעולי | % | `selectors/courseCompletion` | כן (null כשאין שלבים) |
| md-6 | pending_approvals | תפעולי | בקשות | `selectors/pendingApprovals` | כן |
| md-7 | agent_precision | AI | % | "טרם נמדד — דורש נתוני פיקוח אנושי" | חלקית — W7-E מחשב rec_approved_rate מ-approvals |
| md-8 | agent_response_time | AI | דקות | "טרם נמדד — ימדד לאחר הפעלה רציפה" | לא |
| md-9 | automation_success | AI | % | `selectors/automationSuccessRate` | כן |

## 2. MetricObservation records (seed — אוסף `metricObservations`, mo-1..mo-3)

| id | metricKey | value | method |
|----|-----------|-------|--------|
| mo-1 | agent_precision | **null** | "טרם נמדד — אין עדיין מדגם החלטות אנושיות מספק" |
| mo-2 | agent_response_time | **null** | "טרם נמדד — המדידה תחל לאחר הפעלה רציפה" |
| mo-3 | automation_success | 100 | "חושב מ-3 ריצות אוטומציה מתועדות — מדגם קטן" (sample=3, חלקי) |

## 3. W7-E — שלוש רמות המדידה (`src/domain/submission/metricLevels.ts`, 21 מדדים)

מקור האמת לקטלוג ההגשה. כל מדד מוגדר `type: "מחושב" | "יעד פיילוט" | "מבני"`,
`baseline: null` תמיד (פסיקת גל 7: אף מספר דונור לא מיובא כנמדד). W8-A **צורך** את
הקטלוג הזה (ייבוא, לא שכפול) ומרחיב אותו לסדרות-לפי-תקופה.

**מחושבים (9)** — יש להם `measureMetric()` דטרמיניסטי:
`rec_approved_rate`, `rec_edited_rate`, `rec_rejected_rate` (approvals · extendedState m005),
`support_volume` (supportRequests 30 יום), `escalation_rate` (`effectiveSupport().tier ≥ 2`),
`lead_response_hours` (activities×leads, חציון), `quotation_conversion` (quotations שהוכרעו),
`service_resolution_days` (serviceTickets עם closedAt · m007), `course_completion` (enrollments).

**יעדי פיילוט (7)** — יעד בלבד, ללא מקור מדידה מחובר:
`training_completion`, `exercise_success`, `training_satisfaction`, `consultation_rate`
(אין קישור פגישה↔ליד עקבי), `time_saved_hours`, `nps`, `roi`.

**מבניים (5)** — מוגדרים ללא מקור (אין טלמטריה מקומית):
`knowledge_check`, `instructor_approval`, `wau`, `repeat_usage`, `feature_usage`, `quality_error_rate` (6 בפועל — quality_error_rate כלול).

## 4. Selectors קיימים (`src/domain/selectors/`)

- `dashboardKpis.ts`: `leadsByStage`, `openLeadCount`, `openTickets(+ByPriority)`,
  `quotationSubtotal/Total`, `revenuePipeline`, `totalRevenue`, `courseCompletion`,
  `pendingApprovals`, `automationSuccessRate`, `dashboardKpis` (קומפוזיט).
- `badges.ts`: `isOverdueTask` (due end-of-day), `overdueOrUrgentTaskCount`,
  `openTicketCount`, `blockingSubmissionIssueCount`, `agentTasksAwaitingApprovalCount`.
- `activity.ts` / `funnel.ts` / `search.ts`: פיד פעילות, משפך לידים, חיפוש — לא מדדים ישירים.
- `src/modules/support/lib.ts`: `supportSla(r, nowMs)` (רמות תקין/מתקרב/חריגה),
  `slaCompliancePercent` (null כשאין סגורות), `effectiveSupport` (tier), `recurringIssues`.

## 5. מקורות אירועים אמיתיים לניתוח (קיימים בקוד)

| אוסף | נכתב על ידי | שימוש אנליטי כן |
|------|--------------|------------------|
| `activities` | כל המודולים (לוג פעילות) | פעילות לפי תקופה; תגובה-ראשונה לליד |
| `approvals` (+extendedState) | מנוע האישורים `src/agents/approvalEngine.ts` | שיעורי אישור/עריכה/דחייה |
| `agentRuns` / `agentEvents` | `src/agents/orchestrator.ts` + `runlog.ts` | ספירת ריצות AI מקומיות (Mode A, usageSpentILS מדוד=0) |
| `aiRecommendations` | seed + סוכנים | ספירת המלצות; confidenceMethod null = "טרם נמדד" |
| `auditEvents` | agents/learning/memory (run.create/complete, approval.*, learning.*, memory.*) | ספירת פעולות ממשל. **אין action ייעודי ל-fallback** — ה-fallback הוא נתון בתוך המעטפה (`FallbackDisclosure` ב-`src/ai/providers/registry.ts`), לא רשומת audit. ספירת fallbacks מ-audit תהיה 0 כנה + מגבלה מוצהרת |
| `knowledgeUsage` | `src/knowledge/stores.ts` (שימוש מאמר כראיה) | ספירת שימושי ידע (seed ריק — 0 כנה) |
| `memoryUsage` | `src/memory/**` (איזו גרסה שימשה איזו תשובה) | ספירת שימושי זיכרון (seed ריק — 0 כנה) |
| `supportRequests` (tier m002) | /support | נפח פניות, פילוח Tier, חריגות SLA |
| `learningObservations` / `recommendationOutcomes` | `src/learning/loop.ts` | תוצאות המלצות (seed ריק) |

## 6. מדדים ללא קו בסיס / לא-מדידים (חובת "טרם נמדד")

- **קו בסיס**: לכל 21 מדדי W7-E `baseline: null` ⇒ "לא הוגדר קו בסיס". אין השוואת-בסיס כנה לאף מדד.
- **לא מדידים כעת** (value:null בלבד, לעולם לא 0): NPS, ROI, זמן שנחסך, retention (שימור
  לקוחות — אין הגדרת אירוע נטישה בנתונים), downtime (אין טלמטריית זמינות — האפליקציה
  מקומית), WAU/שימוש חוזר/שימוש ביכולות (אין טלמטריית שימוש), knowledge check, exercise
  success, שביעות רצון הדרכה, consultation_rate (אין קישור פגישה↔ליד), quality_error_rate.
- **יעדי פיילוט** מוצגים תמיד כ"יעד", לעולם לא כתוצאה (rail אוכף: pilot-target-presented-as-outcome).

## 7. פערים שנמצאו בבדיקה (מוזנים ל"מבקר המדדים")

1. mo-3 (automation_success=100) — מדגם 3 ריצות: **מדגם חלקי** מוצהר.
2. md-7 (agent_precision) מול W7-E rec_approved_rate — **שתי דרכי חישוב לאותו מושג**
   (md-7 מוצהר "טרם נמדד", W7-E מחשב מ-approvals). מסווג כ"חישוב סותר" עד איחוד.
3. אין רשומת audit ל-fallback ספקים — ספירה כנה 0 + מגבלה.
4. `metricObservations` ללא שדה בעלים — בעלות נגזרת מהקטלוג בלבד; תצפית שה-key שלה
   לא בקטלוג = "תצפית ללא בעלים".
5. תצפיות ה-seed נושנות (observedAt קבוע-סיד) — כלל "מדד מעופש" (>90 יום) נבדק מול now אמיתי.
