# SYSTEM HEALTH — ארכיטקטורת מנוע הבריאות (W8-D, Phase 8.9–8.10)

## עקרון העל: אמת נמדדת בלבד

מצב רכיב **לעולם אינו מוסק מרינדור**. כל מצב מגיע משיטת בדיקה אמיתית שרצה:
- לא רץ ⇒ `טרם נבדק`
- לא מוגדר/כבוי בצד השרת ⇒ `לא הוגדר`
- ה-API למדידה לא קיים בסביבה ⇒ `לא ניתן למדידה`
- `responseTimeMs` נכתב רק כשנמדד בפועל (perf clock מוזרק)
- כשל נרשם כשורת עברית בטוחה — לעולם לא stack trace

## שכבות

```
src/domain/system-health/     טיפוסים + zod (snapshot, component, incident…)
src/system-health/checks.ts   מנוע 15 הבדיקות + HealthCheckEnv (seam מוזרק)
src/system-health/snapshot.ts בניית snapshot + התמדה ל-healthSnapshots
src/system-health/diagnostics דוח אבחון מושמט-סודות (JSON)
src/system-health/incidents   פתיחת אירוע ל-governanceIncidents
src/system-health/buildInfo   מטא-נתוני build כנים
src/modules/system-health/    SystemHealthPage (/system-health)
```

## HealthCheckEnv — ה-seam המוזרק

כל IO עובר דרך env מוזרק: `collection()` (factory קנוני), `probeIdb`, `storageEstimate`, `localProvider`, `remoteProvider`, `fetchImpl`, `agentStores`, `migrations`, `now`, `perf`, `functionsTimeoutMs`. הבדיקות עצמן נבדקות עם seams מדומים — הלוגיקה אמיתית, ה-IO נשלט.

## 15 הבדיקות (מזהה · שיטה · מצבים אפשריים)

| רכיב | שיטת הבדיקה האמיתית | הערות כנות |
|---|---|---|
| indexeddb | פתיחת המסד + גרסה + מספר stores + דגימת ספירות (4 אוספים) | ללא IDB ⇒ "לא זמין" + מגבלת התמדה |
| repositories | סבב CRUD מלא על רשומת scratch באוסף meta (נמחקת) | כל צעד מאומת; כשל ⇒ "דורש תשומת לב" |
| migrations | `meta/schema` מול `ALL_MIGRATIONS` | ממתינות ⇒ שמות המיגרציות בממצא |
| local-ai-provider | הרצת `summarize.weekly-leads` אמיתית + אימות מעטפת (provider=local-rules, model=null, מגבלות) | אף פעם לא מתחזה ל-LLM |
| remote-ai-provider | `health()` — אמת שרת בלבד | "תקין" **רק** אחרי «מחובר» מהשרת; מושבת ⇒ "לא הוגדר" |
| netlify-functions | GET אמיתי ל-ai-health עם AbortSignal.timeout | מקומית ללא netlify dev ⇒ "לא זמין" + המגבלה במפורש |
| approval-engine | בניית ApprovalEngine + ספירת "ממתין" | בנייה אמיתית, לא בדיקת import |
| audit-repository | ספירה + כתיבה אחרונה (auditEvents) | |
| memory-repository | ספירה + כתיבה אחרונה (memoryRecords) | |
| knowledge-repository | ספירה + כתיבה אחרונה (knowledgeArticles+knowledgeNotes) | |
| agent-queues | `agentQueueSizes` על agentTasks | "ממתין לאישור" ⇒ "מוגבל" (תור חסום) |
| automation-runs | סיווג ריצות automationRuns | כישלון ⇒ "דורש תשומת לב" |
| search-index | `rankedSearch` עשן + דטרמיניזם + שאילתה ריקה ⇒ ריק | הפרת חוזה ⇒ "דורש תשומת לב" |
| export-engine | dry-run בזיכרון: redactSecrets עצמי + selectExportRecords + markdown לרשומה V2 ראשונה | ללא כתיבה/הורדה |
| storage-estimate | `navigator.storage.estimate()` | חסר ⇒ "לא ניתן למדידה" |

## Snapshot

`takeAndPersistSnapshot(env)` ⇒ ריצת כל הבדיקות + פאנלי storage/migration/build + ספירות כנות (ok/attention/unavailable/unchecked — **אין ציון מצרפי מומצא**), ולידציית zod, התמדה ל-`healthSnapshots`.

## דוח אבחון מושמט (diagnostics)

שני מעברים: השמטה סטרוקטורלית פר-שדה-מחרוזת (חסינת escaping של JSON) + מעבר טקסט סופי על הסריאליזציה. דפוסים: exporter של הזיכרון (W6-B) + דפוסי הסורק (sk-/AKIA/JWT/api_key=/Bearer) + שורות stack trace. אין ערכי env בדוח מעצם הבנייה (הדפדפן לא מחזיק אותם); ה-exclusions מוצהרים בתוך הדוח.

## אירועים (incidents)

`openHealthIncident` נפתח **רק** ממצב "דורש תשומת לב"/"לא זמין" (לעולם לא מירוק), עם שומר-כפילויות פר-רכיב, רשומה zod-תקפה לאוסף `governanceIncidents` (`source: "system-health"`). הטיפול — בעמוד הממשל (בקשת חיווט בתור).
