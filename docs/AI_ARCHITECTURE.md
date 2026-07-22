# AI ARCHITECTURE — TERAGON AI BUSINESS OS (Wave 5, W5-A)

23.07.2026 · בעלות: W5-A (AI Contracts & Provider Architecture) · צד השרת: W5-B

מסמך זה מגדיר את חוזה ה-AI הקנוני: המעטפת (Envelope V2), חוזה הספק (AIProvider),
מצבי הבריאות, מדיניות ה-Registry, חוזה ה-DTO גרסה v1 מול W5-B, וכללי הכנות.

## עקרונות (ירושה מ-ARCHITECTURE.md — מחייבים)

1. **AI רק בשרת.** הדפדפן פונה אך ורק ל-`/.netlify/functions/ai-*` (נתיבים יחסיים).
   אין מפתחות, אין שמות מודלים, ואין כתובות ספקים בקוד הלקוח. שם המודל חוזר
   **מהשרת** בתוך המעטפת.
2. **כנות.** אין מדד מומצא: ביטחון שלא נמדד = `"unavailable"` ⇒ "טרם נמדד";
   usage שלא דווח = שדות חסרים (חסר ≠ אפס); כל מגבלה מוצהרת; נפילת ספק לעולם
   אינה שקטה.
3. **HITL.** כל פלט שהיה משנה נתונים או שולח הודעה ⇒ `approval.required=true`
   ומחכה לאישור אנושי.
4. **חוזה אחד.** כל ספק — מקומי, מרוחק, עתידי — מממש בדיוק את `AIProvider`.
   ה-UI תלוי בחוזה בלבד.

## מפת קבצים

| קובץ                                     | תפקיד                                                              |
| ---------------------------------------- | ------------------------------------------------------------------ |
| `src/domain/ai/envelope.ts`              | טיפוסי Envelope V2 + עזרי רינדור + גשר למעטפת דור 1                |
| `src/ai/schemas/envelope.ts`             | סכימות zod למעטפת (round-trip מובטח)                               |
| `src/ai/contracts/AIProvider.ts`         | חוזה הספק, AIRequest, בריאות, יכולות, קודי שגיאה + מפת עברית       |
| `src/ai/contracts/serverDto.ts`          | **חוזה ה-DTO v1 מול W5-B** — endpoints, סכימות בקשה/תשובה/סטרימינג |
| `src/ai/providers/LocalRulesProvider.ts` | מנוע מקומי מבוסס כללים — דטרמיניסטי, ללא רשת                       |
| `src/ai/providers/RemoteAIProvider.ts`   | מעטפת לקוח לפונקציות השרת — ולידציית zod על כל תשובה               |
| `src/ai/providers/registry.ts`           | מדיניות בחירת ספק + חשיפת fallback                                 |

## Envelope V2 — המעטפת הקנונית

`AIResponseEnvelopeV2` (עוקבת אחרי מעטפת ה-aiResult של הדונור, SNAP 2345–2354,
ומרחיבה אותה):

```
id · requestId · correlationId · provider · model(string|null) · createdAt ·
operation · recommendation · reason · evidence: EvidenceItem[] ·
confidence: ConfidenceInfo · nextStep · limitations: string[] ·
approval: ApprovalInfo · usage: UsageInfo · status: הצלחה|נכשל|חלקי|בוטל
```

- **EvidenceItem** — `sourceType, sourceId, title, relevantExcerpt,
relevanceMethod, verified, lastUpdated`. כל ראיה מצטטת רשומה **אמיתית**
  (`sourceId` = id קיים); `verified=true` רק כשהרשומה נקראה בזמן הייצור.
- **ConfidenceInfo** — `value?, label, method, contributingSignals, status`.
  חוזה הרנדרר: `status="unavailable"` ⇒ להציג **"טרם נמדד"**; ערך חסר לעולם
  אינו הופך ל-0. הפונקציה היחידה המוסמכת לרינדור טקסטואלי:
  `confidenceDisplayHe()` ב-`src/domain/ai/envelope.ts`. הסכימה אף דוחה
  `unavailable` עם ערך מספרי (מספר מומצא) ו-`measured` בלי ערך.
