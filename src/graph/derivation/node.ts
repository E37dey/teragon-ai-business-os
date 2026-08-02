// TERAGON Business Graph — pure node derivation (Phase 3).
// Projects a canonical record into a BusinessGraphNode envelope. Pure &
// deterministic: dates come from the SOURCE record, org is resolved (never
// invented), and no sensitive body is ever copied onto the node.
import { buildNodeId, type GraphEntityRef, type GraphEntityType } from "../contracts/identity";
import type { BusinessGraphNode } from "../contracts/node";
import { ENTITY_REGISTRY } from "../registry/entityRegistry";
import {
  computeArchived,
  computeAuthoritative,
  computeEnrollmentStageSummary,
  computeMetadataSummary,
  computeOwnerRef,
  computeSensitivity,
  computeSuperseded,
  computeTitle,
  makeIssue,
  readField,
  readStringField,
  resolveOrganization,
} from "./internal";
import type { GraphMetadataValue } from "../contracts/node";
import { DERIVATION_STATUS, type CanonicalRecord, type DeriveNodeOutcome } from "./types";

/**
 * Derive the graph node for one canonical record. Returns the node (when
 * mappable) plus any issues, or an unmappableRecord when the record cannot be a
 * node (missing organization, excluded entity type, ineligible, unsafe id).
 */
export function deriveGraphNode(
  record: CanonicalRecord,
  entityType: GraphEntityType,
  context: { organizationId: string; allowOrgInheritance?: boolean } & Record<string, unknown>,
): DeriveNodeOutcome {
  const entry = ENTITY_REGISTRY[entityType];
  const entityId = readStringField(record, entry.identifierField) ?? "";

  // excluded from Phase-3 derivation (protected raw-content / agent-hard-banned).
  if (DERIVATION_STATUS[entityType] === "EXCLUDED") {
    return {
      issues: [makeIssue("EXCLUDED_ENTITY", entityType, entityId)],
      unmappable: {
        entityType,
        entityId,
        reason: "EXCLUDED_ENTITY",
        detailHe: `סוג ישות ${entityType} מוחרג מגזירת הגרף בשלב זה`,
      },
    };
  }

  if (!entry.graphEligible) {
    return {
      issues: [makeIssue("UNMAPPABLE_ENTITY", entityType, entityId)],
      unmappable: {
        entityType,
        entityId,
        reason: "UNMAPPABLE_ENTITY",
        detailHe: `סוג ישות ${entityType} אינו כשיר לגרף`,
      },
    };
  }

  if (entityId === "") {
    return {
      issues: [
        makeIssue("UNMAPPABLE_ENTITY", entityType, entityId, {
          field: entry.identifierField,
          reasonHe: `חסר מזהה (${entry.identifierField}) — הרשומה אינה ניתנת למיפוי`,
        }),
      ],
      unmappable: {
        entityType,
        entityId,
        reason: "UNMAPPABLE_ENTITY",
        detailHe: `חסר מזהה בשדה ${entry.identifierField}`,
      },
    };
  }

  // organization — never invented.
  const org = resolveOrganization(record, entry, {
    organizationId: context.organizationId,
    registryVersion: "",
    sourceSnapshotVersion: "",
    allowOrgInheritance: context.allowOrgInheritance,
  });
  if (org.unmappable || org.organizationId === null) {
    return {
      issues: [makeIssue("MISSING_ORGANIZATION", entityType, entityId, { field: entry.organizationField ?? undefined })],
      unmappable: {
        entityType,
        entityId,
        reason: "MISSING_ORGANIZATION",
        detailHe: "לרשומה אין ארגון בר-שיוך ולא ניתן לרשת מהקשר",
      },
    };
  }
  const organizationId = org.organizationId;

  const ref: GraphEntityRef = { organizationId, entityType, entityId };
  let id: BusinessGraphNode["id"];
  try {
    id = buildNodeId(ref);
  } catch {
    return {
      issues: [makeIssue("UNMAPPABLE_ENTITY", entityType, entityId)],
      unmappable: {
        entityType,
        entityId,
        reason: "UNMAPPABLE_ENTITY",
        detailHe: "מזהה הצומת נכשל בבנייה (מזהה לא יציב)",
      },
    };
  }

  const archived = computeArchived(record, entry);
  const superseded = computeSuperseded(record, entry);
  const versionRaw = entry.versionField ? readField(record, entry.versionField) : null;
  const version = typeof versionRaw === "number" ? versionRaw : null;
  const status = entry.lifecycleField ? readStringField(record, entry.lifecycleField) : null;

  const createdAt = readStringField(record, "createdAt") ?? "1970-01-01";
  const updatedAt = readStringField(record, "updatedAt") ?? createdAt;

  const extraMeta: Record<string, GraphMetadataValue> = org.inherited ? { orgScopeInherited: true } : {};
  // Phase 9 (Q4) — project a safe, clock-free enrollment delay summary from the
  // embedded stages (StageProgress stays embedded, never a node).
  if (entityType === "enrollment") {
    Object.assign(extraMeta, computeEnrollmentStageSummary(record));
  }
  const node: BusinessGraphNode = {
    id,
    organizationId,
    entityType,
    entityId,
    title: computeTitle(record, entityType, entityId),
    status,
    sensitivity: computeSensitivity(record, entry),
    ownerRef: computeOwnerRef(record, organizationId),
    version,
    authoritative: computeAuthoritative(record, entry),
    archived,
    superseded,
    createdAt,
    updatedAt,
    metadataSummary: computeMetadataSummary(record, extraMeta),
  };

  const issues = org.inherited
    ? [makeIssue("ORG_SCOPE_INHERITED", entityType, entityId, { field: entry.organizationField ?? undefined })]
    : [];

  // sensitive-body guard: a protected record keeps its body OUT of the node —
  // any accidental body key on the record is proven absent from metadataSummary.
  return { node, issues };
}
