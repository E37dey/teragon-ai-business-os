// TERAGON AI BUSINESS OS — typed accessors over the Wave-7 adoption
// collections (W7-A; new file — existing repository files untouched).
// One seam for the implementation-programme domain: programme / milestones /
// risks / evidence / decisions / rollout waves / pilot, plus the read-only
// bridge collections (seed implementationStages, users, auditEvents).
import type {
  AuditEvent,
  BaseEntity,
  Persona,
  TrainingMaterial,
  User,
} from "@/domain/types";
import type { BridgedImplementationStage } from "@/domain/adoption/stageBridge";
import type {
  ImplementationDecision,
  ImplementationEvidence,
  ImplementationMilestone,
  ImplementationProgramme,
  ImplementationRisk,
  PilotDefinition,
  PilotResult,
  RolloutWave,
} from "@/domain/adoption/types";
import type { Repository } from "./Repository";
import type { CollectionKey } from "./collections";
import { getRepository } from "./factory";

export interface ImplementationStores {
  programmes: Repository<ImplementationProgramme>;
  milestones: Repository<ImplementationMilestone>;
  risks: Repository<ImplementationRisk>;
  evidence: Repository<ImplementationEvidence>;
  decisions: Repository<ImplementationDecision>;
  rolloutWaves: Repository<RolloutWave>;
  pilotDefinitions: Repository<PilotDefinition>;
  pilotResults: Repository<PilotResult>;
  /** bridge collections (seedStages is migrated by alignSeedStages; the rest read-only) */
  seedStages: Repository<BridgedImplementationStage>;
  users: Repository<User>;
  personas: Repository<Persona>;
  trainingMaterials: Repository<TrainingMaterial>;
  audit: Repository<AuditEvent>;
  /** generic escape hatch — evidence-ref resolution across ANY collection */
  collection<T extends BaseEntity = BaseEntity>(key: CollectionKey): Repository<T>;
}

/** Production wiring over the canonical repository factory. */
export function implementationStores(): ImplementationStores {
  return {
    programmes: getRepository<ImplementationProgramme>("implementationProgrammes"),
    milestones: getRepository<ImplementationMilestone>("implementationMilestones"),
    risks: getRepository<ImplementationRisk>("implementationRisks"),
    evidence: getRepository<ImplementationEvidence>("implementationEvidence"),
    decisions: getRepository<ImplementationDecision>("implementationDecisions"),
    rolloutWaves: getRepository<RolloutWave>("rolloutWaves"),
    pilotDefinitions: getRepository<PilotDefinition>("pilotDefinitions"),
    pilotResults: getRepository<PilotResult>("pilotResults"),
    seedStages: getRepository<BridgedImplementationStage>("implementationStages"),
    users: getRepository<User>("users"),
    personas: getRepository<Persona>("personas"),
    trainingMaterials: getRepository<TrainingMaterial>("trainingMaterials"),
    audit: getRepository<AuditEvent>("auditEvents"),
    collection: <T extends BaseEntity = BaseEntity>(key: CollectionKey) => getRepository<T>(key),
  };
}
