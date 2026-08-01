// Gate S7.0.1 — Supabase project API-key classification: modern + legacy,
// fail-closed on unknown/ambiguous/missing, never echoes a value.
import { describe, expect, it } from "vitest";
import { classifyProjectKeys, classifyKind } from "../../scripts/platform/shared/keys.mjs";

describe("classifyKind", () => {
  it("maps modern + legacy names", () => {
    expect(classifyKind("publishable")).toBe("PUBLISHABLE");
    expect(classifyKind("anon")).toBe("ANON_LEGACY");
    expect(classifyKind("secret")).toBe("SECRET");
    expect(classifyKind("service_role")).toBe("SERVICE_ROLE_LEGACY");
    expect(classifyKind("weird")).toBe("UNKNOWN");
  });
});

describe("classifyProjectKeys", () => {
  it("prefers publishable + secret (modern)", () => {
    const r = classifyProjectKeys([
      { name: "publishable", api_key: "pub_123456" },
      { name: "secret", api_key: "sec_123456" },
      { name: "anon", api_key: "anon_123456" },
      { name: "service_role", api_key: "svc_123456" },
    ]);
    expect(r.browser.source).toBe("PUBLISHABLE");
    expect(r.server.source).toBe("SECRET");
    expect(r.browser.value).toBe("pub_123456");
    expect(r.server.value).toBe("sec_123456");
  });

  it("falls back to anon + service_role (legacy)", () => {
    const r = classifyProjectKeys([
      { name: "anon", api_key: "anon_123456" },
      { name: "service_role", api_key: "svc_123456" },
    ]);
    expect(r.browser.source).toBe("ANON_LEGACY");
    expect(r.server.source).toBe("SERVICE_ROLE_LEGACY");
  });

  it("REJECTS an unknown key type (fail-closed)", () => {
    expect(() =>
      classifyProjectKeys([
        { name: "anon", api_key: "a" },
        { name: "service_role", api_key: "s" },
        { name: "mystery", api_key: "m" },
      ]),
    ).toThrow(/unknown/i);
  });

  it("REJECTS an ambiguous browser slot (two differing publishable values)", () => {
    expect(() =>
      classifyProjectKeys([
        { name: "publishable", api_key: "pub_a" },
        { name: "publishable", api_key: "pub_b" },
        { name: "secret", api_key: "s" },
      ]),
    ).toThrow(/ambiguous/i);
  });

  it("REJECTS when a server-safe key cannot be identified", () => {
    expect(() => classifyProjectKeys([{ name: "anon", api_key: "a" }])).toThrow(/server-safe key could be uniquely identified/i);
  });

  it("does not leak a key value in the error message", () => {
    try {
      classifyProjectKeys([{ name: "anon", api_key: "anon_SECRETVALUE" }]);
    } catch (e) {
      expect(String(e)).not.toContain("anon_SECRETVALUE");
    }
  });
});
