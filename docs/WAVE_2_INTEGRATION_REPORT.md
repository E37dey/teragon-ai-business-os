# WAVE 2 INTEGRATION REPORT — Application Shell

תאריך: 23.07.2026 · סוכן: Wave 2 (Claude Opus 4.8) · כותב יחיד בריפו בגל הזה.

## מה נבנה

### 2.1 ניווט RTL מקובץ + Badges חיים

- **`src/app/nav/navGroups.ts`** — מודל 5 הקבוצות הקנוני (ניהול העסק / שירות והדרכה / ידע ואוטומציה / הטמעה והגשה / ניהול המערכת) + `groupOfPath` / `activeItemForPath` (exact ואז longest-prefix).
- **`src/layout/RightPrimaryNavigation.tsx`** — הורחב למצב מקובץ: כותרת קבוצה עם chevron (aria-expanded/aria-controls), ניווט מקלדת מלא (↑/↓ בין כל הפקדים הנראים, Home/End, Enter מפעיל), `aria-current="page"` על הפריט הפעיל, `role=navigation` (nav + aria-label). המצב השטוח הישן נשמר (DesignShowcase).
- **`src/app/shellState.ts`** — persist ל-localStorage במפתח **`teragon-os-shell-v1`**: מצב פתיחת קבוצות + כיווץ ה-rail. קריסת JSON/חסימת storage לא מפילה את ה-shell.
- קבוצת הראוט הפעיל **נפתחת אוטומטית** במעבר ראוט (effect ב-OsShell); בחירה נשארת גלויה.
- **Badges** — `src/domain/selectors/badges.ts` (טהור, נבדק): שירות = קריאות פתוחות; משימות = באיחור∪דחופות פתוחות; מרכז ההגשה = שערי Stage-Gate שלא עברו וללא ראיות; סוכני AI = משימות סוכן "ממתין לאישור". חיווט דרך `useNavBadges()` (TanStack Query מעל repositories, `src/app/nav/useNavBadges.ts`). **אפס ⇒ אין badge**. אין מספר קשיח באף רכיב ניווט.

### ראוטים

- `src/app/routes.ts`: נוספו `/system-health` ו-`/settings` (placeholder כן, גל 9) ⇒ **31 רשומות** (30 ראוטים + דגימת `/customers/:id`). tests/router.test.tsx עודכן.
- **`/customers` בכוונה לא בניווט**: המסך נגיש מתוך מסך ה-CRM (גל 3) ומ-URL ישיר; מתועד גם ב-`tests/navGroups.test.ts` (בדיקה ייעודית) וגם כאן. `/submission/presentation` נפתח מתוך מרכז ההגשה.

### 2.2 חיפוש גלובלי

- **`src/domain/selectors/search.ts`** — הורחב ב-`rankedSearch` (טהור): 13 אוספים (לקוחות, לידים, ארגונים, הצעות, דגמי מדפסות, מדפסות לקוח, קורסים, תלמידים, קריאות, משימות, מסמכים, רשומות ידע, זיכרון). התאמות: עברית, שמות דגם באנגלית, מספרים סידוריים, טלפונים, אימיילים, מספרי הצעה (q-…, case-insensitive), מזהי קריאה. דירוג דטרמיניסטי: exact > startsWith > contains ואז עדיפות ישות ⇒ recency (updatedAt) ⇒ id.
- כל תוצאה: chip סוג ישות, כותרת, מידע משני, **תווית שדה ההתאמה** ("התאמה: טלפון"), ראוט יעד, chip סטטוס כשקיים.
- UI: נפתח מתיבת החיפוש בכותרת (focus/Enter) **וגם** ממצב search של ה-palette. מקלדת ↑/↓ + Enter פותח יעד + Escape סוגר; דפוס combobox (aria-activedescendant, listbox/option). מצבי ריק/אין-תוצאות/טעינה כנים. `globalSearch` הישן נשמר (בדיקות גל 1).

### 2.3 לוח פקודות (Ctrl+K / ⌘K)

- **`src/app/commands/registry.ts`** — רישום פקודות typed (`Command {id,title,icon,keywords,run(ctx)}`), מחוץ למודאל. 11 פקודות, **כולן עובדות**: ניווטים, 5 יצירות מהירות, מעבר למצב חיפוש, החלפת מצב תצוגה (כיווץ rail אמיתי ומתמיד), דיאלוג קיצורי מקלדת אמיתי (`ShortcutsDialog.tsx` — מפרט רק קיצורים ממומשים).
- **`src/app/commands/CommandPalette.tsx`** — overlay אחד לשני המצבים (commands/search).

### 2.4 מרכז התראות

