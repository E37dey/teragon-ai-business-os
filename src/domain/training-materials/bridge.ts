// W7-D — idempotent bridge (7.10): upgrades the 13 seeded trainingMaterials
// records to the exact mandated canonical list. Pure core (upgradeMaterials)
// + repository wrapper (ensureCanonicalMaterials).
//
// Idempotency contract (tested):
// - running the bridge twice changes nothing the second time;
// - user-decided fields (status once reviewed/approved, approvalId, reviewDate)
//   are NEVER overwritten;
// - authored content updates re-apply only when CANONICAL_CONTENT_VERSION grows.
import type { TrainingMaterial } from "@/domain/types";
import { getRepository } from "@/repositories";
import { invalidateCollections } from "@/app/data/hooks";
import { CANONICAL_CONTENT_VERSION, CANONICAL_MATERIALS } from "./content";
import type { TrainingMaterialV2 } from "./types";

export interface UpgradeResult {
  materials: TrainingMaterialV2[];
  /** ids that were actually changed this run (empty ⇒ nothing to write) */
  changedIds: string[];
}

/**
 * Pure upgrade: map every seeded record onto its canonical definition.
 * Records without a canonical mapping pass through untouched (there are
 * exactly 13 in the seed; a user-created 14th is out of canonical scope).
 */
export function upgradeMaterials(existing: readonly TrainingMaterialV2[]): UpgradeResult {
  const changedIds: string[] = [];
  const bySeedId = new Map(CANONICAL_MATERIALS.map((def) => [def.seedId, def]));

  const materials = existing.map((rec): TrainingMaterialV2 => {
    const def = bySeedId.get(rec.id);
    if (!def) return rec;
    // already bridged to the current authored content ⇒ untouched (idempotent)
    if (rec.canonicalKey === def.key && rec.contentVersion === CANONICAL_CONTENT_VERSION) {
      return rec;
    }
    const upgraded: TrainingMaterialV2 = {
      ...rec,
      title: def.title,
      description: def.description,
      kind: def.kind,
      audiencePersonaIds: [...def.audiencePersonaIds],
      stageId: def.relatedStageId,
      canonicalKey: def.key,
      section: def.section,
      // honest status: content-complete ⇒ draft/awaiting review, never auto-approved.
      // A status a human already advanced (מאושר / דורש עדכון / בארכיון) is preserved.
      status: preserveHumanStatus(rec.status) ?? def.initialStatus,
      version: rec.version ?? `${CANONICAL_CONTENT_VERSION}.0`,
      ownerId: rec.ownerId ?? def.ownerId,
      contentRoute: def.contentRoute,
      printable: def.printable,
      exportFormats: [...def.exportFormats],
      relatedStageId: def.relatedStageId,
      relatedGateId: def.relatedGateId,
      qualityValidation: [...def.qualityValidation],
      reviewDate: rec.reviewDate ?? null,
      approvalId: rec.approvalId ?? null,
      measurableOutcome: def.measurableOutcome,
      practiceIncluded: def.practiceIncluded,
      contentVersion: CANONICAL_CONTENT_VERSION,
      updatedAt: rec.updatedAt,
    };
    changedIds.push(rec.id);
    return upgraded;
  });

  return { materials, changedIds };
}

/** statuses that only a human review flow sets — the bridge never resets them */
function preserveHumanStatus(
  status: TrainingMaterialV2["status"],
): TrainingMaterialV2["status"] | null {
  if (status === "מאושר" || status === "דורש עדכון" || status === "בארכיון") return status;
  return null;
}

/**
 * Repository wrapper: bridge the stored records in place (create nothing —
 * the 13 records exist from the seed; an empty store is honestly reported).
 */
export async function ensureCanonicalMaterials(): Promise<UpgradeResult> {
  const repo = getRepository<TrainingMaterial>("trainingMaterials");
  const existing = (await repo.list()) as TrainingMaterialV2[];
  const result = upgradeMaterials(existing);
  if (result.changedIds.length > 0) {
    const changed = new Set(result.changedIds);
    for (const material of result.materials) {
      if (changed.has(material.id)) await repo.update(material.id, material);
    }
    await invalidateCollections(["trainingMaterials"]);
  }
  return result;
}
