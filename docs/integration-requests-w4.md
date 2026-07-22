# Integration Requests — Wave 4 (Operations)

בקשות לשינויים בקבצים משותפים (domain / repositories / design-system) שמחוץ לבעלות W4.
לכל בקשה מומש **workaround מקומי** בתוך המודול — שום מסך לא נחסם.

## 1. ServiceTicket — שדות טכניים חסרים

**מבוקש:** `diagnosis`, `estimatedPrice`, `qualityCheckDone`, `customerInstructions`, `mediaRefs[]`, `closedAt` על `ServiceTicket`.
**Workaround מקומי:** פעולות תיקון מוקלדות עם קידומת (`אבחון: / חלק: / בדיקה: / בדיקת איכות: / הנחיות ללקוח: / תיקון:`) ב-`RepairAction.description` (parser ב-`src/modules/service/lib.ts`); אומדן מחיר + קישור מדיה מצורפים ל-`description` של הקריאה בעת היצירה; הנחיות ללקוח נשמרות ב-`solution`; שעון SLA לקריאה סגורה נעצר ב-`updatedAt` (בהיעדר `closedAt` — מתועד כמגבלת כנות).

## 2. Task — מצבי עבודה תפעוליים + סוג בעלות

**מבוקש:** `workState` (6 מצבים: לביצוע/בביצוע/ממתין ללקוח/ממתין לאישור/חסום/הושלם) + `ownership` (אנושית/סוכן/משותפת) על `Task`.
**Workaround מקומי:** מרקרים קומפקטיים בתוך `description` — `⟦מצב:X⟧`, `⟦בעלות:משותפת⟧` (`src/modules/tasks/lib.ts`, round-trip נבדק ביחידה). המרקרים עלולים להופיע כטקסט גולמי במסכים אחרים שמציגים `description` — סיבה נוספת להעדיף שדה אמיתי.

## 3. SupportRequest — Tier / מטפל / קטגוריה / משוב

**מבוקש:** `tier (1|2|3)`, `assigneeId`, `category`, `feedback` על `SupportRequest`; רצוי גם `organizationId` להסכמי תמיכה ארגוניים.
**Workaround מקומי:** מרקרים ב-`description` — `⟦Tier:N⟧`, `⟦מטפל:id⟧`, `⟦משוב:חיובי|שלילי⟧`; קטגוריה נגזרת דטרמיניסטית ממילות מפתח (`categorize`, מסומן "מנוע מקומי מבוסס כללים").

## 4. CourseSession — רשומת נוכחות מובנית

**מבוקש:** `attendance: { studentId: string; present: boolean }[]` על `CourseSession` (או collection נפרד).
**Workaround מקומי:** רישום נוכחות נשמר כטקסט מובנה ב-`notes`: `נוכחות (k/n): שם, שם` — נשמר, נפרס חזרה בעת עריכה חוזרת.

## 5. CustomerPrinter — אחריות ותחזוקה

**מבוקש:** `warrantyUntil` מפורש + `lastMaintenanceAt` / `maintenanceIntervalDays`.
**Workaround מקומי:** נגזרות מדיניות-מודול (12 חודשי אחריות מ-`purchasedAt`, תחזוקה כל 180 יום מהמגע האחרון — קריאה/פעולת תיקון מקושרות) ב-`src/modules/printers/lib.ts`; הקישור קריאה↔מדפסת הוא heuristic (אותו לקוח + שם דגם בשדה הטקסט `printer`) — שדה `customerPrinterId` על `ServiceTicket` יעשה את זה מדויק.

## 6. Document / Meeting — קישור ארגוני

**מבוקש:** `relatedRef` על `Document` (למסמכים ארגוניים); כיום מסך הארגונים מציג רק מסמכים גלויים עם הערת כנות.

## 7. Activity.kind — ערכים חדשים בשימוש

מסכי W4 כותבים `kind: "משימה"` ו-`kind: "תמיכה"` (לצד הקיימים "קורס"/"קריאת שירות"/"מערכת"). אם ל-Command Center יש רשימת kinds סגורה — לעדכן אותה.

## 8. עומס צ'אנק ראשי

`index-*.js` ≈ 572kB (אזהרת rolldown). לא באחריות W4 (דפי W4 מפוצלים lazy) — מועבר ל-Architect.
