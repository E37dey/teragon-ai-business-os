# W7-E → Integration Requests (Wave 7)

23.07.2026 · מאת: W7-E (מרכז ההגשה, מדידה, ולידטור איכות)

## 1. חיווט הראוטר (Integration Lead)

להחליף placeholder אחד בעמוד הממומש (default export):

```
"/submission" → lazy(() => import("@/modules/submission/SubmissionPage"))
```

- העמוד כולל `PageRail` פנימי ("מבקר ההגשה") — אין צורך ב-rail נפרד.
- אין תלות npm חדשה; אין שינוי ב-collections (submission*/qualityValidations
  כבר קיימים ב-IDB v5).
- תצוגת ההדפסה היא אותו נתיב עם `?print=1` — אין ראוט נוסף.
- `/submission/presentation` נשאר בבעלות W7-F — לא נגעתי בו.

## 2. תפרי W7-F (מצגת ההגשה)

- W7-E קורא `presenterNotes` ו-`presentationSections` בקריאה בלבד:
  - `presenterNotes` ריק ⇒ כל תוצר מציג "חסר — הערות מרצה טרם נוצרו (W7-F)" +
    ממצא אזהרה ברייל. שדה אופציונלי `deliverableKey` על רשומת הערה ימפה אותה
    לתוצר (`PresenterNoteLike`, `src/domain/submission/deliverables.ts`).
  - `presentationSections` עם `durationMinutes` מספרי ⇒ סכום מעל 10 דקות מדליק
    ממצא חוסם "חריגת זמן במצגת".
- אם W7-F בוחר שמות שדה אחרים — לעדכן את שני ה-Like-types במקום אחד.

## 3. אישורי תוצרים (מנוע האישורים הקנוני)

תוצר מגיע ל"מלא" רק עם רשומת Approval בסטטוס "אושר" שבה
`subjectRef = "submission-deliverable:<key>"` (12 המפתחות ב-
`REGISTRY_DELIVERABLE_KEYS`). לא נוצרו אישורים כאלה — המצב ההתחלתי הכן הוא
0/12 "מלא". יצירת האישורים היא פעולת מפעיל/Lead דרך המנוע הקנוני, לא seed.

## 4. הערות ל-Lead

- המסך מריץ בעלייה bootstraps אידמפוטנטיים של דומיינים שכנים (stage-gate
  ensureBridge, ensureCanonicalObjections, ensureCanonicalMaterials,
  ensureImplementationProgramme) כדי ש-/submission יהיה עקבי בלי תלות בסדר
  ביקור מסכים. כולם קיימים ומיוצאים על ידי בעליהם; אין כתיבה מחוץ לחוזים
  שלהם.
- `src/domain/submission/metricLevels.ts` מייבא `effectiveSupport` ו-selectors
  מ-`@/modules/support/lib` (שכבת מודול) — אם ה-Lead מעדיף, אפשר להעלות את
  הפונקציות הטהורות האלה לדומיין בסוף הגל (copy-move, אין תלות מעגלית).
- מזהי רשומות איכות דטרמיניסטיים: `qv-<deliverableKey>-<1..8>`; צילומי מצב:
  `ssnap-N`.
