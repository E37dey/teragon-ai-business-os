// TERAGON AI BUSINESS OS — Gate S9.1-A: provider-gated local boot init.
//
// The LOCAL IndexedDB boot initialization (seed / schema migrations / persisted
// UI settings / notification sync) must run ONLY in LOCAL_INDEXEDDB mode. In
// SUPABASE mode this is a strict NO-OP: no local domain database is initialized,
// no demo rows are inserted, no local migration or sync runs — so the app can
// never mix local domain data into the authenticated Supabase composition.
//
// The dependencies are injectable so the gating is deterministically unit-tested
// without touching a real IndexedDB. Local code is preserved (not deleted) and
// simply gated by the resolved persistence provider.
import { PERSISTENCE_PROVIDER, type PersistenceProvider } from "@/persistence/provider";
import { seedIfEmpty } from "@/repositories";
import { runMigrationsAtBoot } from "@/migrations";
import { applyUiSettingsAtBoot } from "@/integration/wave8/applyUiSettings";
import { syncNotifications } from "@/app/notifications/syncNotifications";

export interface BootPersistenceDeps {
  readonly seedIfEmpty: () => Promise<unknown>;
  readonly runMigrationsAtBoot: () => Promise<unknown>;
  readonly applyUiSettingsAtBoot: () => Promise<unknown> | unknown;
  readonly syncNotifications: () => Promise<unknown>;
}

const defaultDeps: BootPersistenceDeps = {
  seedIfEmpty,
  runMigrationsAtBoot,
  applyUiSettingsAtBoot,
  syncNotifications,
};

/**
 * Run the LOCAL persistence boot init, gated by provider. Returns `{ ran }`:
 * `false` (no-op) in SUPABASE mode, `true` after the LOCAL sequence completes.
 */
export async function bootLocalPersistence(
  deps: BootPersistenceDeps = defaultDeps,
  provider: PersistenceProvider = PERSISTENCE_PROVIDER,
): Promise<{ ran: boolean }> {
  if (provider === "SUPABASE") return { ran: false };
  await deps.seedIfEmpty();
  await deps.runMigrationsAtBoot();
  await deps.applyUiSettingsAtBoot();
  await deps.syncNotifications();
  return { ran: true };
}
