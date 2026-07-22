# DESIGN SYSTEM OS — TERAGON AI BUSINESS OS

בעלות: סוכן Design System (W1-B). מקור אמת ויזואלי: `docs/VISUAL_DNA.md` + ייחוסים 1/7/19.
כל הקבצים TypeScript strict (עברו `tsc` תחת הדגלים המלאים של `tsconfig.app.json`, כולל
`noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `erasableSyntaxOnly`).

## מבנה

```
src/styles/
  tokens.css        ← כל ה---os-* (פלטה מחייבת + spacing/radius/type/shadow/glow/transition/layout dims)
  base.css          ← בסיס כהה גלובלי (:root/body ישירות — האפליקציה 100% OS), scrollbars, selection,
                      focus-visible cyan, reduced-motion, .os-num/.os-ltr
  components.css    ← כל מחלקות os-* לפרימיטיבים + מעטפת (nav/header/rail/workspace/shell/copilot)
src/design-system/  ← פרימיטיבים typed + barrel (index.ts)
src/layout/         ← רכיבי המעטפת הקנונית + barrel (index.ts)
```

ייבוא כל דבר מ-`@/design-system` או `@/layout` מושך אוטומטית את שרשרת ה-CSS
(components.css → base.css → tokens.css). אין להוסיף CSS גלובלי במקום אחר.

## פונטים — פעולה נדרשת מהארכיטקט

`tokens.css` כולל `@import` ל-Google Fonts (Heebo + Assistant, display=swap) כ-fallback.
לביצועים עדיפים הוסיפו ל-`<head>` של `index.html` (לא בבעלותי):

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700&family=Assistant:wght@400;600;700&display=swap"
  rel="stylesheet"
/>
```

(ה-@import יכול להישאר — הדפדפן ישתמש בקאש; אפשר גם להסירו לאחר הוספת ה-link.)

## טוקנים (תמצית)

- משטחים: `--os-bg #030812 · --os-nav #050B15 · --os-panel #07111F · --os-raised #0A1627 · --os-highlight #0C1C31`
- גבולות: `--os-border rgba(112,158,220,.17)` · `--os-border-strong rgba(112,158,220,.28)`
- טקסט: `--os-text #F5F8FD · --os-text-2 #98A8BD · --os-muted #65758B`
- אקסנטים: `--os-blue #287BFF · --os-cyan #20C4E8 · --os-violet #7655FF · --os-success #21C981 · --os-warning #E7A93D · --os-danger #EC5D68`
  - לכל אקסנט גם `-soft` (מילוי 12%), `-border` (45%), ו-`--os-glow-*` (זוהר מרוסן).
  - `--os-violet-text #A18DFF` — סגול קריא על רקע כהה (לטקסט בלבד).
- ריווח: `--os-space-1..10` (2/4/6/8/12/16/20/24/32/40px) · רדיוס: `--os-radius-xs..xl,full`
- טיפוגרפיה: `--os-text-2xs..2xl` (11-28px), Heebo→Assistant→Rubik
- מעטפת: `--os-nav-width 220px · --os-rail-width 300px · --os-header-height 56px` + סולם z (`--os-z-*`)
- RTL: לוגי בלבד (inline-start/end). מספרים: class `os-num`; ערכים טכניים LTR: `os-ltr`.

## חוזי כנות (לא ניתנים לעקיפה)

1. **OsButton** — `disabled: true` מחייב `disabledReason: string` **ברמת הטיפוסים**
   (union מפוצל). הסיבה מוצגת כ-tooltip עברי נראה + `title` + `aria-label`.
2. **ConfidenceBar** — `value: number | null`. null ⇒ "טרם נמדד" עם מסילה ריקה. לעולם לא ממציא מספר.
3. **DataTable / EmptyState** — מצב ריק = "אין נתונים להצגה" + `emptyReason`/`reason` שמסביר למה.
4. **StatusChip** — טיפוס `OsStatus` מגביל ל-8 הסטטוסים הקנוניים בלבד; צבע נגזר מהסטטוס, לא מהקורא.
5. **AgentCard.evidenceCount** — `number | null`; null מוצג "—".
6. **KpiCard** — `delta` אופציונלי; ללא delta אין chip. `spark` עם פחות מ-2 נקודות לא מצויר.
7. **Sparkline** — SVG polyline טהור (recharts לא מותקן ואסור).
8. תוכן הדגמה תמיד מסומן "נתוני הדגמה" (ראו DesignShowcase).

## API — פרימיטיבים (`@/design-system`)

| רכיב                           | Props עיקריים                                                                                                                                                                                                                                   |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OsIcon`                       | `name: IconName` (34 שמות, כולם inline SVG, stroke currentColor), `size=16`, `strokeWidth=1.8`, `title?` (בלעדיו aria-hidden). `chevron-forward` מצביע ל-inline-end (שמאל ב-RTL)                                                                |
| `Panel`                        | `variant: 'panel'\|'raised'\|'highlight'`, `accent?: OsAccent` (זוהר מרוסן), + כל HTMLDivElement                                                                                                                                                |
| `KpiCard`                      | `title, value, delta?: number\|null, deltaLabel?, spark?: readonly number[], accent?: OsAccent, glow?, icon?: IconName`                                                                                                                         |
| `Sparkline`                    | `values: readonly number[], accent?/stroke?, strokeWidth?`                                                                                                                                                                                      |
| `StatusChip`                   | `status: OsStatus` (8 קנוניים), `label?` (טקסט בלבד — צבע נשאר מהסטטוס)                                                                                                                                                                         |
| `SectionTitle`                 | `title, subtitle?, icon?: IconName, action?: ReactNode` (סלוט inline-end)                                                                                                                                                                       |
| `DataTable<T>`                 | `columns: DataTableColumn<T>[]` (`render?: (row,i)=>ReactNode`, `align`, `numeric`, `width`), `rows: T[]`, `rowKey?: keyof T \| fn`, `onRowClick?`, `rowClassName?`, `emptyText/emptyReason`, `footer?: ReactNode`, `maxHeight?` (כותרת sticky) |
| `OsButton`                     | `variant: primary\|cyan\|violet\|success\|danger\|ghost\|approve\|reject`, `size: sm\|md\|lg`, `icon?: IconName`, חוזה disabled+disabledReason                                                                                                  |
| `Stepper`                      | `steps: StepperStep[]` (`id,label,icon?,count?,status?`), `activeId?` (גוזר done/active/pending), `onStepClick?`                                                                                                                                |
| `AgentCard`                    | `name, role?, accent (ירוק=אישור אנושי, כחול=Orchestrator, סגול=Mentor, כתום=Fixer, cyan=Wiki/Hunter), owner/input/output?, status?: OsStatus, evidenceCount: number\|null`                                                                     |
| `TierCard`                     | `title, subtitle?, accent: cyan\|blue\|violet, icon?, items: string[], footerTime?`                                                                                                                                                             |
| `ConfidenceBar`                | `value: number\|null, label?, tone?` (אוטומטי: ≥80 ירוק · ≥55 cyan · ≥30 כתום · אחרת אדום), role="meter"                                                                                                                                        |
| `GlowOrb`                      | `size=64, accent: violet\|cyan\|blue, animated=true` (נעצר ב-reduced-motion)                                                                                                                                                                    |
| `EmptyState`                   | `icon?, title="אין נתונים להצגה", reason?, action?`                                                                                                                                                                                             |
| `Drawer`                       | `open, onClose, title, children` — נפתח מ-inline-start (ימין ב-RTL), ESC + overlay סוגרים                                                                                                                                                       |
| `Modal`                        | `open, onClose, title, children, footer?` — מלכודת פוקוס בסיסית (Tab מחזורי), ESC, החזרת פוקוס                                                                                                                                                  |
| `Tabs`                         | `items: {id,label,badge?}[], activeId, onChange` — controlled, role=tablist                                                                                                                                                                     |
| `SearchInput`                  | `value, onChange, onSubmit?(Enter), placeholder, kbdHint?` ("⌘K")                                                                                                                                                                               |
| `ToastProvider` + `useToast()` | `toast(message, tone?: success\|danger\|warning\|info, durationMs?=4000)`, `dismiss(id)`. ה-hook זורק מחוץ ל-Provider                                                                                                                           |

טיפוסים משותפים: `OsAccent`, `OsTierAccent`, `OsStatus`, `OS_ACCENT_HEX` (ל-SVG בלבד).

## API — מעטפת (`@/layout`)

### AppShell — מחליף את MinimalShell ב-Wave 2

```tsx
<ToastProvider>
  {" "}
  {/* עוטפים פעם אחת ברמת האפליקציה */}
  <AppShell
    navItems={NAV_ITEMS} // NavItem: {id,label,icon:IconName,href,badge?}
    activeRoute={location.pathname} // התאמה: exact ואז longest-prefix; או activeNavId מפורש
    user={{ name: "צחי זוסטייהם", role: 'מנכ"ל · טרגון טכנולוגיות' }} // הזהות הקנונית — מוזרקת ע"י האפליקציה
    renderLink={({ item, content, className, active }) => (
      <Link to={item.href} className={className} aria-current={active ? "page" : undefined}>
        {content}
      </Link>
    )} // גשר הראוטר — layout לא מייבא react-router
    railContent={<LeftIntelligenceRail title="…">{railForRoute}</LeftIntelligenceRail>}
    headerProps={{ onSearch, onQuickAdd, onNotifications, notificationsCount, onMail, mailCount }}
    onAsk={undefined} // Copilot: ללא handler הקלט disabled + "יחובר בהמשך"
  >
    <Outlet /> // ה-canvas המרכזי
  </AppShell>
</ToastProvider>
```

- **RightPrimaryNavigation** — ניווט קבוע ~220px ב-inline-start (ימין), לוגו TERAGON · AI BUSINESS OS,
  פריטים עם אייקון+badge+זוהר cyan לפעיל, כרטיס AI Copilot עם GlowOrb + "שאל כל דבר…" בתחתית.
  ניתן להזריק `copilotSlot` להחלפת הכרטיס כולו.
- **CompactTopHeader** — אווטאר+שם/תפקיד (props גנריים), + / פעמון עם badge / מעטפה (disabled בכנות
  כשאין handler), חיפוש גלובלי עם ⌘K, תאריך עברי (Intl he-IL-u-ca-hebrew) + לועזי + שעון חי (30ש׳).
  כל התאריכים אמיתיים — לא מדומים. badges מוצגים רק כשמועבר count אמיתי.
- **LeftIntelligenceRail** — מיכל סלוט ~300px ב-inline-end (שמאל), `title?`, `collapsible` (ברירת מחדל true).
- **MainOperationalWorkspace** — flex: canvas מרכזי (`<main>`) + סלוט rail. צפיפות 1920×1080.

## Showcase

`src/design-system/showcase/DesignShowcase.tsx` — default export, מרנדר את כל הפרימיטיבים בתוך
AppShell מלא עם תוכן עברי מסומן "נתוני הדגמה" (משתמש: צחי זוסטייהם · ברכה: "ערב טוב, צחי").
חיווט מוצע: route זמני `/design` (הארכיטקט מחליט; הקובץ לא נוגע בראוטר).

## אימות

`npx tsc -p <tsconfig עם הדגלים המלאים של tsconfig.app.json>` על `src/design-system/**` +
`src/layout/**` עבר נקי (exit 0) ב-2026-07-22. `tsc -b` מלא נכשל רק על
`src/repositories/Repository.ts` (TS1294 — קובץ של סוכן הארכיטקטורה, לא של מערכת העיצוב).

## סטיות מודעות מהבריף

- `icons.tsx` כולל גם `alert`, `inbox`, `send`, `bot`, `evidence`, `chevron-back` — נדרשים פנימית
  (StatusChip/EmptyState/AgentCard/Copilot) מעבר לרשימה שהוזמנה.
- `Sparkline` נחשף כרכיב עצמאי (KpiCard משתמש בו) — שימושי ל-rails.
- `base.css` מעצב `:root/body` ישירות (האפליקציה 100% OS) אך `.theme-os` נשמר כ-alias לצרכי scoping.
