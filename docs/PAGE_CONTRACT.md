# PAGE CONTRACT — חוזה עמוד למודולים (Waves 2–9)

כל סוכן מסכים בונה עמודים לפי החוזה הזה, **בלי לגעת** ב-router.tsx / AppShell / קבצים משותפים.
האינטגרציה (חיבור ראוט → עמוד → Shell) נעשית רק על ידי ה-Architect בסוף כל גל.

## מבנה מודול

```
src/modules/<module>/
  <ScreenName>Page.jsx      ← default export: קומפוננטת התוכן המרכזי (canvas)
  <ScreenName>Rail.jsx      ← optional named export: ה-rail השמאלי ההקשרי של העמוד
  components/…              ← תתי-קומפוננטות פנימיות של המודול
  index.js                  ← barrel: export { default as XPage, XRail }
```

## כללי עמוד

1. **עיצוב**: אך ורק פרימיטיבים מ-`src/design-system` + מחלקות/משתני `src/styles/os/*` (`--os-*`). אסור צבעים קשיחים, אסור מצב בהיר. העמוד מניח שהוא כבר בתוך `.theme-os` (ה-Shell מספק).
2. **נתונים**: אך ורק דרך `src/repositories` (factory: `getRepository(collection)`) או props. אסור ייבוא ישיר של mockData לרכיבי UI (חריג: קבועי תצורה/רפרנס שאינם ישויות). ערכי seed מסומנים "נתוני הדגמה".
3. **RTL**: logical properties בלבד; מספרים/מידות עוטפים ב-`.os-num`/`dir="ltr"`.
4. **כנות**: אין מדד מומצא (אין ערך → `ConfidenceBar value={null}` / "טרם נמדד"); אין כפתור בלי handler — פיצ'ר לא-זמין = `OsButton disabled disabledReason="…"`; אין `Math.random()` עסקי; תאריכים מ-`new Date()` דרך util, לא קבועים.
5. **זהות**: המשתמש הראשי = צחי זוסטייהם, מנכ"ל, טרגון טכנולוגיות. ברכה: "ערב טוב, צחי". אין להעתיק שמות מתמונות הייחוס.
6. **ייחודיות**: לכל עמוד workflow ראשי משלו + KPI ספציפיים + rail משלו. אסור לשכפל את הדשבורד.
7. **טפסים**: ולידציה עם zod (`src/domain/schemas`), הודעות שגיאה בעברית ליד השדה.
8. **ללא תלות חדשה**: אין להוסיף חבילות npm (בקשות → Architect).

## API של ה-Rail

`<ScreenName>Rail` מקבל props חופשיים מהעמוד דרך ה-Shell (העמוד מרנדר את שניהם דרך ה-layout slot). עד שה-Shell מוכן, מותר לעמוד לרנדר זמנית grid פנימי של canvas+rail — ה-Architect יפצל בעת האינטגרציה.

## דרפטים של Cursor

תחת `src/modules/` קיימים דרפטים זרים (`_*.bak`, תיקיות מסכים חלקיות מסשן Cursor שנסגר). סוכן שבבעלותו התיקייה רשאי לקרוא/למחזר מהם רעיונות, אבל הקוד הסופי חייב לעמוד בחוזה הזה. דרפט שלא שומש — להשאיר כ-`.bak` (לא למחוק).
