# TERAGON AI BUSINESS OS

מערכת הפעלה עסקית מבוססת-AI לעברית (RTL) — פרויקט גמר אקדמי. אפליקציית React/TypeScript
המדגימה CRM, שירות, הדרכה, ידע ואוטומציה עם שכבת סוכני-AI **דטרמיניסטית ומקומית**,
מתוך עמדה של **אישור אנושי (Human-in-the-Loop) ושקיפות מלאה** — הסוכנים **מציעים**,
האדם **מחליט**.

> **הצהרת מהות (חשוב לבודק/ת):** זהו פרויקט אקדמי עם **נתונים סינתטיים בלבד**.
> **אין** מסד נתונים אמיתי של חברה, **אין** שירות בתשלום, **אין** דרישת Production ו**אין**
> מודל שפה מרוחק. `AI_REMOTE_ENABLED=false`. מוטציות דמו של סוכנים מאופסות לאחר רענון.
> **רק** `Customers`, `Contacts` ו-`Customer Detail` הם **LIVE_VALIDATED** (Supabase + RLS);
> **29 המסלולים הנותרים הם ACCEPTED_DEMO_ONLY** — מדגימים תהליכי מוצר, מודולים מקומיים
> ו-AI דטרמיניסטי, ואינם דומיינים עסקיים מגובי-Supabase.

## תיאור המוצר (פסקה)

TERAGON הוא "מרכז פיקוד" עסקי: מסך שליטה עם KPI-ים וכרטיס החלטת-AI בעל אישור אנושי,
ניהול לקוחות ואנשי קשר בזמן אמת (Supabase + RLS), ומודולים מקומיים למכירות, שירות,
הדרכה, ידע, אוטומציה וממשל. שכבת ה-AI מורכבת מ**שבעה סוכנים** שכל אחד מציע **שתי פעולות
עסקיות** דטרמיניסטיות (14 בסך הכול) — עם ראיות, הסבר "למה", ושער אישור לפני כל שינוי.

## סטטוס פרסיסטנטיות

- **חי (LIVE_VALIDATED):** `Customers`, `Contacts`, `Customer Detail` — Supabase עם
  RLS לבידוד דיירים; 12/12 בדיקות קבלה חיות לכל דומיין.
- **דמו מקומי (ACCEPTED_DEMO_ONLY):** כל שאר המסלולים — IndexedDB (זרע דטרמיניסטי) /
  תוכן מובנה / מנוע חוקים מקומי. נושאים באנר "מצב הדגמה" קבוע ותוויות כנות.

## יכולות עיקריות

- מרכז שליטה עם אישורי-AI אנושיים (why · evidence · אשר/דחה).
- CRM חי (לקוחות/אנשי קשר) עם ולידציה וכשל-סגור בטוח.
- 7 סוכני-AI × 2 פעולות (14) — דטרמיניסטי, מקומי, מאושר-אנושית.
- מודולים: מכירות, שירות, מדפסות, קורסים, משימות, מסמכים, אנליטיקה, ידע, זיכרון,
  אוטומציות, ממשל, הטמעה, הגשה.
- ניווט מקובץ (כולל "מעבדת AI · דמו מקומי" ו-"עוד"), מצב כהה, RTL מלא, רספונסיביות מלאה.

## סיכום ארכיטקטורה

React SPA → hooks + `domainComposition` → repositories → מתאם **LOCAL (IndexedDB)** או
**Supabase** → זהות/היקף-ארגון → **RLS** במסד. גבול קומפוזיציה **fail-closed** (ללא נפילה
שקטה ל-IndexedDB במצב Supabase — ADR 0002). תרשימים מלאים:
[docs/submission/ARCHITECTURE_OVERVIEW.md](docs/submission/ARCHITECTURE_OVERVIEW.md).

## מחסנית טכנולוגית

React · TypeScript (strict) · Vite · TanStack Query · react-router-dom · Supabase (RLS) ·
Vitest · Playwright (+ @axe-core/playwright) · oxlint. Node **22**.

## AI דטרמיניסטי מקומי

שכבת ה-AI רצה דרך `LocalRulesProvider` — מנוע חוקים דטרמיניסטי ש**לעולם אינו מתחזה
ל-LLM** (`provider="local-rules"`, `model=null`). `AI_REMOTE_ENABLED=false`. אין LLM, אין
MCP, אין קריאה חיצונית. כל תוצאה מציגה: **"מנוע חוקים מקומי — ללא מודל מרוחק"**.

### שבעה סוכנים · ארבע-עשרה פעולות

Orchestrator (סקירת מצב, תוכנית פעולה) · Hunter (לקוחות חסרי מידע, אנשי קשר חסרים) ·
Fixer (הצעת תיקון, **החלת תיקון מאושר**) · Flow (רצף המשך, **הצעת אוטומציה**) · Mentor
(הסבר המלצה, רשימת שיפור) · Nexa (שאלת מערכת, הכוונה לפעולה) · Wiki (חיפוש ידע, סיכום
ערך). **12 דטרמיניסטיות + 2 מאושרות-אישור.** ראו
[docs/audits/AGENT_ACTION_MATRIX.md](docs/audits/AGENT_ACTION_MATRIX.md) ו-
[src/agents/actions/README.md](src/agents/actions/README.md).

