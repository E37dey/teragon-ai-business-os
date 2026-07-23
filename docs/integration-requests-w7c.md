# INTEGRATION REQUESTS — W7-C (Stage Gates & Evidence)

23.07.2026 · מגיש: W7-C · קבצים משותפים לא נגעו — כל הבקשות כאן ל-Integration Lead.

| # | קובץ משותף | שינוי מבוקש | פרטים |
|---|-----------|--------------|-------|
| 1 | `src/app/router.tsx` | חיבור ראוט `/stage-gates` | להוסיף ל-`MODULE_PAGES`: `"/stage-gates": lazy(() => import("@/modules/stage-gates/StageGatesPage"))` (default export קיים; הראוט כבר מוגדר ב-routes.ts, wave 7) |
| 2 | boot path (`src/main.tsx` / seedIfEmpty) | הפעלת גשר V2 בעלייה (אופציונלי) | `new StageGateService({ stores: stageGateStores() }).ensureBridge()` — אידמפוטנטי; כיום העמוד מריץ אותו ב-mount, כך שאין חובה |
| 3 | W7-A (תכנית ההטמעה) | טיפוסים קנוניים ל-W7 collections | `pilotDefinitions/pilotResults/rolloutWaves/implementationEvidence` נקראים אצלי דרך `W7RecordLike` מינימלי (`src/domain/stage-gates/types.ts`). כשה-types הקנוניים של W7-A ימוזגו — להחליף את הקריאה הטיפוסית ב-`stageGateStores.ts` ולמפות שדות תצוגה (title/status/outcome) |
| 4 | W7-A (שלבי הטמעה) | קישור דו-כיווני שער↔שלב | ה-rail שלי כבר מציג "שלבי הטמעה מושפעים" דרך `implementationStages.gateId` (קריאה בלבד). מוצע שעמוד `/implementation` יציג מנגד את מצב השער V2 לכל שלב: `validateAll()` מ-`@/domain/stage-gates` מחזיר את המצב הדטרמיניסטי לכל שער |
| 5 | W7-E/מרכז ההגשה | צריכת מצבי שערים כראיות הגשה | אין לחשב "G1-G6 עברו" באופן עצמאי — לייבא `StageGateService.validateAll()`; שער שאינו Go מדווח בדיוק כמו שהוא (חסרות ראיות/לא התחיל), כולל G4 שחסום עד רשומת PilotResult אמיתית |
| 6 | תוכן: Use Case Brief | רשומת מטרת-הפתרון | ב-seed אין רשומת "מסמך מטרת הפתרון", ולכן G1 עולה ביושר "חסרות ראיות". כשצוות התוכן ייצור אותה (memoryRecord/document ממושל) — לצרפה לקריטריון `g1-goal` דרך המסך; אין ליצור אותה אוטומטית |

## הערות תלות

- אין תלות חדשה ב-package.json.
- `stageGateStores` עוטף אך ורק את ה-factory הקנוני; אוסף `stageGates` הקיים לא שוכפל — שדה `v2` נוסף לאותן 6 רשומות seed (idempotent, נשמר גם ב-IndexedDB v5 ללא שינוי סכימה).
- audit נכתב ל-`auditEvents` בתבנית הקנונית (`sg2-<gateId>-aud-<n>`, correlationId `stage-gate-<gateId>`), ללא רשומת AgentRun (כמו knowledge-gov ב-W6-C).
- אין שינוי ב-`INTEGRATION_QUEUE_W7.md` (בבעלות ה-Lead) — הבקשות מרוכזות כאן.
