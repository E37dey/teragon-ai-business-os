// Gate S8.0 — canonical identity resolution: the full fail-closed matrix.
import { describe, expect, it } from "vitest";
import { resolveIdentity, IdentityError, type IdentityClient } from "@/auth/identity";

type PgResult = { data: unknown; error: { message?: string } | null };

const OK_PROFILE: PgResult = {
  data: {
    id: "u1",
    organization_id: "org-teragon",
    role_id: "crole-sysadmin",
    name: "מנהל",
    email: "admin@teragon.test",
    active: true,
    status: "פעיל",
  },
  error: null,
};
const OK_MEMBERSHIPS: PgResult = {
  data: [
    { id: "m1", organization_id: "org-teragon", profile_id: "u1", role_id: "crole-sysadmin", active: true },
  ],
  error: null,
};
const OK_ROLES: PgResult = {
  data: [{ id: "crole-sysadmin", label: "מנהל מערכת", permissions: ["settings.update", "user.manage"] }],
  error: null,
};
const OK_ORGS: PgResult = { data: [{ id: "org-teragon", name: "טרגון" }], error: null };

function makeClient(o: {
  profile?: PgResult;
  memberships?: PgResult;
  roles?: PgResult;
  organizations?: PgResult;
}): IdentityClient {
  const at = (t: string): PgResult =>
    t === "memberships"
      ? (o.memberships ?? OK_MEMBERSHIPS)
      : t === "roles"
        ? (o.roles ?? OK_ROLES)
        : (o.organizations ?? OK_ORGS);
  return {
    rpc: () => Promise.resolve(o.profile ?? OK_PROFILE),
    from(table: string) {
      const result = at(table);
      const filterable = {
        eq: () => filterable,
        then: (res: (v: PgResult) => unknown, rej?: (e: unknown) => unknown) =>
          Promise.resolve(result).then(res, rej),
      } as unknown as { eq: () => unknown } & PromiseLike<PgResult>;
      return { select: () => filterable as never };
    },
  } as IdentityClient;
}

async function categoryOf(client: IdentityClient): Promise<string> {
  try {
    await resolveIdentity(client);
    return "OK";
  } catch (e) {
    return e instanceof IdentityError ? e.category : "THROWN";
  }
}

describe("resolveIdentity — happy path", () => {
  it("returns a canonical identity from server records only", async () => {
    const identity = await resolveIdentity(makeClient({}));
    expect(identity).toMatchObject({
      userId: "u1",
      organizationId: "org-teragon",
      organizationName: "טרגון",
      roleId: "crole-sysadmin",
      roleLabel: "מנהל מערכת",
      membershipId: "m1",
    });
    expect(identity.capabilities).toContain("settings.update");
  });
});

describe("resolveIdentity — fail closed", () => {
  it("MISSING_PROFILE when current_profile is null", async () => {
    expect(await categoryOf(makeClient({ profile: { data: null, error: null } }))).toBe(
      "MISSING_PROFILE",
    );
  });
  it("MALFORMED_IDENTITY when the profile row is malformed", async () => {
    expect(await categoryOf(makeClient({ profile: { data: { id: 1 }, error: null } }))).toBe(
      "MALFORMED_IDENTITY",
    );
  });
  it("INACTIVE_ACCOUNT when active=false", async () => {
    const profile = { data: { ...(OK_PROFILE.data as object), active: false }, error: null };
    expect(await categoryOf(makeClient({ profile }))).toBe("INACTIVE_ACCOUNT");
  });
  it("INACTIVE_ACCOUNT when status is not פעיל", async () => {
    const profile = { data: { ...(OK_PROFILE.data as object), status: "מושהה" }, error: null };
    expect(await categoryOf(makeClient({ profile }))).toBe("INACTIVE_ACCOUNT");
  });
  it("MISSING_MEMBERSHIP when there is no active membership", async () => {
    expect(await categoryOf(makeClient({ memberships: { data: [], error: null } }))).toBe(
      "MISSING_MEMBERSHIP",
    );
  });
  it("MALFORMED_IDENTITY when more than one active membership", async () => {
    const memberships = {
      data: [
        { id: "m1", organization_id: "org-teragon", profile_id: "u1", role_id: "crole-sysadmin", active: true },
        { id: "m2", organization_id: "org-teragon", profile_id: "u1", role_id: "crole-sysadmin", active: true },
      ],
      error: null,
    };
    expect(await categoryOf(makeClient({ memberships }))).toBe("MALFORMED_IDENTITY");
  });
  it("MALFORMED_IDENTITY when membership org is inconsistent with profile", async () => {
    const memberships = {
      data: [{ id: "m1", organization_id: "org-other", profile_id: "u1", role_id: "crole-sysadmin", active: true }],
      error: null,
    };
    expect(await categoryOf(makeClient({ memberships }))).toBe("MALFORMED_IDENTITY");
  });
  it("MALFORMED_IDENTITY when the role cannot be resolved", async () => {
    expect(await categoryOf(makeClient({ roles: { data: [], error: null } }))).toBe(
      "MALFORMED_IDENTITY",
    );
  });
  it("MALFORMED_IDENTITY when the organization cannot be resolved", async () => {
    expect(await categoryOf(makeClient({ organizations: { data: [], error: null } }))).toBe(
      "MALFORMED_IDENTITY",
    );
  });
  it("NETWORK when a PostgREST/RLS error is returned", async () => {
    expect(
      await categoryOf(makeClient({ memberships: { data: null, error: { message: "denied" } } })),
    ).toBe("NETWORK");
  });
});