- **ApprovalInfo** — `required, state(not_required|pending|approved|edited|
rejected|expired|cancelled), requestedAt?, approvedAt?, approverId?,
approverName?, userEdits?, rejectionReason?`. דחייה מחייבת סיבה (סימטריה
  לחוזה "החזרה מחייבת נימוק" של בדיקת המדריך).
- **UsageInfo** — `inputTokens?, outputTokens?, totalTokens?, estimatedCost?,
currency?, measured`. **חסר ≠ אפס**: מנוע הכללים מחזיר `{measured:false}`
  ללא שדות טוקנים כלל.

### גשר למעטפת דור 1

`AIResponseEnvelope` (types.ts, 7 שדות) נשארת בשימוש רשומות `AIRecommendation`.

- `toLegacyEnvelope(v2)` — הורדה ל-7 השדות (ראיות הופכות לרשומות `Evidence`
  מלאות; `confidence.unavailable` ⇒ `confidenceMethod:null`).
- `fromLegacyEnvelope(legacy, meta)` — הרמה ל-V2 (ללא המצאת ערכים: אין
  confidenceMethod ⇒ unavailable; usage לא נמדד).

## חוזה הספק — AIProvider

```ts
interface AIProvider {
  id: string; displayName: string;
  health(): Promise<AIProviderHealth>;
  capabilities(): Promise<AICapabilities>;
  stream(req: AIRequest): AsyncIterable<AIStreamEvent>;
  generateStructured<T>(req: AIRequest, schema: z.ZodType<T>): Promise<AIProviderResult<T>>;
  summarize/classify/recommend/explain(req: AIRequest): Promise<AIResponseEnvelopeV2>;
}
```

**AIRequest** נושא: `operation` (מפתח כמו `"summarize.weekly-leads"`),
`organizationId, userId, sessionId, correlationId?`, `relatedEntities:
{type,id}[]`, `boundedContext` — **פרוסות רשומות מוקלדות, לא טקסט חופשי**
(מזעור נתונים: הקורא בוחר בדיוק אילו רשומות הפעולה רשאית לראות),
`params?` סקלרים מוקלדים, `outputSchemaVersion`, `signal?: AbortSignal`.

**מצבי בריאות** (עברית מדויקת): `לא הוגדר · בודק חיבור · מחובר · חיבור מוגבל ·
לא זמין · מגבלת תקציב · שגיאת אימות · מושבת` + `checkedAt` + `detail`.

**AIStreamEvent**: `start → delta* → done(envelope מלאה) | error(code, messageHe)`.

### קודי שגיאה יציבים + מפת עברית

11 קודים: `AI_PROVIDER_NOT_CONFIGURED, AI_PROVIDER_AUTH_FAILED,
AI_PROVIDER_UNAVAILABLE, AI_PROVIDER_TIMEOUT, AI_RATE_LIMITED,
AI_DAILY_BUDGET_EXCEEDED, AI_RESPONSE_INVALID, AI_EVIDENCE_REQUIRED,
AI_PERMISSION_DENIED, AI_REQUEST_CANCELLED, AI_INTERNAL_ERROR`.
`AI_ERROR_MESSAGES_HE` ממפה כל קוד להסבר עברי מדויק (דפוס llmMessage של
הדונור, SNAP 2331–2340). `AIError` נושא `code, recoverable, correlationId,
userMessageHe` — **לעולם לא stack trace למשתמש**. בדיקת שלמות המפה רצה ב-CI.

## LocalRulesProvider — "מנוע מקומי מבוסס כללים"

