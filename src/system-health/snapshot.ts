// W8-D — snapshot builder + persistence into the healthSnapshots collection.
// A snapshot is the honest record of ONE real check run: components as they
// were measured, storage/migration/build panels, and derived tallies. Nothing
// in a snapshot is invented — components that were not run stay "טרם נבדק".
import type { ISODate } from "@/domain/types";
import {
  systemHealthSnapshotSchema,
  type SystemComponentHealth,
  type SystemHealthSnapshot,
} from "@/domain/system-health";
import { nextId } from "@/repositories/Repository";
import { collectBuildInformation } from "./buildInfo";
import {
  collectMigrationHealth,
  collectStorageHealth,
  runAllChecks,
  type HealthCheckEnv,
} from "./checks";

export interface SnapshotTallies {
  okCount: number;
  attentionCount: number;
  unavailableCount: number;
  uncheckedCount: number;
}

export function tallyComponents(components: readonly SystemComponentHealth[]): SnapshotTallies {
  let ok = 0;
  let attention = 0;
  let unavailable = 0;
  let unchecked = 0;
  for (const c of components) {
    switch (c.state) {
      case "תקין":
        ok += 1;
        break;
      case "מוגבל":
      case "דורש תשומת לב":
        attention += 1;
        break;
      case "לא זמין":
        unavailable += 1;
        break;
      default:
        // "לא הוגדר" / "לא ניתן למדידה" / "טרם נבדק" — honestly not measured/configured
        unchecked += 1;
        break;
    }
  }
  return { okCount: ok, attentionCount: attention, unavailableCount: unavailable, uncheckedCount: unchecked };
}

/** Run all checks and assemble an (unpersisted) snapshot. */
export async function buildHealthSnapshot(
  env: HealthCheckEnv,
  existingIds: readonly string[],
): Promise<SystemHealthSnapshot> {
  const components = await runAllChecks(env);
  const storage = await collectStorageHealth(env);
  const migration = await collectMigrationHealth(env);
  const build = collectBuildInformation();
  const now: ISODate = env.now();
  const tallies = tallyComponents(components);
  const snapshot: SystemHealthSnapshot = {
    id: nextId("hs", existingIds),
    createdAt: now,
    updatedAt: now,
    takenAt: now,
    components,
    storage,
    migration,
    build,
    ...tallies,
  };
  systemHealthSnapshotSchema.parse(snapshot);
  return snapshot;
}

/** Run checks, persist the snapshot to healthSnapshots, return it. */
export async function takeAndPersistSnapshot(env: HealthCheckEnv): Promise<SystemHealthSnapshot> {
  const repo = env.collection<SystemHealthSnapshot>("healthSnapshots");
  const existing = await repo.list();
  const snapshot = await buildHealthSnapshot(
    env,
    existing.map((s) => s.id),
  );
  await repo.create(snapshot);
  return snapshot;
}
