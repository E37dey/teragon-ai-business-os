# WAVE 8 — W8-A ANALYTICS REPORT

Workstream: W8-A (Phases 8.0-analytics + 8.1 + 8.2 + 8.3) · תאריך: 23.07.2026

## מה נבנה

- **8.0** `docs/WAVE_8_METRIC_INVENTORY.md` — מלאי מלא מבדיקת קוד אמיתית: md-1..9,
  mo-1..3, 21 מדדי W7-E (9 מחושבים / 7 יעדי פיילוט / 5+1 מבניים), selectors, מקורות
  אירועים, פערים (חישוב סותר md-7, אין audit ל-fallback, מדגם-3 ב-mo-3).
- **8.1** דומיין (`src/domain/analytics`): MetricPoint עם כל שדות החובה
  (metricDefinitionId/periodStart/periodEnd/value/unit/source/calculationMethod/
  measured/calculatedAt/limitations/sampleSize/dataCompleteness; value:null לעולם לא
  0), MetricSeries/Comparison(6 מצבים)/Breakdown/Alert, AnalyticsDashboard/View/
  Filter/Query, ReportDefinition/Run/ExportState + zod מוצמד. מנוע
  (`src/analytics/engine.ts`): חישוב טהור ודטרמיניסטי מעל האוספים הקנוניים.
- **8.2** `/analytics` (`src/modules/analytics/AnalyticsPage.tsx`, default export):
  6 הקבוצות (א פעילות והטמעה / ב מכירות ולקוחות / ג שירות ותפעול / ד הדרכה ולמידה /
  ה AI וממשל / ו תוצאות עסקיות), מסנני טווח/קבוצה/בעלים/סוג-ישות/סטטוס, השוואת
  תקופות עם צ'יפים כנים, כל נקודת גרף לחיצה → drilldown של רשומות המקור האמיתיות עם
  קישורים, תצוגות שמורות (analyticsViews) + איפוס, ייצוא CSV (Blob אמיתי, מיושם),
  הדפסה, גרפים SVG טהורים + חלופת טבלה נגישה, תוויות עברית, ‎.os-num ל-LTR, מצבי
  ריק/אין-די-נתונים, פער ⇒ קו שבור (ללא גישור). Rail "מבקר המדדים" — 8 בדיקות,
  כל ממצא פותח את המדד.
- **8.3** 7 ה-ReportDefinitions הקנוניים (bootstrap אידמפוטנטי, rd-1..rd-7):
  פעילות שבועי / מכירות חודשי / שירות ותקלות / התקדמות תלמידים / אימוץ והטמעה /
  ממשל AI / מוכנות להגשה. הפקת ReportRun משורות מנוע אמיתיות (generatedBy,
  limitations, exportState), תצוגת אפליקציה + תצוגת הדפסה לפי חוזה ה-print של
  submission (A4/RTL/מוני עמודים/כותרת מוצר-גרסה-תאריך-בעלים) + CSV.
  Save-as-PDF של הדפדפן בלבד.

## פיצול כנות: מחושב מול לא-נמדד (34 מדדים)

- **מחושבים (24)**: activities_count, knowledge_usage_count, memory_usage_count,
  support_volume, leads_new, lead_first_response_hours, quotations_created,
  quotation_conversion, pipeline_value, service_resolution_days, sla_breaches,
  tasks_overdue, escalation_rate, open_tickets, enrollment_progress,
  rec_approved/edited/rejected_rate, ai_runs_count, ai_recommendations_count,
  ai_fallbacks, automation_success, approved_revenue, revenue_total — כולל
  ספירות שהן 0 כן על seed ריק: knowledge/memory usage, agentRuns, fallbacks.
- **יעדי פיילוט (5)**: training_completion, training_satisfaction, nps, roi,
  time_saved_hours — value:null + "טרם נמדד" + מגבלות; לעולם לא מוצגים כתוצאה.
- **מבניים (5, בלי מקור)**: wau, repeat_usage, knowledge_check, customer_retention,
  downtime — מוגדרים, לא נמדדים, הסיבה מוצהרת.
  (הפיצול המדויק נבדק בבדיקה `catalogueSplit` — לא מועתק ידנית.)

## בדיקות (tests/analytics — 53)

engine 9 (דטרמיניזם מול seed, null-לעולם-לא-0, מכנה-ריק ⇒ null, ספירת-0 כנה,
periods ללא חפיפה/פער, פיצול הקטלוג, 6 קבוצות) · comparison 10 (שתי הקוטביות לפי
betterWhen, unchanged, insufficient_data, no_baseline, not_applicable, deltaAbs) ·
gaps 4 (פער ⇒ קו שבור) · csv 4 (התאמת שורות, null ⇒ תא ריק, ללא PII/סודות, דוח) ·
reports 5 (7 מוגדרים+schema, bootstrap אידמפוטנטי, שורות אמת+generatedBy+מגבלות,
מוכנות-להגשה כנה, דטרמיניזם) · drilldown 5 (התאמה מדויקת לרשומות seed, ריק למדדים
לא-נמדדים) · audit 11 (כל 8 הבדיקות על fixtures מפרים + שקט על נקיים) · page 5
(6 קבוצות, "טרם נמדד" ולא 0, rail, חלופת טבלה, 7 דוחות).

## שערים (ריצות אמת — ראו פלט בסיכום ה-commit)

oxlint 0/0 · tsc -b 0 · typecheck:tests 0 · vitest 1395/1395 (1342 בסיס + 53) · build ✓

## חריגות/החלטות

1. הראוטר משותף — חיבור `/analytics` הוגש כבקשה #1 ב-`integration-requests-w8a.md`
   (הראוט קיים, מרונדר placeholder עד לחיבור).
2. `ai_fallbacks` נספר מ-audit אך אין כיום action ייעודי ⇒ 0 כן + מגבלה; בקשה #3
   מציעה תיעוד עתידי.
3. `quotation_conversion`/`approved_revenue` — אין שדה מועד-הכרעה; updatedAt משמש
   קירוב מוצהר (limitation על הנקודה).
4. rail findings אינם נשמרים ל-`metricAlerts` (מחושבים חיים בכל רינדור); הטיפוס
   MetricAlert + schema קיימים לאוסף למי שיזדקק לפרסיסטנטיות.