`provider="local-rules"`, `model=null`, לעולם אינו מתחזה ל-LLM. דטרמיניסטי
לחלוטין (שעון + מחולל מזהים מוזרקים). נתונים דרך `LocalDataAccess` מוזרק
(ברירת מחדל: `repositoryDataAccess()` מעל ה-repositories הקנוניים); פרוסות
`boundedContext` שסופקו בבקשה גוברות על הגישה למאגר.

| פעולה                        | מה בפועל                                       | approval         |
| ---------------------------- | ---------------------------------------------- | ---------------- |
| `summarize.weekly-leads`     | לידים שנוצרו ב-7 הימים האחרונים, פילוח סטטוסים | לא               |
| `summarize.meetings`         | פגישות עתידיות ממוינות                         | לא               |
| `summarize.monthly-activity` | פיד פעילות 30 יום לפי סוג                      | לא               |
| `classify.lead-intent`       | כללי מילות מפתח על ליד אמיתי (כוונה+דחיפות)    | לא               |
| `recommend.printer-match`    | האצלה ל-`matchPrinters` (sales/matching.ts)    | לא               |
| `recommend.follow-up`        | טיוטת הודעת מעקב — **שליחה**                   | **כן — pending** |
| `recommend.course-fit`       | קורסים פתוחים שהלקוח טרם לקח                   | לא               |
| `explain.recommendation`     | הסבר מהמלצה + רשומות ה-Evidence המקושרות       | לא               |

כללי כנות של המנוע: כל מעטפת מצטטת ראיות עם ids אמיתיים; `confidence` תמיד
`unavailable` (ניקוד `matchPrinters` הוא כלל עסקי, **לא** הסתברות — ראו ההערה
ב-matching.ts, ולכן אינו מוצג כביטחון); `limitations` לעולם לא ריק; רשומה
חסרה ⇒ `AI_EVIDENCE_REQUIRED` מובנה, לא פלט מזויף.

## RemoteAIProvider — מעטפת הלקוח

- פונה **רק** לנתיבים יחסיים `/.netlify/functions/ai-*` (fetch מוזרק לבדיקות).
- כל תשובה עוברת ולידציית zod מול DTO v1; תשובה פגומה ⇒ `AI_RESPONSE_INVALID`
  (recoverable) — תוכן פגום לעולם אינו מוצג.
- `health()` קורא ל-`ai-health` ו**אינו מדווח "מחובר" אלא אם השרת אימת**;
  שרת לא נגיש / תשובה פגומה ⇒ "לא זמין".
- סטרימינג: `fetch` + `ReadableStream`, שורות NDJSON, כל שורה מאומתת בנפרד.
- `AbortSignal` נתמך בכל הקריאות; ביטול ⇒ `AI_REQUEST_CANCELLED`.
- כותרת `x-correlation-id` על כל בקשה; גוף שגיאת DTO מהשרת גובר על מיפוי
  לפי סטטוס HTTP.

## ProviderRegistry — מדיניות בחירה + חשיפת fallback

`remote-verified → local-fallback-when-permitted → structured-unavailable`:

| remoteEnabled  | בריאות remote       | localFallbackPermitted | תוצאה                                                   |
| -------------- | ------------------- | ---------------------- | ------------------------------------------------------- |
| true           | מחובר / חיבור מוגבל | —                      | remote, `fallback:null`                                 |
| true           | אחר / חריגה         | true                   | local + **חשיפה**: `{from:'remote', reason, messageHe}` |
| true           | אחר / חריגה         | false                  | `provider:null` + `unavailable{code,messageHe}`         |
| false (Mode A) | —                   | true                   | local כמנוע **ראשי** (`fallback:null` — שום דבר לא נפל) |
| false          | —                   | false                  | `unavailable: AI_PROVIDER_NOT_CONFIGURED`               |

הודעת החשיפה המחייבת: **"הספק המרוחק אינו זמין. המערכת עברה למנוע המקומי
מבוסס הכללים."** — ה-UI חייב להציגה; נפילה שקטה אסורה. degradation הוא
**נתון** (אובייקט), לא חריגה.

