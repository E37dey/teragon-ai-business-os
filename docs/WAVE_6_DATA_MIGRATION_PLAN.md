# WAVE 6 — DATA MIGRATION PLAN

עקרונות מחייבים: דטרמיניסטי · אידמפוטנטי · מגורסן · ניתן לשחזור · נבדק מול רשומות malformed · אפס מחיקה שקטה של רשומות דמו קיימות.

## מנגנון
- `src/migrations/` (בעלות W6-E): רישום מיגרציות ממוספרות `m001-…` עם `applies(dbVersion, record)` + `up(record)` טהורות.
- הרצה בעליית האפליקציה אחרי פתיחת IDB: לכל collection שנגעה בו מיגרציה — קריאה, טרנספורמציה טהורה, כתיבה חזרה, רישום AuditEvent אחד לכל מיגרציה שהוחלה (לא לכל רשומה).
- דגל `schemaVersion` נשמר ב-store ייעודי `meta` (בקשה ל-collections — Integration Lead יוסיף) או ברשומת meta ב-store קיים.
- **העלאת גרסת IDB (v3→v4) מבוצעת אך ורק על ידי ה-Integration Lead** (IndexedDBRepository.ts משותף).

## מיגרציות מתוכננות
| # | מה | סיכון | היפוך |
|---|-----|-------|--------|
| m001 | פירוק מרקרי `⟦…⟧` מ-Task.description → שדות workState/ownership | נמוך (regex בדוק round-trip) | המרקר נשמר בשדה `legacyMarker` עד אימות |
| m002 | פירוק מרקרים מ-SupportRequest → tier/assigneeId/category/feedback | נמוך | כנ"ל |
| m003 | localStorage journeyStep → Opportunity.journeyStepId | נמוך | localStorage לא נמחק בגל זה |
| m004 | localStorage quotation version → Quotation.version | נמוך | כנ"ל |
| m005 | Approval extended-state מ-agentEvents → שדה מורחב | בינוני | הנגזרת מהאירועים נשארת מקור אמת משני |
| m006 | Nexa purpose יישור | אפסי | ערך ישן ב-audit |
| m007+ | שדות חדשים (ברירות מחדל בטוחות) ל-ServiceTicket/CustomerPrinter/Document/CourseSession | נמוך | שדות אופציונליים |

## בדיקות
Snapshot לפני-גל (docs/backups/wave6-baseline-seed-snapshot.json) נטען ל-fake-indexeddb → מריצים מיגרציות → אימות: אפס אובדן רשומות, שדות חדשים תקינים, ריצה כפולה = אותה תוצאה, רשומות malformed (מרקר שבור, JSON חלקי) לא מפילות — נרשמות ומדולגות עם audit.

## שחזור
ראו WAVE_6_RECOVERY_PLAN.md.
