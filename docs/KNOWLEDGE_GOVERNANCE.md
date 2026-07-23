# KNOWLEDGE GOVERNANCE — TERAGON AI BUSINESS OS (Wave 6, W6-C)

23.07.2026 · בעלות: W6-C (Phases 6.9–6.11 + צד הראיות של 6.12) · צריכה: W6-E (ראיות), Integration Lead (router/Copilot/MemoryPort)

מסמך זה מגדיר את משטר הידע הקנוני: מודל המאמר המנוהל, מחזור האישור דרך מנוע
האישורים הקנוני, סוכן ה-Wiki המנוהל, שער כשירות הראיות וזרימת הסתירות.

## עקרונות (לא ניתנים לעקיפה)

1. **פרדיקט מוסמכות אחד.** `isAuthoritative(article, now)`
   (`src/domain/knowledge/types.ts`) הוא המקור היחיד ל"מותר לסמוך/לאחזר/לצטט":
   מצב `מאושר` AND לא בארכיון AND `effectiveDate` הגיע AND `reviewDate` לא עבר.
   טיוטה / ממתין / נדחה / שנוי במחלוקת / בארכיון / פג-תוקף — **לעולם לא** מוסמכים.
   העמוד, סוכן ה-Wiki ושער הראיות משתמשים כולם באותו פרדיקט.
2. **אין אישור עוקף מנוע.** כל כניסה למצב `מאושר` עוברת דרך
   `ApprovalEngine` הקנוני (`src/agents/approvalEngine.ts`) בפעולה
   `permanent-knowledge-update` ("עדכון קבוע במאגר הידע"). ל-
   `KnowledgeGovernanceService` אין נתיב אחר: approve/reject/request-changes
   קוראים ל-`engine.decide()`, שדורש רשומת Approval במצב ממתין — עקיפה זורקת
   בתוך המנוע (נבדק).
3. **גרסאות בלתי ניתנות לשינוי.** `appendVersionSnapshot` הוא הדרך היחידה
   לכתוב רשומת גרסה; ניסיון לכתוב שוב את אותה גרסה זורק
   `KNOWLEDGE_VERSION_IMMUTABLE`. השוואת גרסאות = `compareVersions` (דיפ
   דטרמיניסטי ברמת שדה).
4. **אין המצאת מקור.** כל ציטוט של סוכן ה-Wiki חייב להתפענח לרשומה אמיתית
   (id+version); אין מקור מאושר ⇒ בדיוק
   **"לא נמצא מקור מאושר שמספיק למענה"** — ללא השלמה מידע כללי (נבדק).
5. **אחזור דטרמיניסטי ומוצהר.** חיפוש = ניקוד אסימונים טהור
   (`src/knowledge/search.ts`), מוצהר תמיד כ"חיפוש טקסטואלי דטרמיניסטי" —
   לעולם לא מוצג כסמנטי/מודל.
6. **סתירות סוגרות תוקף (fail-closed).** קונפליקט מזוהה ⇒ רשומת
   `KnowledgeConflict` + שני המאמרים עוברים ל"שנוי במחלוקת" ומפסיקים מיידית
   להיות מוסמכים. הדרך היחידה חזרה ל"מאושר" — מחזור בדיקה מלא דרך המנוע.

## מודל הנתונים (`src/domain/knowledge/types.ts`, IDB v4)

