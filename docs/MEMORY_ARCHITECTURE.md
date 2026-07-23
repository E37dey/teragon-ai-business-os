# MEMORY ARCHITECTURE — זיכרון ארגוני V2 (Wave 6, W6-A)

תאריך: 23.07.2026 · בעלות: W6-A (Memory Domain & Persistence)

## עקרונות

1. **אין נתיב עוקף**: הכותב היחיד של זיכרון מאושר הוא ה-handler שמוזרק ל-`ApprovalEngine` הקנוני (Wave 5). `execute()` בלי אישור אנושי שהוכרע ⇒ `AGENT_EXECUTION_WITHOUT_APPROVAL` (נבדק).
2. **ביטחון לעולם אינו מספר עירום**: `confidence` הוא תמיד `ConfidenceInfo` (status/method/signals). מספר עירום נכשל ב-zod (נבדק). לא נמדד ⇒ `unavailable` ⇒ "טרם נמדד".
3. **גרסאות בלתי ניתנות לשינוי**: `memoryVersions` הוא store append-only — update/remove/clear זורקים; כל אובייקט שיוצא ממנו מוקפא (deep-freeze). שחזור = גרסה חדשה דרך הצעה מאושרת, לעולם לא מוטציה.
4. **גשר דור 1 כן**: רשומות ה-seed הישנות (`MemoryRecord`) נשארות קריאות דרך `fromLegacyMemoryRecord` — `origin:"legacy-import"`, `approvedBy:null`, `verificationState:"לא נבדק"`. הגשר לא ממציא אישור.

## שכבות (Layers)

`customer` (זיכרון לקוחות) · `business` (זיכרון עסקי) · `technical` (זיכרון מקצועי) · `agent_learning` (זיכרון סוכנים).
אימות: לא נבדק / בבדיקה / מאומת / שנוי במחלוקת / נדחה / פג תוקף. רגישות: ציבורי / פנימי / רגיש / מוגבל (מסודרת; "סמן כרגיש" רק מעלה).

## מבנה קבצים

```
src/domain/memory/           types.ts · schemas.ts (zod, satisfies) · index.ts
src/memory/core/             proposalWorkflow.ts · versioning.ts · text.ts · engine.ts (singleton)
src/memory/repositories/     memoryStores.ts (typed accessors + immutableStore)
src/memory/adapters/         MemoryRepository.ts (interface + IndexedDB + Cloud stub + MarkdownVaultAdapter seam) · legacyBridge.ts
src/modules/memory/          MemoryPage.tsx · selectors.ts · markdown.ts · components/
tests/memory/                7 קבצים · 58 בדיקות
```

## אחסון

- רשומות V2 ורשומות דור 1 חיות יחד ב-collection `memoryRecords`; ההבחנה לפי צורה (`memoryLayer` קיים ⇒ V2). הקריאה תמיד מגושרת; ה-store לא משוכתב בעלייה.
- אוספי הממשל (Wave-6, IDB v4): `memoryProposals · memorySources · memoryLinks · memoryVersions · memoryUsage · memoryConflicts · memoryImportJobs · memoryExportJobs`.

## זרימת הצעה (Phase 6.2)

```
תצפית → MemoryProposal
  → אימות מקורות (חובה ≥1 מקור קיים; חסר ⇒ ההצעה נשארת טיוטה, לא נפתח אישור)
  → בדיקת כפילות (slug זהה או דמיון כותרת Jaccard ≥ 0.6 — דטרמיניסטי ⇒ אזהרה + מועמדים למיזוג)
  → בדיקת סתירות (חילוץ claims דטרמיניסטי "מפתח: ערך" מול רשומות מאושרות באותה שכבה ⇒ MemoryConflict פתוח)
  → בדיקת רגישות (סריקת מילות מפתח ⇒ אזהרה אם התוכן מרמז על רגישות גבוהה מהמוצהרת)
  → requestApproval(action="permanent-memory-update") — מנוע האישורים הקנוני
  → החלטת אדם בשם (צחי זוסטייהם בהדגמות)
  → executeApproved (ה-handler היחיד): MemoryRecordV2 → MemoryVersion → MemoryLink resolution → AuditEvent
```

