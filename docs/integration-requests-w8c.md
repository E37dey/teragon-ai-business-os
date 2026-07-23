# INTEGRATION REQUESTS — W8-C (ADMINISTRATION)

בקשות ל-Integration Lead (קבצים משותפים אסורים לסוכני workstream):

## 1. חיווט ראוט (חובה להשלמת המסך)

- **קובץ**: `src/app/router.tsx` (MODULE_PAGES)
- **שינוי**: `"/administration": lazy(() => import("@/modules/administration/AdministrationPage"))`
- הראוט `/administration` כבר קיים ב-`routes.ts` (title "ניהול המערכת") — נדרש רק מיפוי העמוד. default export קיים.

## 2. אכיפת דגל השבתת אוטומציות

- **קובץ**: `src/modules/automations/**` (בעלות W5)
- **שינוי**: לפני הרצת אוטומציה — `isEmergencyFlagActive("automation-execution-disable")` מ-`@/administration` ⇒ סירוב עם הודעה כנה. הדגל כבר נכתב ומתועד ברשומת חירום + audit; חסרה רק האכיפה בצד האוטומציות.

## 3. אכיפת מצב קריאה בלבד כלל-מערכתית

- **קבצים**: מודולים משנים (crm/sales/service/…), בדפוס של `useDemoModeGuard`
- **שינוי**: `useEmergencyFlags().flags.readOnlyMode` ⇒ חסימת פעולות כתיבה עם `disabledReason`. במודול הניהול המצב כבר נאכף (השירות דוחה כל מוטציה).

## 4. אוספים ייעודיים (Wave 9, לא דחוף)

- **קובץ**: `src/repositories/collections.ts` (+ bump IDB)
- **שינוי**: פיצול `accessChangeRequests` לשלושה אוספים (`roleAssignments`, `accessChangeRequests`, `emergencyDisables`). כיום שלוש הרשומות חיות באוסף אחד עם `recordKind` מפלה (רישום האוספים קפוא לגל) — עובד, מתועד ב-ADMINISTRATION_MODEL §5, אך אוספים ייעודיים נקיים יותר.

## 5. (רשות) חסימת סוכני AI כמאשרים במנוע הקנוני

- **קובץ**: `src/agents/approvalEngine.ts` (קפוא ל-W5-C)
- **שינוי מוצע**: `decide()` יזרוק על `decidedById` שהוא `ag-*` — כיום החסימה קיימת בשכבת הניהול (W8-C) ובסכמות, אך המנוע עצמו אינו בודק. סגירת הפער במנוע תגן גם על צרכנים אחרים.
