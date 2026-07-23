// TERAGON AI BUSINESS OS — typed accessors over the collections the Stage
// Gates workspace reads/writes (Wave 7, W7-C; new file — existing repository
// files untouched). One seam for the validator, the gate service and the
// /stage-gates page. Wraps the canonical factory only.
import type {
  AuditEvent,
  Document,
  MemoryRecord,
  MetricDefinition,
  MetricObservation,
  Persona,
  StageGate,
  TrainingMaterial,
  User,
} from "@/domain/types";
import type { KnowledgeArticleV2 } from "@/domain/knowledge";
import type { W7RecordLike } from "@/domain/stage-gates/types";
import type { Repository } from "./Repository";
import { getRepository } from "./factory";

export interface StageGateStores {
  /** the SAME seeded collection — V2 fields are annotated onto sg-1..sg-6 */
  gates: Repository<StageGate>;
  personas: Repository<Persona>;
  trainingMaterials: Repository<TrainingMaterial>;
  metricDefinitions: Repository<MetricDefinition>;
  metricObservations: Repository<MetricObservation>;
  memoryRecords: Repository<MemoryRecord>;
  knowledgeArticles: Repository<KnowledgeArticleV2>;
  documents: Repository<Document>;
  /** Wave-7 collections — canonical types owned by W7-A (read as W7RecordLike) */
  implementationEvidence: Repository<W7RecordLike>;
  pilotDefinitions: Repository<W7RecordLike>;
  pilotResults: Repository<W7RecordLike>;
  rolloutWaves: Repository<W7RecordLike>;
  users: Repository<User>;
  audit: Repository<AuditEvent>;
}

/** Production wiring over the canonical repository factory. */
export function stageGateStores(): StageGateStores {
  return {
    gates: getRepository<StageGate>("stageGates"),
    personas: getRepository<Persona>("personas"),
    trainingMaterials: getRepository<TrainingMaterial>("trainingMaterials"),
    metricDefinitions: getRepository<MetricDefinition>("metricDefinitions"),
    metricObservations: getRepository<MetricObservation>("metricObservations"),
    memoryRecords: getRepository<MemoryRecord>("memoryRecords"),
    knowledgeArticles: getRepository<KnowledgeArticleV2>("knowledgeArticles"),
    documents: getRepository<Document>("documents"),
    implementationEvidence: getRepository<W7RecordLike>("implementationEvidence"),
    pilotDefinitions: getRepository<W7RecordLike>("pilotDefinitions"),
    pilotResults: getRepository<W7RecordLike>("pilotResults"),
    rolloutWaves: getRepository<W7RecordLike>("rolloutWaves"),
    users: getRepository<User>("users"),
    audit: getRepository<AuditEvent>("auditEvents"),
  };
}

/** Injectable clock (ISO datetime) — determinism in tests. */
export type StageGateClock = () => string;
