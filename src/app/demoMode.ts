// TERAGON AI BUSINESS OS — Gate S10.3: DEMO-ONLY operating mode.
// =============================================================================
// The Internal Demo Pilot runs on SYNTHETIC data only. This module is the single
// source of truth for that fact and the one gate every outbound side effect must
// pass through.
//
// FAIL-CLOSED BY DESIGN: demo mode is ON unless something explicitly turns it
// off. A misconfigured or missing flag must never silently produce a system that
// looks real, can email real people, or implies the data is the business's own.
//
// Scope of "external side effect": anything that leaves the system and can be
// observed by a third party — email, SMS/messaging, webhooks, push, or any
// outbound call to a non-Supabase third-party API. Reads of our OWN backend
// (Supabase) are NOT side effects and are unaffected.
/**
 * Browser mirror of the SERVER flag. Only an explicit "true" enables remote AI;
 * anything else keeps it off, matching `src/runtime/provenance.ts`.
 */
function aiRemoteMirror(): boolean {
  return (import.meta.env?.VITE_AI_REMOTE_ENABLED ?? "").toString().toLowerCase() === "true";
}

/** Channels that can reach a third party. Extend deliberately, never freely. */
export type ExternalChannel = "email" | "sms" | "webhook" | "push" | "third-party-api";

/**
 * True unless the build explicitly opts out with VITE_DEMO_MODE="false".
 * Any other value — missing, empty, typo'd, "0", "no" — keeps demo mode ON.
 */
export function isDemoMode(): boolean {
  const raw = (import.meta.env?.VITE_DEMO_MODE ?? "").toString().trim().toLowerCase();
  return raw !== "false";
}

/** The banner text. Exported so the test asserts the exact product wording. */
export const DEMO_BANNER_HE = "סביבת הדגמה — הנתונים במערכת סינתטיים ואינם נתוני העסק";

export interface SideEffectDecision {
  readonly allowed: boolean;
  /** Stable, non-free-text reason code. */
  readonly reason: "demo_mode_blocked" | "ai_remote_disabled" | "allowed";
  /** Safe Hebrew explanation for the UI. Never a technical detail. */
  readonly messageHe: string;
}

const BLOCKED_HE = "פעולה חיצונית חסומה בסביבת הדגמה — לא נשלחות הודעות אל גורמים חיצוניים";

/**
 * The ONE gate for outbound side effects. Returns a decision rather than
 * throwing, so a caller must consciously handle refusal instead of an
 * exception being swallowed somewhere up the stack.
 */
export function externalSideEffectDecision(channel: ExternalChannel): SideEffectDecision {
  if (isDemoMode()) {
    return { allowed: false, reason: "demo_mode_blocked", messageHe: BLOCKED_HE };
  }
  // Outside demo mode a third-party API call still requires remote AI to be on;
  // AI_REMOTE_ENABLED stays false for the pilot.
  if (channel === "third-party-api" && !aiRemoteMirror()) {
    return { allowed: false, reason: "ai_remote_disabled", messageHe: "שירותי AI מרוחקים מושבתים" };
  }
  return { allowed: true, reason: "allowed", messageHe: "" };
}

/** Convenience predicate — false in demo mode for every channel. */
export function isExternalSideEffectAllowed(channel: ExternalChannel): boolean {
  return externalSideEffectDecision(channel).allowed;
}
