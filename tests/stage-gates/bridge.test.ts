// W7-C — the idempotent V2 bridge over the six seeded records + the HONEST
// initial states: nothing fabricated, only genuinely-existing refs attached.
import { describe, expect, it } from "vitest";
import { StageGateError, isStageGateV2 } from "@/domain/stage-gates";
import { fresh, freshBridged } from "./helpers";

describe("StageGateV2 bridge", () => {
  it("annotates all six seeded records exactly once (idempotent)", async () => {
    const { svc, stores } = fresh();
    const first = await svc.ensureBridge();
    expect(first).toEqual({ bridged: 6, alreadyBridged: 0 });
    const second = await svc.ensureBridge();
    expect(second).toEqual({ bridged: 0, alreadyBridged: 6 });
    const gates = await stores.gates.list();
    expect(gates.filter(isStageGateV2)).toHaveLength(6);
    // no duplicated bootstrap evidence after the second run
    const g1 = gates.find((g) => g.id === "sg-1");
    expect(g1 && isStageGateV2(g1) ? g1.v2.attachedEvidence : []).toHaveLength(7);
  });

  it("writes one bridge audit event per gate — and none on the second run", async () => {
    const { svc, stores } = fresh();
    await svc.ensureBridge();
    const after1 = (await stores.audit.list()).filter((a) => a.action === "stage-gate.bridge");
    expect(after1).toHaveLength(6);
    await svc.ensureBridge();
    const after2 = (await stores.audit.list()).filter((a) => a.action === "stage-gate.bridge");
    expect(after2).toHaveLength(6);
  });

  it("refuses to bridge when a seeded gate record is missing", async () => {
    const { stores, svc } = fresh();
    await stores.gates.remove("sg-3");
    await expect(svc.ensureBridge()).rejects.toThrowError(StageGateError);
    await expect(svc.ensureBridge()).rejects.toThrow(/STAGE_GATE_SEED_INVALID/);
  });

  it("never fabricates: every bootstrap ref points to a record that exists", async () => {
    const { svc, stores } = await freshBridged();
    const gates = (await stores.gates.list()).filter(isStageGateV2);
    for (const g of gates) {
      for (const ref of g.v2.attachedEvidence) {
        if (ref.refType === "persona") {
          expect(await stores.personas.get(ref.refId)).toBeDefined();
        } else if (ref.refType === "trainingMaterial") {
          expect(await stores.trainingMaterials.get(ref.refId)).toBeDefined();
        } else {
          throw new Error(`bootstrap attached an unexpected ref type: ${ref.refType}`);
        }
      }
    }
    void svc;
  });

  it("derives the honest initial states — nothing pretends to be done", async () => {
    const { svc } = await freshBridged();
    const rows = await svc.validateAll();
    const byKey = new Map(rows.map((r) => [r.def.gateKey, r.validation]));
    // G1: personas resolve, but no Use-Case-Brief record exists in the seed
    expect(byKey.get("G1")?.state).toBe("חסרות ראיות");
    // G2: training matrix + FAQ + support plan genuinely exist ⇒ decision-ready
    expect(byKey.get("G2")?.state).toBe("בבדיקה");
    expect(byKey.get("G2")?.readyForGo).toBe(true);
    // G3: pilot definition + baselines do not exist
    expect(byKey.get("G3")?.state).toBe("חסרות ראיות");
    // G4-G6: untouched
    expect(byKey.get("G4")?.state).toBe("לא התחיל");
    expect(byKey.get("G5")?.state).toBe("לא התחיל");
    expect(byKey.get("G6")?.state).toBe("לא התחיל");
  });

  it("G1 personas criterion is genuinely satisfied by the 7 seeded personas", async () => {
    const { svc } = await freshBridged();
    const { validation } = await svc.validateOne("sg-1");
    const personasCrit = validation.criteria.find((c) => c.def.key === "g1-personas");
    expect(personasCrit?.state).toBe("מולא");
    expect(personasCrit?.validCount).toBe(7);
    // the goal criterion is honestly missing
    const goalCrit = validation.criteria.find((c) => c.def.key === "g1-goal");
    expect(goalCrit?.state).toBe("לא התחיל");
  });
});
