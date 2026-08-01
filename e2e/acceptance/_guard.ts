// TERAGON AI BUSINESS OS — remote acceptance env guard (Gate S7.0).
// =============================================================================
// Fail-HARD gate. The acceptance harness NEVER skips: it either runs against a
// real staging preview or it throws. Absent env ⇒ throw (so a misconfigured run
// fails loudly instead of a green no-op).
export interface AcceptanceEnv {
  readonly previewUrl: string;
  readonly projectRef: string;
  readonly intendedCommit: string;
}

/** Enabled only by an explicit opt-in — anything else means "not configured". */
export function acceptanceEnabled(): boolean {
  return process.env.STAGING_ACCEPTANCE === "1";
}

/**
 * Resolve the acceptance env or throw with the missing NAMES (never values).
 * Called from the harness top-level so an enabled-but-misconfigured run fails.
 */
export function acceptanceEnvOrThrow(): AcceptanceEnv {
  if (!acceptanceEnabled()) {
    throw new Error(
      "remote acceptance requires STAGING_ACCEPTANCE=1. This harness never skips — it is excluded from the " +
        "default suite (*.accept.ts) and fails hard when run without the staging preview env.",
    );
  }
  const previewUrl = (process.env.STAGING_PREVIEW_URL ?? "").replace(/\/$/, "");
  const projectRef = process.env.STAGING_SUPABASE_PROJECT_REF ?? "";
  const intendedCommit = process.env.INTENDED_COMMIT ?? "";
  const missing = [
    previewUrl ? null : "STAGING_PREVIEW_URL",
    projectRef ? null : "STAGING_SUPABASE_PROJECT_REF",
    intendedCommit ? null : "INTENDED_COMMIT",
  ].filter((v): v is string => v !== null);
  if (missing.length) {
    throw new Error(`STAGING_ACCEPTANCE=1 but required env is missing: ${missing.join(", ")}. Configure the staging preview target.`);
  }
  return { previewUrl, projectRef, intendedCommit };
}
