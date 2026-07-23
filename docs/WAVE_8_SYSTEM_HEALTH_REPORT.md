# WAVE 8 — דוח W8-D: בריאות המערכת + הגדרות

תאריך: 23.07.2026 · ענף worktree מבודד · commit יחיד.

## מה נבנה

1. **Phase 8.0** — `docs/WAVE_8_HEALTH_INVENTORY.md` (סכימת IDB v6/100 אוספים, מיגרציות m001–m007, 9 פונקציות שרת, מצבי ספקים, שמות env, זמינות build metadata, מגבלות).
2. **Phase 8.9** — דומיין (`src/domain/system-health`, typed+zod) + מנוע 15 בדיקות אמיתיות (`src/system-health/checks.ts`) מעל seam מוזרק; snapshot מתמיד ל-`healthSnapshots`; דוח אבחון מושמט-סודות; פתיחת אירועים ל-`governanceIncidents`; buildInfo כן.
3. **Phase 8.10** — `/system-health` (`src/modules/system-health/SystemHealthPage.tsx`): 15 רכיבים עם כל שדות החוזה (מצב/בדיקה אחרונה/שיטה/זמן תגובה רק-כשנמדד/הצלחה-כשל אחרונים/מגבלה/פעולה מומלצת/ממצא), פעולות אבחון (ריצה מלאה, אימות repositories/מיגרציות/חיפוש, ייצוא JSON מושמט, פתיחת אירוע), פאנלי אחסון/מיגרציות/build, היסטוריית תצלומים (עמוד לפי interface.tablePageSize), rail (תשומת לב/כשלים/אישורים ממתינים/תורים חסומים/הערת גיבוי כנה).
4. **Phase 8.11** — `/settings` (`src/modules/settings/`): 18 הגדרות מוקלדות ב-7 קבוצות (עסק/ממשק/התראות/AI/זיכרון וידע/אבטחה/הדגמה), אחסון ב-`meta/settings`, zod פר-הגדרה + טווח + ברירת מחדל + הסבר + בעלים + lastChanged, ביקורת לרגישות, אישור קנוני (ApprovalEngine, permission-change) לקבוצת האבטחה, RTL בלתי-ניתן-לשינוי, אפס שדות מפתח/סיסמה, איפוס הדגמה דטרמיניסטי עם אישור כפול + חסימת demo-guard.

## שערים — ריצות אמת (23.07.2026)

| שער | תוצאה |
|---|---|
| oxlint | exit 0 — 0 warnings / 0 errors |
| tsc -b --noEmit | exit 0 |
| typecheck:tests | exit 0 |
| vitest | **1403/1403** (1342 baseline + 61 חדשים, 7 קבצי בדיקה) |
| build | ✓ (vite, exit 0) |
| scan:secrets | RESULT: CLEAN — 0 findings |

## תצלום מצב רכיבים — כן (סביבת בדיקות jsdom, ללא רשת/IDB)

| רכיב | מצב שנמדד בסביבת הבדיקה | מצב צפוי בדפדפן אמיתי |
|---|---|---|
| IndexedDB | לא זמין (אין IDB ב-jsdom) | תקין (גרסה 6, 100 stores) |
| Repositories | תקין (CRUD מלא עבר) | תקין |
| מיגרציות | דורש תשומת לב כשאין meta/schema; תקין כשהכול הוחל | תקין אחרי boot |
| מנוע AI מקומי | תקין (summarize אמיתי, מעטפת תקפה) | תקין |
| ספק AI מרוחק | לא הוגדר (שרת: «מושבת») / לא זמין (אין שרת) — **לעולם לא «מחובר» ללא אימות שרת** | לא הוגדר עד AI_REMOTE_ENABLED=true |
| פונקציות Netlify | לא זמין + מגבלה "ללא netlify dev" / לא ניתן למדידה | תקין בפריסה |
| מנגנון האישורים | תקין (נבנה + נספרו ממתינים) | תקין |
| יומן ביקורת | תקין (ספירה + כתיבה אחרונה) | תקין |
| זיכרון ארגוני | תקין | תקין |
| מאגר ידע | תקין | תקין |
| תורי סוכנים | תקין / מוגבל כשיש "ממתין לאישור" | לפי נתונים |
| ריצות אוטומציה | תקין / דורש תשומת לב על "כישלון" | לפי נתונים |
| אינדקס חיפוש | תקין (דטרמיניסטי, ריק⇒ריק) | תקין |
| מנוע הייצוא | תקין (השמטה עצמית + בחירה + markdown) | תקין |
| אומדן אחסון | לא ניתן למדידה (אין navigator.storage) | תקין (estimate) |

