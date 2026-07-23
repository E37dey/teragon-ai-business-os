// TERAGON AI BUSINESS OS — typed accessors over the collections the
// presentation experience reads/writes (Wave 7, W7-F; new file — shared
// repository files untouched). Wraps the canonical factory only.
import type {
  MetricDefinition,
  MetricObservation,
  Persona,
  TrainingMaterial,
  User,
} from "@/domain/types";
import type {
  ImplementationProgramme,
  ImplementationRisk,
} from "@/domain/adoption/types";
import type { Repository } from "@/repositories/Repository";
import { getRepository } from "@/repositories/factory";
import type { DemoStep, PresentationSection, PresenterNote } from "./types";

export interface PresentationStores {
  sections: Repository<PresentationSection>;
  notes: Repository<PresenterNote>;
  demoSteps: Repository<DemoStep>;
  /** read-only context for the live section visuals */
  personas: Repository<Persona>;
  trainingMaterials: Repository<TrainingMaterial>;
  metricDefinitions: Repository<MetricDefinition>;
  metricObservations: Repository<MetricObservation>;
  programmes: Repository<ImplementationProgramme>;
  risks: Repository<ImplementationRisk>;
  users: Repository<User>;
}

/** Production wiring over the canonical repository factory. */
export function presentationStores(): PresentationStores {
  return {
    sections: getRepository<PresentationSection>("presentationSections"),
    notes: getRepository<PresenterNote>("presenterNotes"),
    demoSteps: getRepository<DemoStep>("demoSteps"),
    personas: getRepository<Persona>("personas"),
    trainingMaterials: getRepository<TrainingMaterial>("trainingMaterials"),
    metricDefinitions: getRepository<MetricDefinition>("metricDefinitions"),
    metricObservations: getRepository<MetricObservation>("metricObservations"),
    programmes: getRepository<ImplementationProgramme>("implementationProgrammes"),
    risks: getRepository<ImplementationRisk>("implementationRisks"),
    users: getRepository<User>("users"),
  };
}

/** Injectable clock (ISO datetime) — determinism in tests. */
export type PresentationClock = () => string;
