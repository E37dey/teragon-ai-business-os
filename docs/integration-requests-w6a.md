# INTEGRATION REQUESTS — W6-A (Memory Domain & Persistence)

תאריך: 23.07.2026 · מבקש: W6-A · יעד: Integration Lead

## 1. חיווט ראוטר (חובה לסגירת ה-placeholder)

| ראוט | מימוש מבוקש |
|---|---|
| `/memory` | lazy entry: `const MemoryPage = lazy(() => import("@/modules/memory/MemoryPage"));` — default export קיים. הראוט כבר מוגדר ב-`src/app/routes.ts` (`title: "זיכרון ארגוני · Obsidian"`, wave 6, inNav). |

אין צורך ב-Rail נפרד — העמוד מפרסם rail דרך `<PageRail>` (מנגנון PAGE_CONTRACT הקיים).

## 2. ללא שינויים בקבצים משותפים

- לא נדרש שינוי ב-`src/domain/types.ts` / `schemas.ts` — כל הטיפוסים החדשים ב-`src/domain/memory/`.
- לא נדרש שינוי ב-collections/factory — כל אוספי ה-Wave-6 כבר קיימים (IDB v4). רשומות V2 חיות ב-`memoryRecords` לצד דור 1 (גישור בקריאה, ללא מיגרציה).
- לא נוספו תלויות npm.

## 3. תפרים ל-W6-B (import/export/markdown/zip)

- `MarkdownVaultAdapter` (interface בלבד) ב-`src/memory/adapters/MemoryRepository.ts` — המימוש של W6-B.
- רשומות job: `MemoryImportJob` / `MemoryExportJob` (`src/domain/memory`) + סכימות zod מוכנות.
- ה-UI: שני כפתורי ייבוא/ייצוא ב-rail של `/memory` מנוטרלים עם הסיבה "ייבוא/ייצוא יחוברו עם רכיב ה-Import של הגל (W6-B)" — W6-B מחליף אותם בפעולות אמת ומעדכן את שורת הסטטוס ל"ייבוא וייצוא Obsidian פעיל" רק כשזה נכון.
- rendering מלא של Markdown (sanitizer): התפר הוא `src/modules/memory/markdown.ts` — חוזה `MarkdownBlock` יציב; החלפה פנימית לא שוברת את `NoteView`.

## 4. הערות ל-W6-E (בדיקות/סגירה)

- `tests/memory/` — 7 קבצים, 58 בדיקות (סכימות, גשר דור 1, זרימת הצעה + נסיון-עקיפה, דטרמיניזם כפילות/סתירות, אי-שינוי גרסאות + השוואה + שחזור, חוזה אדפטרים, סלקטורים של העמוד).
- reset לטסטים: `__resetMemoryEngineForTests()` (`src/memory/core/engine.ts`) בנוסף ל-`__resetRepositoriesForTests()`.

## 5. design-system

אין בקשות — העמוד משתמש בפרימיטיבים קיימים בלבד (Panel/KpiCard/OsButton/StatusChip/SectionTitle/SearchInput/ConfidenceBar/EmptyState/Toast). הגרף הוא SVG מקומי ללא ספרייה.
