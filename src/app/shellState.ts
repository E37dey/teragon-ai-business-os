// Shell UI state persistence — localStorage key 'teragon-os-shell-v1'.
// Stores nav-group open/closed map + intelligence-rail collapsed flag.
// Read once at boot; every change is written through save().

export const SHELL_STATE_KEY = "teragon-os-shell-v1";

export interface ShellState {
  /** group id → open? (missing id ⇒ default open) */
  openGroups: Record<string, boolean>;
  /** left intelligence rail collapsed? */
  railCollapsed: boolean;
}

export const DEFAULT_SHELL_STATE: ShellState = {
  openGroups: {},
  railCollapsed: false,
};

export function loadShellState(): ShellState {
  try {
    const raw = localStorage.getItem(SHELL_STATE_KEY);
    if (!raw) return DEFAULT_SHELL_STATE;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return DEFAULT_SHELL_STATE;
    const p = parsed as Partial<ShellState>;
    const openGroups: Record<string, boolean> = {};
    if (typeof p.openGroups === "object" && p.openGroups !== null) {
      for (const [k, v] of Object.entries(p.openGroups)) {
        if (typeof v === "boolean") openGroups[k] = v;
      }
    }
    return {
      openGroups,
      railCollapsed: typeof p.railCollapsed === "boolean" ? p.railCollapsed : false,
    };
  } catch {
    // corrupt/blocked storage must never break the shell
    return DEFAULT_SHELL_STATE;
  }
}

export function saveShellState(state: ShellState): void {
  try {
    localStorage.setItem(SHELL_STATE_KEY, JSON.stringify(state));
  } catch {
    // storage may be unavailable (private mode) — state simply won't persist
  }
}
