// TERAGON AI BUSINESS OS — the presentation keyboard map (W7-F, 7.22).
//
// RTL SEMANTICS (documented + tested): the presentation reads right-to-left,
// so "forward" is LEFTWARD on screen. Therefore:
//   ArrowLeft  = קדימה (next section)   — the direction the content flows
//   ArrowRight = אחורה (previous section)
//   Space      = קדימה (next section)
//   Escape     = יציאה ממצב מצגת
//   N          = פתיחת/סגירת מגירת הערות המרצה
//   T          = הפעלה/השהיה של הטיימר
//   D          = מעבר לקישור הדמו של השקף הנוכחי
//   B          = מצב צילומי גיבוי
// Matching is on KeyboardEvent.code — layout-independent (works with a Hebrew
// keyboard layout where the letter keys produce Hebrew characters).

export type PresentationKeyAction =
  | "next"
  | "prev"
  | "exit"
  | "toggle-notes"
  | "toggle-timer"
  | "open-demo"
  | "toggle-backup";

/** The full canonical keyboard map (code → action). */
export const PRESENTATION_KEY_MAP: Readonly<Record<string, PresentationKeyAction>> = {
  // RTL: ArrowLeft moves FORWARD, ArrowRight moves BACK
  ArrowLeft: "next",
  ArrowRight: "prev",
  Space: "next",
  Escape: "exit",
  KeyN: "toggle-notes",
  KeyT: "toggle-timer",
  KeyD: "open-demo",
  KeyB: "toggle-backup",
};

export interface PresentationKeyEventLike {
  code: string;
  /** modifier keys must NOT hijack browser shortcuts */
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  /** true when focus is inside an editable element — keys must pass through */
  targetEditable?: boolean;
}

/** Resolve a keyboard event to a presentation action (null = not handled). */
export function resolvePresentationKey(e: PresentationKeyEventLike): PresentationKeyAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  if (e.targetEditable) return null;
  return PRESENTATION_KEY_MAP[e.code] ?? null;
}

/** Is the DOM event target an editable element (input/textarea/contenteditable)? */
export function isEditableTarget(target: unknown): boolean {
  if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

/** Hebrew help lines for the on-screen keyboard legend. */
export const KEYBOARD_LEGEND_HE: ReadonlyArray<{ keys: string; action: string }> = [
  { keys: "← / רווח", action: "קדימה (חץ שמאלה — כיוון הקריאה ב-RTL)" },
  { keys: "→", action: "אחורה (חץ ימינה)" },
  { keys: "N", action: "הערות מרצה" },
  { keys: "T", action: "טיימר — הפעלה/השהיה" },
  { keys: "D", action: "קישור דמו" },
  { keys: "B", action: "צילומי גיבוי" },
  { keys: "Esc", action: "יציאה ממצב מצגת" },
];