| אוסף | רשומה | מהות |
|---|---|---|
| knowledgeArticles | `KnowledgeArticleV2` | המאמר המנוהל: כותרת/קטגוריה/תקציר/תוכן/דגמים/חומרים/קטגוריות-תקלה/הערות-בטיחות/מקורות/מחבר/בודק/approval/גרסה/תאריך-תחולה/תאריך-בדיקה/ארכיון |
| knowledgeSources | `KnowledgeSource` | מקור אמיתי (קריאת שירות/מסמך/ניסיון/יצרן) עם ref, בעלים ו-capturedAt |
| knowledgeVersions | `KnowledgeVersion` | snapshot חתום לכל גרסה — append-only |
| knowledgeUsage | `KnowledgeUsage` | שימוש אמיתי של מאמר כראיה בהמלצה (מאמר+גרסה+סוכן+המלצה) + סמני supersede |
| knowledgeConflicts | `KnowledgeConflict` | סתירה: מאמרים, טענות, מפתח חפיפה, סטטוס פתוח/נפתר |
| knowledgeQuestions | `KnowledgeQuestion` | שאלות פתוחות/נענו — תור השאלות |
| knowledgeReviews | `KnowledgeReview` | רשומת בדיקה המקושרת ל-Approval הקנוני |

- **9 קטגוריות:** מדפסות · חומרי גלם · Slicer · תחזוקה · פתרון תקלות · קורסים · מכירות · שירות · נהלים.
- **7 מצבים:** טיוטה · ממתין לבדיקה · מאושר · דורש עדכון · שנוי במחלוקת · נדחה · בארכיון.
- סכימות zod צמודות לטיפוסים (`satisfies z.ZodType<T>`) — הודעות שגיאה בעברית.

## מחזור החיים

```
טיוטה ──הגשה──▶ ממתין לבדיקה ──engine.decide──▶ מאושר (גרסה נחתמת, effectiveDate,
  ▲                    │                          reviewDate, supersede לשימושים ישנים)
  │                    ├─ דחייה(+נימוק) ─▶ נדחה
  └─ עריכה ◀─ דורש עדכון ◀─ בקשת שינויים(+נימוק)
מאושר ──סתירה מזוהה──▶ שנוי במחלוקת ──הגשה חוזרת──▶ ממתין לבדיקה
מאושר ──סימון דורש עדכון(+נימוק, מסיר תוקף)──▶ דורש עדכון
כל מצב ──ארכוב──▶ בארכיון (archived=true)
```

- עריכה מותרת רק בטיוטה/דורש עדכון/נדחה; עריכת מאמר שאושר בעבר מקפיצה גרסה
  (ל-snapshot הישן אין שכתוב).
- דחייה/בקשת שינויים **מחייבות נימוק** (גם בשירות וגם במנוע).
- אישור הידע הוא recommendation-only ב-engine (ללא executionPayload) — שינוי
  המצב מוחל על ידי השירות אחרי שההחלטה האנושית נרשמה; `engine.execute()` על
  אישור ידע נחסם (אין מה לבצע מכונית).

## סוכן ה-Wiki המנוהל (`src/agents/wiki/wikiAgent.ts`)

ההגדרה הקפואה (`ag-wiki`, `src/agents/definitions.ts`) לא שונתה: חיפוש בידע
מאושר, סימון סתירות, הצעת עדכונים — **לעולם לא** אישור/שינוי קבוע/מחיקה.

- `searchApproved(q)` — אחזור מעל מאמרים מוסמכים בלבד.
- `answerQuestion(q, boundedContext?)` → `WikiAnswer`: answer, sources
  (id+version אמיתיים), relevantExcerpts, sourceStates, limitations,
  unresolvedConflicts, retrievalMethod ("חיפוש טקסטואלי דטרמיניסטי"),
  nextAction, approvalRequirement, memoryHits.
- הצעות שינוי = אובייקטי `WikiProposal` בלבד עם
  `approvalRequirement: permanent-knowledge-update / permanent-memory-update`
  ו-`requiresApproval: true` — הסוכן לא כותב דבר.
- `MemorySearchPort` — seam מוזרק לחיפוש בזיכרון מאושר (W6-A); ברירת מחדל
  no-op כן (ריק) עד האינטגרציה. אין צריכה ישירה מ-src/memory.