### 7 בקרות (כולן מתועדות ב-audit)

| בקרה | מימוש |
|---|---|
| אשר לזיכרון | `approve` → decide(approve) → execute → רשומה+גרסה |
| ערוך ואשר | `editAndApprove` → decide(edit, editedPayload) → הטיוטה הערוכה נכתבת |
| בקש מקור נוסף | `requestMoreSources` → ההצעה נשארת ממתינה + audit |
| מזג עם פריט קיים | `mergeWithExisting` → גרסה חדשה על היעד (לא רשומה חדשה); ליעד דור-1 נוצרת קודם גרסה 1 של המצב הקיים |
| דחה | `reject` (נימוק חובה — נאכף גם במנוע) |
| סמן כרגיש | `markSensitive` (מעלה בלבד) |
| בטל הצעה | `cancelProposal` → engine.cancel |

## גרסאות (Phase 6.3)

- כל עריכה מאושרת = `MemoryVersion` חדשה: snapshot מוקפא, `changedFields` (diff דטרמיניסטי על `VERSIONED_FIELDS`), author/approver/reason/timestamp/rollbackEligible.
- `compareVersions(vA,vB)` — diff ברמת שדה. `submitRestoreProposal` — שחזור כהצעה חדשה שמסתיימת בגרסה חדשה.
- `MemoryUsage` — איזו מעטפת AI השתמשה באיזו גרסה: `recordUsage` + `usageJoinForRecord` + `envelopesForVersion`.

## אדפטרים

- `IndexedDBMemoryAdapter` — Mode A מעל `getRepository`, מגשר דור 1 בקריאה.
- `CloudMemoryAdapter` — stub כן: כל פעולה נכשלת עם "לא זמין במצב הדגמה המקומי", `available:false`.
- `MarkdownVaultAdapter` — **ממשק בלבד** (התפר של W6-B): `importVault(files) → MemoryImportJob`, `exportVault() → MemoryExportJob`. W6-A לא מספק מנוע markdown/zip.

## /memory (Phase 6.8)

- מדדים — כולם נגזרים (מאושרים / הצעות ממתינות / קישורים / לא פתורים / סתירות / סקירות שהגיע זמנן / ייבואים היום / שימושי AI היום); אפס נתונים ⇒ 0 כן.
- סביבת עבודה: דפדפן שכבות+תיקיות (ימין) · רשימת פתקים + גרף קישורים SVG פשוט בר-בחירה (מרכז) · תצוגת פתק + ממשל/גרסאות/שימושי-AI/ביקורת (שמאל).
- Markdown מינימלי-בטוח: parser טהור (`markdown.ts`) שמרנדר טקסט בלבד דרך React (אין innerHTML) — **תפר ל-sanitizer המלא של W6-B**.
- Rail: ייבוא/ייצוא מנוטרלים בכנות ("ייבוא/ייצוא יחוברו עם רכיב ה-Import של הגל"); סטטוס סנכרון אמת: "ייבוא וייצוא: בבנייה (גל 6)" + "גישה מקומית ישירה אינה פעילה". שתי השורות "ייבוא וייצוא Obsidian פעיל" יופיעו רק כשיהיו נכונות (אחרי W6-B).
- אין אנימציית סנכרון מדומה.

## API עיקרי לצרכנים (W6-B / W6-E)

```ts
import { getMemoryEngine } from "@/memory/core/engine";
const { stores, workflow, adapter } = getMemoryEngine();
await workflow.listBridgedRecords();            // כל הזיכרון, מגושר
await workflow.submitProposal({...});           // תצפית → תור אישורים
await workflow.approve(id, {deciderId, deciderName});
recordUsage(stores, clock, {...});              // תיעוד שימוש AI בגרסה
// W6-B מממש: interface MarkdownVaultAdapter (src/memory/adapters/MemoryRepository.ts)
```
