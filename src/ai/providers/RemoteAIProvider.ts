// TERAGON AI BUSINESS OS — RemoteAIProvider, client-side shell (Wave 5, W5-A).
// Talks ONLY to relative /.netlify/functions/ai-* endpoints. Contains NO
// secrets and NO model names — the model comes back FROM the server inside the
// envelope. Every server response is zod-validated against the v1 DTOs
// (src/ai/contracts/serverDto.ts, the W5-B contract); anything malformed
// becomes a structured, recoverable AI_RESPONSE_INVALID — never rendered.
import type { z } from "zod";
import type { AIResponseEnvelopeV2 } from "@/domain/ai/envelope";
import {
  AIError,
  type AICapabilities,
  type AIErrorCode,
  type AIProvider,
  type AIProviderHealth,
  type AIProviderResult,
  type AIRequest,
  type AIStreamEvent,
} from "@/ai/contracts/AIProvider";
import {
  AI_DTO_VERSION,
  CORRELATION_ID_HEADER,
  aiCapabilitiesResponseDtoV1Schema,
  aiEnvelopeResponseDtoV1Schema,
  aiErrorResponseDtoV1Schema,
  aiHealthResponseDtoV1Schema,
  aiStreamEventDtoV1Schema,
  aiStructuredResponseDtoV1Schema,
  type AiRequestDtoV1,
} from "@/ai/contracts/serverDto";

export const REMOTE_PROVIDER_ID = "remote";
export const REMOTE_PROVIDER_DISPLAY_NAME = "מנוע AI מרוחק (דרך השרת)";

export interface RemoteAIProviderOptions {
  /** injectable fetch — tests pass a mock; defaults to globalThis.fetch */
  fetchImpl?: typeof fetch;
  /** relative base path — NEVER an absolute provider URL */
  basePath?: string;
  /** correlation-id generator (deterministic in tests) */
  correlationIdFactory?: () => string;
}

/** HTTP-status → stable error code, used only when the body carries no DTO error. */
function codeForStatus(status: number): AIErrorCode {
  if (status === 401) return "AI_PROVIDER_AUTH_FAILED";
  if (status === 403) return "AI_PERMISSION_DENIED";
  if (status === 402) return "AI_DAILY_BUDGET_EXCEEDED";
  if (status === 429) return "AI_RATE_LIMITED";
  if (status === 408 || status === 504) return "AI_PROVIDER_TIMEOUT";
  if (status === 503) return "AI_PROVIDER_UNAVAILABLE";
  return "AI_INTERNAL_ERROR";
}

export class RemoteAIProvider implements AIProvider {
  readonly id = REMOTE_PROVIDER_ID;
  readonly displayName = REMOTE_PROVIDER_DISPLAY_NAME;

  private readonly fetchImpl: typeof fetch;
  private readonly basePath: string;
  private readonly makeCorrelationId: () => string;
  private corrSeq = 0;

  constructor(options: RemoteAIProviderOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? ((...args) => globalThis.fetch(...args));
    this.basePath = options.basePath ?? "/.netlify/functions";
    this.makeCorrelationId =
      options.correlationIdFactory ??
      (() => {
        this.corrSeq += 1;
        return `corr-${Date.now().toString(36)}-${this.corrSeq}`;
      });
  }

  // -------------------------------------------------------------------------
  // health — the client NEVER claims "מחובר" on its own; only the server can.
  // -------------------------------------------------------------------------