- Domain: `AppNotification` ב-`src/domain/types.ts` + `notificationSchema` + אוסף **`notifications` (ה-46)** ב-collections.ts; **IDB_VERSION הועלה ל-2** (object store חדש).
- **`src/app/notifications/deriveNotifications.ts`** — גנרטור טהור מעל נתוני אמת: ליד חדש ללא מענה (>2 ימים ללא פעילות), משימה באיחור, הצעה ממתינה לאישור (נשלחה), קריאה חורגת מ-SLA (גבוהה 2/בינונית 5/נמוכה 10 ימים), המלצת AI ממתינה לאישור, מסמך עומד לפוג*, תלמיד ללא התקדמות/חסום, אוטומציה שנכשלה (0 בזרע — בכנות).
- **Idempotent**: ids יציבים (`ntf-task-overdue-task-1`), `syncNotifications()` בזמן boot (main.tsx אחרי seed) יוצר רק רשומות חסרות — refresh לא משכפל, מצב נקרא שורד.
- UI: פעמון ⇒ מגירת RTL; פתיחת התראה מנווטת ליעד ומסמנת נקראה; נקרא/לא-נקרא; סמן-הכול; סינון קטגוריה; מסנן לא-נקראו; badge ספירה אמיתית על הפעמון (נעלם ב-0). מצב נשמר ב-repository (IndexedDB).

> *סטייה מתועדת: לישות Document אין שדה תפוגה בדומיין (גל 1). התנאי הכן ל"מסמך עומד לפוג" מומש כהצעת מחיר (מסמך עסקי) שתוקפה בתוך 7 ימים — נגזר, לא מומצא.

### 2.5 יצירה מהירה

- כפתור + בכותרת ⇒ תפריט 6 יצירות; כל טופס RTL עם ולידציית zod והודעות שגיאה בעברית ליד השדה (`src/app/quick-create/QuickCreateHost.tsx`), כתיבה דרך repositories קנוניים (`actions.ts`, ids דטרמיניסטיים עם `nextId`).
- אחרי יצירה: toast הצלחה **עם הערה כנה "העורך המלא של המודול יגיע בגל X"** + ניווט לעמוד תקף.
- כל יצירה מריצה `invalidateCollections` ⇒ badges/חיפוש/התראות מתעדכנים מיד. בדיקת אינטגרציה: `tests/quickCreate.test.ts` (ליד נוצר ⇒ מופיע בחיפוש; קריאה נוצרת ⇒ badge שירות +1).

### 2.6 Shell רספונסיבי

- Wide desktop: nav + rail גלויים.
- ≤1440px: ריווח הדוק יותר; ה-rail נשאר collapsible עם **כפתור שחזור מפורש** (chevron תמיד גלוי) — מצב נשמר (`teragon-os-shell-v1`).
- ≤1064px: הניווט הימני הופך ל-**מגירת RTL** מהמבורגר בכותרת; ה-rail יורד מתחת לתוכן; ללא overflow אופקי; אף פעולה קריטית לא הוסתרה (חיפוש/פעמון/+/hamburger בכותרת).
- `LeftIntelligenceRail` תומך כעת במצב controlled (collapsed+onToggleCollapsed) לצד המצב הפנימי הישן.

## שינויים בקבצים משותפים (גל 1)

| קובץ                     | שינוי                                     | סיבה                                    |
| ------------------------ | ----------------------------------------- | --------------------------------------- |
| `collections.ts`         | + `notifications` (46)                    | מרכז התראות                             |
| `IndexedDBRepository.ts` | IDB_VERSION 1→2                           | store חדש                               |
| `factory.ts`             | `seedIfEmpty` מדלג על אוספים עם seed ריק  | notifications נגזרות, לא נזרעות         |
| `schemas.ts`             | + `notificationSchema`, + `meetingSchema` | ולידציה מלאה לפגישות ולהתראות           |
| `tokens.css`             | `--os-muted` #65758b→#75879f              | axe: ניגודיות AA ≥4.5:1 (9 nodes נכשלו) |
| `PlaceholderPage.tsx`    | אותו תיקון צבע קשיח                       | axe                                     |
| `iconPaths.tsx`          | + אייקון `menu`                           | המבורגר טאבלט                           |
| `CompactTopHeader.tsx`   | + `onSearchOpen`                          | פתיחת חיפוש מה-focus                    |
| `main.tsx`               | + `syncNotifications()` אחרי seed         | boot idempotent                         |

## איך מוסיפים פקודה / התראה (לגלים הבאים)

- פקודה: להוסיף רשומה ל-`COMMANDS` ב-registry.ts עם `run(ctx)` עובד.
- סוג התראה: להוסיף בלוק ב-`deriveNotifications` עם id יציב `ntf-<type>-<entityId>` + בדיקה ב-tests/deriveNotifications.test.ts.
