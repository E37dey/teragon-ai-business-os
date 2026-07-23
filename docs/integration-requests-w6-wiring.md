# W6 CROSS-DOMAIN UI WIRING → Leftovers / Integration Requests

23.07.2026 · מאת: סוכן W6-WIRING (Phases 6.17 / 6.19 / 6.20)

## מה חווט (עובד, נבדק — tests/modules-w6-wiring, 24 בדיקות)

- **6.17** — טאב "זיכרון לקוח" בכרטיס 360 (`Customer360MemoryTab.tsx` +
  `src/integration/customer360MemoryExtras.ts`): מאושר-בלבד כברירת מחדל, שער
  רגישות (רגיש/מוגבל מאחורי חשיפה מנומקת שנרשמת ל-auditEvents בפעולה
  `memory.sensitive-reveal`), הצעות ממתינות, תצפיות, העדפות/מעקבים (נגזרים
  מתיוג), מדפסות + תקלות חוזרות, ראיות פר-פריט, קישור גרסאות, וטופס
  "הצע הוספה לזיכרון" דרך MemoryProposalWorkflow בלבד.
- **6.19** — 8 פקודות Copilot ב-`W6_MEMORY_COMMANDS` (commands.ts +
  memoryOps.ts), כולן `binding:"local"` עם אופ מוגדר; חיפוש הידע גנרי
  ("מצא ידע מאושר על ‹נושא›" — prefix matcher דטרמיניסטי); passthrough מדויק
  של `NO_APPROVED_SOURCE_HE`; הצעת זיכרון מהשיחה יוצרת הצעה ממתינה בלבד.
- **6.20** — `MemoryBand` במרכז הפיקוד מחליף את סיכום ה-Obsidian הסטטי:
  הכול נגזר מ-`commandCenterMemoryBand`, שורות אפס מוסתרות
  (`memoryBandItems`), כל שורה מקושרת ל-/memory · /knowledge · /learning.

## בקשות / שאריות ל-Integration Lead ולבעלי הדומיינים

| # | יעד | פרטים |
|---|-----|-------|
| 1 | `/memory`, `/knowledge`, `/learning` (W6-A/C/D) | הניווט מהבנד/מהטאב/מהפקודות משתמש ב-query params: `?record=<id>`, `?proposal=<id>`, `?article=<id>`, `?filter=pending\|conflicts\|reviews\|today\|rejected\|usage`, `?view=graph`. העמודים כרגע מתעלמים מהם (הראוט נטען, אין בחירה אוטומטית). מומלץ שכל עמוד יקרא את הפרמטרים ב-mount ויקבע בחירה/סינון ראשוני. הניווט עצמו עובד גם בלי זה. |
| 2 | tests/modules-w5d (קפוא לצוות זה) | `commandRegistry.test.ts` נשאר נכון בכוונה: `COPILOT_COMMANDS` נותר 9 פקודות W5; החדשות חיות ב-`W6_MEMORY_COMMANDS` + `ALL_COPILOT_COMMANDS`. אם רוצים רישום אחד — לאחד את שתי הרשימות ולעדכן את בדיקת ה-9. |
| 3 | W6-C בקשה #3 (MemorySearchPort) | לא מומש כאן (מחוץ להיקף): `wikiOps` עדיין רץ עם `noopMemorySearchPort`. המימוש הטבעי — חיפוש על `listBridgedRecords()` המאושרים של W6-A והזרקה ב-`new WikiAgent({ memoryPort })` ב-`src/agents/wiki/index.ts` (שטח W6-C). |
| 4 | סיווג העדפות/מעקבים | `classifyCustomerMemory` נגזר מתיוג/כותרת (`העדפ/תקשורת`, `מעקב/הבטח`). אם ייקבע tag-vocabulary קנוני לזיכרון — לעדכן שם (מקום אחד). |
| 5 | פקודת "אילו מקורות תומכים בהמלצה?" | אין צ'יפ "המלצה" ב-Copilot; הפקודה בוחרת לפי צ'יפ לקוח/ליד/קריאה (התאמת entityRef) ואחרת ההמלצה העדכנית, ומצהירה על כך ב-reason. אם יתווסף צ'יפ המלצה — לחווט אותו ל-`recommendationEvidenceOp`. |
| 6 | חשיפת פריט רגיש | נרשמת ל-auditEvents עם actor קבוע `CEO_USER_ID` (אין מודל משתמשים מרובים במצב ההדגמה). כשיהיה זהות משתמש אמיתית — להעביר את המזהה מהסשן. |
| 7 | סיכום שיחה להצעת זיכרון | נבנה מ-6 הודעות המשתמש האחרונות (localStorage history). אם W5-D יחליט להעביר את ההיסטוריה לרשומות — לעדכן את הגזירה ב-CopilotWorkspace. |

## מה לא נגעתי בו (מחוץ להרשאה)

`src/app/**`, `src/domain/**`, `src/memory/**`, `src/knowledge/**`,
`src/learning/**`, `src/agents/**`, קונפיגים משותפים, tests מחוץ ל-
`tests/modules-w6-wiring/`. כל הצריכה מהדומיינים היא import בלבד.
