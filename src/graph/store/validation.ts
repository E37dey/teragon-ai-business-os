// TERAGON Business Graph — snapshot validation (Phase 4).
// A PURE, deterministic gate run BEFORE any activation. It verifies every
// invariant the brief enumerates and returns a GraphIndexValidationResult.
// Activation policy (enforced by the store, decided here):
//   • error-severity findings BLOCK activation — no silent suppression;
//   • warnings are allowed (they never block);
//   • a derivation error may be tolerated ONLY when its code is in the CLOSED
//     internal `SAFE_NON_INDEXABLE_ACTIVATION_CODES` policy. Any caller-supplied
//     `allowedErrorCodes` is INTERSECTED with that closed set and a
//     `FORBIDDEN_ACTIVATION_CODES` code is ALWAYS dropped — it can never be
//     allow-listed, no matter what is passed in.
import { parseNodeId, GraphIdentityError } from "../contracts/identity";
import { businessGraphEdgeSchema } from "../contracts/edge";
import { businessGraphNodeSchema } from "../contracts/node";
import type { DerivationIssueCode } from "../derivation";
import {
  FORBIDDEN_ACTIVATION_CODES,
  GRAPH_INDEX_CORE_V1_TYPES,
  SAFE_NON_INDEXABLE_ACTIVATION_CODES,
  SUPPORTED_GRAPH_INDEX_SCHEMA_VERSIONS,
  SUPPORTED_GRAPH_REGISTRY_VERSIONS,
  type GraphIndexSnapshot,
  type GraphIndexValidationIssue,
  type GraphIndexValidationResult,
} from "./contracts";
import { recomputeChecksum } from "./snapshot";

/**
 * Resolve the EFFECTIVE tolerated-error set. Starts from the closed
 * `SAFE_NON_INDEXABLE_ACTIVATION_CODES` policy; a caller may only NARROW within
 * it (never expand). Every `FORBIDDEN_ACTIVATION_CODES` code is removed
 * unconditionally, so passing one has no effect. When no caller list is given,
 * the full closed policy applies.
 */
function resolveAllowedErrorCodes(
  requested: readonly DerivationIssueCode[] | undefined,
): Set<DerivationIssueCode> {
  const forbidden = new Set<DerivationIssueCode>(FORBIDDEN_ACTIVATION_CODES);
  const safe = SAFE_NON_INDEXABLE_ACTIVATION_CODES.filter((c) => !forbidden.has(c));
  if (requested === undefined) return new Set(safe);
  const requestedSet = new Set(requested);
  return new Set(safe.filter((c) => requestedSet.has(c)));
}

/** Metadata keys that would leak a sensitive body onto a node envelope. */
const BODY_KEYS: readonly string[] = [
  "body",
  "content",
  "bodyMarkdown",
  "markdown",
  "prompt",
  "notes",
  "plainText",
];

export interface SnapshotValidationOptions {
  now?: () => string;
  supportedSchemaVersions?: readonly string[];
  supportedRegistryVersions?: readonly string[];
  /**
   * A REQUEST to narrow the tolerated-error set. It can only ever select codes
   * already inside the closed `SAFE_NON_INDEXABLE_ACTIVATION_CODES` policy — it
   * can NEVER add a forbidden code (those are dropped unconditionally). This is
   * NOT a free-form allow-list.
   */
  allowedErrorCodes?: readonly DerivationIssueCode[];
  /** if given, a checksum mismatch vs. this value is a hard error */
  expectedChecksum?: string;
}

