# WAVES 2–4 — TEST RESULTS (ריצות אמת, main משולב, 23.07.2026)

| פקודה | תוצאה | Exit |
|---|---|---|
| npm run lint (oxlint) | 0 errors / 0 warnings | 0 |
| npm run typecheck (tsc -b, strict+noUncheckedIndexedAccess) | 0 errors | 0 |
| npm run test (Vitest) | Test Files 23 passed · **Tests 284 passed** | 0 |
| npm run build (tsc -b && vite build) | ✓ | 0 |
| npx playwright test -c e2e/w3.config.ts | **25 passed** (30.4s) | 0 |
| npx playwright test -c e2e/w4.config.ts | **29 passed** (46.3s) | 0 |
| npx vitest run tests/cross-module.test.ts | **10 passed** | 0 |

## הרכב חבילת ה-unit/integration (284)

- ליבה (Waves 1–2, 149): schemas (34 משפחות) · repositories CRUD+subscribe (InMemory+IndexedDB/fake-indexeddb) · selectors מול seed · router smoke 30+ mounts · badges · searchRank · deriveNotifications · navGroups · quickCreate
- W3 (55, tests/modules-w3/): printer matching (catalogue-only) · quote math (הנחה/מע"מ/סכומים) · sales journey reconcile · command-center selectors · escaping ל-print (anti-XSS)
- W4 (70, tests/modules-w4/): SLA math · recurring-issue detection · progress/approval/delayed derivations · warranty/maintenance-due · marker round-trips · kanban grouping · org linkage
- Cross-module (10): עשרת הזרימות המחויבות בין מודולים על השכבה הקנונית

## e2e (54 סה"כ על main)

W3: מרכז שליטה (KPI+console נקי) · יצירת ליד→טבלה+דשבורד · 9 טאבים ב-360 · מסע מכירות שורד reload · סכומים+מע"מ+חסימת הנחה בעברית · print popup.
W4: אישור מטלה מכווץ תור · קריאה→קידום→ציר זמן גדל · תחזוקה נגזרת · kanban שורד reload · הסלמת Tier + טיימר SLA חי · console נקי בכל 6 הראוטים.
Wave 2 (רץ בגל 2, 20/20): קבוצות ניווט+persist · badge שירות · חיפוש "Bambu"→ניווט · ⌘K→יצירת ליד+שגיאת zod+toast · התראות persist · מקלדת · axe 0 serious/critical.
