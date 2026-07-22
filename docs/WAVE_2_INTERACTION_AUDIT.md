# WAVE 2 — INTERACTION AUDIT

כל בקר שה-shell מציג ⇒ סיווג ⇒ handler אמיתי או disabled+סיבה ⇒ בדיקה מכסה.
סיווגים: **LIVE** (handler אמיתי) · **DISABLED-HONEST** (מנוטרל עם סיבה עברית גלויה) · אין בקרים מתים.

## ניווט ראשי (RightPrimaryNavigation)

| בקר                               | סיווג              | Handler                                                                                               | בדיקה                                                     |
| --------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 5 כותרות קבוצה (chevron)          | LIVE               | `onToggleGroup` ⇒ shellState ⇒ localStorage                                                           | e2e "groups expand/collapse and persist"; tests/navGroups |
| 28 קישורי ניווט                   | LIVE               | react-router `<Link>` דרך renderLink; `aria-current`                                                  | tests/router (31 mounts); e2e active-route                |
| Badges (שירות/משימות/הגשה/סוכנים) | LIVE (תצוגה נגזרת) | useNavBadges ⇐ selectors; אפס ⇒ לא מרונדר                                                             | tests/badges; e2e service badge                           |
| מקלדת ↑/↓/Home/End                | LIVE               | onKeyDown על ה-nav, `data-nav-focusable`                                                              | e2e keyboard spec                                         |
| קלט AI Copilot                    | DISABLED-HONEST    | `disabled` + title "ה-Copilot יחובר בשלב הבא" + הערה "יחובר בהמשך — טרם מחובר למנוע AI" (יחובר בגל 5) | Wave-1 audit נשאר בתוקף                                   |

## כותרת (CompactTopHeader)

| בקר                         | סיווג           | Handler                                                     | בדיקה                                                |
| --------------------------- | --------------- | ----------------------------------------------------------- | ---------------------------------------------------- |
| + הוספה מהירה               | LIVE            | פותח תפריט יצירה מהירה (6 ישויות)                           | e2e quick-create; tests/quickCreate                  |
| פעמון התראות (+badge ספירה) | LIVE            | פותח NotificationsDrawer; badge = unread אמיתי, נעלם ב-0    | e2e notification specs                               |
| מעטפת הודעות                | DISABLED-HONEST | title "הודעות — יחובר בהמשך" (מודול הודעות אינו בגל 2)      | — (מנוטרל, לא מת)                                    |
| תיבת חיפוש גלובלי           | LIVE            | focus ⇒ פותח palette במצב search; Enter ⇒ search עם השאילתה | e2e search specs                                     |
| המבורגר (≤1064px)           | LIVE            | פותח את הניווט כמגירת RTL                                   | CSS + code path (מוצג רק בטאבלט); סגירת קישור בלחיצה |
| שעון/תאריכים                | LIVE (תצוגה)    | Intl אמיתי על Date.now, מתעדכן כל 30ש׳                      | Wave-1 audit                                         |

## לוח פקודות (CommandPalette + registry)

| פקודה                           | סיווג | Handler                              | בדיקה                                        |
| ------------------------------- | ----- | ------------------------------------ | -------------------------------------------- |
| פתח מרכז שליטה                  | LIVE  | navigate("/")                        | registry typed; e2e palette opens            |
| צור ליד/לקוח/קריאה/משימה/פגישה  | LIVE  | פותח את הטופס המתאים (zod)           | e2e "צור ליד חדש" מקצה-לקצה                  |
| פתח חיפוש                       | LIVE  | מחליף את ה-palette למצב search       | e2e search via header (אותו רכיב)            |
| פתח סוכני AI / מרכז ההגשה       | LIVE  | navigate                             | route smoke                                  |
| החלף מצב תצוגה                  | LIVE  | toggleRail ⇒ persist                 | shellState persist (אותו מנגנון שנבדק ב-e2e) |
| הצג קיצורי מקלדת                | LIVE  | ShortcutsDialog — רק קיצורים ממומשים | e2e shortcuts spec                           |
| ↑/↓/Enter/Escape בתוך ה-palette | LIVE  | combobox keyboard handler            | e2e Bambu-Enter + Escape specs               |

אין פקודות לא-זמינות ברישום.

## מגירת התראות

| בקר                        | סיווג                  | Handler                                                             | בדיקה                        |
| -------------------------- | ---------------------- | ------------------------------------------------------------------- | ---------------------------- |
| 8 כפתורי סינון קטגוריה     | LIVE                   | setCategory (aria-pressed)                                          | e2e category filter          |
| מסנן "רק שלא נקראו"        | LIVE                   | checkbox state                                                      | unit דרך derive+UI path      |
| סמן הכול כנקרא             | LIVE / DISABLED-HONEST | mutation על כולן; ב-0 לא-נקראות ⇒ disabled + "אין התראות שלא נקראו" | useNotifications             |
| פתיחת התראה                | LIVE                   | mark-read + navigate ל-relatedEntity.route                          | e2e mark-read persists       |
| טוגל נקרא/לא-נקרא פר-התראה | LIVE                   | repo.update ⇒ invalidate                                            | e2e (‑1 בספירה, שורד reload) |

## יצירה מהירה

| בקר                                          | סיווג                             | Handler                                                                                   | בדיקה                                                      |
| -------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 6 פריטי תפריט                                | LIVE                              | פותח טופס ייעודי                                                                          | e2e                                                        |
| שדות טופס (text/select/date/number/textarea) | LIVE                              | controlled state; שגיאת zod עברית ליד השדה (`role=alert`, aria-invalid, aria-describedby) | e2e שגיאת "שם הליד הוא שדה חובה"; tests/quickCreate schema |
| שמירה                                        | LIVE / DISABLED-HONEST בזמן שמירה | action ⇒ repo ⇒ invalidate ⇒ toast+navigate; בזמן busy: disabled + "שמירה מתבצעת…"        | e2e toast + ניווט + חיפוש                                  |
| ביטול                                        | LIVE                              | סוגר את המודאל                                                                            | Modal ESC/overlay (גל 1)                                   |

## Rail + רספונסיביות

| בקר                    | סיווג | Handler                                                                         | בדיקה                                |
| ---------------------- | ----- | ------------------------------------------------------------------------------- | ------------------------------------ |
| כפתור כיווץ/שחזור rail | LIVE  | controlled ⇒ shellState ⇒ persist; הכפתור נשאר גלוי גם במצב מכווץ (שחזור מפורש) | LeftIntelligenceRail controlled mode |
| מגירת ניווט טאבלט      | LIVE  | Drawer + אותו RightPrimaryNavigation (ESC/overlay/קישור סוגרים)                 | code path משותף עם ה-e2e של הניווט   |

## עקרון

אף בקר לא מרונדר בלי handler; כל נטרול מלווה בסיבה עברית גלויה (חוזה OsButton אוכף זאת ברמת הטיפוסים).
