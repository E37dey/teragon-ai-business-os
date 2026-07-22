# AI SERVER SECURITY — TERAGON AI BUSINESS OS (Wave 5, W5-B)

23.07.2026 · בעלות: W5-B (Netlify AI Backend & Security) · חוזה: DTO v1 (`src/ai/contracts/serverDto.ts`)

כל הלוגיקה יושבת ב-`src/server/**` (טהורה, נבדקת ב-vitest); הקבצים תחת
`netlify/functions/` הם עטיפות בנות שורה אחת.

## מודל האיומים (threat model)

| איום                                           | הגנה                                                                                               |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| דליפת מפתח ספק לדפדפן                          | המפתח קיים רק ב-env של הפונקציות; אין `VITE_*`; סריקת bundle ב-CI (ראו AI_PROVIDER_SETUP)          |
| דליפת מפתח ללוגים                              | `redact.ts` — כל שורת לוג עוברת מיסוך דפוסי sk-/Bearer/JWT/key=value; מפתח בשם שדה סודי ממוסך תמיד |
| הזרקת הוראות דרך רשומות/קלט (prompt injection) | שכבות פרומפט מובנות + היוריסטיקות + הסגר (ראו למטה)                                                |
| הצפת בקשות (DoS / runaway loop)                | מגבלת גודל 256KB, מגבלת הקשר, rate limit הזזה, שער מקביליות, תקציב יומי                            |
| שריפת תקציב                                    | שער תקציב יומי לפני כל קריאת ספק; חסימה = `AI_DAILY_BUDGET_EXCEEDED`                               |
| חשיפת stack trace / גוף שגיאה גולמי            | `errors.ts` — רק 11 קודים יציבים + הודעה עברית; detail פנימי נרשם ללוג (לאחר מיסוך) בלבד           |
| זיוף זהות                                      | גבול אימות demo: claims נבדקים צורנית ומסומנים `trusted:false` — לעולם לא זהות מאומתת              |
| הזרקת לוג/כותרת דרך correlationId              | צורה מוקפדת `[A-Za-z0-9._:-]{1,128}`; ערך פגום מוחלף, לא מהודהד                                    |
| CSRF/מקור זר                                   | allowlist CORS: same-origin + פורטי פיתוח מקומיים בלבד; מקור זר לא מקבל allow-origin               |

## טבלת מגבלות (guards.ts)

| מגבלה                       | ערך                                                          | קוד בחריגה                    | HTTP |
| --------------------------- | ------------------------------------------------------------ | ----------------------------- | ---- |
| גודל גוף בקשה               | 256KB                                                        | AI_RESPONSE_INVALID           | 413  |
| אורך הקשר תחום (serialized) | 120,000 תווים                                                | AI_RESPONSE_INVALID           | 413  |
| אורך פלט                    | 40,000 תווים                                                 | חיתוך **מוצהר** ב-limitations | —    |
| תקציב זמן לבקשה             | 25s (מתחת למגבלת Netlify)                                    | AI_PROVIDER_TIMEOUT           | 504  |
| timeout לניסיון ספק         | AI_REQUEST_TIMEOUT_MS (ברירת מחדל 20s)                       | AI_PROVIDER_TIMEOUT           | 504  |
| קצב                         | AI_RATE_LIMIT_PER_MINUTE לדקה, לפי משתמש **וגם** לפי session | AI_RATE_LIMITED               | 429  |
| מקביליות                    | AI_MAX_CONCURRENT_REQUESTS                                   | AI_RATE_LIMITED               | 429  |
| תקציב יומי                  | AI_DAILY_BUDGET יחידות                                       | AI_DAILY_BUDGET_EXCEEDED      | 429  |

## מדיניות retry (providers/http.ts)

