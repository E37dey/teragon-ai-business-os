# FINAL SECURITY REPORT — W9-B (Phase 9.6 review)

> **סיווג פריסה:** סביבת הדגמה מקומית-בדפדפן עם נתונים סינתטיים · Mode A (`AI_REMOTE_ENABLED=false`).
> **אין מנגנון אימות אמיתי** — כל שכבות ההרשאה הן `סימולציית הרשאות במצב הדגמה`.

ביקורת של הקוד האמיתי. כל שורה: **PASS** (הגנה קיימת ומאומתת) / **FINDING** (חשיפה אמיתית שטופלה) /
**LIMITATION** (מגבלה מוצהרת ביושר, לא נטענת כמוגנת). בדיקות: `tests/security-final/**`.

| # | וקטור | מצב | בעלים | ראיה / מיטיגציה |
|---|---|---|---|---|
| 1 | **CSV formula injection** | **FINDING → מטופל** | W8-A (exporter) · W9-B (util) | ה-exporter `src/analytics/csv.ts` מבצע escaping **מבני** בלבד (`",\n\r`) ואינו מנטרל נוסחאות — תא שמתחיל ב-`= + - @` מורץ ב-Excel/Sheets. סיכון חי **נמוך** (העמודות כיום מטא-דאטה של מדדים בשליטת המערכת), אך `titleHe`/`group`/`calculationMethod`/`limitations` הם טקסט אנושי. סופק `csvSafeCell()` ב-`src/security` שמקדים `'` לכל תא נוסחה; **בדיקה מוכיחה את החשיפה בקוד הנוכחי ואז את התיקון** (`csvInjection.security.test.ts`). **אימוץ ה-exporter מבוקש** ב-`integration-requests-w9b.md` (W9-B אינו עורך קבצי W8-A). |
| 2 | **Stored/DOM XSS (markdown)** | **PASS** | W6-B | `src/memory/markdown/render.tsx` — React elements בלבד, **אין `dangerouslySetInnerHTML`**; raw HTML → טקסט inert (`escaped-html`). `securityReview.security.test.tsx`. |
| 3 | **Unsafe URL schemes** | **PASS** | W6-B | `classifyUrl` מנטרל `javascript:`/`data:`/`vbscript:` ושומר http/https/mailto בלבד. תא נבדק. |
| 4 | **Open redirect / tab-nabbing** | **PASS** | W6-B | קישור חיצוני מקבל `rel="noopener noreferrer"` + `target="_blank"` (`InlineView`); הורדת קובץ מקבלת `rel="noopener"`. תא נבדק. |
| 5 | **Print/export injection** | **PASS** | W3 | `buildQuotationPrintHtml` מריץ `escapeHtml` על **כל** שדה מוזרם — `<script>`/`<img onerror>`/`<iframe>` לא שורדים כ-HTML. תא נבדק. |
| 6 | **ZIP path traversal** | **PASS (מכוסה)** | W6-B | `src/memory/zip/zip.ts` דוחה `../`, absolute, drive-letter, backslash-tricks + עומק ספריות. מכוסה ב-`tests/wave6-security/importInjection.security.test.ts` — **לא נבדק מחדש** (משמעת gap-analysis). |
| 7 | **Prototype pollution (import parser)** | **PASS** | W6-B | `parseFrontmatter` — denylist מפתחות, דחיית YAML anchors/aliases; `__proto__` אינו מזהם את `Object.prototype`. תא נבדק. |
| 8 | **Error-message leakage** | **PASS** | W5-B / W9-B | הודעות דחייה (`AuthorizationError.reasonHe`, `authorizeFunctionOperation.detailHe`) הן עברית נקייה — אין stack trace / נתיבי קובץ. תא נבדק. |
| 9 | **Prompt injection (server)** | **PASS (הוריסטי, מוצהר)** | W5-B | `src/server/promptSecurity.ts` — שכבות מופרדות מבנית, זיהוי הוריסטי, הסגר תוכן חשוד, אישור אנושי מגן על כל פלט משנה-נתונים. ההוריסטיקה **אינה מושלמת** ומוצהרת ככזו. |
| 10 | **Oversized request (server)** | **PASS** | W5-B | `src/server/guards.ts` — `MAX_REQUEST_BYTES` 256KB, `MAX_CONTEXT_CHARS` 120K, `MAX_OUTPUT_CHARS` 40K, `MAX_DURATION_MS` 25s; חריגה → `413` typed. |
| 11 | **Audit tampering** | **LIMITATION (מוצהר)** | W8-F | מאגר `auditEvents` **אינו append-only** (`update()`/`remove()` מצליחים) — אין מודל auth (הדגמה חד-משתמש). מה שכן נאכף: ייצוא redacted+summary-only, ו-policy versions עם SHA-256. מכוסה ב-`tests/wave8-security/auditTampering.security.test.ts`. |
| 12 | **Function-operation authz** | **PASS (הדגמה, לא auth)** | W9-B | `src/security/functionAuthz.ts` — מרחיב את `src/server/auth.ts`; דוחה טענת role/org פגומה, operation לא-מוכר, והרשאה חסרה (fail-closed). `trusted:false` תמיד. **אינו טוען זהות מאומתת.** `functionAuthz.security.test.ts`. |

## סיכום CSV injection (המצב האמיתי)

**חשיפה אמיתית קיימת** ב-`src/analytics/csv.ts` — נוסחאות אינן מנוטרלות. הסיכון החי נמוך כי הערכים
המיוצאים היום הם מטא-דאטה בשליטת המערכת, אך זו לא הגנה מבנית. **W9-B סיפק את הפרימיטיב `csvSafeCell()`
+ בדיקה שמוכיחה גם את הבאג וגם את התיקון**, ומבקש מ-W8-A לאמץ אותו ב-`row()`/`esc()` (לפני ה-escaping
המבני). עד האימוץ — זה FINDING מתועד, לא נטען כמתוקן ב-exporter.

## מה לא נבדק כאן (מכוסה במקום אחר — לא רגרסיה)

- ZIP traversal ⇒ `tests/wave6-security/importInjection.security.test.ts`.
- Audit redaction / secret leakage ⇒ `tests/wave8-security/auditTampering.security.test.ts`, `tests/wave6-security/exportLeakage.security.test.ts`.
- Injection של הקשר ל-prompt ⇒ בדיקות W5-B הקיימות של `promptSecurity`.
