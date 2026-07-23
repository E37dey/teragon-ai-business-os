// TERAGON AI BUSINESS OS — provider HTTP helpers (Wave 5, W5-B).
// timeout + limited retry (2 retries, TRANSIENT ONLY: 429/5xx/network).
// NEVER retried: auth failures, invalid requests, budget, policy, cancellation.
import { ServerAIError, toServerAIError } from "../errors";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export const MAX_TRANSIENT_RETRIES = 2;

/** fetch with a hard timeout — an elapsed timer throws AI_PROVIDER_TIMEOUT */
export async function fetchWithTimeout(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
  timeoutMs: number,
  outerSignal?: AbortSignal,
): Promise<Response> {
  if (outerSignal?.aborted) throw new ServerAIError("AI_REQUEST_CANCELLED");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onOuterAbort = () => controller.abort();
  outerSignal?.addEventListener("abort", onOuterAbort, { once: true });
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (outerSignal?.aborted) throw new ServerAIError("AI_REQUEST_CANCELLED");
    if (controller.signal.aborted) {
      throw new ServerAIError("AI_PROVIDER_TIMEOUT", { detail: `timeout after ${timeoutMs}ms` });
    }
    // genuine network failure — transient
    throw new ServerAIError("AI_PROVIDER_UNAVAILABLE", {
      detail: err instanceof Error ? err.message : String(err),
    });
  } finally {
    clearTimeout(timer);
    outerSignal?.removeEventListener("abort", onOuterAbort);
  }
}

/**
 * Run fn with the limited retry policy: up to MAX_TRANSIENT_RETRIES extra
 * attempts, only for errors marked transient (timeout / 5xx / 429 / network).
 */
export async function withTransientRetry<T>(
  fn: (attempt: number) => Promise<T>,
  retries: number = MAX_TRANSIENT_RETRIES,
): Promise<T> {
  let lastError: ServerAIError | null = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (err) {
      const mapped = toServerAIError(err);
      if (!mapped.transient) throw mapped;
      lastError = mapped;
    }
  }
  throw lastError ?? new ServerAIError("AI_INTERNAL_ERROR", { detail: "retry loop fell through" });
}

/** Map a provider HTTP status to a coded error (transient flags per policy). */
export function providerStatusError(status: number): ServerAIError {
  if (status === 401 || status === 403) {
    return new ServerAIError("AI_PROVIDER_AUTH_FAILED", { detail: `provider status ${status}` });
  }
  if (status === 429 || status >= 500) {
    return new ServerAIError("AI_PROVIDER_UNAVAILABLE", {
      detail: `provider status ${status}`,
      transient: true,
    });
  }
  return new ServerAIError("AI_INTERNAL_ERROR", { detail: `provider status ${status}` });
}
