// W8-C — emergency-state flags (Phase 8.8). Follows the W7-F demo-mode
// pattern (src/presentation/demoMode.ts): localStorage flag + change event +
// useSyncExternalStore hook that OTHER modules can read to refuse execution.
// HONESTY: within Wave 8 the flags are ENFORCED inside the administration
// module (service refuses mutations under read-only / permission-lock);
// app-wide enforcement by automations/agents is a queued integration request
// (docs/integration-requests-w8c.md) — the flag is real, the wiring is honest
// about its current reach.
import { useCallback, useSyncExternalStore } from "react";
import type { EmergencyControlKind } from "@/domain/administration";

export const EMERGENCY_FLAG_KEYS = {
  "remote-ai-disable": "teragon.w8c.emergency.remoteAiDisabled",
  "automation-execution-disable": "teragon.w8c.emergency.automationExecutionDisabled",
  "permission-change-lock": "teragon.w8c.emergency.permissionChangeLocked",
  "read-only-mode": "teragon.w8c.emergency.readOnlyMode",
} as const;

export type EmergencyFlagKind = keyof typeof EMERGENCY_FLAG_KEYS;

const EMERGENCY_EVENT = "w8c-emergency-flags-changed";

function safeLocal(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function isEmergencyFlagActive(kind: EmergencyFlagKind): boolean {
  try {
    return safeLocal()?.getItem(EMERGENCY_FLAG_KEYS[kind]) === "1";
  } catch {
    return false;
  }
}

export function setEmergencyFlag(kind: EmergencyFlagKind, active: boolean): void {
  try {
    const s = safeLocal();
    if (!s) return;
    if (active) s.setItem(EMERGENCY_FLAG_KEYS[kind], "1");
    else s.removeItem(EMERGENCY_FLAG_KEYS[kind]);
    if (typeof window !== "undefined") window.dispatchEvent(new Event(EMERGENCY_EVENT));
  } catch {
    // flags must never throw into UI code
  }
}

export interface EmergencyFlagsState {
  remoteAiDisabled: boolean;
  automationExecutionDisabled: boolean;
  permissionChangeLocked: boolean;
  readOnlyMode: boolean;
}

export function readEmergencyFlags(): EmergencyFlagsState {
  return {
    remoteAiDisabled: isEmergencyFlagActive("remote-ai-disable"),
    automationExecutionDisabled: isEmergencyFlagActive("automation-execution-disable"),
    permissionChangeLocked: isEmergencyFlagActive("permission-change-lock"),
    readOnlyMode: isEmergencyFlagActive("read-only-mode"),
  };
}

export function anyEmergencyActive(state: EmergencyFlagsState): boolean {
  return (
    state.remoteAiDisabled ||
    state.automationExecutionDisabled ||
    state.permissionChangeLocked ||
    state.readOnlyMode
  );
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(EMERGENCY_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EMERGENCY_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

let cachedSnapshot: EmergencyFlagsState = readEmergencyFlags();
let cachedKey = JSON.stringify(cachedSnapshot);

function getSnapshot(): EmergencyFlagsState {
  const next = readEmergencyFlags();
  const key = JSON.stringify(next);
  if (key !== cachedKey) {
    cachedSnapshot = next;
    cachedKey = key;
  }
  return cachedSnapshot;
}

const SERVER_SNAPSHOT: EmergencyFlagsState = {
  remoteAiDisabled: false,
  automationExecutionDisabled: false,
  permissionChangeLocked: false,
  readOnlyMode: false,
};

/** Hook other modules read to respect emergency states. */
export function useEmergencyFlags(): {
  flags: EmergencyFlagsState;
  set: (kind: EmergencyFlagKind, active: boolean) => void;
} {
  const flags = useSyncExternalStore(subscribe, getSnapshot, () => SERVER_SNAPSHOT);
  const set = useCallback((kind: EmergencyFlagKind, active: boolean) => {
    setEmergencyFlag(kind, active);
  }, []);
  return { flags, set };
}

/** true when the given control kind is one of the flag-backed controls. */
export function isFlagBackedControl(kind: EmergencyControlKind): kind is EmergencyFlagKind {
  return kind !== "agent-disable";
}