  async health(): Promise<AIProviderHealth> {
    const correlationId = this.makeCorrelationId();
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.basePath}/ai-health`, {
        method: "GET",
        headers: { [CORRELATION_ID_HEADER]: correlationId },
      });
    } catch {
      return {
        state: "לא זמין",
        checkedAt: new Date().toISOString(),
        detail: "לא ניתן להגיע לשרת — סטטוס החיבור לא אומת",
      };
    }
    if (!res.ok) {
      return {
        state: res.status === 401 || res.status === 403 ? "שגיאת אימות" : "לא זמין",
        checkedAt: new Date().toISOString(),
        detail: `השרת השיב בשגיאה (${res.status}) — סטטוס החיבור לא אומת`,
      };
    }
    const body: unknown = await res.json().catch(() => null);
    const parsed = aiHealthResponseDtoV1Schema.safeParse(body);
    if (!parsed.success) {
      // malformed health = we cannot verify anything ⇒ honest "not available"
      return {
        state: "לא זמין",
        checkedAt: new Date().toISOString(),
        detail: "תשובת הבריאות מהשרת לא עמדה בחוזה — הסטטוס לא אומת",
      };
    }
    return parsed.data.health;
  }

  async capabilities(): Promise<AICapabilities> {
    const body = await this.getJson(`${this.basePath}/ai-capabilities`);
    const parsed = aiCapabilitiesResponseDtoV1Schema.safeParse(body.json);
    if (!parsed.success) {
      throw new AIError("AI_RESPONSE_INVALID", {
        recoverable: true,
        correlationId: body.correlationId,
        detail: "תשובת ai-capabilities לא עמדה בחוזה v1",
      });
    }
    return parsed.data.capabilities;
  }

  // -------------------------------------------------------------------------
  // envelope operations
  // -------------------------------------------------------------------------

  summarize(req: AIRequest): Promise<AIResponseEnvelopeV2> {
    return this.envelopeCall("ai-summarize", req);
  }

  classify(req: AIRequest): Promise<AIResponseEnvelopeV2> {
    return this.envelopeCall("ai-classify", req);
  }

  recommend(req: AIRequest): Promise<AIResponseEnvelopeV2> {
    return this.envelopeCall("ai-recommend", req);
  }

  explain(req: AIRequest): Promise<AIResponseEnvelopeV2> {
    return this.envelopeCall("ai-explain", req);
  }

  async generateStructured<T>(req: AIRequest, schema: z.ZodType<T>): Promise<AIProviderResult<T>> {
    const { json, correlationId } = await this.postJson("ai-structured", req);
    const parsed = aiStructuredResponseDtoV1Schema.safeParse(json);
    if (!parsed.success) {
      throw new AIError("AI_RESPONSE_INVALID", {
        recoverable: true,
        correlationId,
        detail: "תשובת ai-structured לא עמדה בחוזה v1",
      });
    }
    const value = schema.safeParse(parsed.data.value);
    if (!value.success) {
      throw new AIError("AI_RESPONSE_INVALID", {
        recoverable: true,
        correlationId,
        detail: "הערך המובנה מהשרת אינו תואם את הסכימה שביקש הקורא",
      });
    }
    return { value: value.data, envelope: parsed.data.envelope };
  }

  // -------------------------------------------------------------------------
  // streaming — fetch + ReadableStream of NDJSON event lines
  // -------------------------------------------------------------------------

  async *stream(req: AIRequest): AsyncIterable<AIStreamEvent> {
    const correlationId = req.correlationId ?? this.makeCorrelationId();
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.basePath}/ai-stream`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [CORRELATION_ID_HEADER]: correlationId,
        },
        body: JSON.stringify(this.toDto(req, correlationId)),
        signal: req.signal ?? null,
      });
    } catch (err) {
      const mapped = this.mapNetworkError(err, correlationId);
      yield {
        type: "error",
        code: mapped.code,
        messageHe: mapped.userMessageHe,
        recoverable: mapped.recoverable,
      };
      return;
    }
    if (!res.ok) {
      const mapped = await this.errorFromResponse(res, correlationId);
      yield {
        type: "error",
        code: mapped.code,
        messageHe: mapped.userMessageHe,
        recoverable: mapped.recoverable,
      };
      return;
    }
    if (!res.body) {
      const err = new AIError("AI_RESPONSE_INVALID", { recoverable: true, correlationId });
      yield { type: "error", code: err.code, messageHe: err.userMessageHe, recoverable: true };
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newline = buffer.indexOf("\n");
        while (newline >= 0) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          newline = buffer.indexOf("\n");
          if (line.length === 0) continue;
          const event = this.parseStreamLine(line, correlationId);
          yield event;
          if (event.type === "error" || event.type === "done") return;
        }
      }
      const tail = buffer.trim();
      if (tail.length > 0) {
        yield this.parseStreamLine(tail, correlationId);
      }
    } catch (err) {
      const mapped = this.mapNetworkError(err, correlationId);
      yield {
        type: "error",
        code: mapped.code,
        messageHe: mapped.userMessageHe,
        recoverable: mapped.recoverable,
      };
    } finally {
      reader.releaseLock();
    }
  }

  private parseStreamLine(line: string, correlationId: string): AIStreamEvent {
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      raw = null;
    }
    const parsed = aiStreamEventDtoV1Schema.safeParse(raw);
    if (!parsed.success) {
      const err = new AIError("AI_RESPONSE_INVALID", { recoverable: true, correlationId });
      return { type: "error", code: err.code, messageHe: err.userMessageHe, recoverable: true };
    }
    const ev = parsed.data;
    switch (ev.type) {
      case "start":
        return {
          type: "start",
          requestId: ev.requestId,
          correlationId: ev.correlationId,
          provider: this.id,
        };
      case "delta":
        return { type: "delta", text: ev.text };
      case "done":
        return { type: "done", envelope: ev.envelope };
      case "error":
        return {
          type: "error",
          code: ev.code,
          messageHe: ev.messageHe,
          recoverable: ev.recoverable,
        };
    }
  }

  // -------------------------------------------------------------------------
  // plumbing
  // -------------------------------------------------------------------------

  private toDto(req: AIRequest, correlationId: string): AiRequestDtoV1 {
    return {
      dtoVersion: AI_DTO_VERSION,
      operation: req.operation,
      organizationId: req.organizationId,
      userId: req.userId,
      sessionId: req.sessionId,
      correlationId,
      relatedEntities: req.relatedEntities,
      // typed slices serialize as plain records; the server re-validates them
      boundedContext: JSON.parse(
        JSON.stringify(req.boundedContext),
      ) as AiRequestDtoV1["boundedContext"],
      ...(req.params
        ? {
            params: JSON.parse(JSON.stringify(req.params)) as NonNullable<AiRequestDtoV1["params"]>,
          }
        : {}),
      outputSchemaVersion: req.outputSchemaVersion,
    };
  }

  private async envelopeCall(endpoint: string, req: AIRequest): Promise<AIResponseEnvelopeV2> {
    const { json, correlationId } = await this.postJson(endpoint, req);
    const parsed = aiEnvelopeResponseDtoV1Schema.safeParse(json);
    if (!parsed.success) {
      throw new AIError("AI_RESPONSE_INVALID", {
        recoverable: true,
        correlationId,
        detail: `תשובת ${endpoint} לא עמדה בחוזה v1`,
      });
    }
    return parsed.data.envelope;
  }

  private async postJson(
    endpoint: string,
    req: AIRequest,
  ): Promise<{ json: unknown; correlationId: string }> {
    const correlationId = req.correlationId ?? this.makeCorrelationId();
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.basePath}/${endpoint}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [CORRELATION_ID_HEADER]: correlationId,
        },
        body: JSON.stringify(this.toDto(req, correlationId)),
        signal: req.signal ?? null,
      });
    } catch (err) {
      throw this.mapNetworkError(err, correlationId);
    }
    if (!res.ok) {
      throw await this.errorFromResponse(res, correlationId);
    }
    const json: unknown = await res.json().catch(() => {
      throw new AIError("AI_RESPONSE_INVALID", { recoverable: true, correlationId });
    });
    return { json, correlationId };
  }

  private async getJson(url: string): Promise<{ json: unknown; correlationId: string }> {
    const correlationId = this.makeCorrelationId();
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: "GET",
        headers: { [CORRELATION_ID_HEADER]: correlationId },
      });
    } catch (err) {
      throw this.mapNetworkError(err, correlationId);
    }
    if (!res.ok) {
      throw await this.errorFromResponse(res, correlationId);
    }
    const json: unknown = await res.json().catch(() => null);
    return { json, correlationId };
  }

  /** Prefer the structured DTO error body; fall back to the HTTP status. */
  private async errorFromResponse(res: Response, correlationId: string): Promise<AIError> {
    const body: unknown = await res.json().catch(() => null);
    const parsed = aiErrorResponseDtoV1Schema.safeParse(body);
    if (parsed.success) {
      return new AIError(parsed.data.error.code, {
        recoverable: parsed.data.error.recoverable,
        correlationId: parsed.data.error.correlationId,
      });
    }
    return new AIError(codeForStatus(res.status), {
      recoverable: res.status === 429 || res.status >= 500,
      correlationId,
    });
  }

  private mapNetworkError(err: unknown, correlationId: string): AIError {
    if (err instanceof DOMException && err.name === "AbortError") {
      return new AIError("AI_REQUEST_CANCELLED", { correlationId });
    }
    if (err instanceof DOMException && err.name === "TimeoutError") {
      return new AIError("AI_PROVIDER_TIMEOUT", { recoverable: true, correlationId });
    }
    return new AIError("AI_PROVIDER_UNAVAILABLE", { recoverable: true, correlationId });
  }
}
