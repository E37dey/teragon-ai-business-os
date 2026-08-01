// Gate S7.0.2 — robust Supabase API-key classification. Sanitized fixtures with
// TEST_VALUE placeholders only — NEVER real keys. Covers the live root cause
// (type:"default" non-semantic metadata) + modern/legacy/JWT + fail-closed.
import { describe, expect, it } from "vitest";
import { classifyProjectKeys, classifyKind } from "../../scripts/platform/shared/keys.mjs";

// --- sanitized fixtures ------------------------------------------------------
const PUB = "sb_publishable_TEST_VALUE_PLACEHOLDER";
const SEC = "sb_secret_TEST_VALUE_PLACEHOLDER";
function b64url(obj: object): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}
function jwt(role: string): string {
  return `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({ role, iss: "supabase" })}.TEST_SIGNATURE_PLACEHOLDER`;
}

describe("classifyKind (back-compat)", () => {
  it("maps semantic tokens; non-semantic → UNKNOWN", () => {
    expect(classifyKind("publishable")).toBe("PUBLISHABLE");
    expect(classifyKind("service_role")).toBe("SERVICE_ROLE_LEGACY");
    expect(classifyKind("default")).toBe("UNKNOWN");
  });
});

describe("modern keys with non-semantic type:'default' (the live root cause)", () => {
  it("classifies by sb_publishable_/sb_secret_ VALUE prefix", () => {
    const r = classifyProjectKeys([
      { name: "default", type: "default", api_key: PUB },
      { name: "default", type: "default", api_key: SEC },
    ]);
    expect(r.browser.source).toBe("PUBLISHABLE");
    expect(r.server.source).toBe("SECRET");
  });

  it("uses a safe prefix field when present (no full value needed)", () => {
    const r = classifyProjectKeys([
      { type: "default", prefix: "sb_publishable_", api_key: PUB },
      { type: "default", prefix: "sb_secret_", api_key: SEC },
    ]);
    expect(r.browser.source).toBe("PUBLISHABLE");
    expect(r.server.source).toBe("SECRET");
  });

  it("handles reversed order + extra irrelevant metadata", () => {
    const r = classifyProjectKeys([
      { name: "default", type: "default", api_key: SEC, id: "x", inserted_at: "t", description: "irrelevant" },
      { name: "default", type: "default", api_key: PUB, id: "y" },
    ]);
    expect(r.browser.source).toBe("PUBLISHABLE");
    expect(r.server.source).toBe("SECRET");
  });
});

describe("legacy keys", () => {
  it("classifies by explicit anon/service_role name", () => {
    const r = classifyProjectKeys([
      { name: "anon", api_key: "legacy-anon-TEST_VALUE" },
      { name: "service_role", api_key: "legacy-svc-TEST_VALUE" },
    ]);
    expect(r.browser.source).toBe("ANON_LEGACY");
    expect(r.server.source).toBe("SERVICE_ROLE_LEGACY");
  });

  it("classifies by JWT role when name is non-semantic", () => {
    const r = classifyProjectKeys([
      { name: "default", api_key: jwt("anon") },
      { name: "default", api_key: jwt("service_role") },
    ]);
    expect(r.browser.source).toBe("ANON_LEGACY");
    expect(r.server.source).toBe("SERVICE_ROLE_LEGACY");
  });
});

describe("modern + legacy COEXIST (the real live 4-key response)", () => {
  it("prefers PUBLISHABLE + SECRET when all four keys are present (not ambiguous)", () => {
    const r = classifyProjectKeys([
      { name: "default", type: "default", api_key: PUB },
      { name: "default", type: "default", api_key: SEC },
      { name: "anon", api_key: jwt("anon") },
      { name: "service_role", api_key: jwt("service_role") },
    ]);
    expect(r.browser.source).toBe("PUBLISHABLE");
    expect(r.server.source).toBe("SECRET");
  });

  it("falls back to legacy when no modern key is present", () => {
    const r = classifyProjectKeys([
      { name: "anon", api_key: "legacy-anon-TEST_VALUE" },
      { name: "service_role", api_key: "legacy-svc-TEST_VALUE" },
    ]);
    expect(r.browser.source).toBe("ANON_LEGACY");
    expect(r.server.source).toBe("SERVICE_ROLE_LEGACY");
  });

  it("treats a duplicate SAME-VALUE key as one (not ambiguous)", () => {
    const r = classifyProjectKeys([
      { type: "default", api_key: PUB },
      { type: "default", api_key: PUB },
      { type: "default", api_key: SEC },
    ]);
    expect(r.browser.source).toBe("PUBLISHABLE");
  });
});

