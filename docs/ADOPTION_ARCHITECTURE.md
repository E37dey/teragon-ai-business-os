# ADOPTION ARCHITECTURE — תכנית ההטמעה (Wave 7, W7-A)

23.07.2026 · Phases 7.1–7.3 · בעלות: `src/domain/adoption/**`, `src/modules/implementation/**`, `src/repositories/implementationStores.ts`, `tests/implementation/**`.

## מהות

תכנית ההטמעה היא **מערכת הפעלה של האימוץ, לא אירוע**: רשומה קנונית אחת (`iprog-teragon`)
עם 6 שלבי אימוץ, אבני דרך, סיכונים, ראיות מוקלדות לרשומות אמת, החלטות Go/No-Go,
5 גלי הרחבה, הגדרת פיילוט — ותוצאות פיילוט **נמדדות-בלבד**.

התוכן שוכתב מחבילת ההטמעה התורמת (`teragon-final/docs/training/*.docx`) לרשומות
מוקלדות — אין הטמעת HTML ישן.

## שכבות

| שכבה | קובץ | תפקיד |
|---|---|---|
| ישויות | `src/domain/adoption/types.ts` | ImplementationProgramme (baselineState/approvalState/version), AdoptionStage (embedded ×6), ImplementationOwner (embedded, אנשים בשם), Milestone, Risk, Evidence (ref מוקלד), Decision, RolloutWave (×5), PilotDefinition, PilotResult |
| ולידציה | `src/domain/adoption/schemas.ts` | zod לכל ישות; אוכף: בדיוק 6 שלבים בשמות הקנוניים, baselineState עקבי עם המדדים, החלטה מוכרעת מחייבת מחליט+תאריך, PilotResult ללא שדות ריקים |
| גשר seed | `src/domain/adoption/stageBridge.ts` | C4 (החלטת Lead): `alignSeedStages` משכתב את רשומות `implementationStages` (is-1..is-6) לשמות האימוץ הקנוניים 1:1 לפי סדר, שומר את השם הישן ב-`legacyName`; `stageNameMismatches` מדווח שאריות |
| שער ראיות | `src/domain/adoption/evidenceEligibility.ts` | פרדיקט טהור: ראיה קבילה ⇔ הרשומה קיימת + מאושרת כשרלוונטי; טיוטה/ממתין/נדחה/ארכיון חוסמים; ref=null ⇒ "חסרה ראיה" |
| החלטות | `src/domain/adoption/decisions.ts` | `decideGate`: Go נדחה כל עוד ראיה כלשהי אינה קבילה (אין שער על אחוז); No-Go מחייב נימוק; כל הכרעה כותבת AuditEvent |
| Selectors | `src/domain/adoption/selectors.ts` | בריאות תכנית, סיכון חוסם, ראיות חסרות, אחראי באיחור, ההחלטה הבאה, מוכנות פיילוט ("חסרות ראיות"/"טרם נמדד"), מיפוי סטטי שלב→תוצרי הגשה |
| Bootstrap | `src/domain/adoption/bootstrap.ts` | `ensureImplementationProgramme` — אידמפוטנטי (ids יציבים); יוצר את תכנית טרגון האחת |
| Stores | `src/repositories/implementationStores.ts` | seam מוקלד מעל אוספי Wave-7 + גשרי קריאה (users/personas/trainingMaterials/audit) + escape hatch לרזולוציית ראיות |
| UI | `src/modules/implementation/ImplementationPage.tsx` | העמוד `/implementation` (ראו למטה) |
| מפה | `src/modules/implementation/AsIsToBe.tsx` | Phase 7.3 (ראו למטה) |

## חוזה הכנות (mandatory)

- **קו בסיס**: `BaselineMetric.value=null` ⇒ "לא הוגדר קו בסיס". מספרי המסמך התורם
  (8 שעות/שבוע, 10–20 דק׳) מופיעים אך ורק כהערכות בשדה `methodHe` — לעולם לא כערך מדוד.
- **פיילוט**: `PilotResult` הוא רשומת-מדידה בלבד (כל השדות חובה, כולל שיטה ומודד);
  היעדר רשומה **הוא** מצב "טרם נמדד". ה-bootstrap לא יוצר אף תוצאה. יעדי WAU/NPS
  מהמסמך התורם = יעד פיילוט עם הערת מקור (החלטת Lead).
