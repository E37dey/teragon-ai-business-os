# /courses — Layout v3 Wireframe (container-query rebuild)

מטרה: לפרק את ה-4-עמודות-בו-זמנית, לבסס את הרספונסיביות על **רוחב מכל התוכן** (לא viewport), ולהחזיר עדיפות ויזואלית ל-workspace של הלומד. אין שינוי copy/repos/domain/actions/seed/permissions/behavior.

## החלטת ארכיטקטורה — למקור הבעיה
ה-shell תמיד שומר ~300px ל-rail השמאלי (flexbox: canvas + rail). ב-1440 זה משאיר לעמוד ~870px וה-rail השמאלי נשאר קבוע → בדיוק ה-collision שנדחה.
**פתרון (מנגנון shell אדיטיבי, כבר מומש):** `HideShellRail` — /courses מבטל את ה-rail של ה-shell ומקבל canvas ברוחב מלא (viewport − nav בלבד). כל תוכן ה-"insights" עובר ל-drawer של העמוד. שאר העמודים לא מושפעים (`railHidden` ברירת מחדל false).

## מכל container-query
עוטף שורש: `.courses-page { container-type: inline-size; container-name: courses; }` על ה-canvas המלא. כל ה-breakpoints הם `@container courses (min-width: …)` — לא media queries של viewport.

רוחב ה-container בפועל (canvas מלא = viewport − nav 220 − padding):
- viewport 1440 → container ≈ **1170px** → מצב 2-עמודות
- viewport 1600 → container ≈ **1330px** → 2-עמודות
- viewport 1920 → container ≈ **1650px** → 3-עמודות (≥1500)
- viewport 2560 → container ≈ **2290px** → 3-עמודות

## היררכיית רכיבים
```
CoursesPage (.courses-page, container-type:inline-size)
├─ HideShellRail                         (מבטל rail של ה-shell)
├─ CoursesHeader (.courses-header)        שורה אחת נקייה
│   ├─ RIGHT: כותרת "קורסים והכשרות" + תת-כותרת "ניהול לומדים, מסלולים, מפגשים והתקדמות"
│   └─ LEFT: [קורס חדש] [בחרו לומד] [תובנות והמשך]
├─ CoursesKpiStrip (.courses-kpi)         5 ערכים קיימים, מוצג רספונסיבי
│   └─ תחתיו: פס התקדמות כולל קומפקטי (מחליף את rail "השלמת מסלולים")
├─ CoursesSubnav (.courses-subnav)        4 טאבים ראשיים + תפריט "עוד"
│   primary: לומדים והתקדמות · מסלולים וקורסים · מטלות והגשות · לוח מפגשים
│   "עוד": קטלוג הקורסים · תעודות והסמכות
└─ LearnerWorkspace (.courses-workspace)  grid container-query
    ├─ [≥1500] INSIGHTS col 280px  |  CENTER minmax(720,1fr)  |  LEARNER-LIST 260px
    ├─ [1050–1499] CENTER minmax(0,1fr)  |  LEARNER-LIST 240px   (insights = drawer)
    └─ [<1050] CENTER בלבד                                        (insights + learners = drawers)
    │
    ├─ CENTER = MainWorkflow (≥65% מהאזור)
    │   ├─ LearnerHeaderCard (שורה אחת): initials/avatar · דנה כהן · מסלול · מדריך · סטטוס · פעילות אחרונה · %
    │   ├─ PhaseProgress (3 שלבים): יסודות 1–4 · תכנון והדפסה 5–10 · יישום מתקדם 11–14
    │   │   └─ מתחת: שלבי השלב הנבחר בלבד (רשימה אנכית / כרטיסים רחבים) — לא 14 עיגולים
    │   ├─ CurrentStageCard (הדומיננטי, max-inline-size:72ch, ≥14px, line-height 1.55):
    │   │   A כותרת שלב · B תיאור+תאריכים · C מטלת השלב · D הגשת הלומדת ·
    │   │   E רשימת בדיקה · F פעולות מדריך (אישור השלמת השלב / החזרה לתיקון / בקשת מידע נוסף) ·
    │   │   G משוב המדריך · H סיכום לתיק הלומדת
    │   └─ NextStageMiniCard (בתוך ה-center, לא ב-rail): "השלב הבא" · שלב N · N מפגשים · [פרטים והכנה לשלב הבא]→drawer
    └─ RIGHT = LearnerList (≥240px לכל כרטיס: שם · קורס · שלב נוכחי · % · תשלום)
```

## Drawers (בלעדיים — רק אחד פתוח בו-זמנית)
- **learnerDrawer** ("בחרו לומד") — חיפוש + סינון קורס + רשימת לומדים.
- **insightsDrawer** ("תובנות והמשך") — התקדמות במסלולים · לומדים הדורשים מעקב · השלב הבא · מפגשים קרובים · המלצת מערכת · ראיות.
- **nextStageDrawer** ("פרטים והכנה לשלב הבא") — המלצה מלאה · מפגשים · תנאי מוכנות · חומרים · סיכונים · ראיות מערכת.
פתיחת אחד סוגר את האחר (state יחיד `openDrawer: 'learner'|'insights'|'nextStage'|null`). כל drawer: כותרת נגישה · ESC סוגר · focus trap · focus חוזר ל-trigger · גלילה אנכית פנימית · אין גלילה אופקית. (רכיב `Drawer` של מערכת העיצוב מספק trap+ESC; ה-focus-restore מנוהל ב-hook.)

## KPI
`@container (min-width:1350px)` → 5 עמ׳; `(min-width:950px)` → 3 עמ׳ (שורה 1) + 2 (שורה 2); ברירת מחדל → 2 עמ׳. כל כרטיס: min-inline-size 190px · תווית שורה-אחת · מספר גדול · שורת-מצב אופציונלית. אין תווית רב-שורתית שולטת.

## פאזות (מחליף את 14-העיגולים — לא קיים בשום רזולוציית desktop)
3 סגמנטים עם: מצב (הושלם/פעיל/ממתין) · ספירת שלבים שהושלמו / סה"כ · אינדיקציית פאזה נוכחית. מתחת — שלבי הפאזה הנבחרת בלבד, ניווט מקלדת (Arrow/Home/End/Enter), aria-labels. שלבי הפאזה הפעילה כרשימה קריאה עם מצב לכל שלב (הושלם/בתהליך).

## כללי CSS
container-type:inline-size · @container · grid-template-columns · minmax(0,1fr) · min-inline-size:0 (כל ילד grid) · max-inline-size:100% · overflow-wrap:break-word. אסור: absolute מבני · כרטיסי viewport-width · margins שליליים · transform ל-layout · overflow:hidden להסתרת פגמים · הקטנת פונט כפתרון רספונסיבי · רוחב center קבוע · 4 עמודות קבועות.

## קריטריוני קבלה (1440×900, shell מלא)
nav ימני נראה · header מלא · אפס KPI חתוך · רק 2 עמודות workspace קבועות · rail insights שמאלי לא קבוע (drawer) · אין stepper 14 · רק שלבי הפאזה הפעילה · אין עטיפת מילה-בודדת · כרטיס המטלה דומיננטי · כרטיסי לומד קריאים · אפס חפיפה · אפס גלישה אופקית · אין טיפוגרפיה זעירה · אין dead-space מלאכותי.
1920×1080: 3 עמודות רק אם container ≥1500 · workflow הכי גדול · טקסט קריא · insights לא מתחרה.
