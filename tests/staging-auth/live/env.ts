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
  return env;
}
