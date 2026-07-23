// W7-C — gate actions: audited decisions, attach/detach flows, and the
// G4-blocked-without-PilotResult guarantee end to end.
import { describe, expect, it } from "vitest";
import { StageGateError } from "@/domain/stage-gates";
import { freshBridged } from "./helpers";

async function auditActions(stores: Awaited<ReturnType<typeof freshBridged>>["stores"]) {
  return (await stores.audit.list()).map((a) => a.action);
}

describe("decision actions — every one audited", () => {
  it("decideGo on decision-ready G2 succeeds, syncs the legacy record and audits", async () => {
    const { svc, stores } = await freshBridged();
    const updated = await svc.decideGo("sg-2", "u-tzachi", "החבילה מכסה את כל הפרסונות");
    expect(updated.v2.decision).toBe("Go");
    expect(updated.v2.decidedById).toBe("u-tzachi");
    expect(updated.status).toBe("עבר"); // legacy sync
    const { validation } = await svc.validateOne("sg-2");
    expect(validation.state).toBe("Go");
    expect(await auditActions(stores)).toContain("stage-gate.decide-go");
  });

  it("decideGo on G1 is REFUSED with the full Hebrew blocking reasons", async () => {
    const { svc } = await freshBridged();
    const err = await svc.decideGo("sg-1", "u-tzachi").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StageGateError);
    if (err instanceof StageGateError) {
      expect(err.code).toBe("STAGE_GATE_GO_BLOCKED");
      expect(err.blockingReasonsHe.length).toBeGreaterThan(0);
    }
  });

  it("decideNoGo requires a reason and audits it", async () => {
    const { svc, stores } = await freshBridged();
    await expect(svc.decideNoGo("sg-1", "u-tzachi", "  ")).rejects.toThrow(
      /STAGE_GATE_NOTE_REQUIRED/,
    );
    const updated = await svc.decideNoGo("sg-1", "u-tzachi", "חסר מסמך מטרה");
    expect(updated.v2.decision).toBe("No-Go");
    expect(updated.status).toBe("נכשל");
    expect(await auditActions(stores)).toContain("stage-gate.decide-no-go");
  });

  it("reopen clears the decision (note required) and audits", async () => {
    const { svc, stores } = await freshBridged();
    await expect(svc.reopen("sg-2", "u-tzachi", "בדיקה")).rejects.toThrow(
      /STAGE_GATE_STATE_INVALID/,
    );
    await svc.decideGo("sg-2", "u-tzachi");
    await expect(svc.reopen("sg-2", "u-tzachi", "")).rejects.toThrow(/STAGE_GATE_NOTE_REQUIRED/);
    const reopened = await svc.reopen("sg-2", "u-tzachi", "נוסף חומר חדש שדורש בדיקה");
    expect(reopened.v2.decision).toBeNull();
    expect(reopened.v2.reopened).toBe(true);
    expect(reopened.status).toBe("בתהליך");
    const { validation } = await svc.validateOne("sg-2");
    expect(validation.state).toBe("נפתח מחדש");
    expect(await auditActions(stores)).toContain("stage-gate.reopen");
  });

  it("requestCompletion records the request and audits", async () => {
    const { svc, stores } = await freshBridged();
    await expect(svc.requestCompletion("sg-3", "", "u-tzachi")).rejects.toThrow(
      /STAGE_GATE_NOTE_REQUIRED/,
    );
    const updated = await svc.requestCompletion("sg-3", "נא לצרף הגדרת פיילוט", "u-tzachi");
    expect(updated.v2.completionRequests).toHaveLength(1);
    expect(await auditActions(stores)).toContain("stage-gate.request-completion");
  });

  it("assignOwner / assignReviewer demand a REAL named user and audit", async () => {
    const { svc, stores } = await freshBridged();
    await expect(svc.assignOwner("sg-4", "u-ghost", "u-tzachi")).rejects.toThrow(
      /STAGE_GATE_USER_NOT_FOUND/,
    );
    const owned = await svc.assignOwner("sg-4", "u-maya", "u-tzachi");
    expect(owned.v2.ownerId).toBe("u-maya");
    const reviewed = await svc.assignReviewer("sg-4", "u-noa", "u-tzachi");
    expect(reviewed.v2.reviewerId).toBe("u-noa");
    const actions = await auditActions(stores);
    expect(actions).toContain("stage-gate.assign-owner");
    expect(actions).toContain("stage-gate.assign-reviewer");
  });
});

