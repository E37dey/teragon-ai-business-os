# AI PROVIDER SETUP — TERAGON AI BUSINESS OS (Wave 5, W5-B)

23.07.2026 · איך מגדירים, מאמתים, משביתים ומחליפים ספק AI בצד השרת.
כל משתני הסביבה מתועדים ב-`.env.example`; הקוד קורא אותם רק ב-
`src/server/config.ts` (Netlify Functions). **שום ערך אמיתי לא נכנס ל-git.**

## מתאמים נתמכים (AI_PROVIDER)

| ערך         | מה זה                                                                                                       | דרישות                          |
| ----------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `test`      | מתאם דטרמיניסטי מקומי — ללא רשת, ללא מפתח. לבדיקות אינטגרציה וסימולציית "הצלחה מרוחקת". לעולם לא ברירת מחדל | `AI_MODEL` רצוי (מהודהד במעטפת) |
| `anthropic` | Anthropic Messages API (`/v1/messages`)                                                                     | `AI_API_KEY` + `AI_MODEL`       |
| `openai`    | OpenAI-compatible Chat Completions (`/v1/chat/completions`; עובד גם מול gateway תואם דרך `AI_BASE_URL`)     | `AI_API_KEY` + `AI_MODEL`       |

שם המודל מגיע **רק** מ-`AI_MODEL` — אין שמות מודלים בקוד; `envelope.model`
מהדהד את הערך שהוגדר.

## הוספת המשתנים

### Netlify UI (production)

1. Site configuration → Environment variables → Add a variable.
2. הוסיפו את המשתנים מ-`.env.example` (לפחות: `AI_PROVIDER`, `AI_MODEL`,
   `AI_API_KEY`, `AI_REMOTE_ENABLED=true`). Scope: **Functions**.
3. Deploy מחדש (env נטען בזמן invocation — אין צורך בשינוי קוד).

### פיתוח מקומי (untracked .env)

1. צרו `.env` בשורש (הקובץ **לא** במעקב git — ודאו לפני commit!).
2. הריצו `netlify dev` — הפונקציות יקבלו את המשתנים; ה-SPA רץ מולן על :8888.

## אימות דרך ai-health

```bash
curl -s http://localhost:8888/.netlify/functions/ai-health
```

| מצב           | משמעות                                                             |
| ------------- | ------------------------------------------------------------------ |
| `מושבת`       | `AI_REMOTE_ENABLED=false` (ברירת המחדל) — שום ספק לא נקרא          |
| `לא הוגדר`    | חסר `AI_PROVIDER` / `AI_MODEL` / `AI_API_KEY`                      |
| `מחובר`       | האימות מול הספק אומת ב**בדיקה חיה** (GET ‎/v1/models — ללא טוקנים) |
| `שגיאת אימות` | הספק דחה את המפתח (401/403)                                        |
| `לא זמין`     | תקלת רשת / timeout / 5xx מהספק                                     |
| `מגבלת תקציב` | `AI_DAILY_BUDGET` מוצה להיום                                       |

`/.netlify/functions/ai-config` מחזיר `{remoteEnabled, providerState}` ציבורי
(ללא סודות) עבור ה-ProviderRegistry של הלקוח; האמת המאומתת היא תמיד
`ai-health`.

## השבתת AI מרוחק (kill switch)

`AI_REMOTE_ENABLED=false` (או מחיקת המשתנה) ⇒ בריאות `מושבת`, כל פעולת AI
נדחית עם `AI_PROVIDER_NOT_CONFIGURED`, ואף ספק אינו נקרא. אין צורך למחוק את
המפתח כדי להשבית (אך ראו רוטציה למטה).

## התנהגות fallback (צד לקוח)

כשהשרת אינו `מחובר`/`חיבור מוגבל`, ה-ProviderRegistry של הלקוח (W5-A) עובר
למנוע המקומי מבוסס הכללים **עם חשיפה מלאה**: "הספק המרוחק אינו זמין. המערכת
עברה למנוע המקומי מבוסס הכללים." — נפילה שקטה אסורה. השרת מצדו לעולם לא
מזייף הצלחה: אין מפתח ⇒ שגיאה מקודדת, לא תוכן מומצא.

## רוטציית מפתח

1. הנפיקו מפתח חדש אצל הספק.
2. עדכנו `AI_API_KEY` ב-Netlify UI (הערך נטען בבקשה הבאה).
3. אמתו `ai-health` ⇒ `מחובר`.
4. בטלו את המפתח הישן אצל הספק.
5. אם מפתח נחשף: בטלו מיד אצל הספק, החליפו, ואז בדקו לוגים — המיסוך
   (`redact.ts`) אמור היה למנוע הופעתו, אבל ביטול אצל הספק הוא האמת היחידה.

## אימות שהמפתח לא בצרור הלקוח (bundle)

אחרי `npm run build`:

```bash
grep -rEil "sk-[A-Za-z0-9]{8}|AI_API_KEY|x-api-key|ANTHROPIC|OPENAI_API" dist/assets
```

התוצאה חייבת להיות **ריקה** (0 קבצים). כלל הזהב: אין `VITE_*` לסודות —
כל משתנה בעל קידומת VITE_ נכנס לצרור הדפדפן.

## פתרון תקלות מהיר

| סימפטום                                   | בדיקה                                                            |
| ----------------------------------------- | ---------------------------------------------------------------- |
| `AI_PROVIDER_NOT_CONFIGURED` למרות שהוגדר | `AI_REMOTE_ENABLED=true`? שלושת המשתנים ב-scope Functions?       |
| `AI_PROVIDER_TIMEOUT` עקבי                | הגדילו `AI_REQUEST_TIMEOUT_MS` (נשאר מתחת ל-25s תקציב הבקשה)     |
| `AI_RATE_LIMITED` מוקדם מדי               | `AI_RATE_LIMIT_PER_MINUTE` נמוך; זכרו: לפי משתמש **וגם** session |
| `AI_DAILY_BUDGET_EXCEEDED`                | ראו חשבונאות measured-only ב-AI_SERVER_SECURITY.md               |
