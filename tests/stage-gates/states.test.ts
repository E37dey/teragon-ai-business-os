// W7-C — all SEVEN gate states are reachable through real flows.
import { describe, expect, it } from "vitest";
import { STAGE_GATE_V2_STATES, type StageGateV2State } from "@/domain/stage-gates";
import { freshBridged } from "./helpers";

describe("all 7 gate states are reachable", () => {
  it("reaches every state via genuine flows (no shortcuts)", async () => {
    const { svc } = await freshBridged();
    const seen = new Map<StageGateV2State, string>();

    const record = async (gateId: string): Promise<void> => {
      const { validation } = await svc.validateOne(gateId);
      if (!seen.has(validation.state)) seen.set(validation.state, gateId);
    };

    // initial honest states
    await record("sg-4"); // לא התחיל
    await record("sg-1"); // חסרות ראיות
    await record("sg-2"); // בבדיקה

    // Go — G2 is genuinely decision-ready
    await svc.decideGo("sg-2", "u-tzachi");
    await record("sg-2"); // Go

    // No-Go — G1 refused with a reason
    await svc.decideNoGo("sg-1", "u-tzachi", "חסר מסמך מטרת הפתרון");
    await record("sg-1"); // No-Go

    // נפתח מחדש — reopen the No-Go
    await svc.reopen("sg-1", "u-tzachi", "נוצר מסמך מטרה חדש לבדיקה");
    await record("sg-1"); // נפתח מחדש

    // פג תוקף — a Go whose evidence no longer resolves
    const g2 = (await svc.validateOne("sg-2")).gate;
    const tm1 = g2.v2.attachedEvidence.find((r) => r.refId === "tm-1");
    expect(tm1).toBeDefined();
    if (tm1) await svc.detachEvidence("sg-2", tm1.id, "u-tzachi");
    await record("sg-2"); // פג תוקף

    for (const state of STAGE_GATE_V2_STATES) {
      expect(seen.has(state), `state "${state}" was not reached`).toBe(true);
    }
    expect(seen.size).toBe(7);
  });
});
