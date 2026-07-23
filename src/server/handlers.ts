// TERAGON AI BUSINESS OS — Netlify AI function handlers (Wave 5, W5-B).
// ALL endpoint logic lives here (pure, unit-testable with constructed Request
// objects); the files under netlify/functions/ are one-line wrappers.
//
// Pipeline per AI operation:
//   preflight → method → size guard → JSON parse → DTO zod validation →
//   correlation → remote-enabled gate → context-length guard → auth boundary →
//   rate limit → concurrency → daily budget (BEFORE any provider call) →
//   prompt security layering → adapter (timeout + transient-only retry) →
//   envelope zod validation → budget accounting → audit → DTO response.
import {
  AI_DTO_VERSION,
  aiRequestDtoV1Schema,
  type AiCapabilitiesResponseDtoV1,
  type AiHealthResponseDtoV1,
  type AiRequestDtoV1,
  type AiStreamEventDtoV1,
} from "@/ai/contracts/serverDto";
import { aiResponseEnvelopeV2Schema } from "@/ai/schemas/envelope";
import type { AIProviderHealthState } from "@/ai/contracts/AIProvider";
import { buildAuditEvent, emitAudit, type ServerAuditEvent } from "./audit";
import { demoAuthVerifier, type AuthVerifier } from "./auth";
import { DailyBudgetLedger } from "./budget";
import { isProviderConfigured, parseServerConfig, type ServerAIConfig } from "./config";
import { handlePreflight, responseHeaders } from "./cors";
import { CORRELATION_ID_HEADER, resolveCorrelationId } from "./correlation";
import { errorResponseBody, ServerAIError, toServerAIError, type AIErrorCode } from "./errors";
import {
  assertContextLength,
  assertRequestSize,
  MAX_CONTEXT_CHARS,
  MAX_DURATION_MS,
  remainingDurationMs,
} from "./guards";
import { buildLayeredPrompt, type PromptBuildResult } from "./promptSecurity";
import { withTransientRetry } from "./providers/http";
import { createAdapter, type AdapterFactory, type AdapterFactoryDeps } from "./providers/registry";
import type { AdapterResult, ServerAIAdapter, ServerOperation } from "./providers/types";
import { ConcurrencyGate, rateKeys, SlidingWindowRateLimiter } from "./rateLimit";
import type { ServerLogSink } from "./redact";

export interface HandlerDeps {
  /** env source — defaults to process.env, read per request */
  env?: () => Readonly<Record<string, string | undefined>>;
  adapterFactory?: AdapterFactory;
  adapterDeps?: AdapterFactoryDeps;
  authVerifier?: AuthVerifier;
  now?: () => number;
  logSink?: ServerLogSink;
  /** receives every audit event object (in addition to the redacted log) */
  onAudit?: (event: ServerAuditEvent) => void;
}

export interface AiHandlers {
  aiHealth: (req: Request) => Promise<Response>;
  aiCapabilities: (req: Request) => Promise<Response>;
  aiConfig: (req: Request) => Promise<Response>;
  aiSummarize: (req: Request) => Promise<Response>;
  aiClassify: (req: Request) => Promise<Response>;
  aiRecommend: (req: Request) => Promise<Response>;
  aiExplain: (req: Request) => Promise<Response>;
  aiStructured: (req: Request) => Promise<Response>;
  aiStream: (req: Request) => Promise<Response>;
}

function defaultEnv(): Readonly<Record<string, string | undefined>> {
  // no node type dependency — isomorphic access to process.env when present
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return proc?.env ?? {};
}

/** timeout race around a single adapter attempt — transient, so retryable */
function invokeWithTimeout(
  adapter: ServerAIAdapter,
  input: Parameters<ServerAIAdapter["invoke"]>[0],
  timeoutMs: number,
): Promise<AdapterResult> {
  return new Promise<AdapterResult>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new ServerAIError("AI_PROVIDER_TIMEOUT", { detail: `adapter attempt > ${timeoutMs}ms` }),
      );
    }, timeoutMs);
    adapter.invoke(input).then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(toServerAIError(e));
      },
    );
  });
}

