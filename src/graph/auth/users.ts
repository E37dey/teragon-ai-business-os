// TERAGON Business Graph — Phase 11 OPERATOR-AUTH active-user adapter.
// ---------------------------------------------------------------------------
// A thin adapter from an injected users-repo-shaped source onto the Phase-10
// `ActiveUserLookup` seam. The runtime resolver uses it to prove the operator's
// canonical user is ACTIVE ("פעיל") before granting a trusted identity — an
// inactive / archived / unknown user is denied. This adapter reads ONLY {id,
// status}; it never fabricates a user and never touches repositories directly.
import type { EntityStatus } from "@/domain/types";
import type { ActiveUserLookup } from "../runtime/identity";

/** The minimal injected users source: return {id,status} for a verified id, or null. */
export interface OperatorUserRecordSource {
  findUserRecord(userId: string): { id: string; status: EntityStatus } | null;
}

/**
 * Build an `ActiveUserLookup` from an injected users source. Pure passthrough of
 * the {id,status} record — the resolver applies the active-status gate. When the
 * source returns null (unknown user) the lookup returns null (deny-by-default).
 */
export function createOperatorActiveUserLookup(source: OperatorUserRecordSource): ActiveUserLookup {
  return { findUser: (userId) => source.findUserRecord(userId) };
}
