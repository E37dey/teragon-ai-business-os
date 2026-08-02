/// <reference types="node" />
// Gate S8 — AUTHORITATIVE live staging Auth integration.
//
// Drives the REAL SupabaseAuthProvider against teragon-staging using the browser
// anon (publishable) key + the staging admin credentials. Asserts the canonical
// identity resolves through the real RLS policies + current_profile() SECURITY
// DEFINER RPC to org-teragon / crole-sysadmin / active, that the session is
// restorable, and that sign-out clears it. No service-role key, JWT, or password
// is ever printed. Enabled ONLY via `npm run test:staging:auth:live` with
// STAGING_AUTH_LIVE=1 (setup.ts fails hard otherwise — never skips).
import { afterAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { SupabaseAuthProvider, type SupabaseAuthClient } from "@/auth/SupabaseAuthProvider";
import { resolveIdentity, type IdentityClient } from "@/auth/identity";
import { assertStagingAuthLiveOrThrow } from "./env";

const env = assertStagingAuthLiveOrThrow();
let executed = 0;

const client = createClient(env.url, env.anonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
});
const provider = new SupabaseAuthProvider({
  getClient: () => client as unknown as SupabaseAuthClient,
});

afterAll(async () => {
  // best-effort teardown; never alters the deterministic seed
  await client.auth.signOut();
});

describe("LIVE staging auth — admin canonical identity", () => {
  it("authenticates the admin and resolves org-teragon / crole-sysadmin / active", async () => {
    executed++;
    const state = await provider.signIn(env.adminEmail, env.adminPassword);
    expect(state.status).toBe("AUTHENTICATED");
    // resolveIdentity only returns when active — AUTHENTICATED implies active=true.
    expect(state.identity?.organizationId).toBe("org-teragon");
    expect(state.identity?.roleId).toBe("crole-sysadmin");
    expect(state.identity?.membershipId).toBeTruthy();
    expect(state.error).toBeNull();
  });

  it("restores the session and re-resolves identity against real RLS + RPC", async () => {
    executed++;
    const { data } = await client.auth.getSession();
    expect(data.session?.user?.id).toBeTruthy();
    const identity = await resolveIdentity(client as unknown as IdentityClient);
    expect(identity.organizationId).toBe("org-teragon");
    expect(identity.roleId).toBe("crole-sysadmin");
  });

  it("signs out and clears the session", async () => {
    executed++;
    const state = await provider.signOut();
    expect(state.status).toBe("SIGNED_OUT");
    expect(state.identity).toBeNull();
    const { data } = await client.auth.getSession();
    expect(data.session).toBeNull();
  });
});

describe("LIVE staging auth — executed guard", () => {
  it("actually executed the live flow (never zero)", () => {
    expect(executed).toBeGreaterThanOrEqual(3);
  });
});
