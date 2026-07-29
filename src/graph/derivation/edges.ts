// TERAGON Business Graph — pure edge derivation (Phase 3).
// Turns a canonical record's foreign keys / link fields into typed edges.
// Authority is ALWAYS decided by the centralized resolveEdgeAuthority policy —
// never hand-set. Broken/cross-org/ambiguous references emit an issue and NO
// authoritative edge. Pure & deterministic: dates come from the source record.
import { parseKindIdRef } from "../contracts/references";
import { resolveEdgeAuthority } from "../contracts/authority";
import type { GraphEntityType, GraphNodeId } from "../contracts/identity";
import {
  businessGraphEdgeSchema,
  type BusinessGraphEdge,
  type GraphEdgeApprovalState,
  type GraphEdgeDirection,
  type GraphProvenance,
  type GraphRelationshipType,
} from "../contracts/edge";
import { EDGE_REGISTRY, type EdgeRegistryEntry } from "../registry/edgeRegistry";
import { ENTITY_REGISTRY } from "../registry/entityRegistry";
import {
  buildEdgeId,
  computeArchived,
  computeSensitivity,
  computeSuperseded,
  makeIssue,
  readField,
  readStringField,
  resolveOrganization,
  safeNodeId,
} from "./internal";
import { DERIVATION_STATUS } from "./types";
import type {
  CanonicalRecord,
  DeriveEdgesOutcome,
  GraphDerivationContext,
  GraphDerivationIssue,
  GraphDerivationLookup,
  GraphLookupTarget,
} from "./types";

// ---------------------------------------------------------------------------
// edge specs
// ---------------------------------------------------------------------------

interface EdgeSpec {
  relationshipType: GraphRelationshipType;
  registrySourceType: GraphEntityType;
  registryTargetType: GraphEntityType;
  /** field on the processed record holding the referenced id(s) */
  fkField: string;
  /** whether the fk references the SOURCE node or the TARGET node */
  fkPointsTo: "source" | "target";
  isArray?: boolean;
  /** when array items are objects, the id field to read */
  arrayItemField?: string;
  /** when array items are objects, only keep items whose `filterField === filterValue` */
  filterField?: string;
  filterValue?: string;
  /** value is a legacy "kind:id" string; targetType picked from kind via targetTypeFromKind */
  legacyKindId?: boolean;
  targetTypeFromKind?: Record<string, GraphEntityType>;
  /** name-based / ambiguous — emit an issue, never an authoritative edge */
  ambiguous?: boolean;
  /** a missing target is expected (weak inferred link) — skip silently */
  silentIfMissing?: boolean;
  /** override provenance when there is no registry entry */
  provenanceOverride?: GraphProvenance;
  directionOverride?: GraphEdgeDirection;
  /** derive a gate result (approvalState + satisfaction) from source+target records */
  gate?: (source: CanonicalRecord, target: GraphLookupTarget | undefined) => {
    gateSatisfied: boolean;
    approvalState: GraphEdgeApprovalState;
  };
}

const quotationGate: EdgeSpec["gate"] = (source) => ({
  gateSatisfied: readField(source, "status") === "אושרה",
  approvalState: "none",
});

const approvalGate: EdgeSpec["gate"] = (_source, target) => {
  const status = target?.status;
  if (status === "אושר") return { gateSatisfied: true, approvalState: "approved" };
  if (status === "נדחה") return { gateSatisfied: false, approvalState: "rejected" };
  return { gateSatisfied: false, approvalState: "pending" };
};

