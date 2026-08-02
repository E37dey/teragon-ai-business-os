// Gate S4 — the Supabase mapping registry (collection → DomainMapping).
// Assembled from the eight domain files. This is the single source of truth for
// which collections the Supabase provider can serve.
import type { CollectionKey } from "@/repositories/collections";
import type { AnyMapping } from "./mapping";
import { identityMappings } from "./domains/identity";
import { crmMappings } from "./domains/crm";
import { productsPrintersMappings } from "./domains/productsPrinters";
import { serviceMappings } from "./domains/service";
import { trainingMappings } from "./domains/training";
import { tasksApprovalsMappings } from "./domains/tasksApprovals";
import { knowledgeMemoryMappings } from "./domains/knowledgeMemory";
import { governanceAuditMappings } from "./domains/governanceAudit";

const ALL: AnyMapping[] = [
  ...identityMappings,
  ...crmMappings,
  ...productsPrintersMappings,
  ...serviceMappings,
  ...trainingMappings,
  ...tasksApprovalsMappings,
  ...knowledgeMemoryMappings,
  ...governanceAuditMappings,
];

export const MAPPING_REGISTRY: ReadonlyMap<CollectionKey, AnyMapping> = new Map(
  ALL.map((m) => [m.collection, m]),
);

export function getMapping(collection: CollectionKey): AnyMapping | undefined {
  return MAPPING_REGISTRY.get(collection);
}

/** Collections the Supabase provider can currently serve. */
export const SUPPORTED_COLLECTIONS: readonly CollectionKey[] = ALL.map((m) => m.collection);
