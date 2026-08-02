// TERAGON Business Graph — Phase 11 OPERATOR-AUTH config tests.
// Injected record only; never reads process.env; degrades to null (unavailable)
// on absent/invalid/incomplete config; carries the verifier, never the raw secret.
import { describe, expect, it } from "vitest";
import {
  OPERATOR_AUTH_DEFAULTS,
  OPERATOR_AUTH_ENV_KEYS,
  parseOperatorAuthConfig,
} from "@/graph";
import { envFor, freshSecret } from "./helpers";

describe("operator-auth config parsing", () => {
  it("parses a complete injected record into a config holding only the verifier", () => {
    const secret = freshSecret();
    const config = parseOperatorAuthConfig(envFor(secret));
    expect(config).not.toBeNull();
    if (config === null) return;
    expect(config.operatorUserId).toBe("u-operator");
    expect(config.organizationId).toBe("org-teragon");
    expect(config.roleId).toBe("crole-ceo");
    expect(config.verifier.hashHex).toMatch(/^[0-9a-f]{64}$/);
    expect(config.verifier.salt.length).toBeGreaterThan(0);
    // the raw secret is NEVER anywhere in the parsed config.
    expect(JSON.stringify(config)).not.toContain(secret);
  });

  it("degrades to null when config is entirely absent", () => {
    expect(parseOperatorAuthConfig({})).toBeNull();
  });

  it("degrades to null when any required field is missing (incomplete)", () => {
    const secret = freshSecret();
    for (const key of [
      OPERATOR_AUTH_ENV_KEYS.userId,
      OPERATOR_AUTH_ENV_KEYS.organizationId,
      OPERATOR_AUTH_ENV_KEYS.roleId,
      OPERATOR_AUTH_ENV_KEYS.credentialSalt,
      OPERATOR_AUTH_ENV_KEYS.credentialHash,
    ]) {
      expect(parseOperatorAuthConfig(envFor(secret, { [key]: undefined }))).toBeNull();
    }
  });

  it("degrades to null when the credential hash is not a 64-hex SHA-256 digest", () => {
    const secret = freshSecret();
    expect(
      parseOperatorAuthConfig(envFor(secret, { [OPERATOR_AUTH_ENV_KEYS.credentialHash]: "deadbeef" })),
    ).toBeNull();
    expect(
      parseOperatorAuthConfig(
        envFor(secret, { [OPERATOR_AUTH_ENV_KEYS.credentialHash]: "z".repeat(64) }),
      ),
    ).toBeNull();
  });

  it("degrades to null on a blank / whitespace-bearing operator id", () => {
    const secret = freshSecret();
    expect(parseOperatorAuthConfig(envFor(secret, { [OPERATOR_AUTH_ENV_KEYS.userId]: "   " }))).toBeNull();
    expect(parseOperatorAuthConfig(envFor(secret, { [OPERATOR_AUTH_ENV_KEYS.userId]: "u operator" }))).toBeNull();
  });

  it("defaults the optional numeric fields when absent or invalid", () => {
    const secret = freshSecret();
    const config = parseOperatorAuthConfig(
      envFor(secret, {
        [OPERATOR_AUTH_ENV_KEYS.sessionTtlMs]: undefined,
        [OPERATOR_AUTH_ENV_KEYS.maxActiveSessions]: "-5",
      }),
    );
    expect(config).not.toBeNull();
    if (config === null) return;
    expect(config.sessionTtlMs).toBe(OPERATOR_AUTH_DEFAULTS.sessionTtlMs);
    expect(config.maxActiveSessions).toBe(OPERATOR_AUTH_DEFAULTS.maxActiveSessions);
  });

  it("never throws on malformed input", () => {
    expect(() => parseOperatorAuthConfig({ [OPERATOR_AUTH_ENV_KEYS.sessionTtlMs]: "NaN" })).not.toThrow();
  });
});
