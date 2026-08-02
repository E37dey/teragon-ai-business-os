// TERAGON Business Graph — stale/orphan detection + health (Phase 4).
// A PURE health computation over a (possibly null) active snapshot. HEALTHY is
// NEVER inferred merely because IndexedDB opened — it requires a present active
// snapshot whose checksum verifies, whose counts match its arrays, whose build/
// validation state is a served+valid one, whose versions are supported, whose
// edge endpoints all resolve, and (when a latest source hash is supplied) whose
// source is not stale.
import {
  SUPPORTED_GRAPH_INDEX_SCHEMA_VERSIONS,
  SUPPORTED_GRAPH_REGISTRY_VERSIONS,
  isServingBuildState,
  type GraphIndexHealth,
  type GraphIndexHealthFinding,
  type GraphIndexHealthState,
  type GraphIndexSnapshot,
} from "./contracts";
import { recomputeChecksum, recomputeSourceHash } from "./snapshot";

export interface HealthOptions {
  now?: () => string;
  /** the sourceHash of the LATEST canonical derivation (for staleness) */
  latestSourceHash?: string;
  supportedSchemaVersions?: readonly string[];
  supportedRegistryVersions?: readonly string[];
}

/**
 * Compute health for an org given its active snapshot (or null when there is no
 * served snapshot). `readError` is set when the store itself failed to
 * reassemble the snapshot (a corruption signal that outranks everything).
 */
export async function computeHealth(
  organizationId: string,
  activeSnapshot: GraphIndexSnapshot | null,
  options: HealthOptions & { readError?: boolean } = {},
): Promise<GraphIndexHealth> {
  const now = options.now ?? (() => new Date().toISOString());
  const checkedAt = now();
  const findings: GraphIndexHealthFinding[] = [];
  const supportedSchema = options.supportedSchemaVersions ?? SUPPORTED_GRAPH_INDEX_SCHEMA_VERSIONS;
  const supportedRegistry = options.supportedRegistryVersions ?? SUPPORTED_GRAPH_REGISTRY_VERSIONS;

  // partial IndexedDB write / unreadable snapshot — corruption outranks all.
  if (options.readError === true) {
    findings.push({ code: "PARTIAL_WRITE", severity: "error", messageHe: "כתיבה חלקית או קריאה כושלת של תמונת המצב" });
    return frame(organizationId, "CORRUPT", checkedAt, null, false, findings);
  }

  // active snapshot missing.
  if (activeSnapshot === null) {
    findings.push({ code: "ACTIVE_SNAPSHOT_MISSING", severity: "error", messageHe: "אין תמונת מצב פעילה לארגון" });
    return frame(organizationId, "MISSING", checkedAt, null, false, findings);
  }

  const activeId = activeSnapshot.snapshotId;

  // checksum mismatch — corruption.
  const checksumVerified = (await recomputeChecksum(activeSnapshot)) === activeSnapshot.checksum;
  if (!checksumVerified) {
    findings.push({ code: "CHECKSUM_MISMATCH", severity: "error", messageHe: "סכום הביקורת אינו תואם — תמונת המצב פגומה" });
    return frame(organizationId, "CORRUPT", checkedAt, activeId, false, findings);
  }

  // partial write — header counts disagree with the persisted arrays.
  if (
    activeSnapshot.nodeCount !== activeSnapshot.nodes.length ||
    activeSnapshot.edgeCount !== activeSnapshot.edges.length
  ) {
    findings.push({ code: "PARTIAL_WRITE", severity: "error", messageHe: "מספרי הצמתים/קשתות אינם תואמים את התוכן שנשמר" });
    return frame(organizationId, "CORRUPT", checkedAt, activeId, false, findings);
  }

  // an unsupported schema/registry, or an invalid/failed served snapshot, needs
  // a rebuild (it should never have been served, but the store must self-report).
  let rebuildRequired = false;
  if (!supportedSchema.includes(activeSnapshot.schemaVersion)) {
    findings.push({ code: "SCHEMA_VERSION_UNSUPPORTED", severity: "error", messageHe: `גרסת סכמה לא נתמכת: ${activeSnapshot.schemaVersion}` });
    rebuildRequired = true;
  }
  if (!supportedRegistry.includes(activeSnapshot.registryVersion)) {
    findings.push({ code: "REGISTRY_VERSION_UNSUPPORTED", severity: "error", messageHe: `גרסת רישום לא נתמכת: ${activeSnapshot.registryVersion}` });
    rebuildRequired = true;
  }
  if (activeSnapshot.validationState === "INVALID" || activeSnapshot.buildState === "FAILED") {
    findings.push({ code: "INVALID_ACTIVE", severity: "error", messageHe: "תמונת המצב הפעילה פסולה/כשלה — נדרש בנייה מחדש" });
    rebuildRequired = true;
  }
  if (!isServingBuildState(activeSnapshot.buildState)) {
    findings.push({ code: "NON_SERVING_STATE", severity: "error", messageHe: `מצב בנייה לא-משרת: ${activeSnapshot.buildState}` });
    rebuildRequired = true;
  }
  if (rebuildRequired) {
    return frame(organizationId, "REBUILD_REQUIRED", checkedAt, activeId, checksumVerified, findings);
  }

  // orphan / stale-endpoint degradation — an edge endpoint that does not resolve
  // to a node in the same snapshot (should have been caught at validation).
  const nodeIds = new Set(activeSnapshot.nodes.map((n) => n.id));
  let orphanEndpoints = 0;
  for (const edge of activeSnapshot.edges) {
    if (!nodeIds.has(edge.source)) {
      orphanEndpoints += 1;
      findings.push({ code: "EDGE_SOURCE_ABSENT", severity: "warning", messageHe: `מקור הקשת ${edge.source} חסר`, });
    }
    if (!nodeIds.has(edge.target)) {
      orphanEndpoints += 1;
      findings.push({ code: "EDGE_TARGET_ABSENT", severity: "warning", messageHe: `יעד הקשת ${edge.target} חסר` });
    }
  }
  const degraded = orphanEndpoints > 0;

  // staleness — the source has changed since this snapshot was derived.
  let stale = false;
  if (options.latestSourceHash !== undefined) {
    const ownSourceHash = await recomputeSourceHash(activeSnapshot);
    if (ownSourceHash !== options.latestSourceHash) {
      stale = true;
      findings.push({
        code: "SOURCE_HASH_STALE",
        severity: "warning",
        messageHe: "מקור הנתונים השתנה מאז הפקת תמונת המצב — יש לבנות מחדש",
      });
    }
  }

  let state: GraphIndexHealthState = "HEALTHY";
  if (degraded) state = "DEGRADED";
  if (stale) state = "STALE";
  return frame(organizationId, state, checkedAt, activeId, checksumVerified, findings);
}

function frame(
  organizationId: string,
  state: GraphIndexHealthState,
  checkedAt: string,
  activeSnapshotId: string | null,
  checksumVerified: boolean,
  findings: GraphIndexHealthFinding[],
): GraphIndexHealth {
  return { organizationId, state, checkedAt, activeSnapshotId, checksumVerified, findings };
}
