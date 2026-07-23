# WAVE 8 — BASELINE (Pre-Wave)

תאריך: 23.07.2026 10:00 · HEAD בכניסה: **8236185** · Working tree: נקי · ענף בטיחות: `backup/pre-wave8-20260723-1000`

## שערי Wave 7 על ה-baseline (ריצות אמת)
oxlint 0/0 · tsc 0 · typecheck:tests 0 · Vitest 1342/1342 · build ✓ (e2e 227/227 + scanner CLEAN בסגירת Wave 7, אותו HEAD).

## תיקון P-1/P-2 (תיקון אמיתי, לא סיווג מחדש)
- **P-1 (מוני עמודים)**: נוספו CSS counters ("עמוד N") ל-Quick-Start print (`qs-print-section`/`qs-print-footer`) ול-handout המצגת (`pres-handout-section`/`pres-handout-footer`, break-after: page).
- **P-2 (כותרת מוצר/גרסה/תאריך/בעלים)**: נוסף header להדפסה בשני המסמכים (מוצר · חברה · תאריך הפקה · בעלים צחי זוסטייהם · מצב), בתבנית של submission printView.
- אימות מחדש: print QA suite 3/3 · w7f presentation suite 10/10 · unit 1342/1342 · build ✓. W8-F יוסיף אכיפה מפורשת לבדיקות ה-print על שני המסמכים.

## תשתית Lead לגל
+13 collections חדשים (analytics/governance/administration/health) · IDB v6. מלאי מפורט (metrics/governance/permissions/health) — מסמכי ה-inventory של Phase 8.0 נכתבים על ידי סוכני ה-workstreams בתחילת עבודתם.