const EDGE_SPECS: Partial<Record<GraphEntityType, EdgeSpec[]>> = {
  customer: [
    {
      relationshipType: "OWNS",
      registrySourceType: "organization",
      registryTargetType: "customer",
      fkField: "organizationId",
      fkPointsTo: "source",
    },
  ],
  customerPrinter: [
    {
      relationshipType: "OWNS",
      registrySourceType: "customerPrinter",
      registryTargetType: "customer",
      fkField: "customerId",
      fkPointsTo: "target",
    },
    {
      relationshipType: "USES",
      registrySourceType: "customerPrinter",
      registryTargetType: "printerModel",
      fkField: "printerModelId",
      fkPointsTo: "target",
    },
  ],
  lead: [
    {
      relationshipType: "ASSIGNED_TO",
      registrySourceType: "lead",
      registryTargetType: "user",
      fkField: "ownerId",
      fkPointsTo: "target",
    },
  ],
  opportunity: [
    {
      relationshipType: "DERIVED_FROM",
      registrySourceType: "opportunity",
      registryTargetType: "lead",
      fkField: "leadId",
      fkPointsTo: "target",
    },
    {
      relationshipType: "RELATED_TO",
      registrySourceType: "opportunity",
      registryTargetType: "customer",
      fkField: "customerId",
      fkPointsTo: "target",
    },
  ],
  quotation: [
    {
      relationshipType: "QUOTED_FOR",
      registrySourceType: "quotation",
      registryTargetType: "customer",
      fkField: "customerId",
      fkPointsTo: "target",
      gate: quotationGate,
    },
    {
      relationshipType: "USES",
      registrySourceType: "quotation",
      registryTargetType: "product",
      fkField: "lines",
      fkPointsTo: "target",
      isArray: true,
      arrayItemField: "productId",
    },
  ],
  serviceTicket: [
    {
      relationshipType: "SERVICED",
      registrySourceType: "serviceTicket",
      registryTargetType: "customer",
      fkField: "customerId",
      fkPointsTo: "target",
    },
  ],
  repairAction: [
    {
      relationshipType: "RESOLVED_BY",
      registrySourceType: "serviceTicket",
      registryTargetType: "repairAction",
      fkField: "ticketId",
      fkPointsTo: "source",
    },
  ],
  course: [
    {
      relationshipType: "ASSIGNED_TO",
      registrySourceType: "course",
      registryTargetType: "user",
      fkField: "instructorId",
      fkPointsTo: "target",
    },
  ],
  enrollment: [
    {
      relationshipType: "ENROLLED_IN",
      registrySourceType: "enrollment",
      registryTargetType: "course",
      fkField: "courseId",
      fkPointsTo: "target",
    },
    {
      relationshipType: "RELATED_TO",
      registrySourceType: "enrollment",
      registryTargetType: "student",
      fkField: "studentId",
      fkPointsTo: "target",
    },
  ],
  aiRecommendation: [
    {
      relationshipType: "RECOMMENDED",
      registrySourceType: "aiRecommendation",
      registryTargetType: "agent",
      fkField: "agentId",
      fkPointsTo: "target",
    },
    {
      relationshipType: "APPROVED_BY",
      registrySourceType: "aiRecommendation",
      registryTargetType: "approval",
      fkField: "approvalId",
      fkPointsTo: "target",
      gate: approvalGate,
    },
    {
      relationshipType: "SUPPORTED_BY",
      registrySourceType: "aiRecommendation",
      registryTargetType: "knowledgeArticle",
      fkField: "evidenceIds",
      fkPointsTo: "target",
      isArray: true,
      silentIfMissing: true,
    },
  ],
  task: [
    {
      relationshipType: "ASSIGNED_TO",
      registrySourceType: "task",
      registryTargetType: "user",
      fkField: "ownerId",
      fkPointsTo: "target",
    },
    {
      relationshipType: "RELATED_TO",
      registrySourceType: "task",
      registryTargetType: "customer",
      fkField: "relatedRef",
      fkPointsTo: "target",
      legacyKindId: true,
      provenanceOverride: "INFERRED",
      directionOverride: "directed",
      targetTypeFromKind: {
        lead: "lead",
        customer: "customer",
        opportunity: "opportunity",
        quotation: "quotation",
        enrollment: "enrollment",
        ticket: "serviceTicket",
      },
    },
  ],
  agentRun: [
    {
      relationshipType: "GENERATED_TASK",
      registrySourceType: "agentRun",
      registryTargetType: "task",
      fkField: "taskIds",
      fkPointsTo: "target",
      isArray: true,
    },
    {
      relationshipType: "CREATED",
      registrySourceType: "agentRun",
      registryTargetType: "aiRecommendation",
      fkField: "recommendationIds",
      fkPointsTo: "target",
      isArray: true,
    },
  ],
  memoryRecord: [
    {
      relationshipType: "MENTIONED_IN",
      registrySourceType: "memoryRecord",
      registryTargetType: "customer",
      fkField: "entityLinks",
      fkPointsTo: "target",
      isArray: true,
      arrayItemField: "entityId",
      filterField: "collection",
      filterValue: "customers",
    },
    {
      relationshipType: "SUPERSEDES",
      registrySourceType: "memoryRecord",
      registryTargetType: "memoryRecord",
      fkField: "supersedesId",
      fkPointsTo: "target",
    },
    {
      relationshipType: "MENTIONED_IN",
      registrySourceType: "memoryRecord",
      registryTargetType: "customer",
      fkField: "frontmatter.customer",
      fkPointsTo: "target",
      ambiguous: true,
    },
  ],
};

// ---------------------------------------------------------------------------
// registry lookup
// ---------------------------------------------------------------------------

function findEdgeRegistry(spec: EdgeSpec): EdgeRegistryEntry | undefined {
  return EDGE_REGISTRY.find(
    (e) =>
      e.relationshipType === spec.relationshipType &&
      e.sourceType === spec.registrySourceType &&
      e.targetType === spec.registryTargetType,
  );
}

