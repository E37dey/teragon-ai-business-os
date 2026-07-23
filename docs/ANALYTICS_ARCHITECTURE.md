# ANALYTICS ARCHITECTURE — W8-A (Wave 8)

## שכבות

```
src/domain/analytics/          ← types + zod + comparison (טהור, ללא IO)
  types.ts      MetricPoint (כל שדות החובה) · MetricSeries · MetricComparison (6 מצבים)
                MetricBreakdown · AnalyticsFilter/Query/View/Dashboard · MetricAlert ·
                ReportDefinition/Run/ExportState · DrilldownRecord
  schemas.ts    zod, מוצמד לטיפוסים עם `satisfies z.ZodType<T>`
  comparison.ts compareMetric — כיוון "טוב" נגזר אך ורק מ-betterWhen

src/analytics/                 ← המנוע (טהור ודטרמיניסטי; השעון מגיע כ-nowISO)
  catalogue.ts  34 מדדים ב-6 הקבוצות (א..ו); כל מדד: kind (מחושב/יעד פיילוט/מבני),
                temporality (series/snapshot), betterWhen, מקורות, מגבלות, בעלים,
                גשרים ל-md-1..9 ול-SUBMISSION_METRICS של W7-E (צריכה, לא שכפול)
  engine.ts     buildPeriods/wholeRange/previousRange · applyFilter · computeBucket ·
                computeSeries · aggregateValue · splitSegments (אין גישור פערים) ·
                drilldownRecords (רשומות אמת לכל נקודה)
  csv.ts        seriesToCsv / reportRunToCsv — null ⇒ תא ריק, לעולם לא 0; רק שדות מדד
  audit.ts      auditMetrics — 8 בדיקות "מבקר המדדים"
  reports.ts    7 הדוחות הקנוניים (rd-1..rd-7) · bootstrap אידמפוטנטי · buildReportRun

src/repositories/analyticsStores.ts ← seam טיפוסי לאוספי W8 + גשרי קריאה
src/modules/analytics/         ← העמוד (default export: AnalyticsPage)
  AnalyticsPage.tsx  6 קבוצות · מסננים (טווח/קבוצה/בעלים/סוג ישות/סטטוס) · השוואת
                     תקופות · drilldown drawer · תצוגות שמורות (analyticsViews) ·
                     CSV (Blob אמיתי) · טאב דוחות · rail "מבקר המדדים"
  MetricChart.tsx    SVG טהור; נקודת null שוברת את הקו; כל נקודה לחיצה → drilldown
  reportPrint.tsx    תצוגת הדפסה A4/RTL לפי חוזה ה-print של submission (מוני עמודים,
                     מוצר/גרסה/תאריך/בעלים); Save-as-PDF של הדפדפן בלבד
```

## חוקי כנות (נאכפים בבדיקות)

1. `value: number | null` — null = "טרם נמדד", לעולם לא מוצג/מיוצא כ-0 (בדיקות
   engine + csv + page). ספירת רשומות אמת יכולה להיות 0 כן.
2. יחס עם מכנה ריק ⇒ null; חציון על מדגם ריק ⇒ null.
3. כיוון השוואה נגזר רק מ-betterWhen (זמן-פתרון נמוך=טוב, השלמה גבוה=טוב — שתי
   הקוטביות נבדקות); snapshot / betterWhen none ⇒ not_applicable; אין נתון נוכחי ⇒
   insufficient_data; אין תקופת ייחוס ⇒ no_baseline.
4. פער בסדרה שובר את הקו (splitSegments) — אין אינטרפולציה.
5. drilldown של כל נקודה = הרשומות האמיתיות שהניבו אותה (ids מהאוספים).
6. דוח: generatedBy = משתמש בשם, rows מהמנוע, מגבלות מצטברות, exportState מתועד.
7. bootstrap הדוחות אידמפוטנטי (ids יציבים rd-1..rd-7).

## תלות בקוד קיים (צריכה בלבד)

- `src/domain/submission/metricLevels.ts` (W7-E) — הטיפוס `SubmissionMetricType` +
  `SUBMISSION_METRICS` (מוזנים ל-audit ולגשרים).
- selectors: `dashboardKpis` (revenuePipeline/totalRevenue/courseCompletion/
  automationSuccessRate/openTickets), `badges.isOverdueTask`.
- `modules/support/lib`: `supportSla`, `effectiveSupport` (אותו seam ש-W7-E צורך).

## מה לא נבנה בכוונה

- אין טלמטריית שימוש (WAU/שימוש חוזר) — החלטת ממשל נדרשת קודם; המדדים מוצגים כמבניים.
- אין רשומת audit ל-fallback ספקים — המדד סופר בכנות 0 עד שיתווסף תיעוד (מגבלה מוצהרת).
- אין PDF native — הדפסת דפדפן בלבד, כמו submission.
