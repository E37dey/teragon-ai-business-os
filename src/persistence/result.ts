// TERAGON AI BUSINESS OS — Gate S4: safe result + loading-state contracts.
//
// The remote (Supabase) boundary NEVER lets a raw PostgREST/network error reach
// the UI. Every remote operation returns a typed `RepoResult` — a discriminated
// union the UI can render (success or a SAFE, human-readable error) — plus a
// loading-state helper for the async lifecycle.

/** Stable, provider-agnostic error codes. No raw PostgREST payloads leak here. */
export type SafeErrorCode =
  | "not_found"
  | "duplicate"
  | "validation" // a row failed zod validation at the boundary
  | "conflict" // optimistic / unique conflict
  | "unauthorized" // RLS / auth denied
  | "network" // transport failure / timeout
  | "unavailable" // provider not configured / offline
  | "unknown";

/** A UI-safe error. `detail` is a short, non-sensitive hint — never a raw error. */
export interface SafeError {
  readonly code: SafeErrorCode;
  /** Hebrew-first, human-readable message safe to show a user. */
  readonly message: string;
  /** Short non-sensitive context (collection / id). Never a raw driver payload. */
  readonly detail?: string;
  /** Whether a retry could plausibly succeed (network/unavailable). */
  readonly retriable: boolean;
}

export type RepoResult<T> = { readonly ok: true; readonly data: T } | { readonly ok: false; readonly error: SafeError };

export function ok<T>(data: T): RepoResult<T> {
  return { ok: true, data };
}

export function err<T = never>(error: SafeError): RepoResult<T> {
  return { ok: false, error };
}

const SAFE_MESSAGES: Record<SafeErrorCode, string> = {
  not_found: "הפריט לא נמצא",
  duplicate: "פריט עם מזהה זה כבר קיים",
  validation: "הנתונים שהתקבלו אינם תקינים",
  conflict: "התגלה קונפליקט בעת השמירה",
  unauthorized: "אין הרשאה לפעולה זו",
  network: "תקלת רשת — נסו שוב",
  unavailable: "שירות האחסון אינו זמין",
  unknown: "אירעה שגיאה בלתי צפויה",
};

export function safeError(code: SafeErrorCode, detail?: string): SafeError {
  return {
    code,
    message: SAFE_MESSAGES[code],
    detail,
    retriable: code === "network" || code === "unavailable",
  };
}

// ---------------------------------------------------------------------------
// pagination
// ---------------------------------------------------------------------------

/** Range-based page request (inclusive `from`/`to`, mirrors PostgREST .range). */
export interface PageRequest {
  readonly from: number;
  readonly to: number;
}

export interface Page<T> {
  readonly rows: readonly T[];
  readonly range: PageRequest;
  /** True when a full page was returned (there may be more rows past `to`). */
  readonly hasMore: boolean;
}

// ---------------------------------------------------------------------------
// loading state (async lifecycle the UI can render)
// ---------------------------------------------------------------------------

export type AsyncStatus = "idle" | "loading" | "success" | "error";

export type AsyncState<T> =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly status: "success"; readonly data: T }
  | { readonly status: "error"; readonly error: SafeError };

export const AsyncStates = {
  idle: <T>(): AsyncState<T> => ({ status: "idle" }),
  loading: <T>(): AsyncState<T> => ({ status: "loading" }),
  fromResult: <T>(r: RepoResult<T>): AsyncState<T> =>
    r.ok ? { status: "success", data: r.data } : { status: "error", error: r.error },
} as const;
