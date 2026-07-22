# W5-B — בקשות אינטגרציה (integration requests)

23.07.2026 · מאת: W5-B (Netlify AI Backend & Security) · אל: integration lead / W5-A

## 1. תלות אופציונלית — @netlify/functions (לא נדרש עכשיו)

package.json אסור לי לגעת. הפונקציות מומשו כ-**Netlify Functions v2 עם
Web-standard בלבד** (`export default (req: Request) => Response`) — עובד ללא
תלות. אם בעתיד נרצה typings של `Context` (geo, cookies) או scheduled
functions: להוסיף `@netlify/functions` כ-devDependency. לא חוסם דבר היום.

## 2. tsconfig.app.json — שינוי משותף קטן (בוצע, לידיעה)

הוספתי `"netlify"` ל-`include` כדי ששער `tsc -b` יכסה גם את עטיפות
הפונקציות (9 קבצים בני שורה). שינוי אדיטיבי; אם מתנגש במיזוג — ההעדפה שלי
נשארת שהעטיפות יהיו בכיסוי tsc.

## 3. Netlify esbuild + alias "@/" — נקודת deploy לבדיקה

`src/ai/contracts/serverDto.ts` (של W5-A) מייבא עם alias `@/`. בשביל bundling
של הפונקציות ב-deploy הוספתי `netlify/functions/tsconfig.json` עם paths
תואמים (esbuild קורא את ה-tsconfig הסמוך). לבדוק ב-deploy הראשון שה-bundling
עובר; אם לא — האופציות: `node_bundler=esbuild` מפורש ב-netlify.toml, או מעבר
ל-imports יחסיים בקבצי החוזה (שינוי אצל W5-A).

## 4. Rate limit / budget גלובליים — store משותף (עתידי)

המונים הם per-instance (מתועד בכנות ב-AI_SERVER_SECURITY.md). לאכיפה
גלובלית קשיחה נדרש Netlify Blobs / Redis / Upstash. מוצע כפריט Wave 6;
דורש אישור תלות + פרוביז'ן.

## 5. ai-config — endpoint תצורה ציבורי עבור ה-Registry (5.14)

מומש `/.netlify/functions/ai-config` ⇒ `{remoteEnabled, providerState}`
(ללא סודות; `providerState` גס וללא בדיקה חיה — האמת המאומתת ב-ai-health).
W5-A: זה המקור המיועד ל-`RegistryConfig.remoteEnabled` במקום env בלקוח.

## 6. אימות אמיתי (JWT) — מוכן להחלפה

`src/server/auth.ts` חושף `AuthVerifier`; מצב demo מסומן `trusted:false`
תמיד. כשיוחלט על ספק זהות (Netlify Identity / Auth0 / custom JWT) — מימוש
verifier חדש בלבד, ללא שינוי handlers. דורש החלטת מוצר.

## 7. סטרימינג SSE אמיתי מהספקים (עתידי)

מתאמי anthropic/openai מזרימים כיום כ"נפילה חיננית": יצירה אחת מלאה ⇒ delta
יחיד ⇒ done. NDJSON ללקוח כבר אמיתי (TestAdapter מרובה-deltas). SSE אמיתי
מהספק = שיפור Wave 6, לא שובר חוזה.
