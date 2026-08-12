// TERAGON AI BUSINESS OS — Gate S8.1: auth React context shape.
import { createContext } from "react";
import type { AuthMode, AuthStatus, ResolvedIdentity, SafeAuthError } from "./types";

/**
 * What the app tree may consume. Exposes ONLY safe current-user info + actions —
 * never a JWT, refresh token, raw session, or provider claims.
 */
export interface AuthContextValue {
  readonly mode: AuthMode;
  readonly status: AuthStatus;
  readonly identity: ResolvedIdentity | null;
  readonly error: SafeAuthError | null;
  /** True while restoring a persisted session (boot). */
  readonly isInitializing: boolean;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  refresh(): Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
