# INTEGRATION REQUESTS — W9-A (Final Interaction Audit)

W9-A מבצע ביקורת בלבד ואינו נוגע ב-`src/**` (כולל תיקוני a11y טריוויאליים).
להלן הפגמים האמיתיים שאותרו, לתיקון ע"י ה-Lead.

**סטטוס שער השחרור: PASS.** אף אחד מהפריטים הבאים אינו בקרה מתה, ולכן אף
אחד מהם אינו חוסם את שער הבקרות המתות (`docs/FINAL_INTERACTION_AUDIT.md`).

---

## W9A-1 · שלב Stepper לחיץ ללא נגישות מקלדת — **medium, פער חי**

| שדה | ערך |
|---|---|
| קובץ | `src/design-system/Stepper.tsx:52-58` |
| צרכן מושפע | `src/modules/courses/CoursesPage.tsx:498` (`onStepClick`) |
| מסלול חי | `/courses` |
| חוק | R08 (סורק סטטי) |
| חומרה | medium |

### הבעיה
כאשר מועבר `onStepClick`, השלב מקבל מטפל עכבר ומצביע-יד — אך נשאר
`role="listitem"` ללא `tabIndex` וללא מטפל מקלדת:

```tsx
<div
  role="listitem"
  onClick={onStepClick ? () => onStepClick(step) : undefined}
  style={onStepClick ? { cursor: "pointer" } : undefined}
  aria-current={status === "active" ? "step" : undefined}
>
```

התוצאה ב-`/courses`: אפשר להחליף שלב בעכבר בלבד. משתמש מקלדת/קורא-מסך אינו
יכול להגיע לשלב או להפעילו — הבקרה "נראית לחיצה" אך אינה נגישה.

### הפתרון המוצע
כאשר (ורק כאשר) `onStepClick` קיים, להפוך את השלב לבקרה אמיתית — עדיף
`<button type="button">` פנימי, או לכל הפחות:

```tsx
role="button"            // במקום listitem, כשהוא לחיץ
tabIndex={0}
onKeyDown={(e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    onStepClick(step);
  }
}}
```

יש לשמור על ההתנהגות הקיימת כשאין `onStepClick` (אז זהו `listitem` לא-לחיץ,
וזה תקין).

### אימות לאחר התיקון
- `npx playwright test -c e2e/w9a.config.ts` — המפקד ב-`/courses` ימשיך 0 הפרות
  (הכלל `ICON-ONLY-NO-LABEL`/`NO-ACCESSIBLE-NAME` לא מושפע), ובנוסף:
- `node scripts/interaction-audit/audit.mjs` — ממצא R08 על `Stepper.tsx:52` ייעלם
  (medium יירד מ-2 ל-1).
- מומלץ לצרף בדיקת מקלדת ב-e2e של הגל הרלוונטי: Tab לשלב → Enter → השלב מתחלף.

---

## W9A-2 · `id="nt-printer"` כפול בקובץ — **medium, סיכון נמוך (היגיינה)**

| שדה | ערך |
|---|---|
| קובץ | `src/modules/service/ServicePage.tsx:997` ו-`:1011` |
| חוק | R15 (סורק סטטי) |
| חומרה | medium (בפועל: נמוך) |

### הבעיה
שני ענפי טרנרי משתמשים באותו `id`:

```tsx
<label className="os-qc-label" htmlFor="nt-printer">…</label>
{printerOptions.length > 0 ? (
  <select id="nt-printer" … />     // :997
) : (
  <input  id="nt-printer" … />     // :1011
)}
```

### הערכת סיכון
**אין באג בזמן ריצה.** הענפים בלעדיים — ב-DOM נמצא תמיד בדיוק אלמנט אחד עם
ה-`id`, וה-`htmlFor` נפתר נכון בשני המקרים. זו הסיבה שהממצא אינו high.

### הפתרון המוצע (רשות)
להוציא את ה-`id` לקבוע משותף כדי שהכפילות תהיה מכוונת ומתועדת, למשל:

```tsx
const NT_PRINTER_ID = "nt-printer";
```

או לתת שני מזהים נפרדים (`nt-printer-select` / `nt-printer-input`) ולהתאים את
ה-`htmlFor` לענף. כל עוד לא תוקן — הסורק ימשיך לדווח על כך כ-medium.

### אימות לאחר התיקון
`node scripts/interaction-audit/audit.mjs` — ממצא R15 ייעלם.

---

## נבדק ונסגר — לא נדרשת פעולה

הועבר לידיעת ה-Lead כדי שלא ייפתחו מחדש כפגמים:

| נושא | מיקומים | מסקנה |
|---|---|---|
| פעולות אישור "לא דרך מנוע אישורים" (R12 · 5) | `ImportPanel:236`, `AdministrationPage:453`, `CoursesPage:601`, `Customer360MemoryTab:253`, `DocumentsPage:517` | פוזיטיב שגוי — כולן מנתבות לתור האישורים דרך `commit()`/`submit()`/מכונת-מצבים. אומת ידנית. |
| פעולות הרסניות "ללא confirm" (R11) | `GovernancePage:708`, `LearningPage:270/294`, `ProposalQueue:188`, `AgentsPage:612`, `SystemHealthPage:517` | מוגנות בשער-נימוק (הכפתור התאום: "מחייב נימוק") או הפיכות/יוצרות-רשומה. הסורק חודד בהתאם. |
| overlay לחיץ (R08 · info · 3) | `Modal:78`, `Drawer:42`, `CommandPalette:95` | תבנית מקובלת — סגירה במקלדת דרך ESC של הדיאלוג. |
| `onClick` על מיכל דיאלוג | `Modal:79`, `CommandPalette:96` | `e.stopPropagation()` בלבד — לא affordance. הסורק מדלג על מטפלי-שמירה. |
| בקרות מושבתות (60 בכל המערכת) | כל המסלולים | 60/60 חושפות סיבה בעברית. חוזה `OsButton.disabledReason` מוחזק במלואו. |
