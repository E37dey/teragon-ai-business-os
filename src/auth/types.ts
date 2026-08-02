// TERAGON AI BUSINESS OS — Gate S8.0: provider-neutral application Auth boundary.
//
// This is the ONE interface the whole application talks to for authentication and
// identity. Two implementations satisfy it:
//   * LocalAuthProvider   — the DEFAULT (LOCAL_INDEXEDDB) behaviour. No remote
//                           auth; the app is usable exactly as before.
//   * SupabaseAuthProvider — real Supabase Auth, selected ONLY when the platform
//                            resolves to the SUPABASE persistence provider.
//
// The composition selector (see ./composition) picks exactly one. There is NO
// silent fallback: a build wired for SUPABASE never quietly drops to LOCAL.
//
// SECURITY CONTRACT (mirrors the DB RLS design):
//   * The browser only ever holds the PUBLIC anon (publishable) key + a real
//     user JWT session. Never a service-role / secret / db-password / admin
//     password / raw access token.
//   * `ResolvedIdentity` is CANONICAL — every field is derived from
//     server-controlled records (the `current_profile()` SECURITY DEFINER RPC +
//     RLS-protected reads). The browser NEVER supplies org / role / active /
//     membership / capabilities.

/**
 * Which authentication mode the running app resolved to. Mirrors the persistence
 * provider selection but is a distinct concept (auth vs. storage backend).
 */
export type AuthMode = "LOCAL" | "SUPABASE";

/**
 * Internal, DIFFERENTIATED failure taxonomy. The UI surfaces a SAFE Hebrew
 * message per category (see ./authError); the category itself is never a leak
 * (it carries no secret, JWT, or raw provider text).
 */
export type AuthErrorCategory =
  | "INVALID_CREDENTIALS" // email/password rejected by the auth server
  | "INACTIVE_ACCOUNT" // valid session, but the profile is not active
  | "MISSING_MEMBERSHIP" // valid session, but no active canonical membership
  | "MISSING_PROFILE" // valid session, but no application profile row
  | "MALFORMED_IDENTITY" // inconsistent / duplicate / unparseable identity data
  | "NETWORK" // could not reach the auth / data server
  | "SESSION_EXPIRED" // the session is no longer valid and could not refresh
  | "NOT_CONFIGURED" // Supabase env is absent (never a silent local fallback)
  | "UNKNOWN"; // anything not otherwise classified

/** A user-safe error: a stable category + a Hebrew message with no sensitive data. */
export interface SafeAuthError {
  readonly category: AuthErrorCategory;
  readonly message: string;
}

/**
 * The canonical, server-resolved application identity. Only ever constructed by
 * the identity resolver AFTER a valid session, from server-controlled data, and
 * ONLY when the account is active with a single consistent membership.
 */
export interface ResolvedIdentity {
  /** auth.users id (uuid) for the authenticated session. */
  readonly userId: string;
  /** application profile id (equals userId in this schema). */
  readonly profileId: string;
  readonly name: string;
  readonly email: string;
  /** tenant anchor — from the profile, never from the browser. */
  readonly organizationId: string;
  readonly organizationName: string;
  /** canonical role id (crole-*). */
  readonly roleId: string;
  readonly roleLabel: string;
  /** the role's capability set (roles.permissions), server-controlled. */
  readonly capabilities: readonly string[];
  /** the active canonical membership backing this identity. */
  readonly membershipId: string;
}

/** Lifecycle status of the auth boundary. */
export type AuthStatus =
  | "INITIALIZING" // restoring a persisted session on boot
  | "SIGNED_OUT" // no active session
  | "SIGNING_IN" // signInWithPassword in flight
  | "AUTHENTICATED" // valid session + resolved canonical identity
  | "SIGNING_OUT" // signOut in flight
  | "ERROR"; // a classified, user-safe failure (see `error`)

/** The full observable auth state. */
export interface AuthState {
  readonly mode: AuthMode;
  readonly status: AuthStatus;
  readonly identity: ResolvedIdentity | null;
  readonly error: SafeAuthError | null;
}

/**
 * The provider-neutral boundary. Both LOCAL and SUPABASE implementations honour
 * this contract. All methods resolve to the NEW state (also broadcast to
 * subscribers) so callers can `await` and read the outcome.
 */
export interface AuthBoundary {
  readonly mode: AuthMode;
  /** Restore any persisted session and resolve identity. Never throws. */
  initialize(): Promise<AuthState>;
  /** Authenticate with email + password. Never throws — failures are classified. */
  signIn(email: string, password: string): Promise<AuthState>;
  /** End the session and clear identity. Never throws. */
  signOut(): Promise<AuthState>;
  /** Refresh the session (and re-resolve identity). Never throws. */
  refresh(): Promise<AuthState>;
  /** The current resolved identity, or null when not authenticated. */
  currentUser(): ResolvedIdentity | null;
  /** A synchronous snapshot of the current state. */
  getState(): AuthState;
  /** Subscribe to state changes. Returns an unsubscribe function. */
  subscribe(listener: (state: AuthState) => void): () => void;
}
