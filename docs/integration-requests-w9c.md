# INTEGRATION REQUESTS — W9-C (Final Regression / Accessibility / Visual QA)

בקשות לסוכני הגלים הבעלים ול-Integration Lead. W9-C הוא שער השחרור הסופי ואינו
עורך קבצי מודול בבעלות אחרים, פרט לתיקוני a11y **טריוויאליים** (כולם מתועדים).

**סטטוס כולל: אין חוסם שחרור.** 196/196 בדיקות W9-C ירוקות; axe = 0 serious / 0 critical.

---

## תוקן ע"י W9-C (מדווח לשקיפות, לא בקשה)

### F-1 · קישור מובחן בצבע בלבד — axe `link-in-text-block` (serious) — **תוקן**
`src/modules/command-center/CommandCenterPage.tsx` — שני `<Link to="/agents/collaboration">`
בתוך בלוק טקסט קיבלו `textDecoration: "underline"`.
לפני: כשל serious ב-`/` ובכל שכבה שנפתחת מעליו (4 בדיקות). אחרי: נקי.
שינוי ויזואלי מינימלי, ללא שינוי לוגיקה. **אין צורך בפעולה** — רק מודעות הבעלים.

### F-2 · ניגודיות שברירית בשבב קיצור המקלדת — axe `color-contrast` (serious) — **תוקן**
`src/styles/components.css` → `.os-palette__kbd`: `--os-muted` → `--os-text-2`.

`--os-muted` על `--os-highlight` נמדד **4.67:1** — בקושי מעל רצפת AA (4.5:1) לטקסט
11px. הריצות הממוקדות עברו אבל הריצה המלאה נכשלה: מיזוג ה-backdrop השקוף של
הפלטה מפיל את היחס האפקטיבי מתחת לסף. אחרי התיקון: **7.07:1**.

**המלצה לבעלי מערכת העיצוב:** `--os-muted` (#75879f) על `--os-highlight` (#0c1c31)
הוא צמד **על הסף** בכל מקום שבו הוא מופיע מעל שכבה שקופה. כדאי לסרוק שימושים
נוספים בצמד הזה מעל overlay/backdrop ולהעדיף `--os-text-2` שם. W9-C תיקן רק את
הצומת שנכשל בפועל ולא ביצע החלפה גורפת.

---

## בקשות פתוחות (moderate — לא חוסמות)

### R-1 · חסר `<h1>` ב-18 מסכים — axe `page-has-heading-one` (moderate)
**בעלים:** סוכני המודולים הרלוונטיים · **חומרה:** moderate · **חוסם:** לא

18 מסכים פותחים בכותרת `h2`/`h3` ללא `h1`:

`/courses` · `/service` · `/printers` · `/organizations` · `/tasks` · `/knowledge` ·
`/analytics` · `/governance` · `/implementation` · `/personas` · `/stage-gates` ·
`/training-materials` · `/quick-start` · `/faq` · `/support` · `/system-health` ·
`/settings` · `/submission`

**מבוקש:** בכל מסך, לקדם את כותרת המסך הראשית ל-`<h1>` (כפי שכבר עושים `/`, `/crm`,
`/customers/:id`, `/sales`, `/documents`, `/automations`, `/agents`, `/memory`, `/learning`).

**למה W9-C לא תיקן:** שינוי היררכיית כותרות ב-18 מסכים בבעלות אחרים אינו טריוויאלי
ועלול לשבור הצמדות טקסט בבדיקות הגלים הבעלים.
**ארטיפקט:** `docs/screenshots/final/heading-survey.json`.

---

### R-2 · דילוג ברמת כותרת — axe `heading-order` (moderate, 12 מסלולים)
**חומרה:** moderate · **חוסם:** לא

12 מסלולים מדלגים רמת כותרת (למשל `h1` → `h3`). ברוב המקרים ייסגר אוטומטית
עם R-1. **מבוקש:** אחרי R-1, לוודא רצף רמות ללא דילוג.

---

### R-3 · תוכן מחוץ ל-landmark — axe `region` (moderate, 16 צמתים במסלול אחד)
**חומרה:** moderate · **חוסם:** לא

במסך אחד 16 צמתי תוכן אינם בתוך landmark (`main`/`nav`/`aside`/`section[aria-label]`).
**מבוקש:** לעטוף את אזורי התוכן ב-landmark מתויג.

---

### R-4 · `landmark-one-main` + `landmark-unique` (moderate, צומת אחד כל אחד)
**חומרה:** moderate · **חוסם:** לא

מופיע יותר מ-`main` אחד במסמך, ושני landmarks חולקים תפקיד+שם זהים.
**מבוקש:** `main` יחיד לכל מסמך; שמות landmark ייחודיים (`aria-label` מבחין).

---

### R-5 · תא כותרת טבלה ריק — axe `empty-table-header` (minor, 2 צמתים)
**חומרה:** minor · **חוסם:** לא

עמודות "פעולות" מכריזות `<th>` ריק. **מבוקש:** `<th><span class="sr-only">פעולות</span></th>`
או `aria-label` על התא.

---

## הערות ארכיטקטורה (לא באגים)

### N-1 · אין service worker — offline מוגבל ב-design
`goto` מלא במצב offline ייכשל; רק ניווט client-side ל-chunks שכבר בזיכרון עובד.
זו התנהגות נכונה ל-SPA ללא SW. מתועד ב-`FINAL_QA_REPORT.md` §3.
**לא מבוקש שינוי** — רק שלא ייחשב בטעות לרגרסיה.

### N-2 · `tsconfig.tests.json` אינו כולל `e2e/`
`typecheck:tests` מכסה `src`, `netlify`, `tests` בלבד. מפרטי e2e מקומפלים ע"י
Playwright בזמן ריצה (טיפוסים נמחקים, לא נבדקים).
**להחלטת ה-Lead** אם להרחיב את ההיקף — W9-C לא שינה קונבנציה זו.
