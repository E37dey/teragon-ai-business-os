// TERAGON vNext — deterministic LOCAL/DEMO login accounts (Phase B).
//
// DEMO-ONLY. These are not production credentials and MUST NOT be used for real
// authentication. They exist only to demonstrate the three role portals in the
// default LOCAL_INDEXEDDB / demo build. The three login shortcuts and the
// visible-credentials helper are surfaced ONLY when isDemoMode() is true.
//
// SECURITY: the credential does NOT decide authorization. Each account carries a
// TRUSTED canonical role (the same 9-role RBAC as the rest of TERAGON); the login
// card only *prefills* the form — authenticating resolves the account record and
// the guards evaluate can(account.canonicalRole, permission). Selecting a
// different card = a different account = its own fixed role; there is no way to
// type one account's credentials and receive another's permissions.
import type { CanonicalRoleId } from "@/domain/administration";
import type { Portal } from "@/authorization/portals";

export interface DemoAccount {
  readonly userId: string;
  readonly nameHe: string;
  readonly email: string;
  /** demo-only, non-secret by design (shown in the demo credentials helper). */
  readonly password: string;
  /** trusted authorization role — the ONLY thing that decides access. */
  readonly canonicalRole: CanonicalRoleId;
  /** derived presentation portal (must equal portalForRole(canonicalRole)). */
  readonly portal: Portal;
}

export const DEMO_ACCOUNTS: readonly DemoAccount[] = Object.freeze([
  {
    userId: "demo-manager",
    nameHe: "צחי זוסטייהם",
    email: "manager@teragon.demo",
    password: "TeragonManager2026!",
    canonicalRole: "crole-bizmgr",
    portal: "manager",
  },
  {
    userId: "demo-student",
    nameHe: "תלמיד דמו",
    email: "student@teragon.demo",
    password: "TeragonStudent2026!",
    canonicalRole: "crole-viewer",
    portal: "student",
  },
  {
    userId: "demo-technician",
    nameHe: "טכנאי דמו",
    email: "technician@teragon.demo",
    password: "TeragonTech2026!",
    canonicalRole: "crole-service",
    portal: "technician",
  },
]);

const BY_EMAIL = new Map(DEMO_ACCOUNTS.map((a) => [a.email.toLowerCase(), a] as const));

/** Resolve a demo account by email (case-insensitive), or null. */
export function findDemoAccount(email: string): DemoAccount | null {
  return BY_EMAIL.get(email.trim().toLowerCase()) ?? null;
}

/** Verify credentials against a demo account. Constant-shape, demo-only. */
export function authenticateDemo(email: string, password: string): DemoAccount | null {
  const acc = findDemoAccount(email);
  if (acc === null) return null;
  return acc.password === password ? acc : null;
}
