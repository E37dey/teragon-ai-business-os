// W6-E — public surface of the migration layer.
// Boot wiring (Integration Lead, src/main.tsx — exact diff in
// docs/integration-requests-w6e.md): call runMigrationsAtBoot() right AFTER
// seedIfEmpty() and before syncNotifications().
export * from "./framework";
export * from "./migrations";

import { defaultMigrationEnv, productionMigrationStores, runMigrations } from "./framework";
import type { RunMigrationsReport } from "./framework";
import { ALL_MIGRATIONS } from "./migrations";

/** Boot path: apply all pending migrations against the canonical stores. Never throws. */
export async function runMigrationsAtBoot(): Promise<RunMigrationsReport> {
  return runMigrations(ALL_MIGRATIONS, defaultMigrationEnv(productionMigrationStores()));
}
