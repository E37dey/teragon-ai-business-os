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

/** Accent hex values for inline SVG needs (sparklines). Mirrors tokens.css. */
export const OS_ACCENT_HEX: Record<OsAccent, string> = {
  blue: "#287BFF",
  cyan: "#20C4E8",
  violet: "#7655FF",
  success: "#21C981",
  warning: "#E7A93D",
  danger: "#EC5D68",
};
