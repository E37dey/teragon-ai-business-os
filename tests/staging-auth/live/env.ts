/// <reference types="node" />
// Live staging-auth env loader + fail-hard gate. Reads browser-public URL + anon
// key from the committed netlify.toml (deploy-preview context) and the admin
// credentials from the gitignored .env.staging.local (or process.env overrides).
// NEVER prints or persists any secret value.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function parseDotEnv(path: string): Record<string, string> {
  let text = "";
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return {};
  }
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && m[1]) out[m[1]] = (m[2] ?? "").replace(/^["']|["']$/g, "");
  }
  return out;
}

function parseNetlifyPreviewEnv(): Record<string, string> {
  let text = "";
  try {
    text = readFileSync(join(repoRoot, "netlify.toml"), "utf8");
  } catch {
    return {};
  }
  const section = /\[context\.deploy-preview\.environment\]([\s\S]*?)(\n\[|$)/.exec(text);
  const out: Record<string, string> = {};
  if (section && section[1]) {
    for (const line of section[1].split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*"(.*)"\s*$/.exec(line);
      if (m && m[1]) out[m[1]] = m[2] ?? "";
    }
  }
  return out;
}

export interface StagingAuthEnv {
  readonly url: string;
  readonly anonKey: string;
  readonly adminEmail: string;
  readonly adminPassword: string;
}

/** The ONLY staging project this suite may reach (override via STAGING_EXPECTED_REF). */
export const EXPECTED_PROJECT_REF = process.env.STAGING_EXPECTED_REF ?? "bjvirkmagwpqroakazjj";

/**
 * Classify a browser key's privilege WITHOUT printing it. Publishable/anon keys
 * are browser-safe; secret/service_role keys must NEVER reach the browser client.
 */
export function keyPrivilegeClass(
  key: string,
): "publishable" | "anon" | "service_role" | "secret" | "unknown" {
  if (key.startsWith("sb_publishable_")) return "publishable";
  if (key.startsWith("sb_secret_")) return "secret";
  const parts = key.split(".");
  if (parts.length === 3 && parts[1]) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as {
        role?: string;
      };
      if (payload.role === "service_role") return "service_role";
      if (payload.role === "anon") return "anon";
    } catch {
      return "unknown";
    }
  }
  return "unknown";
}

/**
 * Fail HARD if the target is not the expected remote staging project, or if the
 * browser key carries privilege. Enforces "wrong project reached" and "privileged
 * key in browser client" as hard stops. Never prints the URL host or the key.
 */
export function assertBrowserSafeStagingTarget(env: StagingAuthEnv): void {
  if (!/^https:\/\//.test(env.url) || /localhost|127\.0\.0\.1/.test(env.url)) {
    throw new Error(
      "[staging-auth-live] refusing to run: target is not a remote https staging project (LOCAL_INDEXEDDB / local stack is never the live target).",
    );
  }
  if (!env.url.includes(EXPECTED_PROJECT_REF)) {
    throw new Error(
      `[staging-auth-live] refusing to run: wrong project reached (expected ref ${EXPECTED_PROJECT_REF}).`,
    );
  }
  const klass = keyPrivilegeClass(env.anonKey);
  if (klass === "service_role" || klass === "secret") {
    throw new Error(
      "[staging-auth-live] refusing to run: a PRIVILEGED key was supplied to the browser client (must be publishable/anon only).",
    );
  }
}

export function loadStagingAuthEnv(): StagingAuthEnv {
  const file = parseDotEnv(join(repoRoot, ".env.staging.local"));
  const toml = parseNetlifyPreviewEnv();
  return {
    url: process.env.STAGING_SUPABASE_URL ?? toml.VITE_SUPABASE_URL ?? "",
    anonKey: process.env.STAGING_SUPABASE_ANON_KEY ?? toml.VITE_SUPABASE_ANON_KEY ?? "",
    adminEmail: process.env.TERAGON_ADMIN_EMAIL ?? file.TERAGON_ADMIN_EMAIL ?? "",
    adminPassword: process.env.TERAGON_ADMIN_PASSWORD ?? file.TERAGON_ADMIN_PASSWORD ?? "",
  };
}

/** Fail HARD (never skip) unless explicitly enabled and fully configured. */
export function assertStagingAuthLiveOrThrow(): StagingAuthEnv {
  if (process.env.STAGING_AUTH_LIVE !== "1") {
    throw new Error(
      "[staging-auth-live] refusing to run: set STAGING_AUTH_LIVE=1 to enable the live staging auth suite (it never skips).",
    );
  }
  const env = loadStagingAuthEnv();
  const missing = (
    [
      ["url", env.url],
      ["anonKey", env.anonKey],
      ["adminEmail", env.adminEmail],
      ["adminPassword", env.adminPassword],
    ] as const
  )
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length > 0) {
    throw new Error(
      `[staging-auth-live] missing required config: ${missing.join(", ")} ` +
        "(URL/anon key from netlify.toml deploy-preview; admin creds from .env.staging.local). Values are never printed.",
    );
  }
  assertBrowserSafeStagingTarget(env);
  return env;
}
