// TERAGON AI BUSINESS OS — demo role store (Wave 9, W9-B).
//
// HONEST DEMO: there is NO login. The "current role" is a demo selector kept
// in sessionStorage so an evaluator can walk the RBAC simulation by switching
// role. Guards read this value LIVE on every evaluation — no grants are cached
// anywhere — so switching role instantly re-evaluates all four layers and can
// never silently escalate a previously-cached decision.
import { useSyncExternalStore } from "react";
import { CANONICAL_ROLE_IDS, type CanonicalRoleId } from "@/domain/administration";

/** default demo role — מנהל מערכת (crole-sysadmin) */
export const DEFAULT_DEMO_ROLE: CanonicalRoleId = "crole-sysadmin";

export const DEMO_ROLE_KEY = "teragon.w9b.demoRole";
const DEMO_ROLE_EVENT = "w9b-demo-role-changed";

function safeSession(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

function isCanonicalRoleId(value: string | null): value is CanonicalRoleId {
  return value !== null && (CANONICAL_ROLE_IDS as readonly string[]).includes(value);
}

/** Live read — validated against the 9 canonical ids; junk ⇒ default. */
export function getCurrentRole(): CanonicalRoleId {
  try {
    const raw = safeSession()?.getItem(DEMO_ROLE_KEY) ?? null;
    return isCanonicalRoleId(raw) ? raw : DEFAULT_DEMO_ROLE;
  } catch {
    return DEFAULT_DEMO_ROLE;
  }
}

/** Switch the demo role; notifies all subscribers so guards re-evaluate. */
export function setCurrentRole(role: CanonicalRoleId): void {
  try {
    const s = safeSession();
    if (!s) return;
    s.setItem(DEMO_ROLE_KEY, role);
    if (typeof window !== "undefined") window.dispatchEvent(new Event(DEMO_ROLE_EVENT));
  } catch {
    // the demo selector must never throw into UI code
  }
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(DEMO_ROLE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(DEMO_ROLE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * The React hook every guarded surface uses. Returns the LIVE demo role and
 * re-renders on switch — no cached grants, so a role change re-runs all guards.
 */
export function useCurrentRole(): CanonicalRoleId {
  return useSyncExternalStore(subscribe, getCurrentRole, () => DEFAULT_DEMO_ROLE);
}
