# FINAL STATIC CONTROL INVENTORY (Phase 9.2 · W9-A)

מקור: `scripts/interaction-audit/audit.mjs` — סורק סטטי נטול-תלויות על כל `src/**/*.tsx`. מריץ טוקנייזר JSX קטן (ללא Babel/TS) ומיישם 17 חוקים. יציאה != 0 כאשר יש ולו ממצא **high** אחד.

תאריך ריצה: 2026-07-23 · קבצים שנסרקו: 98

## מלאי בקרות (ספירה סטטית)

| בקרה | כמות |
|---|---|
| `<OsButton>` | 353 |
| `<button>` native | 46 |
| `<a>` links | 4 |
| `<Modal>` | 31 |
| `<Drawer>` | 15 |
| `<form>` | 6 |

## סיכום ממצאים לפי חומרה

| חומרה | כמות |
|---|---|
| high | 0 |
| medium | 0 |
| low | 5 |
| info | 3 |

## ממצאים מפורטים

| # | קובץ:שורה | בקרה | חומרה | חוק | סיבה | Owner | פתרון | בדיקת אימות |
|---|---|---|---|---|---|---|---|---|
| 1 | `src/memory/import/ui/ImportPanel.tsx:236` | <OsButton> | low | R12 אישור לא דרך רשומות Approval | פעולת אישור ללא התייחסות נראית למנוע/רשומות אישור | Lead (integration-requests-w9a) | בדיקה ידנית / החלטת Lead | e2e/final-interactions (per-route control walk) + tests/final-interactions |
| 2 | `src/modules/administration/AdministrationPage.tsx:453` | <OsButton> | low | R12 אישור לא דרך רשומות Approval | פעולת אישור ללא התייחסות נראית למנוע/רשומות אישור | Lead (integration-requests-w9a) | בדיקה ידנית / החלטת Lead | e2e/final-interactions (per-route control walk) + tests/final-interactions |
| 3 | `src/modules/courses/CoursesPage.tsx:601` | <OsButton> | low | R12 אישור לא דרך רשומות Approval | פעולת אישור ללא התייחסות נראית למנוע/רשומות אישור | Lead (integration-requests-w9a) | בדיקה ידנית / החלטת Lead | e2e/final-interactions (per-route control walk) + tests/final-interactions |
| 4 | `src/modules/customers/Customer360MemoryTab.tsx:253` | <OsButton> | low | R12 אישור לא דרך רשומות Approval | פעולת אישור ללא התייחסות נראית למנוע/רשומות אישור | Lead (integration-requests-w9a) | בדיקה ידנית / החלטת Lead | e2e/final-interactions (per-route control walk) + tests/final-interactions |
| 5 | `src/modules/documents/DocumentsPage.tsx:517` | <OsButton> | low | R12 אישור לא דרך רשומות Approval | פעולת אישור ללא התייחסות נראית למנוע/רשומות אישור | Lead (integration-requests-w9a) | בדיקה ידנית / החלטת Lead | e2e/final-interactions (per-route control walk) + tests/final-interactions |
| 6 | `src/app/commands/CommandPalette.tsx:95` | <div onClick> (overlay) | info | R08 אלמנט לחיץ ללא מקלדת | רקע לסגירה בלחיצה — סגירה במקלדת מטופלת ע"י ESC של הדיאלוג | Lead (integration-requests-w9a) | מקובל — מתועד | e2e/final-interactions (per-route control walk) + tests/final-interactions |
| 7 | `src/design-system/Drawer.tsx:42` | <div onClick> (overlay) | info | R08 אלמנט לחיץ ללא מקלדת | רקע לסגירה בלחיצה — סגירה במקלדת מטופלת ע"י ESC של הדיאלוג | Lead (integration-requests-w9a) | מקובל — מתועד | e2e/final-interactions (per-route control walk) + tests/final-interactions |
| 8 | `src/design-system/Modal.tsx:78` | <div onClick> (overlay) | info | R08 אלמנט לחיץ ללא מקלדת | רקע לסגירה בלחיצה — סגירה במקלדת מטופלת ע"י ESC של הדיאלוג | Lead (integration-requests-w9a) | מקובל — מתועד | e2e/final-interactions (per-route control walk) + tests/final-interactions |

## מקרא חוקים

| חוק | תיאור | חומרה בסיס |
|---|---|---|
| R01 | כפתור ללא שם נגיש | high |
| R02 | כפתור native ללא מטפל | high |
| R03 | קישור ללא href אמיתי | high |
| R04 | מטפל onClick ריק | high |
| R05 | מטפל console.log בלבד | high |
| R06 | alert()/prompt() כמציין מיקום | high |
| R07 | TODO/FIXME בפעולה | medium |
| R08 | אלמנט לחיץ ללא מקלדת | medium |
| R09 | בקרה מושבתת ללא סיבה נראית | high |
| R10 | אייקון-בלבד ללא aria-label | high |
| R11 | פעולה הרסנית ללא confirm | medium |
| R12 | אישור לא דרך רשומות Approval | low |
| R13 | טופס ללא ולידציה | medium |
| R14 | submit מחוץ ל-form | medium |
| R15 | id כפול בקובץ | medium |
| R16 | Modal ללא title | high |
| R17 | Drawer ללא title | high |