## מודל אבטחה

RLS-first לבידוד דיירים (ADR 0001) · הרשאות סוכן deny-by-default (הגדרות קפואות) ·
כשל-סגור ללא fallback שקט (ADR 0002) · תצפיתיות מסונֶנת (whitelist בן 6 שדות,
correlationId, ללא PII) · HSTS · אין מפתחות בדפדפן (מפתח שרת נשאר בצד שרת).

## איכות ובדיקות (עדות ממוזגת)

`build`, `typecheck`, `typecheck:tests` נקיים · **2569/2569** בדיקות לוגיקה עוברות ·
router smoke 36/36 · nav 9/9 · agent-actions 17/17 · a11y **18/18** · network **6/6** ·
cross-browser **144** · overflow **0/32** ב-1440/1024/768/390. ⚠️ 12 קבצי
`tests/platform/*` נכשלים **מקומית בלבד** (מגבלת טעינת Rolldown) — **אינם** כשלי-לוגיקה;
**GitHub CI הוא הסמכות** ורץ ירוק. ציון סופי: **8.6/10, ללא חוסמים**
([FINAL_PRODUCT_VERDICT](docs/final/FINAL_PRODUCT_VERDICT.md)). חבילת בדיקות Trusted-AI
בסגנון "MVP→Trusted AI":
[docs/submission/TRUSTED_AI_TEST_PACK_HE.md](docs/submission/TRUSTED_AI_TEST_PACK_HE.md).

## התקנה והרצה מקומית

```bash
npm install
npm run dev      # שרת פיתוח (Vite) — ברירת המחדל: מצב הדגמה מקומי (IndexedDB)
```

בנייה ותצוגה מקדימה:

```bash
npm run build    # tsc -b && vite build
npm run preview  # תצוגת ה-build המקומי
```

בדיקות ואיכות:

```bash
npm test                # vitest run
npm run typecheck       # tsc -b --noEmit
npm run typecheck:tests # tsc --noEmit -p tsconfig.tests.json
npm run lint            # oxlint
npm run scan:secrets    # סריקת סודות ב-bundle
```

מדריך מלא: [docs/submission/RUN_AND_DEMO_GUIDE.md](docs/submission/RUN_AND_DEMO_GUIDE.md).

## משתני סביבה

הרצה מקומית **אינה דורשת סודות**. ברירות המחדל של הלקוח: מצב הדגמה מופעל
(`VITE_DEMO_MODE`), פרסיסטנטיות מקומית (`VITE_PERSISTENCE_PROVIDER=LOCAL_INDEXEDDB`),
`AI_REMOTE_ENABLED=false`. משתני Supabase (`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`)
נדרשים **רק** להרצת מצב Supabase החי. משתני שרת (ספק AI) נקראים אך ורק בצד השרת ולעולם
אינם עם קידומת `VITE_`. תבנית ללא ערכים אמיתיים: `.env.example`. **אין לחשוף מפתחות אמיתיים.**

## מצב הדגמה

מצב הדגמה מופעל כברירת מחדל: כל הנתונים סינתטיים, אין שליחת הודעות אמיתיות, ובאנר
"מצב הדגמה" קבוע מוצג מעל כל מסלול. הרצה מקומית = מצב הדגמה מקומי (IndexedDB) ללא כל חיבור
חיצוני. מדיניות: [docs/operations/DEMO_PILOT_POLICY.md](docs/operations/DEMO_PILOT_POLICY.md).

## מבנה הפרויקט

```
src/
  app/            # shell, routes, ניווט, rail, quick-create, commands
  layout/         # AppShell, CompactTopHeader, workspace, nav
  modules/        # מסכי המוצר (customers, crm, agents-ui, ...)
  agents/         # 7 סוכנים + agents/actions (מנוע פעולות דמו מקומי)
  ai/             # חוזה AIProvider + LocalRulesProvider + registry
  persistence/    # composition seam + מתאמי Supabase
  repositories/   # מתאמי LOCAL (IndexedDB) + זרע
  authorization/  # routeGuard / RBAC
  observability/  # errorSink + domainEvents (correlationId)
docs/
  final/ audits/ adr/ operations/ submission/
tests/ e2e/
```

## מגבלות ידועות (מקובלות בהיקף אקדמי)

נתונים סינתטיים בלבד · רק 2 דומיינים חיים · AI דטרמיניסטי (לא גנרטיבי) · מוטציות דמו
בזיכרון (מתאפסות ברענון) · אין גיבוי/שחזור (Production מחוץ להיקף) ·
`AI_REMOTE_ENABLED=false`. פירוט: [FINAL_PRODUCT_VERDICT](docs/final/FINAL_PRODUCT_VERDICT.md).

## אינדקס תיעוד

מדד הכניסה לחבילת ההגשה:
**[docs/submission/SUBMISSION_INDEX.md](docs/submission/SUBMISSION_INDEX.md)** — קישורים
לכל מסמכי הקבלה, הראיות, הארכיטקטורה, מדריך ההרצה, תסריט המצגת ושאלות הבודק.
