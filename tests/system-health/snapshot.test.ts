// W8-D — snapshot builder + persistence (honest tallies, zod-valid records).
import { beforeEach, describe, expect, it } from "vitest";
import { HEALTH_COMPONENT_IDS, systemHealthSnapshotSchema } from "@/domain/system-health";
import { __resetRepositoriesForTests } from "@/repositories";
import { uncheckedComponent } from "@/system-health/checks";
import { buildHealthSnapshot, takeAndPersistSnapshot, tallyComponents } from "@/system-health/snapshot";
import { makeEnv } from "./helpers";

beforeEach(() => __resetRepositoriesForTests());

describe("tallyComponents — honest, no invented aggregate score", () => {
  it("counts each state family correctly", () => {
    const components = HEALTH_COMPONENT_IDS.map((id) => uncheckedComponent(id));
    const t = tallyComponents(components);
    // derived from the registry so adding a component cannot silently drift
    expect(t).toEqual({
      okCount: 0, attentionCount: 0, unavailableCount: 0,
      uncheckedCount: HEALTH_COMPONENT_IDS.length,
    });
  });

  it("mixed states land in the right buckets", () => {
    const mk = (state: string) => ({ ...uncheckedComponent("indexeddb"), state }) as never;
    const t = tallyComponents([mk("תקין"), mk("מוגבל"), mk("דורש תשומת לב"), mk("לא זמין"), mk("לא הוגדר")]);
    expect(t).toEqual({ okCount: 1, attentionCount: 2, unavailableCount: 1, uncheckedCount: 1 });
  });
});

describe("snapshot build + persistence", () => {
  it("buildHealthSnapshot passes the zod schema and carries every component", async () => {
    const env = await makeEnv({ probe: { version: 6, storeCount: 100 } });
    const snapshot = await buildHealthSnapshot(env, []);
    expect(() => systemHealthSnapshotSchema.parse(snapshot)).not.toThrow();
    expect(snapshot.components).toHaveLength(HEALTH_COMPONENT_IDS.length);
    expect(snapshot.takenAt).toBe(snapshot.createdAt);
  });

  it("takeAndPersistSnapshot writes to healthSnapshots with a fresh id each run", async () => {
    const env = await makeEnv();
    const s1 = await takeAndPersistSnapshot(env);
    const s2 = await takeAndPersistSnapshot(env);
    expect(s1.id).not.toBe(s2.id);
    const stored = await env.collection("healthSnapshots").list();
    expect(stored.map((s) => s.id).sort()).toEqual([s1.id, s2.id].sort());
  });
});
