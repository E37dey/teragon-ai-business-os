// W7-B barrel — canonical personas domain.
// W7-D consumes: `PERSONA_OBJECTIONS` / `objectionsOf` from "@/domain/personas".
export {
  CANONICAL_PERSONA_NAMES,
  type CanonicalPersonaName,
  type Exactly7Result,
  type PersonaApprovalState,
  type PersonaMaterialLink,
  type PersonaNamedOwner,
  type PersonaObjection,
  type PersonaSuccessMetric,
  type PersonaSupportTier,
  type PersonaV2,
} from "./types";
export {
  MATERIAL_EXPECTED_UPDATED_AT,
  NO_NUMERIC_TARGET,
  NOT_MEASURED,
  PERSONA_V2_DEFINITIONS,
  SEED_BRIDGE_NOTES,
  TRAINING_PROGRAMMES,
} from "./canonical";
export { PERSONA_OBJECTIONS, objectionsOf } from "./objections";
export { bridgePersonas, exactly7Personas, type BridgeResult } from "./bridge";
export {
  auditPersonas,
  GENERIC_PHRASES,
  type PersonaAuditField,
  type PersonaAuditKind,
  type PersonaAuditSeverity,
  type PersonaAuditWarning,
} from "./auditor";
