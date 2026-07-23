# INTEGRATION REQUESTS — W7-A (Implementation Programme)

23.07.2026 · מגיש: W7-A · קבצים משותפים לא נגעו — כל הבקשות ל-Integration Lead.

| # | קובץ משותף | שינוי מבוקש | פרטים |
|---|-----------|--------------|-------|
| 1 | `src/app/router.tsx` | חיבור ראוט `/implementation` | להוסיף ל-MODULE_PAGES: `"/implementation": lazy(() => import("@/modules/implementation/ImplementationPage"))` (default export קיים; הראוט כבר מוגדר ב-routes.ts, wave 7) |
| 2 | boot path (`src/main.tsx` / seedIfEmpty) | הפעלת ה-bootstrap בעלייה | אופציונלי: `ensureImplementationProgramme(implementationStores())` מ-`@/domain/adoption` (אידמפוטנטי). כיום העמוד מריץ אותו ב-mount עם single-flight guard, כך שאין חובה |
| 3 | W7 stage-gates workstream | צריכת שער הראיות וההחלטות | עמוד `/stage-gates` מוזמן לצרוך: `evidenceEligibility` + `resolveEvidence` + `decideGate` מ-`@/domain/adoption` — אותו שער בדיוק (Go נחסם על ראיה חסרה, audit לכל הכרעה). רשומות ההחלטות: `implementationDecisions` ids `idec-1..6`, שמות G1–G6 לפי פרק 14 |
| 4 | W7 submission workstream | מיפוי שלב→תוצרי הגשה | `STAGE_TO_SUBMISSION_DELIVERABLES` ב-`@/domain/adoption/selectors` הוא מיפוי סטטי ראשוני (rail). אם ל-W7-הגשה יש מיפוי קנוני מרשומות `submissionDeliverables` — להחליף את הסטטי בנגזר ולעדכן כאן |
| 5 | `src/repositories/seed/seedData.ts` (קפוא ל-W7-A) | יישור קבוע של seed השלבים | ראו "מיגרציית C4" למטה — כרגע נפתר ברמת הרשומות; מומלץ ל-Lead ליישר גם את קובץ ה-seed עצמו כדי שהתקנה נקייה תיוולד קנונית |

## מיגרציית C4 — יישור שמות שלבי ה-seed (החלטת Lead)

הרשומות השמורות `implementationStages` (is-1..is-6) נולדות מה-seed עם שמות תכנית
**בניית התוכנה** ("תשתית ונתונים", "מסכי ליבה — CRM ומכירות", "למידה ושירות",
"סוכני AI ואישורים", "זיכרון, ידע ודוחות", "הטמעה והשקה"). לפי החלטת ה-Lead
(סתירה C4), מפת הדרך של האימוץ היא הקנונית. `alignSeedStages`
(`@/domain/adoption/stageBridge`, רץ מתוך ה-bootstrap) משכתב את הרשומות 1:1 לפי סדר:

| id | שם ישן (נשמר ב-legacyName) | שם קנוני חדש |
|----|---------------------------|---------------|
| is-1 | תשתית ונתונים | בעיה ותוצאה עסקית |
| is-2 | מסכי ליבה — CRM ומכירות | מפת AS-IS-TO-BE וגבולות אדם-AI |
| is-3 | למידה ושירות | שבע פרסונות ותכנית הדרכה |
| is-4 | סוכני AI ואישורים | פיילוט מבוקר |
| is-5 | זיכרון, ידע ודוחות | הרחבה בגלים |
| is-6 | הטמעה והשקה | שגרה בקרה ושיפור מתמשך |

ids נשמרים · `gateId`/תאריכים לא משוכתבים · `legacyName` נכתב פעם אחת ·
המיגרציה אידמפוטנטית. **קובץ ה-seed המשותף לא נגע** — מומלץ ל-Lead ליישר גם אותו
(או להשאיר את המיגרציה כמקור אמת) ולוודא שעמודים אחרים שקוראים `implementationStages`
(אם יש) מצפים לשמות הקנוניים.

## סטיות ותיעוד כנות

- **גל 4**: המנדט קובע "מחלקות נוספות"; המסמך התורם כתב "מחלקות דומות (~500)". יושם
  לפי המנדט; קהל הגל נוסח מחדש ("הרחבה לקורסים ולמדריכים").
- **רשימות גבולות אדם-AI**: המסמך התורם מכיל 4+4 פריטים (דורש אישור/אסור); המנדט דורש
  6+5. הפריטים שהושלמו נגזרים ממדיניות קיימת במסמך (סף ביטחון 70%, בדיקת VIP/עסקה
  גדולה, בעלות אדם על Go/No-Go) — מסומן גם ב-ADOPTION_ARCHITECTURE.md.
- **מספרים תורמים** (₪3,840, WAU 70%, NPS, דקות): יובאו אך ורק כיעדים עם הערת מקור או
  כהערכות ב-methodHe — אף פעם לא כערך מדוד (החלטת Lead).
- **חריגת print**: `AsIsToBe` מכיל `@media print` עם רקע בהיר — נדרש במפרט 7.3 (A4);
  תצוגת האפליקציה נותרת tokens כהים בלבד.

## הערות תלות

- אין תלות חדשה ב-package.json. Gantt = SVG טהור.
- אין כתיבה לאוספים משותפים פרט ל: `implementationStages` (מיגרציית C4 בלבד) ·
  `auditEvents` (רק דרך `decideGate`, בעת הכרעה אנושית).
