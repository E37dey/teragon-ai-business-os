# FINAL BASELINE (Phase 9.0)

תאריך: 24.07.2026 · HEAD בכניסה: **6084aa8** (Wave 8 final) · ענף: main · ענף בטיחות: `backup/pre-final-release-20260724-0100`

## סביבה
| פריט | ערך |
|---|---|
| Node | v25.8.1 |
| npm | 11.11.0 |
| Netlify CLI | 26.1.0 (win32-x64) — **מותקן** |
| IndexedDB schema | v6 |
| Migration version | m001–m007 (schemaVersion 7) |
| Routes | 31 מבצעיים (0 placeholders) |

## שערי baseline (ריצות אמת)
| שער | תוצאה | Exit |
|---|---|---|
| oxlint | 0 errors / 0 warnings | 0 |
| tsc -b (strict) | 0 errors | 0 |
| typecheck:tests | 0 errors | 0 |
| Vitest | **1639/1639** (177 files) | 0 |
| build | ✓ | 0 |
| scan:secrets | **CLEAN — 0 findings** | 0 |

## תיקון baseline שבוצע (לא רגרסיה — הידוק)
הסורק דיווח 5 ממצאים false-positive בכניסה. תוקנו **בשורש**, לא הושתקו:
1. **`src/server/redact.ts` נשאב ל-bundle הלקוח** (דרך governance audit export) — הפרת "קוד שרת לא בדפדפן". פוצל: `src/lib/redact.ts` איזומורפי (redact/redactValue/REDACTED טהורים) + `src/server/redact.ts` מייצא-מחדש ומשאיר את serverLog בלבד; `governance/auditExplorer.ts` מפנה ל-`@/lib/redact`. עכשיו שום `src/server/*` אינו ב-client bundle.
2. **הסורק סימן `x-api-key`** בתוך אלטרנציית ה-redaction (פיצ'ר מניעת-הדלפה) כאילו היה auth-wiring — הוחכם להבחין בין `headers:{"x-api-key":…}` (מסמן) לבין `…|authorization|x-api-key)…` (מדלג).
3. **`sk-\w{8,}` תפס "ri`sk-r`egister"** בשם צילום — תוקן ל-`(?<![A-Za-z])sk-…`.
4. **fixture בדיקה** `sk-W8FtamperedSecret` (audit-tampering test) בהיסטוריית git — נוסף ל-FAKE_MARKERS.
כל השערים אומתו מחדש אחרי התיקון: 1639/1639 · build ✓ · scanner CLEAN.

## גיבוי סינתטי
`docs/backups/wave6-baseline-seed-snapshot.json` (49 collections/283 רשומות, parse-verified) נשאר תקף; ה-seed דטרמיניסטי ו-`seedIfEmpty()` משחזר בדפדפן. אין נתונים אמיתיים.

## סיווג deployment
"סביבת הדגמה מקומית-בדפדפן עם נתונים סינתטיים" · Mode A (`AI_REMOTE_ENABLED=false`) · ספק AI מרוחק אינו פעיל.