- עד **2 ניסיונות חוזרים** (סה"כ 3 ניסיונות), **רק** לשגיאות חולפות:
  timeout, שגיאת רשת, 429 של הספק, 5xx של הספק.
- **לעולם לא** retry על: אימות (401/403), בקשה לא-תקינה, תקציב, מדיניות/הרשאות,
  ביטול, ספק לא מוגדר.
- ה-handler עוטף כל ניסיון ב-timeout race; מתאמי ה-HTTP אוכפים timeout נוסף
  ברמת fetch (AbortController).

## מיפוי שגיאות (errors.ts)

11 הקודים היציבים בלבד; ההודעה למשתמש היא תמיד `AI_ERROR_MESSAGES_HE[code]`.
`correlationId` מהודהד בכל גוף שגיאה, כותרת ואירוע audit.

**החלטה מתועדת — בקשה לא-תקינה:** ל-DTO v1 אין קוד "בקשה שגויה"; הפרות
צורת בקשה (JSON פגום, כשל ולידציית DTO, גוף גדול מדי) מוחזרות כ-
`AI_RESPONSE_INVALID` עם HTTP 400/413 ו-`recoverable:false`. לקוח תקין
(RemoteAIProvider) מוודא לפני שליחה ולכן לא יפגוש נתיב זה.

## שכבות פרומפט + זיהוי הזרקה (promptSecurity.ts, Phase 5.4)

שש שכבות מובנות: מדיניות מערכת (קבועה) → תפקיד+הרשאות → הוראות פעולה →
**הקשר מאומת** (בלוקי JSON עם source refs — לעולם לא שרשור פרוזה) →
**קלט משתמש לא-מהימן** (תחום ומסומן `<<<user-input>>>`) → סכימת תשובה.

היוריסטיקות (עברית+אנגלית): "ignore previous instructions", "התעלם מההוראות",
בקשות חשיפת system prompt, עקיפת אישור (approval bypass), חשיפת סודות,
דפוסי override אימפרטיביים. ממצא ⇒ הרשומה/הפרמטר **מוצא מהשכבה המהימנה**
(הסגר), נוספת אזהרה עברית ל-`envelope.limitations`, ונרשם ב-audit
(`injectionFlags`).

**גילוי נאות: הזיהוי היוריסטי ואינו מושלם.** ניסוח חדש יעבור אותו. לכן ההגנה
רב-שכבתית: הפרדה מבנית של שכבות, מדיניות מערכת שמגדירה הקשר-כנתון-בלבד,
ו-HITL על כל פלט משנה-נתונים — גם כשאף היוריסטיקה לא נורתה.

## מיסוך לוגים (redact.ts)

כל לוג שרת עובר `serverLog()` → `redactValue()`. דפוסים: `sk-…`, `AKIA…`,
JWT (`eyJ…`), `Bearer …`, `key/secret/token/password=value` (הערך ממוסך, שם
השדה נשמר). בדיקה אוכפת שמפתח דמה `sk-FAKE…` אינו מופיע באף שורת לוג.

## rate limit / budget — אזהרת serverless (בכנות)

המונים הם **בזיכרון, לכל instance של פונקציה**. Netlify עשוי להריץ כמה
instances במקביל ולמחזר אותם — ולכן המגבלה האפקטיבית הגלובלית עשויה להיות
גבוהה מהמוגדר, והמונים מתאפסים ב-cold start. המנגנון עדיין עוצר לולאות
runaway ופרצי בקשות פר-instance. מגבלה גלובלית קשיחה מחייבת store משותף
(Redis / Netlify Blobs) — רשום כבקשת אינטגרציה עתידית.

### חשבונאות תקציב — measured-only

אין המצאת טוקנים: usage שדווח ע"י הספק (`measured:true`) נספר בטוקנים;
usage שלא דווח נספר **כבקשה אחת = יחידה אחת**. שני הסוגים נספרים מול
`AI_DAILY_BUDGET`; הסטטוס מפרט כמה מכל סוג. `0`/ריק = אין שער תקציב.

## גבול ה-audit

השרת פולט **אירועי audit תפעוליים** (אובייקט + שורת לוג ממוסכת):
correlationId, פעולה, endpoint, זהות-claims, `authTrusted:false`, תוצאה,
קוד שגיאה, ספק/מודל בפועל, משך, `usageMeasured`, דגלי הזרקה, אזהרות.
**רשומות ה-audit המוצריות נשמרות בדפדפן** (IndexedDB דרך ה-repositories
הקנוניים) — השרת stateless ואינו שומר דבר. `correlationId` מחבר בין הצדדים.

## גבול אימות (auth.ts) — authentication-READY

מצב demo מוצהר: `organizationId/userId/sessionId` הם **claims** — נבדקת
צורתם בלבד, כותרת `x-teragon-auth` אופציונלית חייבת מבנה `demo.<base64url>`
כשהיא קיימת, וכל הקשר מסומן `trusted:false`. ממשק `AuthVerifier` מוכן
להחלפה ב-verifier JWT אמיתי (`trusted:true`) בלי לשנות את ה-handlers.

## CORS + כותרות אבטחה (cors.ts)

- Allowlist: same-origin + `localhost/127.0.0.1` בפורטים 5173/4173/8888 בלבד.
- מקור לא מורשה ⇒ אין `access-control-allow-origin` (הדפדפן חוסם קריאה).
- OPTIONS מטופל (204); כל תשובה: `x-content-type-options: nosniff`,
  `cache-control: no-store`, `referrer-policy`, והד `x-correlation-id`.
