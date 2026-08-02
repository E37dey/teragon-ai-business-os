// TERAGON AI BUSINESS OS — Gate S9.2-A1b: route → domain mapping.
//
// Maps a route pathname to the domain collection it renders, for the route-aware
// DomainNotConnectedGate. This is NOT an allow-list — the CONNECTED decision is
// made centrally by SUPABASE_CONNECTED_DOMAINS (via isSupabaseConnectedDomain).
// A route with no wired domain data returns null and is treated as not-connected
// in SUPABASE mode.
//
// S9.2-A1b wires the customer LIST (/customers) only. The customer DETAIL route
// (/customers/:id) is deliberately NOT mapped here — its page reads 13 domains
// (12 still NOT_CONNECTED), a broad rewrite deferred to S9.2-A1c+ — so it stays
// blocked (notice) and never mounts its IndexedDB-backed reads in SUPABASE mode.
import type { CollectionKey } from "@/repositories/collections";

export function routeDomain(pathname: string): CollectionKey | null {
  if (pathname === "/customers") return "customers";
  return null;
}
