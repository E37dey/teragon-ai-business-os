// Barrel + production wiring — governed Wiki agent (Wave 6, W6-C).
// `wikiOps` is the surface the integration lead wires to Copilot commands.
// Each call builds over the CURRENT canonical repositories (factory-safe for
// tests that reset repositories between cases).
import { knowledgeStores } from "@/knowledge/stores";
import { WikiAgent, type WikiOps } from "./wikiAgent";

export * from "./wikiAgent";

function currentAgent(): WikiAgent {
  return new WikiAgent({ stores: knowledgeStores() });
}

/** Copilot-facing ops over the governed Wiki agent (read/flag only). */
export const wikiOps: WikiOps = {
  searchApproved: (query) => currentAgent().searchApproved(query),
  showContradictions: () => currentAgent().showContradictions(),
  answerQuestion: (question) => currentAgent().answerQuestion(question),
};
