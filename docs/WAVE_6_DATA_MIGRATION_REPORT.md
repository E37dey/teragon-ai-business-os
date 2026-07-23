# WAVE 6 — DATA MIGRATION REPORT (W6-E, Phase 6.16)

23.07.2026 · מאת: W6-E (Cross-Domain Normalization & Integration) · מול snapshot הבסיס:
`docs/backups/wave6-baseline-seed-snapshot.json` (**283 רשומות / 49 collections**, IDB v3).

## מנגנון

- `src/migrations/framework.ts` — רישום מיגרציות ממוספרות (`id`, `description`,
  `collections`, `idempotencyKey`, `prepare?`, `up`), רץ בעליית האפליקציה **אחרי**
  `seedIfEmpty()` (חיווט main.tsx אצל מוביל האינטגרציה — integration-requests-w6e).
- `schemaVersion` + `appliedMigrations` נשמרים ברשומת `meta/schema` (collection `meta`,
  כבר קיים ב-IDB v4 של המוביל). ריצה חוזרת = no-op; ריצה כפויה (meta מאופס) יציבה כי כל
  `up()` אידמפוטנטי — נבדק.
- **AuditEvent אחד לכל מיגרציה שהוחלה** (`aud-migration-mNNN`, actor `system`,
  correlationId = idempotencyKey) — לא לכל רשומה.
- רשומה פגומה ⇒ דילוג + איסוף + audit, לעולם לא קריסת אפליקציה. כשל `prepare` ⇒
  המיגרציה מסומנת failed + audit `migration-failed:mNNN`, הרצה הבאה מנסה שוב, שאר
  המיגרציות ממשיכות (עצמאיות זו מזו by design).

## מה הוחל (ספירות מריצת בדיקות ה-snapshot, fake-indexeddb)

| # | מה | רשומות שהשתנו (snapshot) | מקור legacy |
|---|-----|---------------------------|--------------|
| m001 | Task ⟦…⟧ → `workState`/`ownership` (+`legacyMarker`) | 8 tasks (למרקרים אמיתיים: וריאנט ריצה מוזרק בבדיקות) | מרקרים ב-description — נשמרים ב-`legacyMarker` |
| m002 | SupportRequest ⟦…⟧ → `tier`/`assigneeId`/`category`/`feedback` (+`legacyMarker`) | 3 supportRequests | כנ"ל |
| m003 | localStorage `teragon-w3.sales.journeyStages` → `Opportunity.journeyStepId` | 5 opportunities | המפתח **לא נמחק** בגל זה |
| m004 | localStorage `teragon-w3.quotations.versions` → `Quotation.version` | 8 quotations | כנ"ל |
| m005 | Approval extended-state נגזר מ-agentEvents → `extendedState` | 3 approvals | agentEvents נשארים מקור אמת משני |
| m006 | Nexa purpose ⇒ המפרט הקפוא ("סוכן שיווק וצמיחה") — seed + רשומה חיה | 1 agent (`ag-nexa`) | הערך הישן נרשם ב-audit («עוזר אישי למנכ"ל…») |
| m007 | ברירות מחדל בטוחות: `ServiceTicket.closedAt` (updatedAt לסגורות / null), `Document.customerId=null`, `CourseSession.attendance=[]`, `CustomerPrinter.warrantyUntil/lastMaintenanceAt/maintenanceIntervalDays=null` | 10+8+4+8 = 30 רשומות | אין ערכים מומצאים — unknown ⇒ null |

**סה"כ אימות אפס-אובדן:** כל 283 רשומות ה-snapshot נשמרות אחרי כל 7 המיגרציות (ספירה
פר-collection + נוכחות כל id); `auditEvents` גדל בדיוק ב-7 (רשומת audit אחת למיגרציה).
`schemaVersion` = 7.

## טיפול ברשומות פגומות (נבדק)

- Task ללא `description` / SupportRequest עם `description` לא-מחרוזתי ⇒ מדולגות,
  נאספות ב-`skipped`, מופיעות ב-details של ה-audit, **נשארות במסד ללא שינוי**.
- `up()` שזורק ⇒ נספר כדילוג, לא קריסה.
- ערכי legacy לא-תקינים: journey step לא מוכר ⇒ `journeyStepId=null` כן; מונה גרסה
  0/לא-שלם ⇒ נפילה ל-1; מרקר שבור (`⟦` ללא סוגר) ⇒ הטקסט נסבל כמות שהוא.
- ללא localStorage (SSR/בדיקות) ⇒ ברירות מחדל כנות (null / 1).

## המודולים עודכנו (קריאה/כתיבה קנונית, fallback לישן)

- **tasks**: `taskWorkState`/`taskOwnership`/`isSharedTask`/`cleanDescription` — שדה
  קנוני → מרקר legacy → נגזרת סטטוס. TasksPage כותב `workState`/`ownership` ותיאור נקי;
  **רשומות חדשות לעולם לא כותבות מרקרים**.
- **support**: `effectiveSupport`/`effectiveCategory` באותו סדר עדיפויות; SupportPage
  כותב שדות + מנרמל את התיאור בכל נגיעה; פנייה חדשה נולדת עם `tier:1`/`category`.
- **sales**: `journeyStepOf` — שדה → מפת localStorage → נגזרת; קידום שלב כותב
  `journeyStepId` על הרשומה (localStorage נשאר mirror לנוחות rollback).
- **documents**: `Quotation.version` נכתב בשמירה; localStorage הפך לקריאה-בלבד
  (fallback לרשומות שטרם הוגרו).

## שחזור / rollback

- מרקרים מקוריים שמורים ב-`legacyMarker`; מפתחות localStorage לא נמחקו — קריאת הקוד
  הישן (fallback) משחזרת התנהגות מלאה גם בלי המיגרציות.
- ריצה כפויה מחדש (איפוס meta) הוכחה כיציבה (0 שינויים בריצה שנייה).
- ענף בטיחות `backup/pre-wave6-20260723-0400` + snapshot קפוא — ראו WAVE_6_RECOVERY_PLAN.md.

## בדיקות (tests/cross-domain-memory/, 36 בדיקות)

framework: סדר, אידמפוטנטיות, malformed-skip+audit, meta versioning, בידוד כשלים,
audit-אחד-למיגרציה · migrations: כל m001-m007 מול ה-snapshot (אפס אובדן, שדות נכונים,
double-run + forced-run יציבים, וריאנטים פגומים) · markerRoundTrip: תאימות נתונים ישנים
· hooks: draft-only (שום דבר לא מאשר את עצמו) · commandCenterMemory: נגזרות בלבד,
אפסים כנים.

שערים (ריצות אמת, worktree): oxlint 0/0 · tsc 0 · typecheck:tests 0 ·
Vitest **623/623** (587 בסיס + 36 חדשות) · build ✓.
