// TERAGON AI BUSINESS OS — honest Obsidian sync status lines (Wave 6, W6-B).
// These two lines replace the /memory rail's "בבנייה" placeholder ONLY now
// that import/export are actually wired (W6-B shipped). Line 2 stays honest:
// the app runs in the browser and has NO direct local-folder access.
export const OBSIDIAN_STATUS_ACTIVE_HE = "ייבוא וייצוא Obsidian פעיל";
export const OBSIDIAN_STATUS_NO_LOCAL_ACCESS_HE = "גישה מקומית ישירה אינה פעילה";

/** the two mandated status lines for the /memory rail. */
export function obsidianStatus(): readonly [string, string] {
  return [OBSIDIAN_STATUS_ACTIVE_HE, OBSIDIAN_STATUS_NO_LOCAL_ACCESS_HE] as const;
}
