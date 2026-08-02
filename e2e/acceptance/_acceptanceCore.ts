/// <reference types="node" />
// TERAGON AI BUSINESS OS — Gate S7.3B-PREP: acceptance-harness CORE (pure).
//
// Framework-free guards + report helpers, unit-testable in the default suite
// (tests/acceptance/harness.test.ts) and imported by the Playwright suite
// (staging-acceptance.accept.ts). It NEVER imports Playwright and NEVER prints,
// persists, or returns any credential / key / token / session material.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const EXPECTED_PROVIDER = "SUPABASE" as const;
export const EXPECTED_PROJECT_REF = process.env.STAGING_EXPECTED_REF ?? "bjvirkmagwpqroakazjj";

export interface AcceptanceEnv {
  readonly baseUrl: string;
  readonly targetOrigin: string;
  readonly projectRef: string;
  readonly intendedCommit: string;
  readonly adminEmail: string;
  readonly adminPassword: string;
}

/** Only a local serve is an acceptable acceptance target — never a deployed/prod origin. */
export function isLocalOrigin(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      (u.protocol === "http:" || u.protocol === "https:") &&
      (u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]")
    );
  } catch {
    return false;
  }
}

/** Reject anything that looks like a deployed/production origin (defence in depth). */
export function isProductionOrigin(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return /netlify\.app$|netlify\.live$|vercel\.app$|\.com$|\.io$|\.co$|\.dev$/i.test(h);
  } catch {
    return true;
  }
}

function parseDotEnv(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && m[1]) out[m[1]] = (m[2] ?? "").replace(/^["']|["']$/g, "");
  }
  return out;
}

export function acceptanceEnabled(): boolean {
  return process.env.STAGING_ACCEPTANCE_LIVE === "1";
}

/**
 * Resolve the acceptance env or THROW with missing NAMES (never values). Fails
 * hard on: not enabled, missing base url / ref / commit / admin creds, a non-local
 * (or production) target origin, or a wrong project ref.
 */
export function acceptanceEnvOrThrow(repoRoot = process.cwd()): AcceptanceEnv {
  if (!acceptanceEnabled()) {
    throw new Error(
      "[acceptance] STAGING_ACCEPTANCE_LIVE=1 is required — this harness never skips and is excluded from the default suites.",
    );
  }
  const baseUrl = (process.env.ACCEPTANCE_BASE_URL ?? "").replace(/\/$/, "");
  const projectRef = process.env.STAGING_SUPABASE_PROJECT_REF ?? EXPECTED_PROJECT_REF;
  const intendedCommit = process.env.INTENDED_COMMIT ?? "";
  const file = parseDotEnv(join(repoRoot, ".env.staging.local"));
  const adminEmail = process.env.TERAGON_ADMIN_EMAIL ?? file.TERAGON_ADMIN_EMAIL ?? "";
  const adminPassword = process.env.TERAGON_ADMIN_PASSWORD ?? file.TERAGON_ADMIN_PASSWORD ?? "";

  const missing = (
    [
      ["ACCEPTANCE_BASE_URL", baseUrl],
      ["INTENDED_COMMIT", intendedCommit],
      ["TERAGON_ADMIN_EMAIL", adminEmail],
      ["TERAGON_ADMIN_PASSWORD", adminPassword],
    ] as const
  )
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length > 0) {
    throw new Error(`[acceptance] missing required config: ${missing.join(", ")} (values never printed).`);
  }
  if (!isLocalOrigin(baseUrl) || isProductionOrigin(baseUrl)) {
    throw new Error(
      "[acceptance] refusing to run: ACCEPTANCE_BASE_URL must be a LOCAL serve (never a deployed/production origin).",
    );
  }
  if (projectRef !== EXPECTED_PROJECT_REF) {
    throw new Error(`[acceptance] refusing to run: wrong Supabase project ref (expected ${EXPECTED_PROJECT_REF}).`);
  }
  return { baseUrl, targetOrigin: new URL(baseUrl).origin, projectRef, intendedCommit, adminEmail, adminPassword };
}

// --- privileged-material detection (reject anywhere) -------------------------
export const PRIVILEGED_PATTERNS: readonly RegExp[] = [
  /service_role/i,
  /SUPABASE_SERVICE_ROLE/i,
  /sb_secret_[A-Za-z0-9]/,
  /db[_-]?password/i,
  /admin[_-]?password/i,
  /access[_-]?token/i,
  /refresh[_-]?token/i,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{6,}/, // JWT / raw session
];

/** Return the list of privileged patterns that match `text` (never returns the text). */
export function scanForPrivileged(text: string): string[] {
  return PRIVILEGED_PATTERNS.filter((re) => re.test(text)).map((re) => re.source);
}

export function maskRef(ref: string): string {
  return ref.length <= 8 ? ref : `${ref.slice(0, 4)}…${ref.slice(-4)}`;
}

// --- fixture identity --------------------------------------------------------
export function makeRunId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `acceptance-${Date.now()}-${rand}`;
}
export function isFixturePrefixed(id: string): boolean {
  return /^acceptance-\d+-[a-z0-9]+/.test(id);
}

// --- machine-readable SAFE report --------------------------------------------
export interface UiCapabilityMissing {
  readonly domain: string;
  readonly route: string;
  readonly missingAction: string;
}
export interface SafeAcceptanceReport {
  suite: "staging-acceptance";
  runId: string;
  targetOrigin: string;
  provider: string;
  expectedCommit: string;
  observedCommit: string;
  maskedRef: string;
  files: number;
  executed: number;
  passed: number;
  failed: number;
  skipped: number;
  cleanup: "ok" | "failed" | "not-run";
  uiCapabilityMissing: UiCapabilityMissing[];
  defects: string[];
  verdict: "PASS" | "PARTIAL" | "FAIL";
}

/** Strip any accidental privileged material from a report before it is written. */
export function redactReport(report: SafeAcceptanceReport): SafeAcceptanceReport {
  const clean = <T,>(v: T): T =>
    typeof v === "string"
      ? (v.replace(
          /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{6,}/g,
          "[REDACTED]",
        ) as unknown as T)
      : v;
  return {
    ...report,
    defects: report.defects.map((d) => clean(d)),
    uiCapabilityMissing: report.uiCapabilityMissing.map((u) => ({ ...u })),
  };
}
