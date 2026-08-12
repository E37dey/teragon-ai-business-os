// S10.3-B — HSTS and security-header regression on the canonical netlify.toml.
// Static assertions over the committed config; no network, no deploy.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const TOML = readFileSync(resolve(process.cwd(), "netlify.toml"), "utf8");

/** The value assigned to a header key in the [[headers]] block. */
function headerValue(name: string): string | null {
  const escaped = name.replace(/-/g, "\\-");
  const m = new RegExp(`${escaped}\\s*=\\s*"([^"]*)"`).exec(TOML);
  return m?.[1] ?? null;
}

describe("S10.3-B · Strict-Transport-Security", () => {
  it("HSTS header is present", () => {
    expect(headerValue("Strict-Transport-Security")).not.toBeNull();
  });

  it("max-age is at least one year (31536000s)", () => {
    const v = headerValue("Strict-Transport-Security") ?? "";
    const m = /max-age=(\d+)/.exec(v);
    expect(m, "max-age directive present").not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(31_536_000);
  });

  it("does NOT enable preload (needs proven every-subdomain HTTPS + operator approval)", () => {
    const v = (headerValue("Strict-Transport-Security") ?? "").toLowerCase();
    expect(v).not.toContain("preload");
  });

  it("does NOT enable includeSubDomains (no subdomain topology proven HTTPS-only)", () => {
    const v = (headerValue("Strict-Transport-Security") ?? "").toLowerCase();
    expect(v).not.toContain("includesubdomains");
  });
});

describe("S10.3-B · existing security headers preserved", () => {
  it("keeps X-Frame-Options: DENY", () => {
    expect(headerValue("X-Frame-Options")).toBe("DENY");
  });
  it("keeps X-Content-Type-Options: nosniff", () => {
    expect(headerValue("X-Content-Type-Options")).toBe("nosniff");
  });
  it("keeps Referrer-Policy", () => {
    expect(headerValue("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });
  it("keeps Permissions-Policy denying camera/mic/geolocation", () => {
    expect(headerValue("Permissions-Policy")).toBe("camera=(), microphone=(), geolocation=()");
  });

  it("keeps a restrictive CSP with no wildcard weakening", () => {
    const csp = headerValue("Content-Security-Policy") ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'"); // no 'unsafe-inline'/'unsafe-eval' for scripts
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    // No wildcard source and no unsafe-eval anywhere.
    expect(csp).not.toMatch(/(^|\s)\*(\s|;|$)/);
    expect(csp).not.toContain("unsafe-eval");
  });

  it("introduces no wildcard Access-Control-Allow-Origin in the config", () => {
    expect(TOML).not.toMatch(/access-control-allow-origin\s*=\s*"\*"/i);
  });
});
