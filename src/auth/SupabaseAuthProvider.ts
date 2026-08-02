// TERAGON AI BUSINESS OS — Gate S8.0: SupabaseAuthProvider.
//
// Real Supabase Auth against ONE browser-safe client (PUBLIC anon key + a real
// user JWT session, persisted + auto-refreshed). It NEVER touches a service-role
// / secret / db-password / admin key. After a valid session it resolves the
// CANONICAL identity from server records (see ./identity) and FAILS CLOSED:
//   * a failed sign-in is classified (invalid creds / network) — no local identity;
//   * a valid session whose identity cannot be resolved is signed OUT again and
//     surfaced as a safe error — the app is NEVER left half-authenticated, and
//     there is NO silent fallback to a local/browser-supplied identity.
import { getSupabaseClient, SupabaseNotConfiguredError } from "@/persistence/supabase/client";
import { classifySupabaseAuthError, safeAuthError } from "./authError";
import { IdentityError, resolveIdentity, type IdentityClient } from "./identity";
import { AuthStateStore } from "./stateStore";
import type { AuthBoundary, AuthState, ResolvedIdentity } from "./types";

/** The narrow client surface this provider needs (structurally satisfied by the real client). */
export interface SupabaseAuthClient extends IdentityClient {
  auth: {
    getSession(): Promise<{ data: { session: { user: { id: string } } | null }; error: unknown }>;
    signInWithPassword(credentials: {
      email: string;
      password: string;
    }): Promise<{ data: { session: unknown }; error: unknown }>;
    signOut(): Promise<{ error: unknown }>;
    refreshSession(): Promise<{
      data: { session: { user: { id: string } } | null };
      error: unknown;
    }>;
  };
}

interface SupabaseAuthProviderOptions {
  /** Injectable for tests. Default builds the one browser-safe client. */
  readonly getClient?: () => SupabaseAuthClient;
  /** Injectable for tests. Default is the canonical resolver. */
  readonly resolveIdentityFn?: (client: IdentityClient) => Promise<ResolvedIdentity>;
}

const INITIAL: AuthState = {
  mode: "SUPABASE",
  status: "INITIALIZING",
  identity: null,
  error: null,
};

export class SupabaseAuthProvider implements AuthBoundary {
  readonly mode = "SUPABASE" as const;
  private readonly store = new AuthStateStore(INITIAL);
  private readonly getClient: () => SupabaseAuthClient;
  private readonly resolveIdentityFn: (client: IdentityClient) => Promise<ResolvedIdentity>;

  constructor(options: SupabaseAuthProviderOptions = {}) {
    this.getClient =
      options.getClient ?? (() => getSupabaseClient() as unknown as SupabaseAuthClient);
    this.resolveIdentityFn = options.resolveIdentityFn ?? resolveIdentity;
  }

  getState(): AuthState {
    return this.store.getState();
  }

  currentUser(): ResolvedIdentity | null {
    return this.store.getState().identity;
  }

  subscribe(listener: (s: AuthState) => void): () => void {
    return this.store.subscribe(listener);
  }

  /** Resolve the client or map an unconfigured env to a safe NOT_CONFIGURED state. */
  private resolveClient(): SupabaseAuthClient | null {
    try {
      return this.getClient();
    } catch (err) {
      if (err instanceof SupabaseNotConfiguredError) {
        this.store.set({
          mode: "SUPABASE",
          status: "ERROR",
          identity: null,
          error: safeAuthError("NOT_CONFIGURED"),
        });
        return null;
      }
      this.store.set({
        mode: "SUPABASE",
        status: "ERROR",
        identity: null,
        error: safeAuthError("UNKNOWN"),
      });
      return null;
    }
  }

  /**
   * Resolve canonical identity for an established session. On success →
   * AUTHENTICATED. On failure → sign the session out (never keep a half-auth)
   * and surface the classified, safe error. Returns the resulting state.
   */
  private async completeWithIdentity(client: SupabaseAuthClient): Promise<AuthState> {
    try {
      const identity = await this.resolveIdentityFn(client);
      return this.store.set({
        mode: "SUPABASE",
        status: "AUTHENTICATED",
        identity,
        error: null,
      });
    } catch (err) {
      // Fail closed: drop the session so the app is never half-authenticated.
      try {
        await client.auth.signOut();
      } catch {
        /* best-effort teardown; the error surfaced below is what matters */
      }
      const category = err instanceof IdentityError ? err.category : "MALFORMED_IDENTITY";
      return this.store.set({
        mode: "SUPABASE",
        status: "ERROR",
        identity: null,
        error: safeAuthError(category),
      });
    }
  }

  async initialize(): Promise<AuthState> {
    const client = this.resolveClient();
    if (!client) return this.store.getState();
    this.store.set({ mode: "SUPABASE", status: "INITIALIZING", identity: null, error: null });
    try {
      const { data, error } = await client.auth.getSession();
      if (error) {
        return this.store.set({
          mode: "SUPABASE",
          status: "ERROR",
          identity: null,
          error: safeAuthError("NETWORK"),
        });
      }
      if (!data.session) {
        return this.store.set({
          mode: "SUPABASE",
          status: "SIGNED_OUT",
          identity: null,
          error: null,
        });
      }
      return await this.completeWithIdentity(client);
    } catch {
      return this.store.set({
        mode: "SUPABASE",
        status: "ERROR",
        identity: null,
        error: safeAuthError("NETWORK"),
      });
    }
  }

  async signIn(email: string, password: string): Promise<AuthState> {
    const client = this.resolveClient();
    if (!client) return this.store.getState();
    this.store.set({ mode: "SUPABASE", status: "SIGNING_IN", identity: null, error: null });
    let signInError: unknown = null;
    try {
      const { error } = await client.auth.signInWithPassword({ email, password });
      signInError = error;
    } catch (err) {
      signInError = err;
    }
    if (signInError) {
      return this.store.set({
        mode: "SUPABASE",
        status: "ERROR",
        identity: null,
        error: safeAuthError(classifySupabaseAuthError(signInError)),
      });
    }
    // Session established — resolve canonical identity (fail-closed inside).
    return await this.completeWithIdentity(client);
  }

  async signOut(): Promise<AuthState> {
    const client = this.resolveClient();
    if (!client) return this.store.getState();
    this.store.set({
      mode: "SUPABASE",
      status: "SIGNING_OUT",
      identity: this.store.getState().identity,
      error: null,
    });
    try {
      await client.auth.signOut();
    } catch {
      /* even if the network call fails, we clear local identity below */
    }
    return this.store.set({ mode: "SUPABASE", status: "SIGNED_OUT", identity: null, error: null });
  }

  async refresh(): Promise<AuthState> {
    const client = this.resolveClient();
    if (!client) return this.store.getState();
    try {
      const { data, error } = await client.auth.refreshSession();
      if (error || !data.session) {
        return this.store.set({
          mode: "SUPABASE",
          status: "SIGNED_OUT",
          identity: null,
          error: safeAuthError("SESSION_EXPIRED"),
        });
      }
      return await this.completeWithIdentity(client);
    } catch {
      return this.store.set({
        mode: "SUPABASE",
        status: "ERROR",
        identity: null,
        error: safeAuthError("NETWORK"),
      });
    }
  }
}
