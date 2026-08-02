// Gate S7.3A (Option B) — netlify.toml deploy-preview Supabase env is browser-
// public, Preview-scoped ONLY, privileged-free, and preserves all prior config.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const TOML = readFileSync(resolve(process.cwd(), "netlify.toml"), "utf8");

/** Extract the raw body of the [context.deploy-preview.environment] table. */
function previewEnvBlock(toml: string): string {
  const m = toml.match(/\[context\.deploy-preview\.environment\]([\s\S]*?)(?=\n\[|$)/);
  return m ? m[1]! : "";
}
/** Parse `KEY = "value"` lines from a table body. */
function parseEnv(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of body.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"([^"]*)"\s*$/);
    if (m) out[m[1]!] = m[2]!;
  }
  return out;
}

describe("netlify.toml deploy-preview environment", () => {
  it("has EXACTLY ONE [context.deploy-preview.environment] block", () => {
    const count = (TOML.match(/\[context\.deploy-preview\.environment\]/g) ?? []).length;
    expect(count).toBe(1);
  });

  it("resolves the Supabase provider + browser-public values in deploy-preview", () => {
    const env = parseEnv(previewEnvBlock(TOML));
    expect(env.VITE_PERSISTENCE_PROVIDER).toBe("SUPABASE");
    expect(env.VITE_SUPABASE_ORG).toBe("org-teragon");
    expect(env.VITE_SUPABASE_URL).toBe("https://bjvirkmagwpqroakazjj.supabase.co");
    expect(Object.keys(env).sort()).toEqual(["VITE_PERSISTENCE_PROVIDER", "VITE_SUPABASE_ANON_KEY", "VITE_SUPABASE_ORG", "VITE_SUPABASE_URL"]);
  });

  it("the browser key is the PUBLISHABLE (browser-safe) key — sb_publishable_ prefix, never a JWT/secret", () => {
    const env = parseEnv(previewEnvBlock(TOML));
    expect(env.VITE_SUPABASE_ANON_KEY?.startsWith("sb_publishable_")).toBe(true);
    // never a service_role/secret JWT or sb_secret_ value
    expect(env.VITE_SUPABASE_ANON_KEY).not.toMatch(/^eyJ|^sb_secret_/);
  });

  it("Production / branch / dev / global build.environment do NOT inherit the Preview Supabase vars", () => {
    expect(TOML).not.toMatch(/\[context\.production\.environment\]/);
    expect(TOML).not.toMatch(/\[context\.branch[^\]]*\.environment\]/);
    expect(TOML).not.toMatch(/\[context\.dev\.environment\]/);
    // build.environment (global, all contexts) must NOT set the provider/keys
    const buildEnv = TOML.match(/\[build\.environment\]([\s\S]*?)(?=\n\[|$)/)?.[1] ?? "";
    expect(buildEnv).not.toMatch(/VITE_PERSISTENCE_PROVIDER|VITE_SUPABASE/);
  });

  it("contains NO privileged key (anywhere) and no privileged VITE_ var", () => {
    expect(TOML).not.toMatch(/service_role|secret_key|server_key|auth_admin|db_password|admin_password|access_token|netlify_auth|sb_secret_/i);
    expect(TOML).not.toMatch(/VITE_[A-Z_]*(SERVICE|SECRET|SERVER|ADMIN|PASSWORD|TOKEN)/);
    // Functions/server env is not configured here at all.
    expect(previewEnvBlock(TOML)).not.toMatch(/SUPABASE_(URL|SERVICE|SECRET|SERVER)_?KEY?(?!\w)/);
  });

  it("preserves the existing config (build, functions, SPA redirect, security headers, caching)", () => {
    expect(TOML).toMatch(/command = "npm run build"/);
    expect(TOML).toMatch(/publish = "dist"/);
    expect(TOML).toMatch(/NODE_VERSION = "22"/);
    expect(TOML).toMatch(/NPM_FLAGS = /);
    expect(TOML).toMatch(/\[functions\]/);
    expect(TOML).toMatch(/\[\[redirects\]\]/);
    expect((TOML.match(/\[\[headers\]\]/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(TOML).toMatch(/Content-Security-Policy/);
  });

  it("TOML env lines are well-formed KEY = \"value\" (basic parse sanity)", () => {
    const body = previewEnvBlock(TOML).trim();
    expect(body.length).toBeGreaterThan(0);
    for (const line of body.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith("#"))) {
      expect(line).toMatch(/^\s*[A-Z0-9_]+\s*=\s*"[^"]*"\s*$/);
    }
  });
});
