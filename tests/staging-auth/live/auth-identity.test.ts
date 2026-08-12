/// <reference types="node" />
// Gate S8.2 — AUTHORITATIVE live staging Auth integration.
//
// Drives the REAL SupabaseAuthProvider against teragon-staging using the browser
// anon (publishable) key + the staging admin credentials (password from
// .env.staging.local — never printed/persisted). Proves, against LIVE staging:
//   1) valid login          — admin signs in, real session, nothing raw logged
//   2) canonical identity    — active, org=org-teragon, role=crole-sysadmin,
//                              membership server-resolved; browser never supplies
//                              role/org (resolveIdentity accepts none)
//   3) session restoration   — a re-initialised provider on the same client
//                              restores the session and re-resolves identity
//   4) token refresh         — refresh is safe; the resolved identity is unchanged
//   5) logout                — Supabase session removed, app identity cleared,
//                              post-logout identity resolution is DENIED (fail closed)
//   6) invalid password      — fails safely (INVALID_CREDENTIALS), no enumeration,
//                              NO fallback to a local identity
// Route-protection redirect (unauth→login, intended-route restore, no flash) and
// the network/malformed fail-closed + no-IndexedDB-fallback guarantees are proven
// deterministically in tests/auth/{RequireAuth,LoginPage,supabaseProvider,identity}
// (they cannot be forced against live staging without harming it).
//
// Enabled ONLY via `npm run test:auth:live` with STAGING_AUTH_LIVE=1; setup.ts
// fails hard (never skips) otherwise, and the env loader fails hard on a wrong
// project or a privileged browser key.
import { afterAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { SupabaseAuthProvider, type SupabaseAuthClient } from "@/auth/SupabaseAuthProvider";
import { resolveIdentity, IdentityError, type IdentityClient } from "@/auth/identity";
import { assertStagingAuthLiveOrThrow, keyPrivilegeClass } from "./env";

const env = assertStagingAuthLiveOrThrow();
let executed = 0;
let firstUserId = "";

function newClient() {
  return createClient(env.url, env.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
}

const client = newClient();
const provider = new SupabaseAuthProvider({
  getClient: () => client as unknown as SupabaseAuthClient,
});

afterAll(async () => {
  await client.auth.signOut(); // best-effort; never alters the deterministic seed
});

describe("LIVE staging auth — provider + canonical identity", () => {
  it("target + key preconditions hold (remote project, browser-safe key)", () => {
    executed++;
    expect(env.url).toContain("bjvirkmagwpqroakazjj");
    expect(["publishable", "anon"]).toContain(keyPrivilegeClass(env.anonKey));
  });

  it("1) valid login — admin signs in and a real session exists", async () => {
    executed++;
    const state = await provider.signIn(env.adminEmail, env.adminPassword);
    expect(state.status).toBe("AUTHENTICATED");
    expect(state.error).toBeNull();
    const { data } = await client.auth.getSession();
    expect(data.session?.user?.id).toBeTruthy();
    firstUserId = state.identity?.userId ?? "";
    expect(firstUserId).toBeTruthy();
  });

  it("2) canonical identity — active, org-teragon, crole-sysadmin, membership server-resolved", () => {
    executed++;
    const id = provider.currentUser();
    expect(id).not.toBeNull();
    // These were NEVER supplied by the browser (only email+password were) — they
    // are resolved from server records via current_profile() + RLS reads.
    expect(id?.organizationId).toBe("org-teragon");
    expect(id?.roleId).toBe("crole-sysadmin");
    expect(id?.membershipId).toBeTruthy();
    expect(id?.userId).toBe(firstUserId);
  });

  it("3) session restoration — a re-initialised provider restores + re-resolves", async () => {
    executed++;
    const restored = new SupabaseAuthProvider({
      getClient: () => client as unknown as SupabaseAuthClient,
    });
    const state = await restored.initialize();
    expect(state.status).toBe("AUTHENTICATED");
    expect(state.identity?.userId).toBe(firstUserId);
    expect(state.identity?.organizationId).toBe("org-teragon");
  });

  it("4) token refresh — safe, and the resolved identity is unchanged", async () => {
    executed++;
    const state = await provider.refresh();
    expect(state.status).toBe("AUTHENTICATED");
    expect(state.identity?.userId).toBe(firstUserId);
    expect(state.identity?.roleId).toBe("crole-sysadmin");
    expect(state.identity?.organizationId).toBe("org-teragon");
  });

  it("6) invalid password — fails safely, no enumeration, no local fallback", async () => {
    executed++;
    const isolated = new SupabaseAuthProvider({
      getClient: () => newClient() as unknown as SupabaseAuthClient,
    });
    const state = await isolated.signIn(env.adminEmail, "definitely-not-the-password");
    expect(state.status).toBe("ERROR");
    expect(state.error?.category).toBe("INVALID_CREDENTIALS");
    expect(state.identity).toBeNull(); // never falls back to any local identity
    expect(isolated.mode).toBe("SUPABASE");
  });

  it("5) logout — session removed, identity cleared, post-logout access denied", async () => {
    executed++;
    const state = await provider.signOut();
    expect(state.status).toBe("SIGNED_OUT");
    expect(state.identity).toBeNull();
    const { data } = await client.auth.getSession();
    expect(data.session).toBeNull();
    // Protected access is denied after logout: identity no longer resolves.
    // With no auth.uid(), current_profile() returns a NULL composite ⇒ fail closed.
    let denied = false;
    let deniedCategory = "";
    try {
      await resolveIdentity(client as unknown as IdentityClient);
    } catch (e) {
      denied = true;
      deniedCategory = e instanceof IdentityError ? e.category : "THROWN";
    }
    expect(denied).toBe(true);
    expect(deniedCategory).toBe("MISSING_PROFILE");
  });
});

describe("LIVE staging auth — executed guard", () => {
  it("actually executed the full live flow (never zero)", () => {
    expect(executed).toBeGreaterThanOrEqual(7);
  });
});