describe("attach / detach evidence flows", () => {
  it("attach validates criterion, ref type, record existence and duplicates", async () => {
    const { svc, stores } = await freshBridged();
    await expect(
      svc.attachEvidence(
        "sg-1",
        { refType: "persona", refId: "per-1", criterionKey: "no-such" },
        "u-tzachi",
      ),
    ).rejects.toThrow(/STAGE_GATE_CRITERION_UNKNOWN/);
    await expect(
      svc.attachEvidence(
        "sg-1",
        { refType: "pilotResult", refId: "pr-1", criterionKey: "g1-personas" },
        "u-tzachi",
      ),
    ).rejects.toThrow(/STAGE_GATE_REF_TYPE_INVALID/);
    await expect(
      svc.attachEvidence(
        "sg-1",
        { refType: "memoryRecord", refId: "mem-ghost", criterionKey: "g1-goal" },
        "u-tzachi",
      ),
    ).rejects.toThrow(/STAGE_GATE_RECORD_NOT_FOUND/);
    // duplicate: per-1 was bootstrap-attached to g1-personas
    await expect(
      svc.attachEvidence(
        "sg-1",
        { refType: "persona", refId: "per-1", criterionKey: "g1-personas" },
        "u-tzachi",
      ),
    ).rejects.toThrow(/STAGE_GATE_DUPLICATE_EVIDENCE/);
    // a genuine attach works and is audited
    const updated = await svc.attachEvidence(
      "sg-1",
      { refType: "memoryRecord", refId: "mem-4", criterionKey: "g1-goal", noteHe: "החלטת מטרה" },
      "u-tzachi",
    );
    expect(updated.v2.attachedEvidence.some((r) => r.refId === "mem-4")).toBe(true);
    expect(await auditActions(stores)).toContain("stage-gate.evidence.attach");
  });

  it("detach removes the ref and audits; unknown ref refused", async () => {
    const { svc, stores } = await freshBridged();
    const gate = await svc
      .validateOne("sg-1")
      .then((r) => r.gate);
    const ref = gate.v2.attachedEvidence[0];
    expect(ref).toBeDefined();
    if (!ref) return;
    const updated = await svc.detachEvidence("sg-1", ref.id, "u-tzachi");
    expect(updated.v2.attachedEvidence.some((r) => r.id === ref.id)).toBe(false);
    await expect(svc.detachEvidence("sg-1", "sge-ghost", "u-tzachi")).rejects.toThrow(
      /STAGE_GATE_RECORD_NOT_FOUND/,
    );
    expect(await auditActions(stores)).toContain("stage-gate.evidence.detach");
  });

  it("attaching evidence after Go without revalidation does not silently upgrade a gate", async () => {
    const { svc } = await freshBridged();
    // G2 Go, then detach a matrix material — the Go honestly expires
    await svc.decideGo("sg-2", "u-tzachi");
    const gate = (await svc.validateOne("sg-2")).gate;
    const tm1 = gate.v2.attachedEvidence.find((r) => r.refId === "tm-1");
    expect(tm1).toBeDefined();
    if (!tm1) return;
    await svc.detachEvidence("sg-2", tm1.id, "u-tzachi");
    const { validation } = await svc.validateOne("sg-2");
    expect(validation.state).toBe("פג תוקף");
  });
});

describe("G4 — «הפיילוט הצליח» end to end", () => {
  it("cannot Go while no PilotResult record exists; can Go once one genuinely does", async () => {
    const { svc, stores, clock } = await freshBridged();
    await svc.assignOwner("sg-4", "u-noa", "u-tzachi");
    await svc.assignReviewer("sg-4", "u-tzachi", "u-tzachi");
    // still blocked — no PilotResult record anywhere
    const err = await svc.decideGo("sg-4", "u-tzachi").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StageGateError);
    if (err instanceof StageGateError) {
      expect(err.blockingReasonsHe.join(" ")).toMatch(/PilotResult/);
    }

    // a REAL pilot result + measured metrics with a baseline
    const ts = clock();
    await stores.pilotResults.create({
      id: "pr-1",
      createdAt: ts,
      updatedAt: ts,
      title: "תוצאת פיילוט מכירות",
      outcome: "הושלם עם ממצאים",
    });
    await stores.metricObservations.create({
      id: "mo-t-base",
      createdAt: ts,
      updatedAt: ts,
      metricKey: "pilot_adoption",
      observedAt: "2026-07-01T10:00:00.000Z",
      value: 40,
      method: "מדידת קו בסיס לפני הפיילוט",
    });
    await stores.metricObservations.create({
      id: "mo-t-cur",
      createdAt: ts,
      updatedAt: ts,
      metricKey: "pilot_adoption",
      observedAt: "2026-07-20T10:00:00.000Z",
      value: 55,
      method: "מדידה בסיום הפיילוט",
    });
    await svc.attachEvidence(
      "sg-4",
      { refType: "pilotResult", refId: "pr-1", criterionKey: "g4-pilot-result" },
      "u-tzachi",
    );
    await svc.attachEvidence(
      "sg-4",
      { refType: "metricObservation", refId: "mo-t-cur", criterionKey: "g4-metrics" },
      "u-tzachi",
    );
    const before = await svc.validateOne("sg-4");
    expect(before.validation.readyForGo).toBe(true);
    const updated = await svc.decideGo("sg-4", "u-tzachi", "תוצאה מתועדת מול קו בסיס");
    expect(updated.v2.decision).toBe("Go");
  });

  it("a metric observation without baseline keeps G4 blocked even with a PilotResult", async () => {
    const { svc, stores, clock } = await freshBridged();
    const ts = clock();
    await svc.assignOwner("sg-4", "u-noa", "u-tzachi");
    await svc.assignReviewer("sg-4", "u-tzachi", "u-tzachi");
    await stores.pilotResults.create({
      id: "pr-1",
      createdAt: ts,
      updatedAt: ts,
      title: "תוצאת פיילוט",
    });
    await stores.metricObservations.create({
      id: "mo-t-nobase",
      createdAt: ts,
      updatedAt: ts,
      metricKey: "pilot_new_metric",
      observedAt: "2026-07-20T10:00:00.000Z",
      value: 90,
      method: "מדידה יחידה ללא קו בסיס",
    });
    await svc.attachEvidence(
      "sg-4",
      { refType: "pilotResult", refId: "pr-1", criterionKey: "g4-pilot-result" },
      "u-tzachi",
    );
    await svc.attachEvidence(
      "sg-4",
      { refType: "metricObservation", refId: "mo-t-nobase", criterionKey: "g4-metrics" },
      "u-tzachi",
    );
    await expect(svc.decideGo("sg-4", "u-tzachi")).rejects.toThrow(/קו בסיס/);
  });
});