// ---------------------------------------------------------------------------
// candidate reference collection
// ---------------------------------------------------------------------------

interface CandidateRef {
  referencedId: string;
  /**
   * The entity type the referenced record is looked up under. For a
   * source-pointing FK this is the SOURCE type (the fk names the source node);
   * for a target-pointing FK it is the TARGET type. Decided generically by
   * `fkPointsTo` — never by any name/substring match.
   */
  referenceType: GraphEntityType;
  discriminator: string;
}

function collectRefs(
  spec: EdgeSpec,
  record: CanonicalRecord,
): { refs: CandidateRef[]; malformed: string[] } {
  const refs: CandidateRef[] = [];
  const malformed: string[] = [];
  const raw = readField(record, spec.fkField);

  // GENERIC: the referenced record's type is the SOURCE type when the fk points
  // at the source node, otherwise the TARGET type. This is the single rule that
  // makes a source-pointing FK (e.g. customer.organizationId → OWNS, or
  // repairAction.ticketId → RESOLVED_BY) resolve under the correct type. The
  // legacy kind:id path is always target-pointing and keeps its kind-resolved
  // type below.
  const referenceEntityType: GraphEntityType =
    spec.fkPointsTo === "source" ? spec.registrySourceType : spec.registryTargetType;

  const pushKindId = (value: string): void => {
    const parsed = parseKindIdRef(value);
    if ("malformed" in parsed) {
      malformed.push(value);
      return;
    }
    const targetType = spec.targetTypeFromKind?.[parsed.kind];
    if (!targetType) {
      malformed.push(value); // unsupported kind — surfaced as malformed/unsupported
      return;
    }
    refs.push({
      referencedId: parsed.id,
      referenceType: targetType,
      discriminator: `${spec.fkField}:${parsed.kind}:${parsed.id}`,
    });
  };

  if (spec.isArray) {
    if (!Array.isArray(raw)) return { refs, malformed };
    for (const item of raw) {
      if (spec.arrayItemField) {
        if (item === null || typeof item !== "object") continue;
        const obj = item as Record<string, unknown>;
        if (spec.filterField && obj[spec.filterField] !== spec.filterValue) continue;
        const id = obj[spec.arrayItemField];
        if (typeof id === "string" && id.trim() !== "") {
          refs.push({
            referencedId: id,
            referenceType: referenceEntityType,
            discriminator: `${spec.fkField}:${id}`,
          });
        }
      } else if (typeof item === "string" && item.trim() !== "") {
        refs.push({
          referencedId: item,
          referenceType: referenceEntityType,
          discriminator: `${spec.fkField}:${item}`,
        });
      }
    }
    return { refs, malformed };
  }

  if (typeof raw !== "string" || raw.trim() === "") return { refs, malformed };
  if (spec.legacyKindId) {
    pushKindId(raw);
  } else {
    refs.push({
      referencedId: raw,
      referenceType: referenceEntityType,
      discriminator: spec.fkField,
    });
  }
  return { refs, malformed };
}

// ---------------------------------------------------------------------------
// deriveGraphEdges
// ---------------------------------------------------------------------------

