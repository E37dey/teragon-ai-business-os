// W7-A — content bootstrap: idempotence, honest states (pilot NOT completed,
// no results, baseline undefined), named owners from the real seed users,
// exact counts (6 stages / 5 waves), C4 seed-stage migration with legacyName.
import { describe, expect, it } from "vitest";
import {
  ADOPTION_STAGE_NAMES,
  ROLLOUT_WAVE_NAMES,
  ensureImplementationProgramme,
  PILOT_ID,
  PROGRAMME_ID,
  stageNameMismatches,
} from "@/domain/adoption";
import { fresh, freshBootstrapped } from "./helpers";

describe("ensureImplementationProgramme — idempotence", () => {
  it("creates records on the first run and NOTHING on the second", async () => {
    const { stores, clock } = fresh();
    const first = await ensureImplementationProgramme(stores, clock);
    expect(first.created).toBeGreaterThan(0);
    const counts = async () => ({
      programmes: (await stores.programmes.list()).length,
      milestones: (await stores.milestones.list()).length,
      risks: (await stores.risks.list()).length,
      evidence: (await stores.evidence.list()).length,
      decisions: (await stores.decisions.list()).length,
      waves: (await stores.rolloutWaves.list()).length,
      pilots: (await stores.pilotDefinitions.list()).length,
      results: (await stores.pilotResults.list()).length,
    });
    const afterFirst = await counts();
    const second = await ensureImplementationProgramme(stores, clock);
    expect(second.created).toBe(0);
    expect(await counts()).toEqual(afterFirst);
  });

  it("does not overwrite user edits on re-run", async () => {
    const { stores, clock, programme } = await freshBootstrapped();
    await stores.programmes.update(programme.id, { businessProblem: "עודכן ידנית" });
    await ensureImplementationProgramme(stores, clock);
    const after = await stores.programmes.get(PROGRAMME_ID);
    expect(after?.businessProblem).toBe("עודכן ידנית");
  });
});

describe("honest bootstrap content", () => {
  it("creates exactly 6 stages with the mandated names and exactly 5 waves", async () => {
    const { stores, programme } = await freshBootstrapped();
    expect(programme.stages).toHaveLength(6);
    expect(programme.stages.map((s) => s.name)).toEqual([...ADOPTION_STAGE_NAMES]);
    const waves = (await stores.rolloutWaves.list()).sort((a, b) => a.order - b.order);
    expect(waves).toHaveLength(5);
    expect(waves.map((w) => w.name)).toEqual([...ROLLOUT_WAVE_NAMES]);
  });

  it("current stage is פיילוט מבוקר and it is NOT completed", async () => {
    const { programme } = await freshBootstrapped();
    const current = programme.stages.find((s) => s.id === programme.currentStageId);
    expect(current?.name).toBe("פיילוט מבוקר");
    expect(current?.status).not.toBe("הושלם");
  });

  it("creates NO pilot results — the pilot is honestly 'טרם נמדד'", async () => {
    const { stores } = await freshBootstrapped();
    expect(await stores.pilotResults.list()).toEqual([]);
    const pilot = await stores.pilotDefinitions.get(PILOT_ID);
    expect(pilot?.status).toBe("מוגדר");
    expect(pilot?.startDate).toBeNull();
  });

  it("baseline is honestly undefined — every metric value null", async () => {
    const { programme } = await freshBootstrapped();
    expect(programme.baselineState).toBe("לא הוגדר קו בסיס");
    expect(programme.baselineMetrics.length).toBeGreaterThan(0);
    for (const m of programme.baselineMetrics) {
      expect(m.value).toBeNull();
      expect(m.capturedAt).toBeNull();
    }
  });

  it("all gate decisions start undecided (no fabricated Go)", async () => {
    const { stores } = await freshBootstrapped();
    const decisions = await stores.decisions.list();
    expect(decisions).toHaveLength(6);
    for (const d of decisions) {
      expect(d.decision).toBeNull();
      expect(d.decidedById).toBeNull();
    }
  });

  it("every owner is a NAMED person that exists in the seed users", async () => {
    const { stores, programme } = await freshBootstrapped();
    const users = await stores.users.list();
    const ids = new Set(users.map((u) => u.id));
    const names = new Map(users.map((u) => [u.id, u.name]));
    for (const owner of programme.owners) {
      expect(ids.has(owner.userId)).toBe(true);
      expect(owner.name).toBe(names.get(owner.userId));
    }
    for (const stage of programme.stages) {
      expect(ids.has(stage.ownerId)).toBe(true);
    }
    for (const m of await stores.milestones.list()) expect(ids.has(m.ownerId)).toBe(true);
    for (const r of await stores.risks.list()) expect(ids.has(r.ownerId)).toBe(true);
    // canonical CEO spelling
    expect(names.get("u-tzachi")).toBe("צחי זוסטייהם");
  });

  it("programme is a draft — never bootstrapped as approved", async () => {
    const { programme } = await freshBootstrapped();
    expect(programme.approvalState).toBe("טיוטה");
    expect(programme.approvalId).toBeNull();
    expect(programme.version).toBe(1);
  });
});

describe("C4 seed-stage migration (Lead decision)", () => {
  it("rewrites the stored is-N records to the canonical names, keeping legacyName", async () => {
    const { stores } = await freshBootstrapped();
    const seedStages = (await stores.seedStages.list()).sort((a, b) => a.order - b.order);
    expect(seedStages).toHaveLength(6);
    seedStages.forEach((s, i) => {
      expect(s.name).toBe(ADOPTION_STAGE_NAMES[i]);
      expect(s.id).toBe(`is-${i + 1}`); // ids preserved
      expect(typeof s.legacyName).toBe("string"); // old build-plan name kept
      expect(s.legacyName).not.toBe(s.name);
    });
    // post-migration there are no residual mismatches
    expect(stageNameMismatches(seedStages)).toEqual([]);
  });

  it("migration is idempotent — legacyName is not overwritten on re-run", async () => {
    const { stores, clock } = await freshBootstrapped();
    const before = await stores.seedStages.get("is-1");
    await ensureImplementationProgramme(stores, clock);
    const after = await stores.seedStages.get("is-1");
    expect(after?.legacyName).toBe(before?.legacyName);
    expect(after?.updatedAt).toBe(before?.updatedAt);
  });
});
