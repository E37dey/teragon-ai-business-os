// TERAGON AI BUSINESS OS — Gate S8.0: LocalAuthProvider (the DEFAULT behaviour).
//
// LOCAL_INDEXEDDB is the default persistence provider, and in that mode the app
// has always been usable WITHOUT a remote login. This provider preserves that
// exactly: it presents a synthetic, local-only operator identity and is always
// AUTHENTICATED, so the shared route guard is a no-op outside a SUPABASE build.
// It performs NO network calls and holds NO credentials.
import { AuthStateStore } from "./stateStore";
import type { AuthBoundary, AuthState, ResolvedIdentity } from "./types";

/** The synthetic local operator. Not a real account — never sent to any server. */
export const LOCAL_IDENTITY: ResolvedIdentity = {
  userId: "local-operator",
  profileId: "local-operator",
  name: "משתמש מקומי",
  email: "",
  organizationId: "",
  organizationName: "",
  roleId: "local",
  roleLabel: "מקומי",
  capabilities: [],
  membershipId: "local",
};

const LOCAL_STATE: AuthState = {
  mode: "LOCAL",
  status: "AUTHENTICATED",
  identity: LOCAL_IDENTITY,
  error: null,
};

export class LocalAuthProvider implements AuthBoundary {
  readonly mode = "LOCAL" as const;
  private readonly store = new AuthStateStore(LOCAL_STATE);

  getState(): AuthState {
    return this.store.getState();
  }
  currentUser(): ResolvedIdentity | null {
    return this.store.getState().identity;
  }
  subscribe(listener: (s: AuthState) => void): () => void {
    return this.store.subscribe(listener);
  }
  initialize(): Promise<AuthState> {
    return Promise.resolve(this.store.set(LOCAL_STATE));
  }
  signIn(): Promise<AuthState> {
    // No remote auth in local mode — remain the local operator.
    return Promise.resolve(this.store.set(LOCAL_STATE));
  }
  signOut(): Promise<AuthState> {
    // Local mode has no session to end; stay usable.
    return Promise.resolve(this.store.set(LOCAL_STATE));
  }
  refresh(): Promise<AuthState> {
    return Promise.resolve(this.store.set(LOCAL_STATE));
  }
}
