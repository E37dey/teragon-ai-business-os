// TERAGON AI BUSINESS OS — Gate S8.1: AuthProvider (React binding).
//
// Constructs the one auth boundary (composition selector), restores any
// persisted session on mount, and exposes SAFE state + actions to the tree via
// `useSyncExternalStore`. It surfaces only name/email/org/role/logout-level
// information — never a JWT, refresh token, raw session, or provider claims.
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { ReactElement, ReactNode } from "react";
import { AuthContext, type AuthContextValue } from "./authContext";
import { createAuthBoundary } from "./composition";
import type { AuthBoundary } from "./types";

export function AuthProvider({
  children,
  boundary,
}: {
  children: ReactNode;
  /** Injectable for tests / harness. Default = the composition selector. */
  boundary?: AuthBoundary;
}): ReactElement {
  const ref = useRef<AuthBoundary | null>(boundary ?? null);
  if (ref.current === null) ref.current = createAuthBoundary();
  const auth = ref.current;

  const state = useSyncExternalStore(
    (cb) => auth.subscribe(cb),
    () => auth.getState(),
    () => auth.getState(),
  );

  // Restore a persisted session exactly once on mount.
  useEffect(() => {
    void auth.initialize();
  }, [auth]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      await auth.signIn(email, password);
    },
    [auth],
  );
  const signOut = useCallback(async () => {
    await auth.signOut();
  }, [auth]);
  const refresh = useCallback(async () => {
    await auth.refresh();
  }, [auth]);

  const value = useMemo<AuthContextValue>(
    () => ({
      mode: state.mode,
      status: state.status,
      identity: state.identity,
      error: state.error,
      isInitializing: state.status === "INITIALIZING",
      signIn,
      signOut,
      refresh,
    }),
    [state, signIn, signOut, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
