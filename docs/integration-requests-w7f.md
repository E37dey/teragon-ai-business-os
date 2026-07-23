# W7-F → Integration Requests (Wave 7)

23.07.2026 · מאת: W7-F (מצגת ההגשה וחוויית המרצה) · קבצים משותפים לא נגעו — כל הבקשות ל-Integration Lead.

## 1. חיווט הראוטר — `/submission/presentation` כראוט TOP-LEVEL (חשוב)

העמוד `src/modules/presentation/PresentationPage.tsx` (default export) חייב מסך מלא אמיתי, ולכן מבוקש לחווטו **מחוץ ל-OsShell**, כמו `/design` — לא דרך `MODULE_PAGES`:

```tsx
// src/app/router.tsx — בתוך appRouteObjects, אחרי ראוט ה-OsShell:
{
  path: "/submission/presentation",
  element: (
    <Suspense fallback={<div className="os-route-loading" aria-busy="true" />}>
      {lazy-import של "@/modules/presentation/PresentationPage"}
    </Suspense>
  ),
},
```

ובנוסף **להסיר** את `submission/presentation` מילדי ה-OsShell (כיום placeholder דרך APP_ROUTES). אם ה-Lead מעדיף להשאיר את הראוט בתוך ה-Shell — העמוד עדיין עובד (ה-overlay הוא `position:fixed`), אבל כותרות/ניווט ה-Shell יידלקו מאחורי המצגת ב-DOM; top-level הוא הפתרון הנכון.

ה-harness של ה-e2e (`e2e/presentation/harness/main.tsx`) מריץ **בדיוק** את החיווט המבוקש הזה מעל `appRouteObjects` האמיתי — אפשר להעתיק ממנו 1:1. כל 10 בדיקות ה-e2e (config `e2e/w7f.config.ts`, פורט 4873) רצות מולו וירוקות.

## 2. הרכיב הצף "חזרה למצגת" — mounting אפליקטיבי

`ReturnToPresentation` (מ-`@/modules/presentation`) צריך להירנדר **בכל המסכים** (הוא מציג את עצמו רק כשדגל sessionStorage פעיל ולעולם לא על ראוט המצגת). הבקשה: לעטוף את שני הראוטים העליונים ב-layout משותף, או פשוט לרנדר אותו בתוך `OsShell` (נקודה אחת) **וגם** לצד ה-route העליון של המצגת אין צורך — הוא מוסתר שם ממילא. ה-harness מדגים את דפוס ה-layout:

```tsx
{ element: <><Outlet /><ReturnToPresentation /></>, children: [presentationRoute, osShellRoute, designRoute] }
```

## 3. שדות/אוספים

- אין שינוי סכימה: `presentationSections` / `presenterNotes` / `demoSteps` כבר קיימים ב-IDB v5 (הוכנו על ידי ה-Lead). ה-bootstrap שלי (`ensurePresentationContent` + `ensureDemoSteps`) אידמפוטנטי ורץ ב-mount של העמוד — אפשר (לא חובה) להוסיפו ל-boot של `main.tsx`.
- טיפוסים קנוניים: `PresentationSection` / `PresenterNote` / `DemoStep` מוגדרים ב-`src/presentation/types.ts` + zod ב-`schemas.ts`. אם ה-Lead ירצה לקפלם ל-`src/domain/types.ts` — copy-paste, אין תלות מודולרית.

## 4. שער ההדגמה לבוחן — חיווט למודולים אחרים (מניעת שינויים הרסניים)

`useDemoModeGuard()` (מ-`@/presentation`) מחזיר `{ active, guard(actionHe) }`; בזמן מצב הדגמה `guard` מחזיר `allowed:false` עם נימוק עברי. בתוך עמודי W7-F זה נאכף ישירות. מבוקש (לא חוסם) שמסכים עם פעולות הרסניות (מחיקות, אישורי שליחה חיצונית) יקראו ל-hook ויציגו את `reasonHe` במקום לבצע. חלופה פונקציונלית ללא React:‏ `guardDestructiveAction(actionHe, isDemoModeActive())`.

## 5. צילומי גיבוי — הגישה המתועדת

התמונות הועתקו מ-`docs/screenshots/**` (מקור האמת, נרשם ב-`backupImage.sourceFile` של כל שקף) אל `src/modules/presentation/assets/` ומיובאות עם `?url` — כך הן חלק מה-bundle וזמינות offline. מסכי גל 7 טרם צולמו — כל רשומת גיבוי נושאת `honestyNoteHe` שאומר בדיוק מה הצילום מציג (capturedWave < 7, נבדק בטסט). כשצוות ה-QA יצלם את מסכי גל 7 — להחליף את חמשת הקבצים + לעדכן את `content.ts`.

## 6. הערות תיאום

- אין תלות npm חדשה; אין נגיעה ב-`vite.config.ts` (ל-harness יש config עצמאי ב-`e2e/presentation/harness.vite.config.ts`; ה-`dist` שלו לא בקומיט).
- תפר W7-E: קישור הדמו של שקף 5 מפנה ל-`/submission` (כיום placeholder של ה-Lead) — כשמסך W7-E יחווט, הקישור כבר נכון. צעד הדמו ds-10 זהה.
- מדידת חזרות: `actualRehearsalSeconds` נכתב אך ורק ממדידת זמן אמת במצב חזרה (`recordRehearsalSeconds` דוחה ערכים לא-חיוביים); "טרם נמדד" עד אז — אין לזרוע ערכים.
- ההערה מ-W7-D על tm-9 ("מצגת ההגשה" ↔ `/submission/presentation`) נסגרת בזה — הראוט ממומש.
