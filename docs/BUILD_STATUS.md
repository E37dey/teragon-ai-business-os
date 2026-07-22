# BUILD STATUS — TERAGON AI BUSINESS OS (teragon-os)

עדכון: 22.07.2026 · Wave 0

| Wave | תוכן                                                   | מצב                  |
| ---- | ------------------------------------------------------ | -------------------- |
| 0    | ריפו נקי, מסמכי ארכיטקטורה, מלאי תורמים                | 🟡 IN PROGRESS       |
| 1    | Domain model, repositories, IndexedDB, seed דטרמיניסטי | ✅ DONE (23.07.2026) |
| 2    | Design system RTL פרימיום + AppShell                   | ⚪                   |
| 3    | Command Center, CRM, Customer 360, Sales, Documents    | ⚪                   |
| 4    | Courses, Service, Printers, Organizations, Tasks       | ⚪                   |
| 5    | Server-side AI אמיתי + fallback                        | ⚪                   |
| 6    | Product agents + approvals                             | ⚪                   |
| 7    | Memory, knowledge, governed learning                   | ⚪                   |
| 8    | Adoption, personas, Stage Gates, submission            | ⚪                   |
| 9    | Analytics, governance, administration                  | ⚪                   |
| 10   | QA מלא, אבטחה, נגישות, Visual QA, Netlify              | ⚪                   |

## Wave 1 — Architecture & Integration (23.07.2026) ✅

- **Domain** (`src/domain/`): `types.ts` — 45 ישויות קנוניות + Enrollment + `AIResponseEnvelope` (7 שדות) + unions בעברית (`AgentStatus`, `LeadStatus`, `EntityStatus`…). `schemas.ts` — 34 סכמות zod נעולות לטיפוסים עם `satisfies z.ZodType<T>`.
- **Selectors** (`src/domain/selectors/`): dashboardKpis (לידים לפי שלב, קריאות לפי דחיפות, צבר הכנסות מהצעות, השלמת קורסים), globalSearch, salesFunnel, recentActivity — טהורים ונבדקים; **ערבות אין-KPI-קשיח**: מדד לא-נמדד ⇒ `null` ("טרם נמדד"), לעולם לא מספר מומצא.
- **Repositories** (`src/repositories/`): `Repository<T>` (list/get/create/update/remove/clear/subscribe) · `IndexedDBRepository` (idb, DB `teragon-os`, store לכל אחת מ-45 collections) · `InMemoryRepository` (בדיקות/fallback) · factory עם singletons עצלים · `nextId` דטרמיניסטי · `seedIfEmpty()` בעליית האפליקציה (זורע רק collections ריקים — לא דורס עריכות משתמש).
- **Seed** (`src/repositories/seed/`): נתוני הדגמה עבריים דטרמיניסטיים (עוגן 22.07.2026), עקביים פנימית: 15 לקוחות · 15 לידים · 8 הצעות עם שורות · 10 קריאות · 6 קורסים + 10 הרשמות/8 תלמידים · 8 דגמי מדפסות · 5 ארגונים · 7 סוכני מוצר (מנהל התזמור/Hunter/Fixer/Mentor/Nexa/Wiki/Flow) + trace שיתוף פעולה מלא (משימות/הודעות/handoffs/קונפליקט/ראיות/אישורים) · 9 MetricDefinitions (3 רמות; מדדי AI = "טרם נמדד") · 7 פרסונות · 6 שלבי הטמעה · 6 Stage Gates · 13 חומרי הדרכה · זיכרון/ידע עם [[wikilinks]]+frontmatter · יומן ביקורת. זהות: טרגון טכנולוגיות, צחי זוסטייהם (`u-tzachi`, מנכ"ל).
- **App** (`src/app/`): `router.tsx` — 28 ראוטים + `/customers` index + NotFound; `PlaceholderPage` RTL כן ("המסך ייבנה בגל X"); `MinimalShell` כהה זמני (יוחלף ב-Wave 2); `queryClient.ts`; `mode.ts` (`local-demo` עד Wave 5). `main.tsx`: seedIfEmpty → Query+Router providers. סקאפולד הדמו נמחק.
- **Gate (רץ בפועל)**: typecheck 0 שגיאות · **103/103 בדיקות** (zod round-trip 34 משפחות, CRUD+subscribe על InMemory+IndexedDB[fake-indexeddb], selectors מול הזרע, router smoke 30 mounts) · build נקי · preview: `/` ו-`/crm` → 200.
- תלות חדשה: `fake-indexeddb` (dev בלבד).

## מצב טכני

- Stack: Vite 7 · React 19 · TS **strict: true + noUncheckedIndexedAccess** · react-router-dom · TanStack Query/Table · zod · idb
- Dev: Vitest · @testing-library/react · Playwright · @axe-core/playwright · Prettier · ESLint
- netlify.toml (SPA redirect + security headers) + .env.example (ללא סודות) — קיימים מקומיט ראשון
- תורמים (read-only): `Desktop/teragon-final` (frozen 7b54d6a) · `Desktop/CRM -TERAGON` (snapshot בתוך teragon-final/docs/donor-snapshot)
