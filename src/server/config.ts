// TERAGON AI BUSINESS OS — server-side env config parsing (Wave 5, W5-B).
// Pure + isomorphic: takes an env record, NEVER reads process.env itself and
// NEVER throws at import or parse time. Missing/invalid values degrade to the
// honest "לא הוגדר" posture — the server refuses work, it never invents config.
export type ServerAIProviderKind = "test" | "anthropic" | "openai";

export interface ServerAIConfig {
  /** null ⇒ no provider configured ⇒ health "לא הוגדר" */
  provider: ServerAIProviderKind | null;
  /** central model config — code NEVER hardcodes a model name */
  model: string | null;
  /** server-side only; never logged, never echoed */
  apiKey: string | null;
  /** override provider base URL (self-hosted gateways); null = provider default */
  baseUrl: string | null;
  requestTimeoutMs: number;
  maxOutputTokens: number;
  /**
   * Daily org budget in accounting units (see budget.ts): measured token cost
   * when the provider reports usage, otherwise 1 unit per request.
   * 0 ⇒ no budget configured ⇒ requests are NOT blocked by budget (documented).
   */
  dailyBudget: number;
  rateLimitPerMinute: number;
  maxConcurrentRequests: number;
  /** master switch — false ⇒ health "מושבת", all AI ops refused */
  remoteEnabled: boolean;
}

export const SERVER_CONFIG_DEFAULTS = {
  requestTimeoutMs: 20_000,
  maxOutputTokens: 2_048,
  dailyBudget: 0,
  rateLimitPerMinute: 10,
  maxConcurrentRequests: 4,
} as const;

const PROVIDER_KINDS: readonly ServerAIProviderKind[] = ["test", "anthropic", "openai"];

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw.trim());
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function parseNonNegativeNumber(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw.trim());
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

function parseOptionalString(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

function parseBoolean(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw.trim() === "") return fallback;
  const v = raw.trim().toLowerCase();
  if (v === "true" || v === "1" || v === "yes") return true;
  if (v === "false" || v === "0" || v === "no") return false;
  return fallback;
}

/**
 * Parse the server env into a typed config. NEVER throws — an unknown provider
 * or malformed number degrades to null/default, which downstream code reports
 * as "לא הוגדר" instead of crashing the function at import time.
 */
export function parseServerConfig(
  env: Readonly<Record<string, string | undefined>>,
): ServerAIConfig {
  const rawProvider = parseOptionalString(env["AI_PROVIDER"])?.toLowerCase() ?? null;
  const provider = PROVIDER_KINDS.find((k) => k === rawProvider) ?? null;
  return {
    provider,
    model: parseOptionalString(env["AI_MODEL"]),
    apiKey: parseOptionalString(env["AI_API_KEY"]),
    baseUrl: parseOptionalString(env["AI_BASE_URL"]),
    requestTimeoutMs: parsePositiveInt(
      env["AI_REQUEST_TIMEOUT_MS"],
      SERVER_CONFIG_DEFAULTS.requestTimeoutMs,
    ),
    maxOutputTokens: parsePositiveInt(
      env["AI_MAX_OUTPUT_TOKENS"],
      SERVER_CONFIG_DEFAULTS.maxOutputTokens,
    ),
    dailyBudget: parseNonNegativeNumber(env["AI_DAILY_BUDGET"], SERVER_CONFIG_DEFAULTS.dailyBudget),
    rateLimitPerMinute: parsePositiveInt(
      env["AI_RATE_LIMIT_PER_MINUTE"],
      SERVER_CONFIG_DEFAULTS.rateLimitPerMinute,
    ),
    maxConcurrentRequests: parsePositiveInt(
      env["AI_MAX_CONCURRENT_REQUESTS"],
      SERVER_CONFIG_DEFAULTS.maxConcurrentRequests,
    ),
    remoteEnabled: parseBoolean(env["AI_REMOTE_ENABLED"], false),
  };
}

/**
 * Is the configured provider actually usable?
 * - "test" needs no key (fully local deterministic adapter), but still needs
 *   AI_PROVIDER=test explicitly — it is NEVER a default.
 * - real providers need a model AND a key. We never invent either.
 */
export function isProviderConfigured(config: ServerAIConfig): boolean {
  if (config.provider === null) return false;
  if (config.provider === "test") return true;
  return config.apiKey !== null && config.model !== null;
}
