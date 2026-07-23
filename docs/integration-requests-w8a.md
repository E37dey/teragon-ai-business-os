# INTEGRATION REQUESTS — W8-A (Analytics)

בקשות ל-Integration Lead (קבצים משותפים — W8-A לא נגע בהם).

## 1. router — חיבור /analytics לעמוד האמיתי

`src/app/router.tsx` · הוספה ל-`MODULE_PAGES`:

```ts
"/analytics": lazy(() => import("@/modules/analytics/AnalyticsPage")),
```

הראוט `/analytics` כבר קיים ב-`routes.ts` ("דוחות וניתוחים") ומרונדר כיום כ-placeholder.
העמוד עומד בחוזה העמוד (default export, PageRail, design-system בלבד, repositories בלבד).

## 2. אימות — הראוט של W7-E "רמות המדידה" מצביע ל-/analytics

נבדק: התוצר metric-levels של W7-E מפנה ל-/analytics. לאחר בקשה #1 היעד נפתר לעמוד
אמיתי שמציג את שלוש הרמות (מחושב/יעד פיילוט/מבני) בתוך 6 הקבוצות, כולל הגשרים
ל-SUBMISSION_METRICS (`submissionKey` בקטלוג) — הקישור הופך משמעותי, לא placeholder.

## 3. (רשות, לגל עתידי) audit ל-fallback ספקי AI

כדי שהמדד `ai_fallbacks` יimpact מדידה אמיתית ולא 0 מוצהר: כשה-ProviderRegistry
(src/ai/providers/registry.ts — בבעלות workstream אחר) מחזיר `fallback !== null`,
לכתוב AuditEvent עם `action: "ai.fallback"`. עד אז המדד מציג 0 כן + מגבלה מוצהרת.

## סטטוס

| # | קובץ | שינוי | סטטוס |
|---|------|-------|--------|
| 1 | src/app/router.tsx | MODULE_PAGES["/analytics"] | ממתין ל-Integration Lead |
| 2 | — | אימות בלבד | בוצע (מסמך זה) |
| 3 | src/ai/providers/registry.ts | audit ל-fallback | הצעה — לא חוסם |
