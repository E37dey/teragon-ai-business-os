// TERAGON AI BUSINESS OS — Gate S9.2-A1b: route → domain mapping.
//
// Maps a route pathname to the domain collection it renders, for the route-aware
// DomainNotConnectedGate. This is NOT an allow-list — the CONNECTED decision is
// made centrally by SUPABASE_CONNECTED_DOMAINS (via isSupabaseConnectedDomain).
// A route with no wired domain data returns null and is treated as not-connected
// in SUPABASE mode.
//
// S9.2-A1b wired the customer LIST (/customers). S9.2-A1d1 adds the customer
// DETAIL route (/customers/:id) — a reduced, SUPABASE-connected detail shell that
// mounts ONLY remotely-connected customer data (its disconnected Customer-360
// sections are not mounted in SUPABASE mode). Every other domain stays blocked.
import type { CollectionKey } from "@/repositories/collections";

const CUSTOMER_DETAIL = /^\/customers\/[^/]+$/;

export function routeDomain(pathname: string): CollectionKey | null {
  if (pathname === "/customers") return "customers";
  if (CUSTOMER_DETAIL.test(pathname)) return "customers";
  // S9.3-B: contacts LIST only. There is deliberately no /contacts/:id mapping —
  // a contact detail route stays not-connected until its own checkpoint.
  if (pathname === "/contacts") return "contacts";
  return null;
}
