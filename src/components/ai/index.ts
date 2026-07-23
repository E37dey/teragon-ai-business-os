// W5-D — shared AI widgets barrel. Envelope rendering ALWAYS goes through
// these components (honesty contract enforced in one place).
export { EnvelopeCard, type EnvelopeCardProps } from "./EnvelopeCard";
export { ProviderStateBadge, type ProviderStateBadgeProps } from "./ProviderStateBadge";
export {
  providerLabelHe,
  LOCAL_PROVIDER_LABEL_HE,
  REMOTE_PROVIDER_LABEL_HE,
} from "./providerLabels";
export { FallbackNotice, type FallbackNoticeProps } from "./FallbackNotice";
export { UsageDisplay, type UsageDisplayProps } from "./UsageDisplay";
export { usageDisplayHe, USAGE_UNMEASURED_HE } from "./usage";
export { EvidenceList, type EvidenceListProps } from "./EvidenceList";
export { InjectionWarning, type InjectionWarningProps } from "./InjectionWarning";
export { detectInjection, type InjectionFinding } from "./injection";
export {
  getAgentEngine,
  selectProvider,
  assertAgentsEnabled,
  startGuardedRun,
  AGENT_DISABLED_STATUS,
  __resetAgentEngineForTests,
  type AgentEngineBundle,
} from "./engine";
