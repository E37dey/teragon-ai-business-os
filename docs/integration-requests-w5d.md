# W5-D → Integration Requests (Wave 5)

23.07.2026 · מאת: W5-D (AI Product UI & Approval Experience)

## 1. חיווט ה-Copilot ל-OsShell (הבקשה המרכזית)

ה-Copilot מלא וממומש ב-`src/modules/ai-copilot/` (CopilotWorkspace + CopilotProvider +
useCopilot). **מיקום ביניים:** עד לחיווט ה-Shell, מרכז הפיקוד (/) מארח את ה-Drawer
בעצמו (כפתור "AI Copilot" בכותרת — `data-testid="open-copilot"`). לאחר החיווט ל-Shell
יש להסיר את המעטפת הזמנית מ-`CommandCenterPage.tsx` (מסומנת בהערת "interim Copilot
mount") — ה-Provider יעלה רמה אחת.

### הסניפט המדויק ל-`src/app/OsShell.tsx`

```tsx
import CopilotWorkspace from "@/modules/ai-copilot/CopilotWorkspace";
import { CopilotProvider } from "@/modules/ai-copilot/copilotContext";
import { useCopilot } from "@/modules/ai-copilot/copilotApi";

// 1) עוטפים את התוכן — בתוך RailProvider, סביב OsShellInner:
export default function OsShell(): ReactElement {
  return (
    <RailProvider>
      <CopilotProvider>
        <OsShellInner />
        <CopilotWorkspace />
      </CopilotProvider>
    </RailProvider>
  );
}

// 2) בתוך OsShellInner — מחברים את כרטיס ה-Copilot של הניווט:
//    (RightPrimaryNavigation תומך ב-copilotSlot; לחלופין onAsk)
function NavCopilotCard(): ReactElement {
  const { openCopilot } = useCopilot();
  return (
    <button
      type="button"
      onClick={openCopilot}
      className="os-copilot-card"
      aria-label="פתיחת AI Copilot"
    >
      {/* התוכן הקיים של כרטיס ה-Copilot (GlowOrb + "שאל כל דבר…") */}
    </button>
  );
}
// ולהעביר: <AppShell … copilotSlot={<NavCopilotCard />} />
```

`useCopilot()` זמין לכל קומפוננטה מתחת ל-Provider (open/openCopilot/closeCopilot/
toggleCopilot). ה-Drawer סוגר ב-ESC/overlay (רכיב Drawer של מערכת העיצוב).

## 2. מיפוי הפקודות — אילו פעולות מומלץ להעביר ל-LocalRulesProvider

רישום הפקודות: `src/modules/ai-copilot/commands.ts` (אין העברה חופשית — קלט לא ממופה
מקבל "הפקודה אינה נתמכת עדיין" + רשימת הנתמכות). 5 פקודות ממומשות כפעולות מקומיות של
המודול (`src/modules/ai-copilot/ops.ts`, provider="local-rules", model=null, usage
unmeasured) כי `src/ai` אסור ל-W5-D. מומלץ להעבירן ל-LocalRulesProvider בגל הבא:

| פקודה                                           | פעולה מודולרית כיום              | יעד מוצע ב-LocalRulesProvider           |
| ----------------------------------------------- | -------------------------------- | --------------------------------------- |
| מי מהלקוחות עדיין לא קיבל מענה?                 | `copilot.unanswered-customers`   | `summarize.unanswered-customers`        |
| הצג הצעות מחיר ללא תגובה                        | `copilot.quotations-no-response` | `summarize.quotations-no-response`      |
| אילו תלמידים אינם מתקדמים?                      | `copilot.stuck-students`         | `summarize.stuck-students`              |
| הצג תקלות חוזרות לפי דגם מדפסת                  | `copilot.recurring-faults`       | `summarize.recurring-faults`            |
| מצא לקוחות המתאימים לקורס מתקדם (ללא צ'יפ לקוח) | `copilot.course-fit-scan`        | הרחבת `recommend.course-fit` למצב סריקה |

בנוסף: 6 פעולות תכנון האוטומציות (`src/modules/automations/planOps.ts`,
`automation.plan.*`) — מועמדות לאותו מסלול.

4 פקודות רצות ישירות דרך הספק מה-Registry (Mode A ⇒ LocalRulesProvider):
`summarize.weekly-leads`, `recommend.follow-up`, `summarize.meetings`,
`summarize.monthly-activity`, וכן `recommend.course-fit` כשנבחר צ'יפ לקוח.

## 3. בחירת שכבת ההתמדה של שיחות ה-Copilot

**localStorage** (מפתח `teragon.copilot.history.v1`) ולא repository: השיחה היא מצב UI
אישי של המשתמש בדפדפן, לא רשומה עסקית — אין לה סכימה דומיינית, אין seed ואין audit.
כל מה שעסקי (ריצות, אישורים, ראיות, ביקורת) נשמר דרך המנוע ב-repositories. אם בגל 6
יוגדר אוסף `copilotConversations` — ההחלפה נקודתית (loadHistory/persist בלבד).

## 4. השבתת חירום — בקשה להעברת האכיפה למנוע

ההגדרות של W5-C קפואות (Object.freeze) ולכן ההשבתה נשמרת בשדה `status` של רשומת
ה-agents (ערך `"מושבת"`). האכיפה כיום היא צד-UI: **כל** הפעלת ריצה של W5-D עוברת דרך
`startGuardedRun` (`src/components/ai/engine.ts`) שקורא `assertAgentsEnabled` ומסרב
בעברית. **בקשה ל-W5-C/גל 6:** להוסיף את אותה בדיקה בתוך `AgentOrchestrator.startRun`
(מול stores.agents) כך שהאכיפה תהיה מנועית ולא תלוית-קורא.

## 5. externalHandlers שהוזרקו (הביצוע הכן)

`src/components/approval/externalHandlers.ts` מזריק handlers ל-
`customer-message` / `external-notification` / `external-automation`: ביצוע מאושר
יוצר רשומות **Task + Activity** אמיתיות עם התווית "ביצוע מקומי מתועד — שליחה חיצונית
אמיתית אינה נתמכת במצב הדגמה". פעולות ללא handler נכשלות בכנות (by design). שליחה
חיצונית אמיתית מוצגת בכל מקום ככפתור disabled עם סיבה.

"בקש תיקון" ב-ApprovalPanel ממומש כדחייה מנומקת (prefix "בקשת תיקון:") — לרשומת
ה-Approval של דור 1 אין מצב revision; מוצע למיזוג הסכימה של גל 6 (יחד עם בקשה 4 של
W5-C).

## 6. עדכון בדיקה משותפת (סטייה מתועדת)

`tests/router.test.tsx` — הבדיקה "placeholder pages state their wave honestly" בדקה
ש-`/agents` הוא placeholder של גל 5; W5-D בנה את המסך, ולכן הבדיקה הוסבה ל-`/memory`
(placeholder של גל 6). שינוי מינימלי הכרחי מחוץ לתיקיות הבלעדיות.

## 7. מה W5-D לא עשה בכוונה

- לא נגע ב-`src/app/**` (מלבד ההערה: ה-Copilot ממוקם זמנית במרכז הפיקוד — בתיקייה
  המורשית `src/modules/command-center/**`), `src/agents/**`, `src/ai/**`,
  `src/server/**`, `netlify/**`, `src/domain/**`, `src/repositories/**`,
  design-system/layout/styles, `package.json`.
- לא רץ merge מול main — אצל מוביל האינטגרציה.
- שליחה חיצונית אמיתית (מייל/SMS/רשתות) לא מומשה ולא זויפה — disabled עם סיבה בעברית.