describe("fail-closed on ambiguity / conflict / unknown", () => {
  it("rejects a record classifiable by neither semantics, prefix, nor JWT", () => {
    expect(() => classifyProjectKeys([{ type: "default", api_key: "opaque-TEST_VALUE" }])).toThrow(/unknown\/unclassifiable/i);
  });

  it("rejects a name-vs-prefix conflict (name anon but value is sb_secret_)", () => {
    expect(() => classifyProjectKeys([{ name: "anon", api_key: SEC }, { name: "default", api_key: PUB }])).toThrow(/conflict/i);
  });

  it("rejects two browser candidates (two DISTINCT publishable values)", () => {
    expect(() => classifyProjectKeys([{ type: "default", api_key: PUB }, { type: "default", api_key: `${PUB}_2` }, { type: "default", api_key: SEC }])).toThrow(/ambiguous/i);
  });

  it("rejects two server candidates (two DISTINCT secret values)", () => {
    expect(() => classifyProjectKeys([{ type: "default", api_key: SEC }, { type: "default", api_key: `${SEC}_2` }, { type: "default", api_key: PUB }])).toThrow(/ambiguous/i);
  });

  it("rejects when the server slot is missing", () => {
    expect(() => classifyProjectKeys([{ type: "default", api_key: PUB }])).toThrow(/server-safe key/i);
  });

  it("rejects when the browser slot is missing", () => {
    expect(() => classifyProjectKeys([{ type: "default", api_key: SEC }])).toThrow(/browser-safe key/i);
  });

  it("rejects a malformed JWT", () => {
    expect(() => classifyProjectKeys([{ name: "default", api_key: "aaa.bbb.ccc" }, { name: "default", api_key: SEC }])).toThrow(/malformed JWT/i);
  });

  it("rejects an unexpected JWT role", () => {
    expect(() => classifyProjectKeys([{ name: "default", api_key: jwt("superadmin") }, { name: "default", api_key: SEC }])).toThrow(/unexpected JWT role/i);
  });

  it("rejects an unsupported modern prefix", () => {
    expect(() => classifyProjectKeys([{ type: "default", api_key: "sb_unknown_TEST" }, { type: "default", api_key: SEC }])).toThrow(/unsupported modern key prefix/i);
  });

  it("rejects an unknown response shape", () => {
    expect(() => classifyProjectKeys(null as unknown as unknown[])).toThrow(/unknown response shape/i);
    expect(() => classifyProjectKeys([])).toThrow(/no project API keys/i);
  });
});

describe("no key material ever leaks into errors", () => {
  it("unsupported-prefix error omits the key value", () => {
    try {
      classifyProjectKeys([{ type: "default", api_key: "sb_unknown_SUPER_SENSITIVE_ABC" }, { type: "default", api_key: SEC }]);
    } catch (e) {
      expect(String(e)).not.toContain("SUPER_SENSITIVE_ABC");
      expect(String(e)).toContain("sb_(unsupported)");
    }
  });

  it("JWT errors never contain the token", () => {
    const token = jwt("superadmin");
    try {
      classifyProjectKeys([{ name: "default", api_key: token }, { name: "default", api_key: SEC }]);
    } catch (e) {
      expect(String(e)).not.toContain(token);
      expect(String(e)).not.toContain("superadmin");
    }
  });

  it("conflict error contains neither key value", () => {
    try {
      classifyProjectKeys([{ name: "anon", api_key: SEC }, { name: "default", api_key: PUB }]);
    } catch (e) {
      expect(String(e)).not.toContain("TEST_VALUE_PLACEHOLDER");
    }
  });
});
