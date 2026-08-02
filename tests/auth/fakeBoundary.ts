// Test helper — a controllable AuthBoundary for component tests.
import type { AuthBoundary, AuthState, ResolvedIdentity } from "@/auth/types";

export function makeIdentity(over: Partial<ResolvedIdentity> = {}): ResolvedIdentity {
  return {
    userId: "u1",
    profileId: "u1",
    name: "מנהל",
    email: "admin@teragon.test",
    organizationId: "org-teragon",
    organizationName: "טרגון",
    roleId: "crole-sysadmin",
    roleLabel: "מנהל מערכת",
    capabilities: ["settings.update"],
    membershipId: "m1",
    ...over,
  };
}

/** A minimal, in-memory AuthBoundary whose state can be driven from tests. */
export class FakeBoundary implements AuthBoundary {
  readonly mode: "LOCAL" | "SUPABASE";
  private state: AuthState;
  private readonly listeners = new Set<(s: AuthState) => void>();
  signInImpl: (email: string, password: string) => AuthState = () => this.state;

  constructor(initial: AuthState) {
    this.mode = initial.mode;
    this.state = initial;
  }
  private set(next: AuthState): AuthState {
    this.state = next;
    for (const l of this.listeners) l(next);
    return next;
  }
  getState(): AuthState {
    return this.state;
  }
  currentUser(): ResolvedIdentity | null {
    return this.state.identity;
  }
  subscribe(l: (s: AuthState) => void): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  initialize(): Promise<AuthState> {
    return Promise.resolve(this.state);
  }
  signIn(email: string, password: string): Promise<AuthState> {
    return Promise.resolve(this.set(this.signInImpl(email, password)));
  }
  signOut(): Promise<AuthState> {
    return Promise.resolve(
      this.set({ mode: this.mode, status: "SIGNED_OUT", identity: null, error: null }),
    );
  }
  refresh(): Promise<AuthState> {
    return Promise.resolve(this.state);
  }
  /** Test-only: push a new state and notify subscribers. */
  push(next: AuthState): void {
    this.set(next);
  }
}
