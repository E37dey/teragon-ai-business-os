// Gate S8.0 — SupabaseAuthProvider: sign-in/out, session restore, fail-closed
// identity, safe error classification, and the no-silent-fallback guarantee.
import { describe, expect, it, vi } from "vitest";
import { SupabaseAuthProvider, type SupabaseAuthClient } from "@/auth/SupabaseAuthProvider";
import { SupabaseNotConfiguredError } from "@/persistence/supabase/client";
import { IdentityError } from "@/auth/identity";
import type { ResolvedIdentity } from "@/auth/types";

const IDENTITY: ResolvedIdentity = {
  userId: "u1",
  profileId: "u1",
  name: "מנהל",
  email: "admin@teragon.test",
  organizationId: "org-teragon",
  organizationName: "טרגון",
  roleId: "crole-sysadmin",
  roleLabel: "מנהל מערכת",
  capabilities: [],
  membershipId: "m1",
};

interface FakeAuthOpts {
  session?: { user: { id: string } } | null;
  signInError?: unknown;
  signInThrows?: unknown;
}

function fakeClient(opts: FakeAuthOpts = {}) {
  const signOut = vi.fn(() => Promise.resolve({ error: null }));
  const client = {
    auth: {
      getSession: vi.fn(() =>
        Promise.resolve({ data: { session: opts.session ?? null }, error: null }),
      ),
      signInWithPassword: vi.fn(() => {
        if (opts.signInThrows) return Promise.reject(opts.signInThrows);
        return Promise.resolve({ data: { session: {} }, error: opts.signInError ?? null });
      }),
      signOut,
      refreshSession: vi.fn(() =>
        Promise.resolve({ data: { session: opts.session ?? null }, error: null }),
      ),
    },
    rpc: vi.fn(),
    from: vi.fn(),
  } as unknown as SupabaseAuthClient;
  return { client, signOut };
}

describe("SupabaseAuthProvider — sign in", () => {
  it("resolves canonical identity on success → AUTHENTICATED", async () => {
    const { client } = fakeClient();
    const p = new SupabaseAuthProvider({
      getClient: () => client,
      resolveIdentityFn: () => Promise.resolve(IDENTITY),
    });
    const state = await p.signIn("admin@teragon.test", "pw");
    expect(state.status).toBe("AUTHENTICATED");
    expect(state.identity?.organizationId).toBe("org-teragon");
    expect(p.currentUser()?.roleId).toBe("crole-sysadmin");
  });

  it("classifies invalid credentials safely (no identity)", async () => {
    const { client } = fakeClient({ signInError: { status: 400, code: "invalid_credentials" } });
    const p = new SupabaseAuthProvider({
      getClient: () => client,
      resolveIdentityFn: () => Promise.resolve(IDENTITY),
    });
    const state = await p.signIn("admin@teragon.test", "bad");
    expect(state.status).toBe("ERROR");
    expect(state.error?.category).toBe("INVALID_CREDENTIALS");
    expect(state.identity).toBeNull();
  });

  it("classifies network failures", async () => {
    const { client } = fakeClient({ signInThrows: { name: "AuthRetryableFetchError" } });
    const p = new SupabaseAuthProvider({ getClient: () => client });
    const state = await p.signIn("a@b.c", "pw");
    expect(state.error?.category).toBe("NETWORK");
  });

  it("FAILS CLOSED when a valid session cannot resolve identity — signs out, no fallback", async () => {
    const { client, signOut } = fakeClient();
    const p = new SupabaseAuthProvider({
      getClient: () => client,
      resolveIdentityFn: () => Promise.reject(new IdentityError("MISSING_MEMBERSHIP", "x")),
    });
    const state = await p.signIn("admin@teragon.test", "pw");
    expect(state.status).toBe("ERROR");
    expect(state.error?.category).toBe("MISSING_MEMBERSHIP");
    expect(state.identity).toBeNull();
    expect(signOut).toHaveBeenCalledTimes(1); // half-session was torn down
  });
});

describe("SupabaseAuthProvider — session lifecycle", () => {
  it("initialize with no persisted session → SIGNED_OUT", async () => {
    const { client } = fakeClient({ session: null });
    const p = new SupabaseAuthProvider({
      getClient: () => client,
      resolveIdentityFn: () => Promise.resolve(IDENTITY),
    });
    expect((await p.initialize()).status).toBe("SIGNED_OUT");
  });

  it("initialize with a persisted session → AUTHENTICATED (restore on refresh)", async () => {
    const { client } = fakeClient({ session: { user: { id: "u1" } } });
    const p = new SupabaseAuthProvider({
      getClient: () => client,
      resolveIdentityFn: () => Promise.resolve(IDENTITY),
    });
    expect((await p.initialize()).status).toBe("AUTHENTICATED");
  });

  it("signOut clears identity → SIGNED_OUT", async () => {
    const { client } = fakeClient({ session: { user: { id: "u1" } } });
    const p = new SupabaseAuthProvider({
      getClient: () => client,
      resolveIdentityFn: () => Promise.resolve(IDENTITY),
    });
    await p.initialize();
    const state = await p.signOut();
    expect(state.status).toBe("SIGNED_OUT");
    expect(state.identity).toBeNull();
  });

  it("maps an unconfigured environment to NOT_CONFIGURED (never a local fallback)", async () => {
    const p = new SupabaseAuthProvider({
      getClient: () => {
        throw new SupabaseNotConfiguredError();
      },
    });
    const state = await p.signIn("a@b.c", "pw");
    expect(state.status).toBe("ERROR");
    expect(state.error?.category).toBe("NOT_CONFIGURED");
    expect(p.mode).toBe("SUPABASE");
  });
});
