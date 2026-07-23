// TERAGON AI BUSINESS OS — presentation session persistence (W7-F, 7.22).
// sessionStorage-backed: leaving the presentation via a demo link and coming
// back (the floating "חזרה למצגת" control) resumes the exact section, timers
// and drawers. Storage failures are swallowed — persistence must never break
// the presentation itself.

export type PresentationViewMode = "overview" | "present" | "handout";

export interface PresentationSessionState {
  mode: PresentationViewMode;
  /** 0-based index of the active section */
  sectionIndex: number;
  /** overall stopwatch — accumulated ms (persisted paused) */
  overallAccumulatedMs: number;
  /** active-section stopwatch — accumulated ms (persisted paused) */
  sectionAccumulatedMs: number;
  /** was the timer running when we left (resume keeps it paused but visible) */
  timerWasRunning: boolean;
  notesOpen: boolean;
  backupOpen: boolean;
  rehearsalActive: boolean;
  savedAt: string;
}

export const PRESENTATION_STATE_KEY = "teragon.w7f.presentation.state";
/** set while the presenter is OUT on a demo link — drives "חזרה למצגת" */
export const PRESENTATION_RETURN_KEY = "teragon.w7f.presentation.return";
export const PRESENTATION_ROUTE = "/submission/presentation";

function storage(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

export function savePresentationState(state: PresentationSessionState): void {
  try {
    storage()?.setItem(PRESENTATION_STATE_KEY, JSON.stringify(state));
  } catch {
    // persistence must never break the presentation
  }
}

export function loadPresentationState(): PresentationSessionState | null {
  try {
    const raw = storage()?.getItem(PRESENTATION_STATE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const p = parsed as Record<string, unknown>;
    if (
      (p.mode !== "overview" && p.mode !== "present" && p.mode !== "handout") ||
      typeof p.sectionIndex !== "number" ||
      typeof p.overallAccumulatedMs !== "number" ||
      typeof p.sectionAccumulatedMs !== "number"
    ) {
      return null;
    }
    return {
      mode: p.mode,
      sectionIndex: Math.min(4, Math.max(0, Math.floor(p.sectionIndex))),
      overallAccumulatedMs: Math.max(0, p.overallAccumulatedMs),
      sectionAccumulatedMs: Math.max(0, p.sectionAccumulatedMs),
      timerWasRunning: p.timerWasRunning === true,
      notesOpen: p.notesOpen === true,
      backupOpen: p.backupOpen === true,
      rehearsalActive: p.rehearsalActive === true,
      savedAt: typeof p.savedAt === "string" ? p.savedAt : "",
    };
  } catch {
    return null;
  }
}

export function clearPresentationState(): void {
  try {
    storage()?.removeItem(PRESENTATION_STATE_KEY);
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// the "out on a demo link" flag → floating "חזרה למצגת" control
// ---------------------------------------------------------------------------

/** same-tab change event (storage events fire cross-tab only) */
export const PRESENTATION_RETURN_EVENT = "w7f-presentation-return-changed";

function notifyReturnChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(PRESENTATION_RETURN_EVENT));
  }
}

export function markPresentationReturn(): void {
  try {
    storage()?.setItem(PRESENTATION_RETURN_KEY, "1");
  } catch {
    // ignore
  }
  notifyReturnChanged();
}

export function clearPresentationReturn(): void {
  try {
    storage()?.removeItem(PRESENTATION_RETURN_KEY);
  } catch {
    // ignore
  }
  notifyReturnChanged();
}

export function hasPresentationReturn(): boolean {
  try {
    return storage()?.getItem(PRESENTATION_RETURN_KEY) === "1";
  } catch {
    return false;
  }
}
