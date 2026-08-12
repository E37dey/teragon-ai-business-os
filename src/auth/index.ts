// TERAGON AI BUSINESS OS — Gate S8: application Auth boundary public surface.
export type {
  AuthBoundary,
  AuthMode,
  AuthState,
  AuthStatus,
  AuthErrorCategory,
  SafeAuthError,
  ResolvedIdentity,
} from "./types";
export { AuthProvider } from "./AuthProvider";
export { AuthContext, type AuthContextValue } from "./authContext";
export { useAuth } from "./useAuth";
export { RequireAuth } from "./RequireAuth";
export { LoginPage } from "./LoginPage";
export { createAuthBoundary, resolveAuthMode } from "./composition";
export { SupabaseAuthProvider } from "./SupabaseAuthProvider";
export { LocalAuthProvider, LOCAL_IDENTITY } from "./LocalAuthProvider";
export { resolveIdentity, IdentityError, type IdentityClient } from "./identity";
export { safeAuthError, classifySupabaseAuthError } from "./authError";
