// TERAGON vNext — the live RECORD-SCOPE context hook.
//
// Resolves the (portal, identity) pair that scopeRecords() needs from the TRUSTED
// authenticated session: the active demo account supplies both its fixed portal
// and its seed scope identity; with no demo account the default operator is the
// broad manager (its capability is the floor). Components never assemble the scope
// themselves — they read it here and hand it to scopeRecords(), so every surface
// scopes against the SAME source.
import { useActiveDemoAccount } from "./portalSession";
import { useCurrentRole } from "./roleStore";
import { portalForRole, type Portal } from "./portals";
import type { RecordScope } from "./recordScope";

export interface ScopeContext {
  readonly portal: Portal;
  readonly scope: RecordScope | null;
}

export function useScopeContext(): ScopeContext {
  const account = useActiveDemoAccount();
  const role = useCurrentRole();
  return {
    portal: account?.portal ?? portalForRole(role),
    scope: account?.scope ?? null,
  };
}
