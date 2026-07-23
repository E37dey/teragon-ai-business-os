# WAVE 8 — מלאי בריאות המערכת (Phase 8.0, W8-D)

תאריך: 23.07.2026 · נכתב בתחילת עבודת ה-workstream, לפני מימוש המנוע.

## 1. סכימת IndexedDB

- מסד: `teragon-os` · **IDB_VERSION = 6** (`src/repositories/IndexedDBRepository.ts`).
- הסכימה נגזרת מרשימת `COLLECTIONS` הקנונית (`src/repositories/collections.ts`) — **100 אוספים** (object store לכל אוסף, keyPath `id`), כולל 13 אוספי Wave 8 החדשים (analytics/governance/administration/health) ובהם `healthSnapshots` (קיים, seed ריק) ו-`governanceIncidents`.
- נפילה: כשאין IndexedDB (בדיקות/jsdom) — `InMemoryRepository` נזרע מ-SEED.

## 2. מצב מיגרציות

- מסגרת: `src/migrations/framework.ts` — `schemaVersion` + `appliedMigrations` ברשומת `meta/schema` (SCHEMA_META_ID="schema"); AuditEvent אחד לכל מיגרציה שהוחלה.
- רישום: `ALL_MIGRATIONS` (m001–m007, W6-E). ריצה בעליית האפליקציה דרך `runMigrationsAtBoot()`.
- אימות בריאות אפשרי: השוואת `appliedMigrations` מול הרישום — ממומש ב-`checkMigrations`.

## 3. פונקציות שרת (netlify/functions)

`ai-capabilities` · `ai-classify` · `ai-config` · `ai-explain` · `ai-health` · `ai-recommend` · `ai-stream` · `ai-structured` · `ai-summarize` (9 פונקציות; עטיפות דקות מעל `src/server/handlers.ts`).
מגבלת סביבה: ב-`vite preview`/`vite dev` מקומי ללא `netlify dev` הפונקציות **אינן רצות** ⇒ בדיקת נגישות חייבת לדווח ביושר "לא זמין בסביבה מקומית ללא netlify dev".

## 4. מצבי ספקי AI

- **LocalRulesProvider** (`local-rules`): דטרמיניסטי, `model=null`, ביטחון "טרם נמדד", תמיד זמין ללא רשת. בדיקה אמיתית = הרצת פעולת summarize ואימות מעטפת.
- **RemoteAIProvider** (`remote`): הדפדפן לעולם אינו מכריז "מחובר" — רק תשובת `ai-health` מהשרת. עם `AI_REMOTE_ENABLED=false` (ברירת המחדל) השרת מדווח "מושבת"; ללא ספק מוגדר — "לא הוגדר".
- **ProviderRegistry**: נפילה remote→local לעולם אינה שקטה (FALLBACK_MESSAGE_HE חובה).

## 5. שמות משתני סביבה בצד השרת (שמות בלבד — לעולם לא ערכים)

`AI_PROVIDER`, `AI_MODEL`, `AI_API_KEY` (שרת בלבד), `AI_BASE_URL`, `AI_REQUEST_TIMEOUT_MS`, `AI_MAX_OUTPUT_TOKENS`, `AI_DAILY_BUDGET`, `AI_RATE_LIMIT_PER_MINUTE`, `AI_MAX_CONCURRENT_REQUESTS`, `AI_REMOTE_ENABLED` (`src/server/config.ts`).

## 6. זמינות מטא-נתוני build

- `import.meta.env.MODE` / `DEV` / `PROD` — זמינים תמיד (vite).
- **אין** define ל-`VITE_APP_VERSION` או `VITE_BUILD_COMMIT` ב-vite.config.ts (קובץ אסור לעריכה על ידי W8-D) ⇒ גרסה/קומיט מדווחים ביושר "לא סופק בזמן build". בקשה ל-Lead בתור האינטגרציה.
- `package.json` version = "0.0.0"; ייבוא ישיר של JSON חסום (resolveJsonModule כבוי ב-tsconfig משותף — אסור לעריכה).

## 7. תורים ואישורים

- `agentQueueSizes(tasks)` (`src/agents/selectors.ts`) — גדלי תורים מסטטוסים בתור/רץ/ממתין לאישור.
- `pendingApprovals(approvals)` — אישורים במצב "ממתין".
- `ApprovalEngine` (`src/agents/approvalEngine.ts`) — ניתן לבנייה מעל `agentStores()`; פעולת "permission-change" קיימת ברשימת 12 הפעולות הקנוניות ומשמשת את הגדרות האבטחה.

## 8. יכולות מדידה בדפדפן

- `navigator.storage.estimate()` — זמין בדפדפנים מודרניים; **לא** ב-jsdom ⇒ "לא ניתן למדידה".
- `performance.now()` — למדידת זמני תגובה (רק כשנמדד בפועל).
- `AbortSignal.timeout` — לבדיקת פונקציות עם timeout קצר.

## 9. מגבלות ידועות (בכניסה לגל)

1. אין מנגנון גיבוי חיצוני אוטומטי — הייצוא הידני (זיכרון W6-B) הוא המנגנון היחיד.
2. אין commit/version בזמן build (סעיף 6) עד שה-Lead יוסיף defines.
3. אין ל-`governanceIncidents` בעלים-טיפוס בדומיין עדיין (ה-workstream של הממשל בונה אותו) — W8-D כותב רשומת אירוע מוקלדת משלו (`HealthIncident`) ומתעד בתור האינטגרציה.
4. `רשומת meta` משמשת גם את המיגרציות (id "schema") — W8-D מוסיף רשומות `settings` ו-scratch זמני (`w8d-health-scratch`, נמחק מיד) באותו אוסף; אין התנגשות מזהים.
5. בדיקת remote/פונקציות בסביבה מקומית תדווח "לא זמין" — זה המצב הכן, לא כשל של המנוע.
