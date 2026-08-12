// Gate S8.0 — LocalAuthProvider preserves the default (no-login) experience.
import { describe, expect, it } from "vitest";
import { LocalAuthProvider } from "@/auth/LocalAuthProvider";

describe("LocalAuthProvider", () => {
  it("is always authenticated as the local operator", async () => {
    const p = new LocalAuthProvider();
    expect(p.mode).toBe("LOCAL");
    const s = await p.initialize();
    expect(s.status).toBe("AUTHENTICATED");
    expect(s.identity?.userId).toBe("local-operator");
    expect(s.error).toBeNull();
  });
  it("signIn / signOut keep the app usable (no remote session)", async () => {
    const p = new LocalAuthProvider();
    expect((await p.signIn()).status).toBe("AUTHENTICATED");
    expect((await p.signOut()).status).toBe("AUTHENTICATED");
    expect(p.currentUser()?.roleId).toBe("local");
  });
});
