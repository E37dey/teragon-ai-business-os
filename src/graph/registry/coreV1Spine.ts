// TERAGON Business Graph — core-v1 spine (Phase 2).
// The 15 entity types and the priority relationships that form the minimum
// viable, high-confidence graph. Name mapping applied: 'recommendation' →
// aiRecommendation, 'KnowledgeArticle' → knowledgeArticle, 'MemoryRecord' →
// memoryRecord (the canonical graph entity-type spellings).
import type { GraphEntityType } from "../contracts/identity";
import type { GraphRelationshipType } from "../contracts/edge";

export const CORE_V1_ENTITY_SPINE: readonly GraphEntityType[] = [
  "customer",
  "lead",
  "opportunity",
  "quotation",
  "customerPrinter",
  "printerModel",
  "serviceTicket",
  "knowledgeArticle",
  "aiRecommendation",
  "approval",
  "task",
  "agentRun",
  "course",
  "enrollment",
  "memoryRecord",
] as const;

export const CORE_V1_PRIORITY_RELATIONSHIPS: readonly GraphRelationshipType[] = [
  "OWNS",
  "CONTACT_FOR",
  "ASSIGNED_TO",
  "DERIVED_FROM",
  "QUOTED_FOR",
  "USES",
  "SERVICED",
  "RESOLVED_BY",
  "ENROLLED_IN",
  "RECOMMENDED",
  "APPROVED_BY",
  "GENERATED_TASK",
  "SUPPORTED_BY",
  "MENTIONED_IN",
  "SUPERSEDES",
  "AUDITS",
] as const;
