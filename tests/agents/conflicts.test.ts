// W5-C — conflict detection (demo rule + generic contradiction) and the 5
// audited resolution actions. The orchestrator never silently picks a side.
import { describe, expect, it } from "vitest";
import type { AgentConflict, ServiceTicket } from "@/domain/types";
import {
  CONFLICT_RESOLUTION_ACTIONS,
  detectConflicts,
  resolveConflict,
  type SpecialistOutput,
} from "@/agents/conflicts";
import { SEED } from "@/repositories";
import { freshStores, makeClock, makeEnvelope, makeEvidence } from "./helpers";

const seedTickets = SEED.serviceTickets as readonly ServiceTicket[];

function hunterPrinterOutput(modelName: string, sourceId: string): SpecialistOutput {
  return {
    taskId: "t-run-task-1",
    agentId: "ag-hunter",
    envelope: makeEnvelope({
      operation: "recommend.printer-match",
      recommendation: `ההתאמה המובילה: ${modelName}`,
      evidence: [makeEvidence({ title: `דגם: ${modelName}`, sourceId })],
    }),
  };
}

function fixerOutput(): SpecialistOutput {
  return {
    taskId: "t-run-task-3",
    agentId: "ag-fixer",
    envelope: makeEnvelope({
      operation: "explain.recommendation",
      recommendation: "היסטוריית שירות נבדקה",
      evidence: [makeEvidence({ sourceId: "rec-2", title: "המלצה: פתרון וורפינג" })],
    }),
  };
}

describe("detectConflicts — deterministic demo rule", () => {
  it("Hunter recommends P1S while an open ticket exists ⇒ Hunter/Fixer conflict", () => {
    const outputs = [hunterPrinterOutput("Bambu Lab P1S", "pm-3"), fixerOutput()];
    const conflicts = detectConflicts(outputs, { serviceTickets: seedTickets });
    expect(conflicts).toHaveLength(1);
    const c = conflicts[0];
    expect(c?.detail.participants).toEqual(["ag-hunter", "ag-fixer"]);
    expect(c?.descriptionHe).toContain("Bambu Lab P1S");
    // both sides carry claims + evidence refs; open ticket t-3 cited by Fixer
    expect(c?.detail.claims).toHaveLength(2);
    expect(c?.detail.claims[1]?.evidenceRefs).toContain("t-3");
    expect(c?.detail.missingEvidenceHe.length).toBeGreaterThan(0);
    expect(c?.detail.humanDecisionState).toBe("ממתין להחלטה");
  });

  it("no conflict when the recommended model has no open tickets", () => {
    const outputs = [hunterPrinterOutput("Prusa MK4", "pm-5"), fixerOutput()];
    // t-4 (MK4) is "טופל" — closed, not support load
    const conflicts = detectConflicts(outputs, { serviceTickets: seedTickets });
    expect(conflicts).toHaveLength(0);
  });

  it("no demo conflict without a Fixer participant", () => {
    const outputs = [hunterPrinterOutput("Bambu Lab P1S", "pm-3")];
    const conflicts = detectConflicts(outputs, { serviceTickets: seedTickets });
    expect(conflicts).toHaveLength(0);
  });

  it("deterministic: same inputs ⇒ identical result", () => {
    const outputs = [hunterPrinterOutput("Bambu Lab P1S", "pm-3"), fixerOutput()];
    const a = detectConflicts(outputs, { serviceTickets: seedTickets });
    const b = detectConflicts(outputs, { serviceTickets: seedTickets });
    expect(a).toEqual(b);
  });
});

