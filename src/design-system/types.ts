/**
 * TERAGON AI BUSINESS OS — shared design-system types.
 */

/** The six accent tones of the OS (mandatory palette). */
export type OsAccent = "blue" | "cyan" | "violet" | "success" | "warning" | "danger";

/** Tier cards only use the three "cool" accents (per reference 19.png). */
export type OsTierAccent = "cyan" | "blue" | "violet";

/**
 * The 8 canonical Hebrew statuses. Each has exactly ONE color across the
 * whole product (docs/VISUAL_DNA.md pattern 4). Never invent new statuses.
 */
export type OsStatus =
  "פעיל" | "ממתין" | "דורש אישור" | "חסום" | "מושבת" | "הושלם" | "אזהרה" | "מושהה";

/**
 * Accent colors for inline SVG / icon needs (KPI icons, sparklines).
 * Visual Calm v2: resolves to the calm readable token variants (not raw hex),
 * so icons/series follow the canonical palette and stay AA-legible on dark.
 */
export const OS_ACCENT_HEX: Record<OsAccent, string> = {
  blue: "var(--accent-primary-text)",
  cyan: "var(--accent-primary-text)",
  violet: "var(--accent-ai-text)",
  success: "var(--success-text)",
  warning: "var(--warning-text)",
  danger: "var(--danger-text)",
};
