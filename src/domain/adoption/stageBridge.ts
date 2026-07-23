// TERAGON AI BUSINESS OS — adoption-stage ⇄ seeded implementationStages bridge
// (W7-A, 7.1). The seed collection implementationStages (is-1..is-6) originally
// carried the SOFTWARE-BUILD wave names ("תשתית ונתונים", "מסכי ליבה"…).
// LEAD DECISION (contradiction C4): the Wave-7 adoption roadmap is CANONICAL.
// The bridge therefore REWRITES the stored is-N records 1:1 by order — keeping
// the seed ids, replacing name/description with the canonical adoption stage,
// and preserving the previous name in `legacyName`. The seed FILE itself is
// shared and untouched; the migration runs at the repository layer
// (alignSeedStages, called from the bootstrap) and is idempotent.
import type { ImplementationStage } from "@/domain/types";
import type { Repository } from "@/repositories/Repository";
import { ADOPTION_STAGE_NAMES, type AdoptionStageName } from "./types";

/** Stored is-N record after the C4 migration — old build-plan name preserved. */
export interface BridgedImplementationStage extends ImplementationStage {
  /** the pre-migration (build-plan) name; absent on records seeded canonical */
  legacyName?: string;
}

export interface StageBridgeEntry {
  /** adoption stage id ("as-N") */
  adoptionStageId: string;
  adoptionName: AdoptionStageName;
  /** seeded implementationStages record id ("is-N") */
  seedStageId: string;
  order: number;
}

/** Order-aligned bridge: as-N ⇄ is-N for N = 1..6. */
export const STAGE_BRIDGE: readonly StageBridgeEntry[] = ADOPTION_STAGE_NAMES.map(
  (adoptionName, i) => ({
    adoptionStageId: `as-${i + 1}`,
    adoptionName,
    seedStageId: `is-${i + 1}`,
    order: i + 1,
  }),
);

export function seedStageIdFor(adoptionStageId: string): string | null {
  return STAGE_BRIDGE.find((b) => b.adoptionStageId === adoptionStageId)?.seedStageId ?? null;
}

export function adoptionStageIdFor(seedStageId: string): string | null {
  return STAGE_BRIDGE.find((b) => b.seedStageId === seedStageId)?.adoptionStageId ?? null;
}

export interface StageNameMismatch {
  order: number;
  adoptionName: AdoptionStageName;
  seedStageId: string;
  seedName: string;
}

/**
 * C4 migration: align the stored implementationStages records to the canonical
 * adoption roadmap. Keeps ids, replaces name (+ description when provided),
 * preserves the old name in `legacyName` (set once, never overwritten).
 * Idempotent: already-canonical records are left untouched.
 */
export async function alignSeedStages(
  repo: Repository<BridgedImplementationStage>,
  objectives?: ReadonlyMap<string, string>,
): Promise<{ migrated: number }> {
  let migrated = 0;
  for (const entry of STAGE_BRIDGE) {
    const stored = await repo.get(entry.seedStageId);
    if (!stored || stored.name === entry.adoptionName) continue;
    const patch: Partial<Omit<BridgedImplementationStage, "id">> = {
      name: entry.adoptionName,
      legacyName: stored.legacyName ?? stored.name,
    };
    const objective = objectives?.get(entry.adoptionStageId);
    if (objective) patch.description = objective;
    await repo.update(stored.id, patch);
    migrated += 1;
  }
  return { migrated };
}

/**
 * Honest mismatch report against the ACTUAL stored records — after the C4
 * migration this should be empty; residual mismatches surface on the page
 * footnote and in the queue doc.
 */
export function stageNameMismatches(seedStages: ImplementationStage[]): StageNameMismatch[] {
  const byId = new Map(seedStages.map((s) => [s.id, s]));
  const out: StageNameMismatch[] = [];
  for (const entry of STAGE_BRIDGE) {
    const seed = byId.get(entry.seedStageId);
    if (!seed) {
      out.push({
        order: entry.order,
        adoptionName: entry.adoptionName,
        seedStageId: entry.seedStageId,
        seedName: "(רשומת seed חסרה)",
      });
    } else if (seed.name !== entry.adoptionName) {
      out.push({
        order: entry.order,
        adoptionName: entry.adoptionName,
        seedStageId: seed.id,
        seedName: seed.name,
      });
    }
  }
  return out;
}
