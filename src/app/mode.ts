// App mode — Mode A ("local-demo": IndexedDB + LocalRulesProvider, no secrets)
// vs Mode B ("connected": server-detected env, real /health). Detection is a stub
// until Wave 5: the client will ask /.netlify/functions/health and show honest status.

export type AppMode = "local-demo" | "connected";

/** Hebrew UI label for the permanent mode badge. */
export const MODE_LABEL: Record<AppMode, string> = {
  "local-demo": "מצב הדגמה מקומי",
  connected: "מצב מחובר",
};

/**
 * Detection stub — always local-demo until the Wave 5 health endpoint exists.
 * Kept as a function (not a constant) so callers already depend on the final shape.
 */
export function detectMode(): AppMode {
  return "local-demo";
}

/** Hook-shaped accessor for components; today static, later backed by /health polling. */
export function useAppMode(): AppMode {
  return detectMode();
}
