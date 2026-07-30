// TERAGON AI BUSINESS OS — Gate S4: PostgREST/Supabase error → SafeError mapping.
//
// A raw PostgREST error (driver payload: sql state code, table names, hints)
// must NEVER reach the UI. This module translates it into a stable, non-sensitive
// `SafeError`. The raw payload is intentionally dropped (only a coarse code +
// the collection name survive as `detail`).
import { safeError, type SafeError, type SafeErrorCode } from "../result";

/** Shape of a PostgREST error as returned by supabase-js (subset we rely on). */
export interface PostgrestErrorLike {
  message?: string;
  code?: string; // e.g. "23505" (unique_violation), "PGRST116" (no rows)
  details?: string;
  hint?: string;
}

function isPostgrestError(e: unknown): e is PostgrestErrorLike {
  return typeof e === "object" && e !== null && ("code" in e || "message" in e);
}

/** Map a Postgres SQLSTATE / PostgREST code to a coarse, safe category. */
function codeToSafe(code: string | undefined): SafeErrorCode {
  switch (code) {
    case "23505": // unique_violation
      return "duplicate";
    case "23503": // foreign_key_violation
    case "23514": // check_violation
    case "23502": // not_null_violation
      return "conflict";
    case "PGRST116": // no rows returned by .single()
      return "not_found";
    case "42501": // insufficient_privilege (RLS)
    case "PGRST301": // JWT / auth
      return "unauthorized";
    default:
      return "unknown";
  }
}

/**
 * Convert any thrown/returned remote failure into a UI-safe error. Accepts a
 * PostgREST error object, a transport `Error`, or anything else — and never
 * echoes the raw payload.
 */
export function toSafeError(e: unknown, detail?: string): SafeError {
  if (isPostgrestError(e)) return safeError(codeToSafe(e.code), detail);
  if (e instanceof Error) {
    // Transport-level failures (fetch abort / offline) surface as network.
    if (/network|fetch|timeout|abort/iu.test(e.message)) return safeError("network", detail);
    return safeError("unknown", detail);
  }
  return safeError("unknown", detail);
}
