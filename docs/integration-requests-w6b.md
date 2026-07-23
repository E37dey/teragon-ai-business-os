# INTEGRATION REQUESTS — W6-B (Import/Export & Obsidian Compatibility)

תאריך: 23.07.2026 · מבקש: W6-B · יעד: Integration Lead

## 1. חיווט MemoryPage rail (lead בלבד — W6-B לא נגע ב-MemoryPage.tsx)

החלפת שני הכפתורים המנוטרלים + שורת הסטטוס "ייבוא וייצוא: בבנייה (גל 6)" בקטע הבא:

```tsx
// imports (ראש הקובץ):
import { ImportPanel } from "@/memory/import/ui/ImportPanel";
import { ExportPanel } from "@/memory/export/ui/ExportPanel";
import { obsidianStatus } from "@/memory/export/status";

// בתוך <PageRail> — במקום בלוק "מצב סנכרון" הקיים ושני הכפתורים המנוטרלים:
const [obsLine1, obsLine2] = obsidianStatus();
// ...
<div style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-text-2)", display: "grid", gap: 3 }}>
  <div>מאגר מקומי (IndexedDB) — פעיל</div>
  <div>{obsLine1}</div>   {/* "ייבוא וייצוא Obsidian פעיל" */}
  <div>{obsLine2}</div>   {/* "גישה מקומית ישירה אינה פעילה" */}
  <div>ענן: לא זמין במצב הדגמה המקומי</div>
</div>
<ImportPanel onImported={refresh} />
<ExportPanel onExported={refresh} />
```

הערות:
- `refresh` הוא ה-invalidator הקיים בעמוד (`MEMORY_COLLECTIONS` — מומלץ להוסיף אליו `"memoryImportJobs"`, `"memoryExportJobs"`).
- שני הפאנלים עצמאיים (design-system בלבד, RTL, שגיאות בעברית) ואינם דורשים props נוספים.
- זהות המבקש בפאנלים היא הזהות הקנונית (צחי זוסטייהם / `u-tzachi`); אם ל-lead יש הקשר משתמש — אפשר להרחיב props בעתיד.

## 2. חיווט backlinks (אין hook קיים ב-W6-A)

W6-A לא חשף hook ב-workflow, לכן W6-B מספק פונקציה מפורשת:

```ts
import { recomputeBacklinks } from "@/memory/markdown/wikilinks";
await recomputeBacklinks(getMemoryEngine().stores);
```

מומלץ ל-lead (או W6-E) לקרוא לה אחרי כל אחד מ-5 הטריגרים: ייבוא (אחרי אישור הצעות) · אישור הצעה · שינוי כותרת · ארכוב · supersede. הפונקציה דטרמיניסטית ואידמפוטנטית (מחזירה `{linksUpdated, recordsUpdated}`); בטוח לקרוא לה גם תקופתית. ההתנהגות על כל 5 הטריגרים מכוסה ב-`tests/memory-import/wikilinks.test.ts`.

## 3. תלויות npm

**לא נוספה אף תלות.** ZIP מומש עצמאית מעל `Uint8Array` (`src/memory/zip/`): קריאה store+deflate (deflate דרך `DecompressionStream("deflate-raw")` — קיים ב-Node 20+/דפדפנים מודרניים, אומת בסביבת הבדיקות), כתיבה store בלבד. **אין בקשת תלות** — אם בעתיד יידרש ייצוא דחוס, זו נקודת ההרחבה.

## 4. ה-seam של W6-A — מה מומש

- `MarkdownVaultAdapter` ⇒ `ObsidianVaultAdapter` (`src/memory/import/vaultAdapter.ts`). לא חוּבר ל-`getMemoryEngine()` (ה-engine הוא קובץ של W6-A) — אם ה-lead רוצה לחשוף אותו על ה-bundle:
  ```ts
  // src/memory/core/engine.ts (שינוי של W6-A/lead):
  import { ObsidianVaultAdapter } from "@/memory/import/vaultAdapter";
  // בתוך getMemoryEngine():
  vaultAdapter: new ObsidianVaultAdapter({ stores, agentStores: agents, workflow,
    requestedById: CEO_USER_ID, requestedByName: CEO_NAME_HE }),
  ```
- `src/modules/memory/markdown.ts` — הפנימיות הוחלפו במנוע הבטוח המלא; **חוזה `MarkdownBlock`/`InlineSegment` נשמר אחד-לאחד** (down-mapping), `NoteView` ובדיקות W6-A עוברות ללא שינוי.

## 5. סטיות מתועדות מהבריף

1. **שדה 14**: הבריף מנה 13 שמות תחת "14 שדות" — `folder` הושלם כשדה ה-14 (מטא-דאטה, ללא יכולת).
2. **`MemorySource{type:'imported-markdown'}`**: ה-union של W6-A (`kind`) סגור (entity/document/conversation/observation/external) ואינו בבעלות W6-B — מומש כ-`kind:"external"` + `refId:"imported-markdown:<path>"`; התוכן המקורי המאובטח נשמר ב-`excerpt`.
3. **aliases אחרי אישור**: ל-`MemoryRecordV2` אין שדה aliases; רזולוציית כינויים פועלת בתוך אצוות ייבוא בלבד. הרחבת domain — החלטת lead.
4. **ייצוא ZIP הוא store בלבד** (מותר לפי הבריף; מתועד ב-OBSIDIAN_COMPATIBILITY).