לפני ריצה ראשונה: כל 15 הרכיבים "טרם נבדק" — נבדק בטסט (אין ירוק מזויף).

## בדיקות (61 חדשות)

- `tests/system-health/checks.test.ts` (27) — כל שיטת בדיקה אמיתית עם seams מדומים; remote לעולם-לא-ירוק ללא שרת (כולל RemoteAIProvider אמיתי עם fetch כושל/גוף פגום); ללא stack traces.
- `tests/system-health/snapshot.test.ts` (4) — ספירות כנות, zod, התמדה.
- `tests/system-health/diagnostics.test.ts` (5) — סודות מוזרקים נעדרים מה-JSON (עמיד escaping), שורות stack מושמטות, exclusions מוצהרים, שם קובץ דטרמיניסטי.
- `tests/system-health/incidents.test.ts` (3) — נפתח רק ממצב מצדיק, zod, שומר כפילויות.
- `tests/system-health/page.test.tsx` (4) — "טרם נבדק" לפני ריצה, ייצוא מושבת עם סיבה, ריצה מהעמוד.
- `tests/settings/settingsStore.test.ts` (11) — 7 קבוצות, אפס הגדרות בצורת סוד, טווחים, דחיית ערך לא חוקי, RTL בלתי-הפיך, אישור קנוני (החלה רק אחרי אושר; דחייה מוחקת), ביקורת, density חל בפועל.
- `tests/settings/page.test.tsx` (7) — אפס input password/key בכל 7 הקבוצות, קישור AI_PROVIDER_SETUP, RTL מושבת+מסומן, סיבות read-only, קבוצת הדגמה, איפוס דטרמיניסטי (אותם מזהי seed פעמיים).

## סטיות מהמנדט (מדווחות ביושר)

1. **גרסת אפליקציה** — ייבוא package.json חסום (resolveJsonModule כבוי בקובצי tsconfig משותפים שאסורים לעריכה) ⇒ הגרסה מדווחת "לא סופק בזמן build" עד ה-define של ה-Lead (בקשה #2 בתור).
2. **reduced-motion / תקציר מייל / תגי ניווט** — אין מנגנון צריכה אמיתי ⇒ הוצגו read-only עם סיבה (חוזה "אין מתג מת"), לא כהגדרות חיות.
3. **החלת density בעליית האפליקציה** — דורשת main.tsx (אסור) ⇒ מוחלת בעמוד ההגדרות + בקשה #3.
4. הרכיב ה-15 ברשימה מומש כ"אומדן שטח אחסון" (storage-estimate) — הרשימה במנדט מנתה את audit/memory/knowledge כשלושה רכיבים נפרדים וכך מומש; storage estimate הוא גם רכיב וגם פאנל מובנה.

## בקשות בתור האינטגרציה

ראו `docs/integration-requests-w8d.md`: (1) חיווט /system-health + /settings ב-MODULE_PAGES, (2) defines ל-VITE_APP_VERSION/VITE_BUILD_COMMIT, (3) applyUiSettings בעליית האפליקציה, (4) תצוגת אירועי system-health בעמוד הממשל, (5) הרחבת אכיפת demo-guard, (6) דגל reduced-motion גלובלי, (7) צריכת תוקף הצעה במכירות.
