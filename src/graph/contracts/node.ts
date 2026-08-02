// TERAGON Business Graph — node envelope contract (Phase 2).
// A BusinessGraphNode carries ONLY safe projection metadata (title/status/
// lifecycle/ownership/sensitivity). It deliberately has NO body/content/prompt/
// notes field — sensitive payloads are referenced (never embedded) via a
// ProtectedPayloadReference, which itself carries no content. This mirrors
// SECURITY_MODEL §3 ("refuse the sensitive body on the node — title/label only").
import { z } from "zod";
import type { ISODate } from "@/domain/types";
import { MEMORY_SENSITIVITIES, type MemorySensitivity } from "@/domain/memory/types";
import {
  graphEntityRefSchema,
  graphEntityTypeSchema,
  graphIsoDateSchema,
  graphNodeIdSchema,
  type GraphEntityRef,
  type GraphEntityType,
  type GraphNodeId,
} from "./identity";

// ---------------------------------------------------------------------------
// sensitivity (mirrored from the memory 4-level scale — cannot drift)
// ---------------------------------------------------------------------------

/**
 * The graph reuses the memory sensitivity scale verbatim. The
 * `satisfies readonly MemorySensitivity[]` binds this tuple to the domain type
 * so any divergence is a compile error.
 */
export const GRAPH_SENSITIVITIES = [
  "ציבורי",
  "פנימי",
  "רגיש",
  "מוגבל",
] as const satisfies readonly MemorySensitivity[];

export type GraphSensitivity = (typeof GRAPH_SENSITIVITIES)[number];

export const graphSensitivitySchema = z.enum(GRAPH_SENSITIVITIES);

/** The hidden sensitivities whose body is never delivered without a reason. */
export const GRAPH_HIDDEN_SENSITIVITIES: readonly GraphSensitivity[] = ["רגיש", "מוגבל"];

// Compile-time assurance the mirror covers the whole domain scale.
const _sensitivityCoverage: readonly MemorySensitivity[] = MEMORY_SENSITIVITIES;
void _sensitivityCoverage;

// ---------------------------------------------------------------------------
// node envelope
// ---------------------------------------------------------------------------

/** A value that is safe to expose in a projection summary. */
export type GraphMetadataValue = string | number | boolean | null;

/**
 * The read-only projection of a canonical record as a graph node. Contains no
 * free-text body, prompt, article content or private notes — only structured,
 * envelope-safe metadata.
 */
export interface BusinessGraphNode {
  id: GraphNodeId;
  organizationId: string;
  entityType: GraphEntityType;
  entityId: string;
  title: string;
  status: string | null;
  sensitivity: GraphSensitivity;
  ownerRef: GraphEntityRef | null;
  version: number | null;
  authoritative: boolean;
  archived: boolean;
  superseded: boolean;
  createdAt: ISODate;
  updatedAt: ISODate;
  metadataSummary: Record<string, GraphMetadataValue>;
}

const graphMetadataValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const businessGraphNodeSchema = z.object({
  id: graphNodeIdSchema,
  organizationId: z.string().min(1),
  entityType: graphEntityTypeSchema,
  entityId: z.string().min(1),
  title: z.string(),
  status: z.string().nullable(),
  sensitivity: graphSensitivitySchema,
  ownerRef: graphEntityRefSchema.nullable(),
  version: z.number().int().nullable(),
  authoritative: z.boolean(),
  archived: z.boolean(),
  superseded: z.boolean(),
  createdAt: graphIsoDateSchema,
  updatedAt: graphIsoDateSchema,
  metadataSummary: z.record(z.string(), graphMetadataValueSchema),
});

// ---------------------------------------------------------------------------
// protected payload reference — points at a sensitive body, carries no content
// ---------------------------------------------------------------------------

/**
 * A typed pointer to where a sensitive body lives — NOT the body itself. The
 * traversal layer resolves this only behind a reveal-with-reason gate; the
 * contract guarantees the content never rides along inside the graph.
 */
export interface ProtectedPayloadReference {
  entityRef: GraphEntityRef;
  fieldName: string;
  sensitivity: GraphSensitivity;
  requiresRevealReason: boolean;
}

export const protectedPayloadReferenceSchema = z.object({
  entityRef: graphEntityRefSchema,
  fieldName: z.string().min(1),
  sensitivity: graphSensitivitySchema,
  requiresRevealReason: z.boolean(),
}) satisfies z.ZodType<ProtectedPayloadReference>;
