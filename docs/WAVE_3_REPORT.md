# WAVE 3 REPORT — CRM & Revenue (Command Center · CRM · Customer 360 · Sales · Documents)

תאריך: 23.07.2026 · סוכן: Wave 3 (CRM and Revenue) · worktree מבודד, branch `feat/social-distribution-phase-b`

## מסכים שנבנו (החלפת stubs, שמות default-export ללא שינוי)

| ראוט             | קובץ                                            | ה-workflow המרכזי                                                                                                                                          |
| ---------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`              | `src/modules/command-center/CommandCenterPage.tsx` | ברכה לפי שעה ("בוקר/צהריים/ערב טוב, צחי") · רצועת KPI מ-`dashboardKpis` · מרכז החלטות AI (מעטפה מלאה + אישור/דחייה אמיתיים על רשומת Approval) · רשת 7 סוכנים + handoffs ("מצב הדגמה מקומי") · משפך מכירות · מצב קורסים/שירות · מגמת הכנסות לפי חודש · ציר זמן יומי · תור פולואו-אפ · פעילות אחרונה |
| `/crm`           | `src/modules/crm/CrmPage.tsx`                   | TanStack Table אמיתי: מיון, סינון (סטטוס/בעלים/מקור/טקסט), תצוגות שמורות (localStorage), עימוד, הרחבת שורה (היסטוריה), יצירת ליד+לקוח (zod), שיוך בעלים inline, עדכון סטטוס + פעולה באה + תאריך מעקב · טאב לקוחות → ניווט ל-360 |
| `/customers`     | `src/modules/customers/CustomersPage.tsx`       | רשימת לקוחות עם חיפוש/סינון סוג, KPI נגזרים, יצירת לקוח, ניווט לכרטיס                                                                                    |
| `/customers/:id` | `src/modules/customers/CustomerDetailPage.tsx`  | כותרת זהות (שם/ארגון/סטטוס/בעלים/פעולה באה) + רצועת KPI + 9 טאבים חיים: ציר זמן ממוזג, פרטי קשר (עריכה zod), מדפסות, קורסים, הצעות, קריאות, מסמכים, משימות, זיכרון לקוח |
| `/sales`         | `src/modules/sales/SalesPage.tsx`               | Stepper של 10 שלבי המסע (RTL) עם ספירות · קידום שלב שנשמר (repo + localStorage) · טופס אבחון צרכים · מנוע התאמה דטרמיניסטי מקטלוג `printerModels` בלבד ("מנוע מקומי מבוסס כללים") עם התאמה/מגבלות/אביזרים/קורס/אומדן · Preview→Approve שיוצר טיוטת Quotation |
| `/documents`     | `src/modules/documents/DocumentsPage.tsx`       | רשימת הצעות (סינון סטטוס/תוקף) · עורך הצעה: שורות מקטלוג המוצרים + שורה חופשית, כמות/מחיר, ולידציית הנחה ≤30% עם שגיאה עברית, מע"מ 18%, סכומים נגזרים, גרסה, זרימת סטטוסים, משימת מעקב לתפוגה · תצוגת הדפסה RTL (window.print, **כל שדה עובר escapeHtml — ה-XSS של הדונור לא שוחזר**) · כפתור PDF מנוטרל בכנות · רשימת מסמכים כללית עם סינון סוג |

## קבצים חדשים/ששוכתבו

- `src/modules/command-center/`: `CommandCenterPage.tsx`, `selectors.ts`
- `src/modules/crm/`: `CrmPage.tsx`, `selectors.ts`, `savedViews.ts`
- `src/modules/customers/`: `CustomersPage.tsx`, `CustomerDetailPage.tsx`, `selectors.ts`
- `src/modules/sales/`: `SalesPage.tsx`, `journey.ts`, `matching.ts`
- `src/modules/quotations/` (ספריית עזר משותפת לגל): `quoteMath.ts`, `printView.ts`, `fmt.ts`
- `src/modules/documents/`: `DocumentsPage.tsx`
- `tests/modules-w3/`: 6 קובצי בדיקה (55 בדיקות חדשות)
- `e2e/`: `w3.config.ts` (פורט 4273), `w3-crm-flows.spec.ts` (10 בדיקות), `w3-screens.spec.ts` (15 צילומים)
- `docs/screenshots/wave3/`: 15 צילומים (5 מסכים × 1920/2560/3840)
- `docs/integration-requests-w3.md`

**לא שונה אף קובץ משותף** (router / OsShell / layout / design-system / domain / repositories / styles / package.json).

## תוצאות שערים (הרצות אמיתיות ב-worktree)

| שער              | פקודה                                | תוצאה                                             | exit |
| ---------------- | ------------------------------------- | ------------------------------------------------- | ---- |
| התקנה            | `npm ci`                              | הותקן נקי                                         | 0    |
| פורמט            | `npx prettier --write <קבצי הגל>`     | הכל מפורמט                                        | 0    |
| Lint             | `npm run lint` (oxlint)               | 0 שגיאות / 0 אזהרות (פלט ריק)                     | 0    |
| Typecheck        | `npm run typecheck` (tsc strict מלא)  | נקי                                               | 0    |
| בדיקות יחידה     | `npm run test` (vitest)               | **16 קבצים · 204 בדיקות עוברות** (149 קודמות + 55 חדשות; תיקון אחד נדרש: הוספת מזהה הלקוח לכותרת ה-360 כדי לספק את router.test הקיים) | 0 |
| Build            | `npm run build`                       | ✓ built (כל מסך chunk נפרד: CrmPage 67.7kB, DocumentsPage 22.0kB, SalesPage 19.9kB, CommandCenter 18.6kB, CustomerDetail 18.4kB) | 0 |
| E2E              | `npx playwright test -c e2e/w3.config.ts` (vite preview :4273) | **25 עוברות** (10 flows + 15 צילומים)             | 0    |

### כיסוי ה-E2E (w3-crm-flows.spec.ts)

1. מרכז הפיקוד נטען עם KPI + מרכז החלטות + "טרם נמדד" + **0 שגיאות קונסול**
2. אישור המלצת AI מעדכן Approval ומציג toast
3. יצירת ליד ב-/crm → מופיע בטבלה **וגם** בתור הפולואו-אפ בדשבורד (אינבלידציה)
4. סינון/מיון בטבלת הלידים
5. כל 9 הטאבים של כרטיס לקוח מתחלפים + טאב הזיכרון מוצא רשומה אמיתית
6. קידום שלב מסע → **שורד reload**
7. מנוע ההתאמה מחזיר רק דגמי קטלוג עם הסברים ואומדן
8. עורך ההצעה גוזר סכומים+מע"מ וחוסם הנחה 45% עם שגיאה עברית ("דורשת אישור מנכ\"ל")
9. תצוגת הדפסה נפתחת כ-popup עם מסמך RTL (כל שדה escaped)
10. כפתור PDF מנוטרל עם סיבה עברית גלויה

### בדיקות יחידה חדשות (tests/modules-w3)

- `quoteMath.test.ts` — סכומים/הנחה/מע"מ 18%/זרימת סטטוסים/תפוגה (12)
- `printView.test.ts` — escapeHtml מלא + מסמך עוין לא מזליג HTML (5)
- `commandCenterSelectors.test.ts` — ברכה לפי שעה, הכנסות לפי חודש, תור פולואו-אפ, ציר יומי, המלצות ממתינות (8)
- `crmSelectors.test.ts` — סינון, המרה (cohort מוכרע, null כשאין), חדשים-בשבוע, חמים, התיישנות, תצוגות שמורות (10)
- `salesJourney.test.ts` — 10 שלבים, מיפוי גס↔עדין, קידום, פרסיסטנטיות, המרה, תקועות (9)
- `printerMatching.test.ts` — דטרמיניסטי, קטלוג-בלבד, רזין/ABS/תקציב, אומדן פתרון (8)
- `customer360Selectors.test.ts` — ציר זמן ממוזג, זיכרון-ללקוח, משימות, פריטים פתוחים (3 describe)

## Visual QA

15 צילומים ב-`docs/screenshots/wave3/`. הושוו מול `teragon-command-center.png` ו-anti-patterns של VISUAL_DNA:
ניווט בימין ✓ · rail בשמאל ✓ · אין רקע בהיר/כרטיס לבן ✓ · אין עברית חתוכה ✓ · אף מסך אינו שיבוט דשבורד ✓ · מספרים ב-`os-num` ✓.

**מחזורי תיקון:** Customer 360 — מחזור 1: ה-canvas היה דליל וחסרה רצועת מדדים עמודית ⇒ נוספה רצועת 6 KPI נגזרים (הכנסות/הצעות/קריאות/משימות/מדפסות/שביעות רצון "טרם נמדד"); צולם מחדש ואושר. שאר המסכים אושרו במחזור הראשון. נבדק גם ב-2560 וב-3840 (ללא שבירה; טבלאות גוללות בתוך `os-table-scroll`).

## כנות AI

- כל המלצה מוצגת עם המעטפת המלאה: המלצה/סיבה/ראיות (claims מרשומות Evidence)/`ConfidenceBar value={null}` → "טרם נמדד" + תיאור שיטת ההערכה/פעולה באה/כפתורי אישור-דחייה שמעדכנים את רשומת ה-Approval ואת ה-AgentTask המקושר.
- רשת הסוכנים ומנוע ההתאמה מסומנים "מצב הדגמה מקומי" / "מנוע מקומי מבוסס כללים"; אין claims של מודל/טוקנים/דיוק.
- מדדים לא מדידים מוצגים "טרם נמדד" (המרה ללא cohort מוכרע, מגמה עם חודש יחיד, ביקורת חסרה).

## מגבלות ידועות / סטיות

1. **שלב מסע עדין** נשמר ב-localStorage (השלב הגס נשמר ב-repository) — ראו integration-requests #1.
2. **גרסת הצעה** = מונה עריכות localStorage — ראו #2.
3. **סטטוסי הצעה** לפי ה-domain הקנוני (נשלחה/אושרה/נדחתה), לא בנוסח המילולי של הבריף — ראו #3.
4. **ייצוא PDF** לא ממומש — הכפתור מנוטרל עם הסיבה "ייצוא PDF ייתמך בגל עתידי — השתמשו בתצוגת הדפסה".
5. טאב "מסמכים" בכרטיס לקוח מציג מסמכי קורסים בלבד (ה-domain לא קושר מסמך ללקוח) — ראו #4.
6. שמירת תצוגה ב-CRM משתמשת ב-`window.prompt` לשם התצוגה (פשוט ועובד; מודאל ייעודי — שיפור עתידי).
7. הבדיקה `tests/router.test.tsx` (של סוכן אחר) דרשה שהמזהה יופיע ב-/customers/:id — נפתר בהצגת המזהה בכותרת הכרטיס (שינוי בקובץ שבבעלותי בלבד).
