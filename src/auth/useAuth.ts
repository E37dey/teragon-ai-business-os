// TERAGON AI BUSINESS OS — Gate S8.1: useAuth hook.
import { useContext } from "react";
import { AuthContext, type AuthContextValue } from "./authContext";

/** Consume the auth context. Throws if used outside <AuthProvider>. */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
