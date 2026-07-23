// W5-E functional integration — Phase 5.16 flow 6: multi-agent collaboration
// with a detected conflict routed to HUMAN review. A DISTINCT scenario from
// the packaged demo (different run id, goal, requester, resolution action and
// an execution payload behind the gate) — extending, not duplicating,
// tests/agents/demoScenario.test.ts.
// Hunter recommends an engineering-materials printer, Wiki cross-references
// approved knowledge, Fixer surfaces the open-service-ticket risk on the
// recommended model ⇒ conflict ⇒ the orchestrator NEVER decides alone.
import { describe, expect, it } from "vitest";
import {
  LocalRulesProvider,
  repositoryDataAccess,
} from "@/ai/providers/LocalRulesProvider";
import { ProviderRegistry } from "@/ai/providers/registry";
import { AgentOrchestrator, type PlannedStep } from "@/agents/orchestrator";
import { ApprovalEngine } from "@/agents/approvalEngine";
import { resolveConflict } from "@/agents/conflicts";
import { collectRunRecords } from "@/repositories/agentStores";
import { runGraph, runTimeline, successFailureCounts } from "@/agents/selectors";
import { freshStores, makeClock } from "../helpers";

const RUN_ID = "it-collab-run-1";
const GOAL_HE = "בחירת מדפסת לסדנת חלקים טכניים — כולל בדיקת עומס שירות";

/** Same specialist trio, DIFFERENT commissioning: workshop procurement. */
const PLAN: readonly PlannedStep[] = [
  {
    agentId: "ag-hunter",
    operation: "recommend.printer-match",
    domain: "printerModels",
    titleHe: "התאמת דגם לסדנת חלקים טכניים",
    params: {
      useCase: "חלקים טכניים",
      materials: ["PETG", "ABS"],
      buildVolume: "בינוני",
      budget: 3600,
    },
  },
  {
    agentId: "ag-wiki",
    operation: "explain.recommendation",
    domain: "aiRecommendations",
    titleHe: "הצלבת ידע מאושר על הדפסת PETG",
    relatedEntities: [{ type: "aiRecommendation", id: "rec-2" }],
  },
  {
    agentId: "ag-fixer",
    operation: "explain.recommendation",
    domain: "aiRecommendations",
    titleHe: "בדיקת עומס שירות לדגם המוביל",
    relatedEntities: [{ type: "aiRecommendation", id: "rec-2" }],
  },
] as const;

describe("flow 6 — collaboration: Hunter+Wiki+Fixer → conflict → human review path", () => {
  it("detects the support-risk conflict and parks at the human gate", async () => {
    const stores = freshStores();
    const clock = makeClock();
    const local = new LocalRulesProvider(repositoryDataAccess(), {
      now: clock,
      idFactory: (n) => `it-collab-env-${n}`,
    });
    const registry = new ProviderRegistry(
      { remoteEnabled: false, localFallbackPermitted: true },
      { remote: local, local },
    );
    const orchestrator = new AgentOrchestrator({ stores, registry, clock });

    const result = await orchestrator.startRun({
      goal: GOAL_HE,
      requestedById: "user-1",
      runId: RUN_ID,
      plan: [...PLAN],
      approval: {
        action: "customer-message",
        executionPayload: null,
        previewHe: "הצגת ההמלצה למנהל הסדנה עם גילוי נאות על קריאות השירות",
      },
    });

    // three specialists really ran
    expect(result.run.specialistAgentIds).toEqual(["ag-hunter", "ag-wiki", "ag-fixer"]);
    expect(result.outputs).toHaveLength(3);
    // a REAL conflict was detected from the specialists' evidence vs. tickets
    expect(result.conflicts.length).toBeGreaterThanOrEqual(1);
    const conflict = result.conflicts[0];
    expect(conflict?.agentIds).toEqual(["ag-hunter", "ag-fixer"]);
    expect(conflict?.resolution).toBeNull();
    // conflict ⇒ human gate, ALWAYS — the run parks pending approval
    expect(result.run.status).toBe("ממתין לאישור");
    expect(result.approval?.status).toBe("ממתין");

    // ---- human review path: a DIFFERENT resolution action than the demo ----
    await resolveConflict(stores, clock, {
      runId: RUN_ID,
      conflictId: conflict?.id as string,
      action: "בקש חלופה",
      resolvedById: "user-1",
      noteHe: "לבקש מ-Hunter דגם חלופי ללא קריאות שירות פתוחות",
    });
    const resolved = await stores.conflicts.get(conflict?.id as string);
    expect(resolved?.resolution).toContain("בקש חלופה");
    expect(resolved?.resolvedById).toBe("user-1");

    // second resolution attempt is refused — the decision is final
    await expect(
      resolveConflict(stores, clock, {
        runId: RUN_ID,
        conflictId: conflict?.id as string,
        action: "אשר חריגה",
        resolvedById: "user-1",
      }),
    ).rejects.toMatchObject({ code: "AGENT_APPROVAL_STATE_INVALID" });

    // the human decision is an event + an audit record
    const events = (await stores.events.list()).filter((e) => e.runId === RUN_ID);
    const resolvedEvent = events.find((e) => e.type === "ConflictResolved");
    expect(resolvedEvent).toBeDefined();
    const audits = await stores.audit.list();
    expect(audits.some((a) => a.action === "conflict.resolve")).toBe(true);

    // close the loop: the pending approval is decided, the run completes
    const engine = new ApprovalEngine({ stores, clock });
    await engine.decide({
      runId: RUN_ID,
      approvalId: result.approval?.id as string,
      kind: "approve",
      decidedById: "user-1",
      noteHe: "לאחר קבלת חלופה — ההמלצה תוצג עם הגילוי הנאות",
    });
    expect((await stores.runs.get(RUN_ID))?.status).toBe("הושלם");

    // selectors: graph shows the decided conflict; per-agent success counts
    const records = await collectRunRecords(stores, RUN_ID);
    const graph = runGraph(records);
    const conflictNode = graph.nodes.find((n) => n.kind === "conflict");
    expect(conflictNode?.status).toBe("הוחלט");
    const types = runTimeline(records).map((t) => t.type);
    expect(types).toContain("ConflictDetected");
    expect(types).toContain("ConflictResolved");
    expect(types).toContain("AgentRunCompleted");
    for (const agentId of ["ag-hunter", "ag-wiki", "ag-fixer"]) {
      expect(successFailureCounts(records.events, agentId)).toEqual({ success: 1, failure: 0 });
    }
  });
});