export function createAiHandlers(deps: HandlerDeps = {}): AiHandlers {
  const env = deps.env ?? defaultEnv;
  const adapterFactory = deps.adapterFactory ?? createAdapter;
  const authVerifier = deps.authVerifier ?? demoAuthVerifier;
  const now = deps.now ?? (() => Date.now());

  // per-instance state (serverless caveat documented in rateLimit.ts/budget.ts)
  let rateLimiter: SlidingWindowRateLimiter | null = null;
  let budget: DailyBudgetLedger | null = null;
  let gate: ConcurrencyGate | null = null;

  function state(config: ServerAIConfig): {
    rateLimiter: SlidingWindowRateLimiter;
    budget: DailyBudgetLedger;
    gate: ConcurrencyGate;
  } {
    rateLimiter ??= new SlidingWindowRateLimiter(config.rateLimitPerMinute);
    budget ??= new DailyBudgetLedger(config.dailyBudget);
    gate ??= new ConcurrencyGate(config.maxConcurrentRequests);
    return { rateLimiter, budget, gate };
  }

  function audit(fields: Omit<ServerAuditEvent, "kind" | "at">): void {
    const event = buildAuditEvent(fields, now());
    emitAudit(event, deps.logSink);
    deps.onAudit?.(event);
  }

  function errorResponse(
    req: Request,
    err: ServerAIError,
    correlationId: string,
    context: {
      endpoint: string;
      operation?: string;
      organizationId?: string;
      userId?: string;
      startedAt: number;
      injectionFlags?: string[];
    },
  ): Response {
    audit({
      correlationId,
      operation: context.operation ?? "-",
      endpoint: context.endpoint,
      organizationId: context.organizationId ?? "-",
      userId: context.userId ?? "-",
      authTrusted: false,
      outcome: "error",
      errorCode: err.code,
      provider: null,
      model: null,
      durationMs: now() - context.startedAt,
      usageMeasured: false,
      injectionFlags: context.injectionFlags ?? [],
      warnings: [],
    });
    const headers = responseHeaders(req, correlationId);
    if (err.code === "AI_RATE_LIMITED" || err.code === "AI_DAILY_BUDGET_EXCEEDED") {
      headers.set("retry-after", "60");
    }
    return new Response(
      JSON.stringify(errorResponseBody(err.code, correlationId, err.recoverable)),
      { status: err.httpStatus, headers },
    );
  }

  interface PreparedRequest {
    dto: AiRequestDtoV1;
    correlationId: string;
    config: ServerAIConfig;
    prompt: PromptBuildResult;
    adapter: ServerAIAdapter;
    release: () => void;
  }

  /** shared pipeline up to (but not including) the adapter invocation */
  async function prepare(req: Request): Promise<PreparedRequest> {
    if (req.method !== "POST") {
      throw new ServerAIError("AI_RESPONSE_INVALID", {
        httpStatus: 405,
        recoverable: false,
        detail: `method ${req.method} not allowed`,
      });
    }
    const rawBody = await req.text();
    assertRequestSize(rawBody);
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawBody) as unknown;
    } catch {
      throw new ServerAIError("AI_RESPONSE_INVALID", {
        httpStatus: 400,
        recoverable: false,
        detail: "request body is not valid JSON",
      });
    }
    const dtoResult = aiRequestDtoV1Schema.safeParse(parsedJson);
    if (!dtoResult.success) {
      throw new ServerAIError("AI_RESPONSE_INVALID", {
        httpStatus: 400,
        recoverable: false,
        detail: "request DTO failed validation",
      });
    }
    const dto = dtoResult.data;
    const correlationId = resolveCorrelationId(
      req.headers.get(CORRELATION_ID_HEADER),
      dto.correlationId,
    );
    const config = parseServerConfig(env());
    if (!config.remoteEnabled) {
      throw new ServerAIError("AI_PROVIDER_NOT_CONFIGURED", {
        detail: "AI_REMOTE_ENABLED is false — remote AI is disabled",
      });
    }
    assertContextLength(dto.boundedContext);
    const auth = authVerifier.verify({
      organizationId: dto.organizationId,
      userId: dto.userId,
      sessionId: dto.sessionId,
      authHeader: req.headers.get("x-teragon-auth"),
    });
    const { rateLimiter: limiter, budget: ledger, gate: concurrency } = state(config);
    const rate = limiter.check(rateKeys(auth.organizationId, auth.userId, auth.sessionId), now());
    if (!rate.allowed) {
      throw new ServerAIError("AI_RATE_LIMITED", { detail: `limited by ${rate.limitedBy}` });
    }
    if (!concurrency.tryAcquire()) {
      throw new ServerAIError("AI_RATE_LIMITED", {
        detail: `concurrent request limit reached (${concurrency.current()})`,
      });
    }
    let released = false;
    const release = () => {
      if (!released) {
        released = true;
        concurrency.release();
      }
    };
    try {
      // budget gate BEFORE any provider call — a blocked request never reaches
      // the adapter (asserted by tests).
      const budgetStatus = ledger.status(now());
      if (budgetStatus.exceeded) {
        throw new ServerAIError("AI_DAILY_BUDGET_EXCEEDED", {
          detail: `daily budget ${budgetStatus.limit} exhausted (${budgetStatus.spentUnits} units)`,
        });
      }
      const prompt = buildLayeredPrompt(dto);
      const adapter = adapterFactory(config, deps.adapterDeps);
      if (adapter === null || !isProviderConfigured(config)) {
        throw new ServerAIError("AI_PROVIDER_NOT_CONFIGURED");
      }
      return { dto, correlationId, config, prompt, adapter, release };
    } catch (err) {
      release();
      throw err;
    }
  }

  function validateEnvelope(
    result: AdapterResult,
    correlationId: string,
    prompt: PromptBuildResult,
  ) {
    const parsed = aiResponseEnvelopeV2Schema.safeParse(result.envelope);
    if (!parsed.success) {
      throw new ServerAIError("AI_RESPONSE_INVALID", {
        recoverable: true,
        detail: "adapter output failed envelope validation",
      });
    }
    // server duties: echo the effective correlation id + disclose warnings
    const limitations = [
      ...parsed.data.limitations,
      ...prompt.warnings.filter((w) => !parsed.data.limitations.includes(w)),
    ];
    return { ...parsed.data, correlationId, limitations };
  }

  function opHandler(op: Exclude<ServerOperation, "stream">, endpoint: string) {
    return async (req: Request): Promise<Response> => {
      const startedAt = now();
      const headerCorrelation = resolveCorrelationId(req.headers.get(CORRELATION_ID_HEADER));
      const preflight = handlePreflight(req, headerCorrelation);
      if (preflight) return preflight;
      let prepared: PreparedRequest | null = null;
      try {
        prepared = await prepare(req);
        const { dto, correlationId, config, prompt, adapter } = prepared;
        const input = {
          op,
          request: dto,
          prompt,
          config,
          correlationId,
          signal: req.signal,
        };
        const attemptTimeout = Math.min(
          config.requestTimeoutMs,
          Math.max(1, remainingDurationMs(startedAt, now(), MAX_DURATION_MS)),
        );
        const result = await withTransientRetry(() =>
          invokeWithTimeout(adapter, input, attemptTimeout),
        );
        const envelope = validateEnvelope(result, correlationId, prompt);
        state(config).budget.record(now(), envelope.usage);
        audit({
          correlationId,
          operation: dto.operation,
          endpoint,
          organizationId: dto.organizationId,
          userId: dto.userId,
          authTrusted: false,
          outcome: "success",
          errorCode: null,
          provider: envelope.provider,
          model: envelope.model,
          durationMs: now() - startedAt,
          usageMeasured: envelope.usage.measured,
          injectionFlags: prompt.findings.map((f) => f.patternId),
          warnings: prompt.warnings,
        });
        const body =
          op === "structured"
            ? { dtoVersion: AI_DTO_VERSION, envelope, value: result.value ?? null }
            : { dtoVersion: AI_DTO_VERSION, envelope };
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: responseHeaders(req, correlationId),
        });
      } catch (err) {
        const mapped = toServerAIError(err);
        return errorResponse(req, mapped, prepared?.correlationId ?? headerCorrelation, {
          endpoint,
          operation: prepared?.dto.operation,
          organizationId: prepared?.dto.organizationId,
          userId: prepared?.dto.userId,
          startedAt,
          injectionFlags: prepared?.prompt.findings.map((f) => f.patternId),
        });
      } finally {
        prepared?.release();
      }
    };
  }

  const aiStream = async (req: Request): Promise<Response> => {
    const startedAt = now();
    const headerCorrelation = resolveCorrelationId(req.headers.get(CORRELATION_ID_HEADER));
    const preflight = handlePreflight(req, headerCorrelation);
    if (preflight) return preflight;
    let prepared: PreparedRequest | null = null;
    try {
      prepared = await prepare(req);
    } catch (err) {
      return errorResponse(req, toServerAIError(err), headerCorrelation, {
        endpoint: "ai-stream",
        startedAt,
      });
    }
    const { dto, correlationId, config, prompt, adapter, release } = prepared;
    const encoder = new TextEncoder();
    const emit = (
      controller: ReadableStreamDefaultController<Uint8Array>,
      event: AiStreamEventDtoV1,
    ) => {
      controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
    };
    const stream = new ReadableStream<Uint8Array>({
      start: async (controller) => {
        let outcome: "success" | "error" = "success";
        let errorCode: AIErrorCode | null = null;
        let model: string | null = null;
        let usageMeasured = false;
        try {
          emit(controller, {
            type: "start",
            dtoVersion: AI_DTO_VERSION,
            requestId: `req-${correlationId}`,
            correlationId,
            provider: adapter.id,
          });
          const input = {
            op: "stream" as const,
            request: dto,
            prompt,
            config,
            correlationId,
            signal: req.signal,
          };
          const generator = adapter.streamDeltas(input);
          let result: AdapterResult | null = null;
          for (;;) {
            if (req.signal?.aborted) {
              throw new ServerAIError("AI_REQUEST_CANCELLED");
            }
            const step = await generator.next();
            if (step.done) {
              result = step.value;
              break;
            }
            emit(controller, { type: "delta", text: step.value.text });
          }
          const envelope = validateEnvelope(result, correlationId, prompt);
          model = envelope.model;
          usageMeasured = envelope.usage.measured;
          state(config).budget.record(now(), envelope.usage);
          emit(controller, { type: "done", envelope });
        } catch (err) {
          const mapped = toServerAIError(err);
          outcome = "error";
          errorCode = mapped.code;
          emit(controller, {
            type: "error",
            code: mapped.code,
            messageHe: errorResponseBody(mapped.code, correlationId).error.messageHe,
            recoverable: mapped.recoverable,
          });
        } finally {
          release();
          audit({
            correlationId,
            operation: dto.operation,
            endpoint: "ai-stream",
            organizationId: dto.organizationId,
            userId: dto.userId,
            authTrusted: false,
            outcome,
            errorCode,
            provider: adapter.id,
            model,
            durationMs: now() - startedAt,
            usageMeasured,
            injectionFlags: prompt.findings.map((f) => f.patternId),
            warnings: prompt.warnings,
          });
          controller.close();
        }
      },
      cancel: () => {
        release();
      },
    });
    const headers = responseHeaders(req, correlationId);
    headers.set("content-type", "application/x-ndjson; charset=utf-8");
    return new Response(stream, { status: 200, headers });
  };

  async function computeHealth(
    config: ServerAIConfig,
    signal?: AbortSignal,
  ): Promise<{
    state: AIProviderHealthState;
    detail: string;
    model: string | null;
  }> {
    if (!config.remoteEnabled) {
      return {
        state: "מושבת",
        detail: "AI מרוחק מושבת (AI_REMOTE_ENABLED=false). המערכת פועלת במצב מקומי בלבד.",
        model: null,
      };
    }
    if (!isProviderConfigured(config)) {
      return {
        state: "לא הוגדר",
        detail: "ספק ה-AI טרם הוגדר בצד השרת (AI_PROVIDER / AI_MODEL / AI_API_KEY).",
        model: null,
      };
    }
    const budgetStatus = state(config).budget.status(now());
    if (budgetStatus.exceeded) {
      return {
        state: "מגבלת תקציב",
        detail: `תקציב ה-AI היומי (${budgetStatus.limit} יחידות) מוצה להיום.`,
        model: config.model,
      };
    }
    const adapter = adapterFactory(config, deps.adapterDeps);
    if (adapter === null) {
      return { state: "לא הוגדר", detail: "לא נמצא מתאם לספק המוגדר.", model: null };
    }
    const health = await adapter.health(signal);
    return { state: health.state, detail: health.detail, model: health.model };
  }

  const aiHealth = async (req: Request): Promise<Response> => {
    const correlationId = resolveCorrelationId(req.headers.get(CORRELATION_ID_HEADER));
    const preflight = handlePreflight(req, correlationId);
    if (preflight) return preflight;
    const config = parseServerConfig(env());
    const health = await computeHealth(config, req.signal);
    const body: AiHealthResponseDtoV1 = {
      dtoVersion: AI_DTO_VERSION,
      health: {
        state: health.state,
        checkedAt: new Date(now()).toISOString(),
        detail: health.detail,
      },
      model: health.model,
    };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: responseHeaders(req, correlationId),
    });
  };

  const aiCapabilities = async (req: Request): Promise<Response> => {
    const correlationId = resolveCorrelationId(req.headers.get(CORRELATION_ID_HEADER));
    const preflight = handlePreflight(req, correlationId);
    if (preflight) return preflight;
    const config = parseServerConfig(env());
    const configured = config.remoteEnabled && isProviderConfigured(config);
    const body: AiCapabilitiesResponseDtoV1 = {
      dtoVersion: AI_DTO_VERSION,
      capabilities: {
        operations: configured ? ["summarize", "classify", "recommend", "explain"] : [],
        streaming: configured,
        structuredOutput: configured,
        maxInputChars: MAX_CONTEXT_CHARS,
        detail: configured
          ? "כל הפעולות זמינות דרך פונקציות השרת — המפתח נשאר בצד השרת בלבד."
          : "ספק ה-AI המרוחק אינו מוגדר/מופעל — אין פעולות מרוחקות זמינות.",
      },
    };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: responseHeaders(req, correlationId),
    });
  };

  // public runtime config for the client registry (5.14) — NO secrets, ever.
  const aiConfig = async (req: Request): Promise<Response> => {
    const correlationId = resolveCorrelationId(req.headers.get(CORRELATION_ID_HEADER));
    const preflight = handlePreflight(req, correlationId);
    if (preflight) return preflight;
    const config = parseServerConfig(env());
    // coarse, honest state WITHOUT a live provider call (ai-health is the
    // verified truth): configured real providers report "בודק חיבור" here.
    let providerState: AIProviderHealthState;
    if (!config.remoteEnabled) providerState = "מושבת";
    else if (!isProviderConfigured(config)) providerState = "לא הוגדר";
    else if (config.provider === "test") providerState = "מחובר";
    else providerState = "בודק חיבור";
    const body = { remoteEnabled: config.remoteEnabled, providerState };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: responseHeaders(req, correlationId),
    });
  };

  return {
    aiHealth,
    aiCapabilities,
    aiConfig,
    aiSummarize: opHandler("summarize", "ai-summarize"),
    aiClassify: opHandler("classify", "ai-classify"),
    aiRecommend: opHandler("recommend", "ai-recommend"),
    aiExplain: opHandler("explain", "ai-explain"),
    aiStructured: opHandler("structured", "ai-structured"),
    aiStream,
  };
}

/** shared instance for the Netlify function wrappers (per-container state) */
export const defaultAiHandlers: AiHandlers = createAiHandlers();