`RegistryConfig` מוזרק (`remoteEnabled`, `localFallbackPermitted`). קוד לקוח
**אינו קורא env**; הדגלים יגיעו מ-endpoint תצורה ציבורי (W5-B, 5.14).

## DTO v1 — החוזה מול W5-B (`src/ai/contracts/serverDto.ts`)

Endpoints (הקובץ הוא מקור האמת; כאן תקציר):

| Endpoint                                  | Method | תשובה                                                                                      |
| ----------------------------------------- | ------ | ------------------------------------------------------------------------------------------ |
| `ai-health`                               | GET    | `{dtoVersion:'v1', health:{state,checkedAt,detail}, model:string\|null}`                   |
| `ai-capabilities`                         | GET    | `{dtoVersion, capabilities:{operations,streaming,structuredOutput,maxInputChars?,detail}}` |
| `ai-summarize/classify/recommend/explain` | POST   | `{dtoVersion, envelope: AIResponseEnvelopeV2}`                                             |
| `ai-structured`                           | POST   | `{dtoVersion, envelope, value: unknown}`                                                   |
| `ai-stream`                               | POST   | NDJSON: `start / delta / done(envelope) / error` — שורה = אירוע                            |

בקשה (`aiRequestDtoV1Schema`): `{dtoVersion:'v1', operation, organizationId,
userId, sessionId, correlationId, relatedEntities, boundedContext(record→
מערכי רשומות; השרת מאמת מחדש מול סכימות הדומיין), params?, outputSchemaVersion}`.

שגיאה (הצורה היחידה המותרת): `{dtoVersion:'v1', error:{code∈11 הקודים,
messageHe, correlationId, recoverable}}` על סטטוס לא-2xx. חובות שרת: הד
`x-correlation-id` לכל מעטפת/שגיאה/אירוע + audit; לעולם לא stack trace ולא
גוף שגיאה גולמי של ספק; `envelope.model` = המודל בפועל. שינוי שובר ⇒
`dtoVersion` חדש, לא שינוי v1.

## מדריך הרחבה — הוספת ספק/מתאם

1. **מתאם צד-שרת (הדרך המועדפת):** מוסיפים adapter בתוך פונקציות ה-W5-B
   (למשל ספק LLM אחר). הלקוח לא משתנה כלל — `RemoteAIProvider` כבר מדבר
   DTO v1; רק `envelope.model`/`provider` שחוזרים ישתנו.
2. **ספק צד-לקוח חדש (נדיר — רק מנועים מקומיים):** מממשים `AIProvider`
   במלואו; חובה: envelope ולידית לכל פעולה, ראיות עם ids אמיתיים,
   `limitations` לא ריק, `approval.required=true` לכל פלט מוטציה/שליחה,
   `confidence` כן (unavailable כברירת מחדל), שגיאות רק כ-`AIError`.
   מוסיפים לבדיקות את מטריצת ה-contract (ראו tests/ai/contracts).
3. רושמים ב-`ProviderRegistry` — ואם הספק אינו "מקומי אמיתי", הוא חייב
   health מאומת-שרת לפני שירות.

## כללי הכנות (סיכום אכיף)

- ביטחון שלא נמדד ⇒ `unavailable` ⇒ "טרם נמדד"; אסור להמציא אחוז ואסור להציג 0.
- usage חסר ≠ 0; `measured` מפריד דיווח אמיתי מהיעדר דיווח.
- כל ראיה מצטטת רשומה אמיתית; אין ראיה ⇒ `AI_EVIDENCE_REQUIRED`, לא פלט ריק-ראיות.
- מנוע הכללים לעולם אינו מציג עצמו כ-LLM (`model:null`, תווית "מנוע מקומי
  מבוסס כללים"). תג "LLM" ב-UI רק כשמודל אמיתי ייצר את הטקסט (דפוס הדונור).
- fallback תמיד מוצהר; unavailable תמיד מובנה עם הסבר עברי; אין fake success.
