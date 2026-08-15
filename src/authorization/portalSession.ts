// TERAGON vNext — the demo portal session bridge (Phase B).
//
// The RBAC guards read the LIVE canonical role from roleStore. This module is the
// ONLY place that sets that role from an authenticated demo account, so the role
// is always sourced from the TRUSTED account record — never from a login card,
// never from the URL. Entering a portal = authenticating a demo account = setting
// its fixed canonical role; there is no path that sets a role higher than the
// account's own. Exiting returns to the default operator role.
//
// Local/demo-only. In a real SUPABASE build the authenticated identity's role
// would drive the same bridge; the card shortcuts are hidden outside demo mode.
import { useSyncExternalStore } from "react";
import { setCurrentRole, DEFAULT_DEMO_ROLE } from "./roleStore";
import { DEMO_ACCOUNTS, type DemoAccount } from "@/auth/demoAccounts";

const ACTIVE_KEY = "teragon.vnext.activeDemoAccount";
const EVENT = "teragon-vnext-portal-session-changed";

function session(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

function emit(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT));
}

/** The active demo account (or null = default operator), read live. */
export function getActiveDemoAccount(): DemoAccount | null {
  const id = session()?.getItem(ACTIVE_KEY) ?? null;
  return id ? DEMO_ACCOUNTS.find((a) => a.userId === id) ?? null : null;
}

/** Enter a demo portal: set the account's TRUSTED role, then record it. The
 *  role is the account's own — selecting a card can never escalate. */
export function enterDemoPortal(account: DemoAccount): void {
  setCurrentRole(account.canonicalRole); // authoritative — from the trusted record
  session()?.setItem(ACTIVE_KEY, account.userId);
  emit();
}

/** Exit the demo portal — back to the default operator role. */
export function exitDemoPortal(): void {
  setCurrentRole(DEFAULT_DEMO_ROLE);
  session()?.removeItem(ACTIVE_KEY);
  emit();
}

function subscribe(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** React hook — the live active demo account (re-renders on enter/exit). */
export function useActiveDemoAccount(): DemoAccount | null {
  return useSyncExternalStore(subscribe, getActiveDemoAccount, () => null);
}
