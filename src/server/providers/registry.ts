// TERAGON AI BUSINESS OS — server adapter registry (Wave 5, W5-B).
// Maps the configured provider kind to its adapter. Null when nothing is
// configured — callers then answer AI_PROVIDER_NOT_CONFIGURED / "לא הוגדר".
import type { ServerAIConfig } from "../config";
import type { FetchLike } from "./http";
import { AnthropicAdapter } from "./anthropicAdapter";
import { OpenAIAdapter } from "./openaiAdapter";
import { TestAdapter } from "./testAdapter";
import type { ServerAIAdapter } from "./types";

export interface AdapterFactoryDeps {
  fetchImpl?: FetchLike;
  nowIso?: () => string;
}

export type AdapterFactory = (
  config: ServerAIConfig,
  deps?: AdapterFactoryDeps,
) => ServerAIAdapter | null;

/** TestAdapter ONLY when AI_PROVIDER=test — never a silent default. */
export const createAdapter: AdapterFactory = (config, deps = {}) => {
  switch (config.provider) {
    case "test":
      return new TestAdapter(config.model, deps.nowIso);
    case "anthropic":
      return new AnthropicAdapter(config, deps.fetchImpl, deps.nowIso);
    case "openai":
      return new OpenAIAdapter(config, deps.fetchImpl, deps.nowIso);
    case null:
      return null;
  }
};
