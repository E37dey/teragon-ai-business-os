// TERAGON AI BUSINESS OS — client ⇄ server AI DTOs, version "v1" (Wave 5, W5-A).
// THIS FILE IS THE CONTRACT BETWEEN W5-A (client shell) AND W5-B (Netlify
// functions). Both sides zod-validate against these schemas. Breaking changes
// require a new dtoVersion — never mutate v1 in place.
//
// Endpoints (all relative, same-origin — the browser NEVER talks to an AI
// provider directly and NEVER sees a secret):
//   GET  /.netlify/functions/ai-health        → aiHealthResponseDtoV1
//   GET  /.netlify/functions/ai-capabilities  → aiCapabilitiesResponseDtoV1
//   POST /.netlify/functions/ai-summarize     → aiEnvelopeResponseDtoV1 | aiErrorResponseDtoV1
//   POST /.netlify/functions/ai-classify      → aiEnvelopeResponseDtoV1 | aiErrorResponseDtoV1
//   POST /.netlify/functions/ai-recommend     → aiEnvelopeResponseDtoV1 | aiErrorResponseDtoV1
//   POST /.netlify/functions/ai-explain       → aiEnvelopeResponseDtoV1 | aiErrorResponseDtoV1
//   POST /.netlify/functions/ai-structured    → aiStructuredResponseDtoV1 | aiErrorResponseDtoV1
//   POST /.netlify/functions/ai-stream        → NDJSON stream of aiStreamEventDtoV1 lines
//
// Correlation: the client sends header "x-correlation-id"; the server MUST echo
// it into every envelope/error/stream event and its audit log.
// Errors: non-2xx responses carry aiErrorResponseDtoV1 with a stable AIErrorCode;
// the server never returns stack traces or provider-raw error bodies.
// Model: the model name comes back FROM the server in envelope.model — the
// client never hardcodes or sends a model name.
import { z } from "zod";
import { aiIsoDate, aiResponseEnvelopeV2Schema } from "@/ai/schemas/envelope";

export const AI_DTO_VERSION = "v1" as const;

export const CORRELATION_ID_HEADER = "x-correlation-id";

// ---------------------------------------------------------------------------
// request DTO
// ---------------------------------------------------------------------------

export const aiRelatedEntityDtoV1Schema = z.object({
  type: z.string().min(1),
  id: z.string().min(1),
});

/**
 * Serialized bounded context: collection name → array of plain records.
 * The server re-validates each slice against its own domain schemas (W5-B).
 */
export const aiBoundedContextDtoV1Schema = z.record(
  z.string(),
  z.array(z.record(z.string(), z.unknown())),
);

export const aiRequestParamsDtoV1Schema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
);

export const aiRequestDtoV1Schema = z.object({
  dtoVersion: z.literal(AI_DTO_VERSION),
  operation: z.string().min(1),
  organizationId: z.string().min(1),
  userId: z.string().min(1),
  sessionId: z.string().min(1),
  correlationId: z.string().min(1),
  relatedEntities: z.array(aiRelatedEntityDtoV1Schema),
  boundedContext: aiBoundedContextDtoV1Schema,
  params: aiRequestParamsDtoV1Schema.optional(),
  outputSchemaVersion: z.string().min(1),
});

export type AiRequestDtoV1 = z.infer<typeof aiRequestDtoV1Schema>;

// ---------------------------------------------------------------------------
// response DTOs
// ---------------------------------------------------------------------------

export const aiErrorCodeDtoV1Schema = z.enum([
  "AI_PROVIDER_NOT_CONFIGURED",
  "AI_PROVIDER_AUTH_FAILED",
  "AI_PROVIDER_UNAVAILABLE",
  "AI_PROVIDER_TIMEOUT",
  "AI_RATE_LIMITED",
  "AI_DAILY_BUDGET_EXCEEDED",
  "AI_RESPONSE_INVALID",
  "AI_EVIDENCE_REQUIRED",
  "AI_PERMISSION_DENIED",
  "AI_REQUEST_CANCELLED",
  "AI_INTERNAL_ERROR",
]);