describe("detectConflicts — generic claim contradiction", () => {
  it("opposing stances over the same cited record are flagged", () => {
    const outputs: SpecialistOutput[] = [
      {
        taskId: "t-a",
        agentId: "ag-nexa",
        envelope: makeEnvelope({
          recommendation: "מומלץ לקדם את הליד למסלול הצעה",
          evidence: [makeEvidence({ sourceId: "l-3" })],
        }),
      },
      {
        taskId: "t-b",
        agentId: "ag-mentor",
        envelope: makeEnvelope({
          recommendation: "אזהרה: זוהתה בעיה ברשומה זו",
          evidence: [makeEvidence({ sourceId: "l-3" })],
        }),
      },
    ];
    const conflicts = detectConflicts(outputs, { serviceTickets: [] });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.detail.participants).toEqual(["ag-nexa", "ag-mentor"]);
  });

  it("no conflict when the shared record has agreeing stances", () => {
    const outputs: SpecialistOutput[] = [
      {
        taskId: "t-a",
        agentId: "ag-nexa",
        envelope: makeEnvelope({
          recommendation: "מומלץ לקדם",
          evidence: [makeEvidence({ sourceId: "l-3" })],
        }),
      },
      {
        taskId: "t-b",
        agentId: "ag-mentor",
        envelope: makeEnvelope({
          recommendation: "מומלץ גם כן",
          evidence: [makeEvidence({ sourceId: "l-3" })],
        }),
      },
    ];
    expect(detectConflicts(outputs, { serviceTickets: [] })).toHaveLength(0);
  });
});

describe("resolveConflict — the 5 audited human actions", () => {
  async function seedConflict(id: string) {
    const stores = freshStores();
    const clock = makeClock();
    const ts = clock();
    const conflict: AgentConflict = {
      id,
      createdAt: ts,
      updatedAt: ts,
      taskId: "r-c-task-1",
      agentIds: ["ag-hunter", "ag-fixer"],
      description: "קונפליקט בדיקה",
      resolution: null,
      resolvedById: null,
      resolvedAt: null,
    };
    await stores.conflicts.create(conflict);
    return { stores, clock };
  }

  it("each of the 5 actions resolves, emits an event and writes an audit record", async () => {
    expect(CONFLICT_RESOLUTION_ACTIONS).toHaveLength(5);
    for (const action of CONFLICT_RESOLUTION_ACTIONS) {
      const id = `w5c-conf-${CONFLICT_RESOLUTION_ACTIONS.indexOf(action)}`;
      const { stores, clock } = await seedConflict(id);
      const resolved = await resolveConflict(stores, clock, {
        runId: "r-c",
        conflictId: id,
        action,
        resolvedById: "u-tzachi",
        noteHe: "החלטה מנומקת",
      });
      expect(resolved.resolution).toContain(action);
      expect(resolved.resolvedById).toBe("u-tzachi");
      expect(resolved.resolvedAt).not.toBeNull();
      const events = (await stores.events.list()).filter((e) => e.runId === "r-c");
      expect(events.find((e) => e.type === "ConflictResolved")?.event).toMatchObject({
        conflictId: id,
        action,
        resolvedById: "u-tzachi",
      });
      const audits = (await stores.audit.list()).filter((a) => a.action === "conflict.resolve");
      expect(audits.some((a) => a.entityRef === `agent-conflict:${id}`)).toBe(true);
    }
  });

  it("an already-resolved conflict cannot be resolved again", async () => {
    const { stores, clock } = await seedConflict("conf-once");
    await resolveConflict(stores, clock, {
      runId: "r-c",
      conflictId: "conf-once",
      action: "אשר חריגה",
      resolvedById: "u-tzachi",
    });
    await expect(
      resolveConflict(stores, clock, {
        runId: "r-c",
        conflictId: "conf-once",
        action: "דחה את ההמלצה",
        resolvedById: "u-tzachi",
      }),
    ).rejects.toMatchObject({ code: "AGENT_APPROVAL_STATE_INVALID" });
  });

  it("resolving a missing conflict throws a structured error", async () => {
    const stores = freshStores();
    await expect(
      resolveConflict(stores, makeClock(), {
        runId: "r-c",
        conflictId: "conf-missing",
        action: "בקש חלופה",
        resolvedById: "u-tzachi",
      }),
    ).rejects.toMatchObject({ code: "AGENT_RUN_NOT_FOUND" });
  });
});
