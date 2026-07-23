# W5-C → Integration Requests (Wave 5)

23.07.2026 · מאת: W5-C (Agent Orchestration Engine)

## ל-W5-D (UI) — איך מחברים את המנוע

הכל דרך `src/agents/index.ts` (המשטח הציבורי). אין תלות ב-`src/ai` הקונקרטי.

### הפעלת ריצה

```ts
import { AgentOrchestrator } from "@/agents";
import { agentStores } from "@/repositories/agentStores";
import { LocalRulesProvider, repositoryDataAccess } from "@/ai/providers/LocalRulesProvider";
import { ProviderRegistry } from "@/ai/providers/registry";

const local = new LocalRulesProvider(repositoryDataAccess());
const registry = new ProviderRegistry(
  { remoteEnabled: false, localFallbackPermitted: true }, // Mode A
  { remote: local, local },
);
const orchestrator = new AgentOrchestrator({ stores: agentStores(), registry });
const result = await orchestrator.startRun({ goal, requestedById, plan? , approval? });
// result: { run, outputs, conflicts, approval, summaryHe }
```

- ריצה עם אישור נדרש נעצרת ב-`status:"ממתין לאישור"`; אחרת `"הושלם"`.
- שגיאות: `AgentGovernanceError` (code + userMessageHe + limit) או `AIError`.
  להציג `userMessageHe` בלבד.
- ביטול משתמש: `orchestrator.cancelRun(runId, byId, reasonHe)`.
- העברת משימה: `orchestrator.requestHandoff(...)` — עומק/לולאות נאכפים.

### אישורים (מרכז ההחלטות)

```ts
const engine = orchestrator.approvals; // או new ApprovalEngine({ stores, externalHandlers })
await engine.decide({ runId, approvalId, kind: "approve" | "edit" | "reject", decidedById, noteHe?, editedPayload? });
await engine.execute(runId, approvalId, executorId);       // רק אחרי אישור/עריכה
await engine.rollback(runId, approvalId, actorId);          // task-creation / record-field-change
await engine.retryFailedExecution(runId, approvalId, id);   // אחרי ביצוע כושל
await engine.expire(runId, approvalId, "system");
await engine.workflowState(runId, approvalId);              // מצב מורחב נגזר-אירועים
```

`externalHandlers` הוא ה-seam של W5-D למוטציות אמיתיות (הודעות, עדכוני
רשומות מחוץ לשני ה-handlers המובנים). בלי handler — כשל כן, לא הצלחה מזויפת.

### גרף ותצוגות (נגזרות רשומות בלבד)

```ts
import { collectRunRecords } from "@/repositories/agentStores";
import { runGraph, runTimeline, agentQueueSizes, pendingApprovals, successFailureCounts } from "@/agents";

const records = await collectRunRecords(agentStores(), runId);
const graph = runGraph(records);        // nodes/edges: run·agent·task·conflict·approval
const timeline = runTimeline(records);  // אירועים ממוינים + תוויות עברית
```

### הקונפליקטים

```ts
import { resolveConflict, CONFLICT_RESOLUTION_ACTIONS } from "@/agents";
await resolveConflict(agentStores(), clock, { runId, conflictId, action, resolvedById, noteHe });
```

### תרחיש ההדגמה למסך /agents

```ts
import { runDemoScenario, DEMO_RUN_ID } from "@/agents";
const demo = await runDemoScenario(); // אידמפוטנטי — בטוח בכל טעינה
```

## בקשות אינטגרציה

1. **W5-D:** לחווט את `externalHandlers` של מנוע האישורים לפעולות UI אמיתיות
   (שליחת הודעה, עדכון הצעה) — המנוע מסרב לבצע בלעדיהם (by design).
2. **W5-D:** מסך /agents/collaboration — לצרוך `runGraph`/`runTimeline` בלבד;
   לא לגזור גרף מרשומות ה-seed הסטטיות הישנות.
3. **W5-B (שרת):** כשה-Remote provider יעבור אימות, אין שינוי נדרש במנוע —
   מחליפים רק את קונפיגורציית ה-Registry (`remoteEnabled:true`). ההוצאה
   הנמדדת (usage.measured) תתחיל להיספר מול `maxUsageBudgetILS` אוטומטית.
4. **Wave 6 / בעל הסכימה:** מוצע לאחד את מצבי ה-Approval המורחבים
   (edited/expired/cancelled) לתוך `ApprovalStatus` הדומייני בגרסת סכימה
   הבאה — כיום הם נגזרים מאירועים (מתועד ב-AGENT_GOVERNANCE.md).
5. **Seed (בעל seedData):** רשומת ה-seed של Nexa מתארת "עוזר אישי למנכ\"ל";
   מפרט W5-C קובע "סוכן שיווק וצמיחה". ההגדרה הקפואה נוקטת במפרט — מומלץ
   ליישר את שדה ה-purpose ב-seed בגל עדכון seed הבא (W5-C אינו נוגע בקבצי
   repositories קיימים).

## מה W5-C לא עשה בכוונה

- לא נגע ב-`src/ai/**`, `netlify/**`, `src/server/**`, `src/modules/**`,
  `src/app/**`, `src/domain/types.ts`, קבצי repositories קיימים, package.json.
- לא רץ merge/rebase מול main (W5-B התמזג במקביל) — ההתמזגות אצל מוביל
  האינטגרציה.
