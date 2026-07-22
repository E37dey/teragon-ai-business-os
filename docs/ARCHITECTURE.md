# ARCHITECTURE — TERAGON AI BUSINESS OS (teragon-os)

Wave 0 · 22.07.2026 · בעלות: Architecture & Integration

## עקרונות

1. **מקור אמת אחד לכל דבר**: ראוט אחד = מימוש אחד; ישות אחת = repository אחד; מספר בדשבורד = selector מעל repository. אסור מערך KPI קשיח בתוך קומפוננטה.
2. **TS strict מיום ראשון** (`strict` + `noUncheckedIndexedAccess`). אין allowJs — אין קוד JS בכלל.
3. **AI רק בשרת** (Netlify Functions). הדפדפן לא פונה לספק AI לעולם.
4. **כנות**: אין מדד מומצא ("טרם נמדד"), אין כפתור מת (disabled + סיבה בעברית), אין fake success.
5. **RTL-first**: logical properties בלבד; מספרים/מידות/קוד ב-`dir="ltr"`.
6. **Local-first**: Mode A (הדגמה, IndexedDB, seed דטרמיניסטי, ללא סודות) תמיד עובד; Mode B (מחובר) תוספת.

## מבנה תיקיות ובעלות

```
src/
  app/            ← Architect: router, providers (QueryClient), mode manager, shell wiring
  domain/         ← Architect: types.ts (45+ ישויות), schemas.ts (zod), selectors/
  repositories/   ← Architect: Repository interface, IndexedDBAdapter, CloudAdapter(stub), seed/
  styles/         ← Design: tokens.css, base.css, components.css (.theme-os)
  design-system/  ← Design: פרימיטיבים (Panel, KpiCard, DataTable, OsButton[disabledReason], StatusChip, Stepper, AgentCard, TierCard, ConfidenceBar[טרם נמדד], GlowOrb, EmptyState…)
  layout/         ← Design: RightPrimaryNavigation, CompactTopHeader, LeftIntelligenceRail, MainOperationalWorkspace, GlobalSearch, CommandPalette, NotificationCenter, UserProfileMenu
  modules/        ← סוכני מסכים לפי PAGE_CONTRACT:
    command-center/ crm/ customers/ sales/ documents/        (Agent 3)
    courses/ service/ printers/ organizations/ tasks/        (Agent 4)
    automations/ agents/                                      (Agent 5)
    memory/ knowledge/ learning/                              (Agent 6)
    implementation/ personas/ stage-gates/ training-materials/
    quick-start/ faq/ support/ submission/                    (Agent 7)
    analytics/ governance/ administration/                    (Agent 3/4 or 9)
  ai/             ← Agent 5: AIProvider interface, LocalRulesProvider, RemoteAIProvider (client of functions), envelope types
  agents-core/    ← Agent 5: orchestrator, product-agent registry, event persistence (דרך repositories)
  memory-core/    ← Agent 6: markdown/frontmatter/wikilinks parsing, vault import/export, proposal workflow
netlify/functions/ ← Agent 5: ai-*.ts endpoints (zod validation, rate limit, budget, correlation IDs, audit)
tests/            ← Agent 8 + כל סוכן לקוד שלו
e2e/              ← Agent 8: Playwright + axe
```

## חוזה עמוד (PAGE_CONTRACT)

כל מסך: `<Name>Page.tsx` (default export, canvas) + אופציונלי `<Name>Rail.tsx` (rail שמאלי הקשרי) + `meta` (title, KPIs selector, breadcrumbs). נתונים רק דרך hooks של TanStack Query מעל repositories. עיצוב רק דרך design-system. ולידציה zod. כל פעולה אמיתית או disabled+סיבה.

## שכבת נתונים

`Repository<T>`: list/get/create/update/remove/subscribe + query selectors טהורים ב-domain/selectors (נבדקים ביחידה). IndexedDB (idb) store לכל collection + זריעה דטרמיניסטית (seed מסומן "נתוני הדגמה", עקבי פנימית: כל KPI נגזר). TanStack Query כשכבת cache/invalidation — מוטציה מנקה את כל ה-queries התלויים ⇒ "ליד חדש" מעדכן רשימה/חיפוש/KPI/משפך/פעילות בבת אחת.

## AI

`AIProvider`: health/capabilities/stream/generateStructured/summarize/classify/recommend/explain/embed.

- `LocalRulesProvider`: דטרמיניסטי, שקוף ("מנוע חוקים מקומי"), ללא רשת.
- `RemoteAIProvider`: fetch ל-`/.netlify/functions/ai-*` בלבד. השרת: env vars, timeout, retry מוגבל, rate limit, תקציב יומי, zod על קלט/פלט, correlation ID, audit.
  כל תשובה = AIResponseEnvelope: result · reason · evidence[] · confidenceMethod · limitations · nextAction · approvalRequired.

## אישורים אנושיים

preview → approve → execute → verify → audit (+ edit/reject/request-revision/cancel/rollback). פעולות אסורות ל-AI ללא אישור: שליחת הודעות, שינוי הצעה/מחיר/הנחה, מחיקה, הרשאות, סגירת קריאה, כתיבת זיכרון קבוע, אוטומציה חיצונית, התחייבות כספית.

## מצבים

- **Mode A — מצב הדגמה מקומי**: ברירת מחדל. IndexedDB + LocalRulesProvider. תג קבוע בממשק.
- **Mode B — מצב מחובר**: env מזוהה בשרת בלבד; ה-client שואל `/health` ומציג סטטוס אמת. נפילת ספק ⇒ fallback שקוף ל-Local + הודעה.
