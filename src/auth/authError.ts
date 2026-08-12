// TERAGON AI BUSINESS OS — Gate S8.0: safe, Hebrew auth error mapping.
//
// Maps the internal AuthErrorCategory to a user-safe Hebrew message. The message
// NEVER reveals which of email/password was wrong, whether an account exists, or
// any raw provider text / JWT / secret. Callers differentiate INTERNALLY via the
// category; the user only ever sees `message`.
import type { AuthErrorCategory, SafeAuthError } from "./types";

const MESSAGES: Record<AuthErrorCategory, string> = {
  // Deliberately does not disclose which field was wrong or whether the user exists.
  INVALID_CREDENTIALS: "האימות נכשל. בדקו את כתובת האימייל והסיסמה ונסו שוב.",
  INACTIVE_ACCOUNT: "החשבון אינו פעיל. פנו למנהל המערכת.",
  MISSING_MEMBERSHIP: "אין לחשבון שיוך פעיל לארגון. פנו למנהל המערכת.",
  MISSING_PROFILE: "לא נמצא פרופיל משתמש עבור החשבון. פנו למנהל המערכת.",
  MALFORMED_IDENTITY: "לא ניתן לאמת את זהות המשתמש. פנו למנהל המערכת.",
  NETWORK: "אין חיבור לשרת האימות. בדקו את החיבור ונסו שוב.",
  SESSION_EXPIRED: "פג תוקף החיבור. יש להתחבר מחדש.",
  NOT_CONFIGURED: "שירות האימות אינו מוגדר בסביבה זו.",
  UNKNOWN: "אירעה שגיאה בלתי צפויה בתהליך ההתחברות. נסו שוב.",
};

/** Build a user-safe error object for a category. */
export function safeAuthError(category: AuthErrorCategory): SafeAuthError {
  return { category, message: MESSAGES[category] };
}

/**
 * Classify a raw error thrown by `@supabase/supabase-js` auth calls into a safe
 * category WITHOUT propagating its text. supabase-js surfaces network problems
 * as fetch failures and rejected credentials as `AuthApiError` (status 400 with
 * code "invalid_credentials"). Everything else is UNKNOWN.
 */
export function classifySupabaseAuthError(err: unknown): AuthErrorCategory {
  const e = err as { name?: string; status?: number; code?: string; message?: string } | null;
  if (!e) return "UNKNOWN";
  // Network / fetch failures: no HTTP status reached us.
  if (e.name === "AuthRetryableFetchError" || e.name === "TypeError") return "NETWORK";
  if (typeof e.message === "string" && /fetch failed|network|Failed to fetch/i.test(e.message)) {
    return "NETWORK";
  }
  if (e.code === "invalid_credentials" || e.status === 400) return "INVALID_CREDENTIALS";
  if (e.status === 401 || e.code === "session_expired" || e.name === "AuthSessionMissingError") {
    return "SESSION_EXPIRED";
  }
  return "UNKNOWN";
}
