// TERAGON AI BUSINESS OS — Gate S8.0: tiny observable state store for the auth
// boundary. Holds the current AuthState and notifies subscribers on change.
import type { AuthState } from "./types";

export class AuthStateStore {
  private state: AuthState;
  private readonly listeners = new Set<(s: AuthState) => void>();

  constructor(initial: AuthState) {
    this.state = initial;
  }

  getState(): AuthState {
    return this.state;
  }

  set(next: AuthState): AuthState {
    this.state = next;
    for (const listener of this.listeners) listener(next);
    return next;
  }

  subscribe(listener: (s: AuthState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
