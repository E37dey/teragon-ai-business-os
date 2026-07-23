// TERAGON AI BUSINESS OS — server adapter contract (Wave 5, W5-B).
// A server adapter turns a validated DTO request + layered prompt into an
// envelope. Adapters throw ONLY ServerAIError; the handler validates every
// envelope against the canonical zod schema before it leaves the server.
import type { AiRequestDtoV1 } from "@/ai/contracts/serverDto";
import type { AIProviderHealthState } from "@/ai/contracts/AIProvider";
import type { ServerAIConfig } from "../config";
import type { PromptBuildResult } from "../promptSecurity";

export type ServerOperation =
  "summarize" | "classify" | "recommend" | "explain" | "structured" | "stream";

export interface AdapterInvokeInput {
  op: ServerOperation;
  request: AiRequestDtoV1;
  prompt: PromptBuildResult;
  config: ServerAIConfig;
  correlationId: string;
  signal?: AbortSignal;
}

/** raw adapter output — handler zod-validates envelope before responding */
export interface AdapterResult {
  /** envelope-shaped output (unknown until schema-validated by the handler) */
  envelope: unknown;
  /** structured value (op="structured" only) */
  value?: unknown;
}

export interface AdapterHealth {
  state: AIProviderHealthState;
  detail: string;
  /** the model the adapter would use — from config, never invented */
  model: string | null;
}

export interface AdapterStreamChunk {
  type: "delta";
  text: string;
}

export interface ServerAIAdapter {
  readonly id: string;
  /** verify config/auth honestly; may perform a live provider check */
  health(signal?: AbortSignal): Promise<AdapterHealth>;
  invoke(input: AdapterInvokeInput): Promise<AdapterResult>;
  /**
   * op="stream": yields text deltas and RETURNS the final AdapterResult
   * (generator return value) — one generation, no double provider call.
   */
  streamDeltas(input: AdapterInvokeInput): AsyncGenerator<AdapterStreamChunk, AdapterResult, void>;
}