export function deriveGraphEdges(
  record: CanonicalRecord,
  entityType: GraphEntityType,
  lookup: GraphDerivationLookup,
  context: GraphDerivationContext,
): DeriveEdgesOutcome {
  const edges: BusinessGraphEdge[] = [];
  const issues: GraphDerivationIssue[] = [];
  const entry = ENTITY_REGISTRY[entityType];
  const entityId = readStringField(record, entry.identifierField) ?? "";

  if (DERIVATION_STATUS[entityType] === "EXCLUDED" || entityId === "") {
    return { edges, issues };
  }

  const org = resolveOrganization(record, entry, context);
  if (org.unmappable || org.organizationId === null) {
    return { edges, issues };
  }
  const organizationId = org.organizationId;
  const ownNode = safeNodeId(organizationId, entityType, entityId);
  if (ownNode === null) return { edges, issues };

  const ownArchived = computeArchived(record, entry);
  const ownSuperseded = computeSuperseded(record, entry);
  const ownRejected =
    readField(record, "rejected") === true || readField(record, "status") === "נדחה";
  const sensitivity = computeSensitivity(record, entry);
  const createdAt = readStringField(record, "createdAt") ?? "1970-01-01";

  const specs = EDGE_SPECS[entityType] ?? [];
  const seen = new Set<string>();

  for (const spec of specs) {
    const reg = findEdgeRegistry(spec);
    const provenance: GraphProvenance =
      spec.provenanceOverride ?? reg?.defaultProvenance ?? "INFERRED";
    const direction: GraphEdgeDirection = spec.directionOverride ?? reg?.direction ?? "directed";
    const approvalGated = reg?.approvalGated ?? false;

    // name-based / ambiguous field → issue only, never an authoritative edge.
    if (spec.ambiguous) {
      const nameVal = readStringField(record, spec.fkField);
      if (nameVal !== null) {
        issues.push(
          makeIssue("AMBIGUOUS_REFERENCE", entityType, entityId, {
            field: spec.fkField,
            attemptedRelationship: spec.relationshipType,
          }),
        );
      }
      continue;
    }

    const { refs, malformed } = collectRefs(spec, record);
    for (const bad of malformed) {
      issues.push(
        makeIssue(
          spec.targetTypeFromKind ? "UNSUPPORTED_REFERENCE" : "MALFORMED_REFERENCE",
          entityType,
          entityId,
          {
            field: spec.fkField,
            attemptedRelationship: spec.relationshipType,
            reasonHe: `הפניה "${bad}" אינה ניתנת לרזולוציה`,
          },
        ),
      );
    }

    for (const cand of refs) {
      const referencedExists = lookup.exists(cand.referenceType, cand.referencedId);
      const referenced = lookup.get(cand.referenceType, cand.referencedId);

      if (!referencedExists) {
        if (!spec.silentIfMissing) {
          issues.push(
            makeIssue("MISSING_TARGET", entityType, entityId, {
              field: spec.fkField,
              attemptedRelationship: spec.relationshipType,
              reasonHe: `יעד ${cand.referenceType}:${cand.referencedId} אינו קיים`,
            }),
          );
        }
        continue;
      }

      const refOrg = referenced?.organizationId;
      const sameOrganization =
        refOrg === null || refOrg === undefined || refOrg === "" ? true : refOrg === organizationId;
      if (!sameOrganization) {
        issues.push(
          makeIssue("CROSS_ORGANIZATION", entityType, entityId, {
            field: spec.fkField,
            attemptedRelationship: spec.relationshipType,
          }),
        );
        continue;
      }

      // build the two node ids (record fills the role opposite the fk).
      const sourceNodeId: GraphNodeId | null =
        spec.fkPointsTo === "source"
          ? safeNodeId(organizationId, spec.registrySourceType, cand.referencedId)
          : ownNode;
      const targetNodeId: GraphNodeId | null =
        spec.fkPointsTo === "source"
          ? ownNode
          : safeNodeId(organizationId, cand.referenceType, cand.referencedId);
      if (sourceNodeId === null || targetNodeId === null) continue;

      const gate = spec.gate?.(record, referenced) ?? {
        gateSatisfied: true,
        approvalState: "none" as GraphEdgeApprovalState,
      };

      // source-side facts depend on which endpoint the record is.
      const sourceArchived =
        spec.fkPointsTo === "source" ? referenced?.archived === true : ownArchived;
      const sourceRejected =
        spec.fkPointsTo === "source"
          ? referenced?.rejected === true || referenced?.status === "נדחה"
          : ownRejected;
      const sourceEligibleBase =
        !sourceRejected && (spec.fkPointsTo === "source" ? referencedExists : entry.graphEligible);
      const sourceEligible = sourceEligibleBase && (!approvalGated || gate.gateSatisfied);
      const registryAuthoritative =
        reg?.defaultAuthority === "CANONICAL" && (!approvalGated || gate.gateSatisfied);

      const decision = resolveEdgeAuthority({
        provenance,
        registryAuthoritative,
        sourceEligible,
        targetExists: referencedExists,
        sameOrganization,
        sourceArchived,
        sourceRejected,
        ambiguousResolution: false,
        approvalState: gate.approvalState,
      });

      const edgeId = buildEdgeId({
        organizationId,
        source: sourceNodeId,
        relationshipType: spec.relationshipType,
        target: targetNodeId,
        discriminator: cand.discriminator,
      });
      if (seen.has(edgeId)) continue; // in-record dedupe (e.g. two lines, same product)
      seen.add(edgeId);

      const staleState = ownSuperseded ? "SUPERSEDED" : sourceArchived ? "STALE" : "FRESH";
      const edge: BusinessGraphEdge = {
        id: edgeId,
        organizationId,
        relationshipType: spec.relationshipType,
        source: sourceNodeId,
        target: targetNodeId,
        direction,
        provenance,
        authority: decision.authority,
        evidenceRefs: [],
        sensitivity,
        approvalState: gate.approvalState,
        validFrom: createdAt,
        validUntil: null,
        createdAt,
        createdBy: null,
        version: 1,
        staleState,
      };

      if (!businessGraphEdgeSchema.safeParse(edge).success) {
        issues.push(
          makeIssue("INELIGIBLE_TARGET", entityType, entityId, {
            field: spec.fkField,
            attemptedRelationship: spec.relationshipType,
          }),
        );
        continue;
      }
      edges.push(edge);
    }
  }

  return { edges, issues };
}