export async function validateSnapshot(
  snapshot: GraphIndexSnapshot,
  options: SnapshotValidationOptions = {},
): Promise<GraphIndexValidationResult> {
  const now = options.now ?? (() => new Date().toISOString());
  const supportedSchema = options.supportedSchemaVersions ?? SUPPORTED_GRAPH_INDEX_SCHEMA_VERSIONS;
  const supportedRegistry = options.supportedRegistryVersions ?? SUPPORTED_GRAPH_REGISTRY_VERSIONS;
  const allowedErrorCodes = resolveAllowedErrorCodes(options.allowedErrorCodes);

  const errors: GraphIndexValidationIssue[] = [];
  const warnings: GraphIndexValidationIssue[] = [];
  const err = (code: string, messageHe: string, ref?: string): void => {
    errors.push(ref === undefined ? { code, severity: "error", messageHe } : { code, severity: "error", messageHe, ref });
  };
  const warn = (code: string, messageHe: string, ref?: string): void => {
    warnings.push(ref === undefined ? { code, severity: "warning", messageHe } : { code, severity: "warning", messageHe, ref });
  };

  // --- schema / registry versions supported ---
  if (!supportedSchema.includes(snapshot.schemaVersion)) {
    err("SCHEMA_VERSION_UNSUPPORTED", `גרסת סכמה לא נתמכת: ${snapshot.schemaVersion}`);
  }
  if (!supportedRegistry.includes(snapshot.registryVersion)) {
    err("REGISTRY_VERSION_UNSUPPORTED", `גרסת רישום לא נתמכת: ${snapshot.registryVersion}`);
  }

  // --- checksum matches recomputed content (corruption / partial write) ---
  const recomputed = await recomputeChecksum(snapshot);
  const checksumVerified = recomputed === snapshot.checksum;
  if (!checksumVerified) {
    err("CHECKSUM_MISMATCH", `סכום ביקורת אינו תואם — ${snapshot.checksum} מול ${recomputed}`);
  }
  if (options.expectedChecksum !== undefined && options.expectedChecksum !== snapshot.checksum) {
    err("CHECKSUM_EXPECTED_MISMATCH", `סכום הביקורת אינו תואם את הצפוי`);
  }

  // --- counts match arrays (partial write) ---
  if (snapshot.nodeCount !== snapshot.nodes.length) {
    err("NODE_COUNT_MISMATCH", `מספר הצמתים (${snapshot.nodeCount}) אינו תואם ${snapshot.nodes.length}`);
  }
  if (snapshot.edgeCount !== snapshot.edges.length) {
    err("EDGE_COUNT_MISMATCH", `מספר הקשתות (${snapshot.edgeCount}) אינו תואם ${snapshot.edges.length}`);
  }

  // --- node id validity + duplicates + organization + sensitivity payload ---
  const nodeIds = new Set<string>();
  for (const node of snapshot.nodes) {
    const parsed = businessGraphNodeSchema.safeParse(node);
    if (!parsed.success) {
      err("NODE_INVALID", `צומת לא תקין: ${node.id}`, node.id);
      continue;
    }
    if (nodeIds.has(node.id)) {
      err("DUPLICATE_NODE_ID", `מזהה צומת כפול: ${node.id}`, node.id);
    }
    nodeIds.add(node.id);
    if (node.organizationId !== snapshot.organizationId) {
      err(
        "NODE_CROSS_ORGANIZATION",
        `צומת ${node.id} שייך לארגון ${node.organizationId} ולא ל-${snapshot.organizationId}`,
        node.id,
      );
    }
    for (const key of BODY_KEYS) {
      if (key in node.metadataSummary) {
        err("SENSITIVE_PAYLOAD_ON_NODE", `שדה גוף רגיש (${key}) אסור על מעטפת צומת ${node.id}`, node.id);
      }
    }
  }

  // --- edge id validity + duplicates + endpoints exist + no cross-org +
  //     authority/approval trust rules ---
  const edgeIds = new Set<string>();
  for (const edge of snapshot.edges) {
    const parsed = businessGraphEdgeSchema.safeParse(edge);
    if (!parsed.success) {
      err("EDGE_INVALID", `קשת לא תקינה: ${edge.id}`, edge.id);
      continue;
    }
    if (edgeIds.has(edge.id)) {
      err("DUPLICATE_EDGE_ID", `מזהה קשת כפול: ${edge.id}`, edge.id);
    }
    edgeIds.add(edge.id);

    if (edge.organizationId !== snapshot.organizationId) {
      err("EDGE_CROSS_ORGANIZATION", `קשת ${edge.id} אינה בארגון ${snapshot.organizationId}`, edge.id);
    }
    // endpoints must exist in this snapshot's node set (orphan endpoint blocks).
    if (!nodeIds.has(edge.source)) {
      err("EDGE_SOURCE_ABSENT", `מקור הקשת ${edge.source} אינו בתמונת המצב`, edge.id);
    }
    if (!nodeIds.has(edge.target)) {
      err("EDGE_TARGET_ABSENT", `יעד הקשת ${edge.target} אינו בתמונת המצב`, edge.id);
    }
    // no cross-organization relationship between endpoints.
    const srcOrg = safeNodeOrg(edge.source);
    const tgtOrg = safeNodeOrg(edge.target);
    if (srcOrg !== null && tgtOrg !== null && srcOrg !== tgtOrg) {
      err("CROSS_ORGANIZATION_EDGE", `קשת ${edge.id} חוצה ארגונים (${srcOrg}→${tgtOrg})`, edge.id);
    }
    // no rejected edge marked authoritative.
    if (edge.authority === "REJECTED" && edge.approvalState === "approved") {
      err("REJECTED_EDGE_APPROVED", `קשת שנדחתה ${edge.id} מסומנת כמאושרת`, edge.id);
    }
    // no proposed edge marked approved.
    if (edge.provenance === "PROPOSED" && edge.approvalState === "approved") {
      err("PROPOSED_EDGE_APPROVED", `קשת מוצעת ${edge.id} מסומנת כמאושרת`, edge.id);
    }
  }

  // --- sensitive payload must not ride inside issues / unmappable diagnostics ---
  for (const issue of snapshot.issues) {
    for (const key of BODY_KEYS) {
      if (issue.reasonHe.includes(`"${key}"`)) {
        warn("ISSUE_PAYLOAD_SUSPECT", `אזכור שדה גוף בהערת אבחון: ${issue.code}`);
      }
    }
  }

  // --- derivation error-severity issues block unless explicitly re-classified ---
  const blockingDerivationErrors = snapshot.issues.filter(
    (i) => i.severity === "error" && !allowedErrorCodes.has(i.code),
  );
  if (blockingDerivationErrors.length > 0) {
    err(
      "DERIVATION_ERRORS_PRESENT",
      `לתמונת המצב ${blockingDerivationErrors.length} בעיות ברמת שגיאה שאינן מסווגות כבטוחות לאי-אינדוקס`,
    );
  }

  // --- Core-V1 coverage (a warning, never a silent pass; errors still block) ---
  const presentTypes = new Set(snapshot.nodes.map((n) => n.entityType));
  const missingCore = GRAPH_INDEX_CORE_V1_TYPES.filter((t) => !presentTypes.has(t));
  const coreV1Covered = missingCore.length === 0;
  if (!coreV1Covered) {
    warn("CORE_V1_COVERAGE_INCOMPLETE", `חסרים סוגי ליבה: ${missingCore.join(", ")}`);
  }

  return {
    snapshotId: snapshot.snapshotId,
    organizationId: snapshot.organizationId,
    valid: errors.length === 0,
    checkedAt: now(),
    errors,
    warnings,
    checksumVerified,
    coreV1Covered,
  };
}

function safeNodeOrg(nodeId: string): string | null {
  try {
    return parseNodeId(nodeId).organizationId;
  } catch (e) {
    void (e as GraphIdentityError);
    return null;
  }
}