- זיהוי סתירות: `extractClaims` שולף טענות פרמטריות מספריות
  (טמפ' מיטה/הדפסה/חוד, מהירות, Brim); `detectContradictions` מצליב ערכים
  שונים לאותו פרמטר בהיקף חופף (קטגוריה/חומר משותף); `flagContradictions`
  כותב רשומות קונפליקט + מעביר ל"שנוי במחלוקת" (אידמפוטנטי).
- `wikiOps` (`src/agents/wiki/index.ts`) = `{searchApproved,
  showContradictions, answerQuestion}` — הפני-הפעולה שה-Integration Lead מחבר
  לפקודות ה-Copilot.

## שער כשירות הראיות (`src/knowledge/evidenceEligibility.ts`, ל-W6-E)

- `mayUseAsEvidence(article, now)` — שער טהור: כשיר ⇔ מוסמך (אותו פרדיקט).
- `recordKnowledgeUsage(stores, {articleId, byAgent, inRecommendation}, clock)`
  — רושם שימוש עם הגרסה הנוכחית; **מסרב** (זורק) למאמר לא-כשיר.
- `markUsageSuperseded(stores, articleId, newVersion, clock)` — עם אישור גרסה
  חדשה: רשומות שימוש ישנות מקבלות `supersededByVersion`/`supersededAt` בלבד;
  שדות הרישום המקוריים לעולם אינם משוכתבים.

## גשר ה-seed (`src/knowledge/seedBridge.ts`)

`ensureKnowledgeSeed` אידמפוטנטי (ids יציבים; ריצה שנייה יוצרת 0):
5 רשומות ה-knowledgeNotes של דור 1 → `ka-kn-1..5` (מאושרות ⇒ "מאושר"+snapshot
v1+מקורות; kn-4 הלא-מאושרת ⇒ טיוטה), זוג הדגמה שנוי-במחלוקת
(`ka-demo-1/2` + `kc-demo-1`), מאמר שפג תוקפו (`ka-demo-3`), שאלה פתוחה
(`kq-demo-1`) ורשומת שימוש אמיתית (`ku-demo-1` ← rec-2). הכול מסומן
"נתוני הדגמה" (`demo:true`).

## עמוד /knowledge (`src/modules/knowledge/KnowledgePage.tsx`)

ניווט קטגוריות, חיפוש דטרמיניסטי, סינון מצב/קטגוריה/מועד-בדיקה, צפייה בתוכן
**escaped בלבד** (sanitizer מלא — seam של W6-B), יצירת/עריכת טיוטה (zod),
הגשה/אישור/דחייה/בקשת-שינויים דרך המנוע, ארכוב, השוואת גרסאות, קישורים
לדגמים/קריאות שירות/קורסים (התאמה דטרמיניסטית מוצהרת), תור שאלות (מענה מסוכן
הידע), פאנל סתירות (סריקה+הכרעה עם נימוק), ו-rail "איכות הידע": מקורות ישנים,
ללא בעלים, בדיקות קרובות, פגי-תוקף, סותרים, שאלות פתוחות, שימושי AI אמיתיים,
עדכונים מוצעים, כיסוי ראיות ("טרם נמדד" כשאין מה למדוד).

## מדריך הרחבה

1. **קטגוריה/מצב חדשים:** להרחיב את ה-union ב-`types.ts` — הסכימה, המסננים
   ומטריצת הבדיקות ייכשלו עד יישור מלא (בכוונה).
2. **פרמטר סתירה חדש:** להוסיף ל-`CLAIM_PARAM_KEYS_HE` + בדיקת חילוץ.
3. **צרכן ראיות חדש (W6-E):** לייבא `mayUseAsEvidence`+`recordKnowledgeUsage`
   בלבד — אין לקרוא ל-repositories של הידע ישירות לצורך ציטוט.
4. **חיבור זיכרון (W6-A):** לממש `MemorySearchPort` מעל חיפוש הזיכרון המאושר
   ולהזריק ב-Integration — אין לייבא מ-src/memory בתוך W6-C.