/** Error body — the ONLY error shape the server may return. No stack traces. */
export const aiErrorResponseDtoV1Schema = z.object({
  dtoVersion: z.literal(AI_DTO_VERSION),
  error: z.object({
    code: aiErrorCodeDtoV1Schema,
    /** safe Hebrew user message (server-side copy of AI_ERROR_MESSAGES_HE) */
    messageHe: z.string().min(1),
    correlationId: z.string().min(1),
    recoverable: z.boolean(),
  }),
});

export type AiErrorResponseDtoV1 = z.infer<typeof aiErrorResponseDtoV1Schema>;

/** Envelope-bearing success body for summarize/classify/recommend/explain. */
export const aiEnvelopeResponseDtoV1Schema = z.object({
  dtoVersion: z.literal(AI_DTO_VERSION),
  envelope: aiResponseEnvelopeV2Schema,
});

export type AiEnvelopeResponseDtoV1 = z.infer<typeof aiEnvelopeResponseDtoV1Schema>;

/** Structured-output success body: envelope + raw value (client re-validates value). */
export const aiStructuredResponseDtoV1Schema = z.object({
  dtoVersion: z.literal(AI_DTO_VERSION),
  envelope: aiResponseEnvelopeV2Schema,
  value: z.unknown(),
});

export type AiStructuredResponseDtoV1 = z.infer<typeof aiStructuredResponseDtoV1Schema>;

// ---------------------------------------------------------------------------
// health + capabilities DTOs
// ---------------------------------------------------------------------------

export const aiHealthStateDtoV1Schema = z.enum([
  "לא הוגדר",
  "בודק חיבור",
  "מחובר",
  "חיבור מוגבל",
  "לא זמין",
  "מגבלת תקציב",
  "שגיאת אימות",
  "מושבת",
]);

/**
 * Health truth comes from the SERVER (it alone can verify provider auth).
 * The client passes it through — it never claims "מחובר" on its own.
 */
export const aiHealthResponseDtoV1Schema = z.object({
  dtoVersion: z.literal(AI_DTO_VERSION),
  health: z.object({
    state: aiHealthStateDtoV1Schema,
    checkedAt: aiIsoDate,
    detail: z.string(),
  }),
  /** model the server would use; null when not configured — never invented */
  model: z.string().nullable(),
});

export type AiHealthResponseDtoV1 = z.infer<typeof aiHealthResponseDtoV1Schema>;

export const aiCapabilitiesResponseDtoV1Schema = z.object({
  dtoVersion: z.literal(AI_DTO_VERSION),
  capabilities: z.object({
    operations: z.array(z.enum(["summarize", "classify", "recommend", "explain"])),
    streaming: z.boolean(),
    structuredOutput: z.boolean(),
    maxInputChars: z.number().int().positive().optional(),
    detail: z.string(),
  }),
});

export type AiCapabilitiesResponseDtoV1 = z.infer<typeof aiCapabilitiesResponseDtoV1Schema>;

// ---------------------------------------------------------------------------
// streaming DTO — NDJSON: one JSON event per line on the ai-stream response body
// ---------------------------------------------------------------------------

export const aiStreamEventDtoV1Schema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("start"),
    dtoVersion: z.literal(AI_DTO_VERSION),
    requestId: z.string().min(1),
    correlationId: z.string().min(1),
    provider: z.string().min(1),
  }),
  z.object({ type: z.literal("delta"), text: z.string() }),
  z.object({ type: z.literal("done"), envelope: aiResponseEnvelopeV2Schema }),
  z.object({
    type: z.literal("error"),
    code: aiErrorCodeDtoV1Schema,
    messageHe: z.string().min(1),
    recoverable: z.boolean(),
  }),
]);

export type AiStreamEventDtoV1 = z.infer<typeof aiStreamEventDtoV1Schema>;
