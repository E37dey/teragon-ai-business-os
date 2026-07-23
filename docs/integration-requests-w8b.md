# INTEGRATION REQUESTS — W8-B (AI Governance, Risk & Audit)

| # | קובץ משותף | שינוי מבוקש | הערות |
|---|---|---|---|
| 1 | `src/app/router.tsx` | הוספת שורה ל-MODULE_PAGES: `"/governance": lazy(() => import("@/modules/governance/GovernancePage"))` | הראוט `/governance` כבר קיים ב-routes.ts (כיום placeholder). העמוד default-export, עומד ב-PAGE_CONTRACT (PageRail משלו: "מבקר הממשל"). |

אין בקשות נוספות: כל הקוד בבעלות W8-B (`src/domain/governance/**`, `src/governance/**`, `src/modules/governance/**`, `src/repositories/governanceStores.ts` חדש, `tests/governance/**`). לא נגעתי בקבצים משותפים.
