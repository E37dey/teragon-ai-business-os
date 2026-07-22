# WAVE 2 TEST RESULTS — ריצות אמיתיות (23.07.2026)

כל הפקודות רצו בפועל על המכונה (Windows 11, Node). exit codes אמיתיים.

## 1. Prettier

```
> npx prettier --write src tests e2e playwright.config.ts
exit code: 0   (formatted; re-run "--check" clean)
```

## 2. Lint — oxlint

```
> npm run lint
> oxlint
exit code: 0    (0 errors, 0 warnings — no suppressions added)
```

## 3. Typecheck — tsc strict + noUncheckedIndexedAccess

```
> npm run typecheck
> tsc -b --noEmit
exit code: 0    (0 errors)
```

## 4. Unit / integration — Vitest

```
> npm run test
 Test Files  9 passed (9)
      Tests  149 passed (149)
   Duration  3.89s
exit code: 0
```

חדשים בגל 2 (46 בדיקות):

| קובץ                              | בדיקות | מכסה                                                                                                                       |
| --------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------- |
| tests/badges.test.ts              | 9      | ארבעת סלקטורי ה-badge מול מעבר עצמאי על הזרע, `now` קבוע, גבול end-of-day, אפס⇒אין badge                                   |
| tests/searchRank.test.ts          | 13     | classifyMatch, שדות (טלפון/אימייל/סריאלי/Q-מספר/ticket-id/עברית), דירוג דטרמיניסטי, עדיפות ישויות, limit                   |
| tests/deriveNotifications.test.ts | 11     | דטרמיניזם/אידמפוטנטיות, ids יציבים, zod, איחורים מול מעבר עצמאי, SLA, חסום=דחוף, 0 כשלי אוטומציה בזרע + כן מייצר על כשל    |
| tests/navGroups.test.ts           | 8      | כל path קיים ב-APP_ROUTES, 5 קבוצות, ייחודיות, 2 ראוטים חדשים, `/customers` מחוץ לניווט אך ראוט חי, רזולוציית active/group |
| tests/quickCreate.test.ts         | 4      | createLead ⇒ מופיע ב-rankedSearch; createTicket ⇒ badge שירות +1; ids דטרמיניסטיים; שגיאות zod בעברית                      |
| tests/router.test.tsx             | עודכן  | 31 רשומות ראוט (30 ראוטים) + עטיפת QueryClientProvider                                                                     |
| tests/repositories.test.ts        | עודכן  | seedIfEmpty מדלג על אוסף notifications הריק                                                                                |

## 5. Production build

```
> npm run build
> tsc -b && vite build
dist/assets/index-*.css   45.54 kB │ gzip:   7.50 kB
dist/assets/index-*.js   570.45 kB │ gzip: 168.92 kB
✓ built in 247ms
exit code: 0
```

(אזהרת chunk >500kB בלבד — לא שגיאה; פיצול קוד מתוכנן לגל מסכים.)

## 6. Playwright e2e — chromium, baseURL http://localhost:4173 (vite preview)

```
> npx playwright test
  20 passed (20.2s)
exit code: 0
```

| Spec                                                      | מה מוכח                                                                                             |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| groups expand/collapse and persist after reload           | פתיחה/כיווץ קבוצה + persist ב-localStorage אחרי reload                                              |
| active route's group auto-expands                         | deep-link ל-/service פותח את "שירות והדרכה" + aria-current                                          |
| service badge shows the real open-ticket count            | badge > 0 מהזרע (7 קריאות פתוחות)                                                                   |
| keyboard: arrows / Home / End                             | ניווט מקלדת בין כל פקדי הניווט                                                                      |
| "Bambu" finds a printer model and Enter opens destination | חיפוש אמיתי + ניווט מקלדת לתוצאה + Enter ⇒ /printers                                                |
| no-results state + Escape                                 | מצב כן + סגירה                                                                                      |
| Ctrl+K … צור ליד חדש                                      | palette ⇒ טופס zod (שגיאה בעברית על ריק) ⇒ toast ⇒ /crm ⇒ הליד נמצא בחיפוש מיד (query invalidation) |
| shortcuts dialog                                          | פקודת "הצג קיצורי מקלדת" פותחת דיאלוג אמיתי                                                         |
| bell … mark-read persists across reload                   | ספירה אמיתית, ‑1 אחרי סימון, שורד reload (IndexedDB)                                                |
| unread-only + category filters                            | סינון קטגוריה מציג רק את הקטגוריה                                                                   |
| no console errors on /, /crm, /agents                     | 0 שגיאות console/pageerror                                                                          |
| axe on /                                                  | **0 הפרות serious/critical** (אחרי תיקון ניגודיות `--os-muted`)                                     |

### תיקון axe שבוצע (root cause, לא סינון)

ריצה ראשונה: `color-contrast` serious על 9 nodes (כולם `--os-muted:#65758b` על רקעים כהים, יחס 3.64–4.27). תוקן ע"י הבהרת הטוקן ל-`#75879f` (≥4.67:1 על כל משטחי ה-shell) + אותו תיקון ב-PlaceholderPage (צבע קשיח). ריצה חוזרת: 0 הפרות.

## 7. צילומי מסך (Playwright, נשמרו בפועל)

`docs/screenshots/wave2/`: shell-home-1920x1080 / 2560x1440 / 3840x2160, search-open, palette-open, notifications-open.
