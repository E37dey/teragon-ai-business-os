// TERAGON Business Graph — Phase 8 APPLICATION-FACADE typed error model.
// ---------------------------------------------------------------------------
// A CLOSED set of safe result codes and a typed error class. Every failure the
// facade can surface maps to exactly one code. A code NEVER carries a stack
// trace, a raw IndexedDB error, a hidden entity id, permission internals, or any
// sensitive value — only the code plus a fixed, safe Hebrew message. Where the
// contract requires it, "unauthorized" and "absent" collapse to the SAME code so
// the two remain indistinguishable to the caller.
import { z } from "zod";

// ---------------------------------------------------------------------------
// result codes (closed)
// ---------------------------------------------------------------------------

export const BUSINESS_GRAPH_FACADE_RESULT_CODES = [
  "OK",
  "DISABLED",
  "UNAUTHENTICATED",
  "IDENTITY_AMBIGUOUS",
  "ORGANIZATION_MISMATCH",
  "FORBIDDEN",
  "GRAPH_MISSING",
  "GRAPH_UNHEALTHY",
  "STALE_NOT_AUTHORIZED",
  "QUERY_NOT_READY",
  "LIMIT_EXCEEDED",
  "INTERNAL_FAILURE",
] as const;
export type BusinessGraphFacadeResultCode = (typeof BUSINESS_GRAPH_FACADE_RESULT_CODES)[number];
export const businessGraphFacadeResultCodeSchema = z.enum(BUSINESS_GRAPH_FACADE_RESULT_CODES);

/** Every non-OK code (the ERROR codes). */
export type BusinessGraphFacadeErrorCode = Exclude<BusinessGraphFacadeResultCode, "OK">;

// ---------------------------------------------------------------------------
// fixed, safe Hebrew messages (no sensitive detail — ever)
// ---------------------------------------------------------------------------

const SAFE_MESSAGES_HE: Record<BusinessGraphFacadeErrorCode, string> = {
  DISABLED: "יכולת גרף העסקי מכובה — הבקשה לא בוצעה",
  UNAUTHENTICATED: "הזהות אינה מאומתת — הגישה נדחתה",
  IDENTITY_AMBIGUOUS: "הזהות אינה חד-משמעית — הגישה נדחתה",
  ORGANIZATION_MISMATCH: "הבקשה אינה תואמת את הארגון המורשה",
  FORBIDDEN: "אין הרשאה לפעולה זו",
  GRAPH_MISSING: "אינדקס הגרף אינו זמין",
  GRAPH_UNHEALTHY: "אינדקס הגרף אינו במצב תקין",
  STALE_NOT_AUTHORIZED: "גרף לא-עדכני אינו מורשה לצרכן זה",
  QUERY_NOT_READY: "השאילתה אינה נתמכת על-ידי נתוני הגרף הנוכחיים",
  LIMIT_EXCEEDED: "הבקשה חורגת מהמכסה המותרת",
  INTERNAL_FAILURE: "אירעה שגיאה פנימית — הבקשה לא הושלמה",
};

/** The fixed, safe Hebrew message for an error code (never sensitive). */
export function safeMessageFor(code: BusinessGraphFacadeErrorCode): string {
  return SAFE_MESSAGES_HE[code];
}

// ---------------------------------------------------------------------------
// typed error
// ---------------------------------------------------------------------------

/**
 * The typed application-facade error. Carries ONLY a safe result code and a
 * fixed safe Hebrew message. It never embeds a cause, a stack from a lower layer,
 * or any raw value. It is thrown internally to short-circuit the secure execution
 * path and is always caught + mapped to a `BusinessGraphFacadeResult` — it never
 * escapes to the caller.
 */
export class BusinessGraphApplicationError extends Error {
  readonly code: BusinessGraphFacadeErrorCode;
  readonly detailHe: string;

  constructor(code: BusinessGraphFacadeErrorCode) {
    const detailHe = SAFE_MESSAGES_HE[code];
    super(`${code}: ${detailHe}`);
    this.name = "BusinessGraphApplicationError";
    this.code = code;
    this.detailHe = detailHe;
  }

  /** The safe error envelope surfaced on a facade result. */
  toSafeError(): BusinessGraphFacadeError {
    return { code: this.code, messageHe: this.detailHe };
  }
}

/** The safe error envelope carried on a facade result (no stack, no cause). */
export interface BusinessGraphFacadeError {
  code: BusinessGraphFacadeErrorCode;
  messageHe: string;
}
