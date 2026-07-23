# INTEGRATION REQUESTS — W8-E (Cross-Module Integration, Wave 8)

בקשות ל-Integration Lead בלבד (קבצים בבעלות ה-Lead — W8-E לא נגע בהם).

## 1. חיווט applyUiSettings בעליית האפליקציה (main.tsx — חובה לסגירת w8d #3)

ב-`src/main.tsx`, אחרי `seedIfEmpty()` והמיגרציות, להוסיף:

```ts
import { applyUiSettingsAtBoot } from "@/integration/wave8/applyUiSettings";
void applyUiSettingsAtBoot();
```

המודול `src/integration/wave8/applyUiSettings.ts` כבר קיים ונבדק: קורא את רשומת
ההגדרות (meta/settings) ומחיל את הצפיפות; לעולם אינו זורק — שגיאה מחזירה false
והאפליקציה עולה עם ברירת המחדל. בלי החיווט, density מוחל רק אחרי ביקור ב-/settings.

## 2. עדכון משפט ה"היקף הכן" של דגל השבתת האוטומציות (service.ts — W8-C)

בוצע חיווט האכיפה (בקשת w8c #2): מודול האוטומציות אוכף כעת את
`automation-execution-disable` — הכפתורים "בקש אישור להרצה/לביצוע" מושבתים עם
הסיבה, ו-requestExecution מסרב בקריאה טרייה של הדגל
(`src/integration/wave8/automationExecutionGuard.ts` + עריכה תחומה ב-
`src/modules/automations/AutomationsPage.tsx`).

`EMERGENCY_HONEST_SCOPE_HE["automation-execution-disable"]` ב-
`src/administration/service.ts` (בבעלות W8-C) עדיין אומר "אכיפה במודול
האוטומציות ממתינה לחיווט" — מבוקש עדכון המשפט ל:
"הדגל נאכף במודול הניהול ובמודול האוטומציות (בקשות הרצה נחסמות עם סיבה)".
שינוי טקסט בלבד; ייתכן שנדרש עדכון מקביל בבדיקות W8-C אם הן מצמידות את הנוסח.

## 3. (רשות) הצגת ראיות Wave-8 בעמוד ההגשה (SubmissionPage — W7-E)

נוספו refs אדיטיביים ב-`src/domain/submission/wave8Evidence.ts`
(`WAVE8_DELIVERABLE_EVIDENCE`, `wave8EvidenceFor`, `wave8EvidenceSummaryHe`,
`WAVE8_PENDING_APPROVAL_HE`). שער המוכנות לא נגוע — המצבים לא השתנו.
מוזמן (לא חוסם): רינדור הרשימה בכרטיס התוצר ב-`/submission` עם התווית
"ממתין לאישור אנושי בשם" (הקבוע כבר מיוצא).

## 4. אימותים שבוצעו (אין פעולה נדרשת)

- **w8a #3 (audit ל-fallback)** — מומש: `src/ai/providers/registry.ts` כותב
  AuditEvent עם `action:"ai.fallback"` בכל fallback מרוחק→מקומי (sink מוזרק,
  ברירת מחדל repository; כשל audit לעולם אינו שובר את הבחירה). המדד
  `ai_fallbacks` סופר כעת אירועים אמיתיים.
- **w8d #4 (אירועי בריאות בעמוד הממשל)** — מומש: אומת שחסר, ונוסף
  `src/integration/wave8/healthIncidents.ts` (פיצול לפי `source:"system-health"`
  + סגירה מבוקרת עם audit) ורינדור בעריכה תחומה ב-GovernancePage
  (מקטע "אירועי בריאות המערכת", data-testid="zone-health-incidents").
- **Phase 8.13** — רצועת הניהול חיה במרכז הפיקוד:
  `src/modules/command-center/ManagementBand.tsx` מעל
  `src/integration/wave8/managementBand.ts` (7 פריטים נגזרים + click-through).

## סטטוס

| # | קובץ | שינוי | סטטוס |
|---|------|-------|--------|
| 1 | src/main.tsx | קריאת applyUiSettingsAtBoot | ממתין ל-Integration Lead |
| 2 | src/administration/service.ts | עדכון משפט היקף כן (טקסט) | ממתין ל-Lead / W8-C |
| 3 | src/modules/submission/SubmissionPage.tsx | רינדור ראיות Wave-8 | רשות — לא חוסם |
| 4 | — | אימות/מימוש בלבד | בוצע (מסמך זה) |