- **שלב נוכחי**: `as-4` (פיילוט מבוקר), סטטוס "בתהליך" — לא הושלם, אין הצלחת פיילוט מפוברקת.
  שלבים 1–3 "הושלם" כי התוצרים קיימים כרשומות אמת (metricDefinitions, controls,
  personas ×7, trainingMaterials ×13) — אבל **כל 6 החלטות השער נותרות "ממתין"**.
- **החלטות**: schema דוחה החלטה בלי מחליט/תאריך; `decideGate` דוחה Go עם ראיות חסרות
  וכותב audit לכל הכרעה.
- **בעלים**: תמיד אנשים בשם מה-seed (צחי זוסטייהם, נעה פרידמן); ה-bootstrap נכשל אם
  משתמש נדרש חסר.
- **תאריכי יעד** מוצגים כ"יעד", רק `startDate` (עוגן ה-seed) הוא עובדה.

## העמוד `/implementation`

- **TOP**: KPI נגזרים (שלבים 3/6, ראיות קבילות 6/12, סיכונים 6, החלטות ממתינות 6,
  מצב פיילוט "חסרות ראיות", קו בסיס "לא הוגדר") + פאנל השלב הנוכחי.
- **CENTER**: 6 כרטיסי שלב RTL — אחראי בשם, מטרה, תאריכים, סטטוס, תוצרים,
  ראיות נדרשות מול קיימות, סיכונים, פעולה הבאה, שער הבא, מצב Go/No-Go.
  כרטיס ← Drawer עם טאבים סקירה/תוצרים/ראיות/סיכונים/החלטות/היסטוריה
  (היסטוריה = AuditEvents אמיתיים בלבד ⇒ empty state כן עד להחלטה ראשונה).
- **BOTTOM**: ציר זמן Gantt ב-SVG טהור (ללא ספרייה) + 5 גלי ההרחבה עם קריטריוני כניסה.
- **AS-IS/TO-BE**: משולב בעמוד עם מתגי תצוגה (עמוד/מצגת) וכפתור הדפסה אמיתי.
- **PageRail "מבקר ההטמעה"**: סיכון חוסם, ראיות חסרות, אחראי באיחור, ההחלטה הבאה,
  מוכנות פיילוט, הפעולה הבאה, תוצרי הגשה מושפעים (מיפוי סטטי) — הכול נגזר.

## AS-IS / TO-BE (Phase 7.3)

`AsIsToBe.tsx` — התוכן המחויב המדויק: **5** שלבי AS-IS, **7** שלבי TO-BE (◆ = נקודת AI),
**6** פריטי "נשאר באחריות אדם", **5** פריטי "אסור להעביר ל-AI" (שוכתב מהמסמך התורם;
רשימות 4+4 של המסמך הורחבו לספירות המחויבות — הפריטים שנוספו נגזרים ממדיניות קיימת:
סף ביטחון 70%, בדיקת VIP, בעלות אדם על החלטות Go/No-Go).

שלוש תצוגות: `app` (זרימה כהה, tokens בלבד) · `print` (`@media print`: רקע בהיר, A4
portrait, `break-inside: avoid` — חריגת "אין מצב בהיר" מנדטורית להדפסה בלבד) ·
`presentation` (מסגרת 1280×720 = 16:9; כל תיבה ממוקמת ע"י `computeMapLayout` —
מתמטיקת פריסה טהורה שנבדקת ב-test על אי-חפיפה של כל זוג תיבות).

## מודל הנתונים בפועל (bootstrap)

תכנית 1 · שלבים 6 (embedded) · אבני דרך 6 · סיכונים 6 · ראיות 12 (מהן 6 "חסרה ראיה"
בכוונה — כנות) · החלטות 6 (כולן ממתינות) · גלים 5 · פיילוט 1 · תוצאות פיילוט **0**.

## בדיקות (`tests/implementation/**`, 66)

schemas (ולידציה+ספירות 6/5) · bootstrap (אידמפוטנטיות, מצבים כנים, בעלים בשם,
מיגרציית C4+legacyName) · evidenceEligibility (draft/pending/rejected/missing חוסמים) ·
decisions (Go נחסם על ראיה חסרה, audit לכל הכרעה, אין הכרעה כפולה) ·
selectors ("טרם נמדד"/"חסרות ראיות", בריאות, סיכון חוסם) · asIsToBe (ספירות מדויקות,
אי-חפיפה, print stylesheet) · page (6 כרטיסים, 5 גלים, drawer, rail).
