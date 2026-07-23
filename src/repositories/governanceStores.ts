// TERAGON AI BUSINESS OS — typed accessors over the Wave-8 governance
// collections (W8-B; existing repository files untouched). One seam for the
// governance engine + /governance page. The governancePolicyVersions and
// promptVersions stores are wrapped so update/remove/clear THROW —
// versions are immutable by construction (same mechanism as memoryVersions).
import type { Agent, Approval, AuditEvent, Control, Evidence } from "@/domain/types";
import type { AgentEventRecord } from "@/domain/agents";
import type { LearningRule } from "@/domain/learning";
import type {
  GovernanceIncident,
  GovernancePolicy,
  GovernancePolicyVersion,
  GovernanceReview,
  GovernanceRisk,
  PromptVersionRecord,
} from "@/domain/governance";
import type { BaseEntity } from "@/domain/types";
import type { Repository } from "./Repository";
import type { CollectionKey } from "./collections";
import { getRepository } from "./factory";

export const GOVERNANCE_VERSION_IMMUTABLE_HE =
  "גרסת ממשל היא רשומה בלתי ניתנת לשינוי — עדכון/מחיקה של גרסה נחסמים";

/** Deep-freeze (version snapshots are frozen before persisting). */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

/**
 * Wrap a repository so that update/remove/clear throw — append-only store.
 * Every object returned is re-frozen on the way out (structural clones).
 */
export function immutableGovernanceStore<T extends BaseEntity>(
  repo: Repository<T>,
): Repository<T> {
  return {
    collection: repo.collection,
    list: async () => (await repo.list()).map((x) => deepFreeze(x)),
    get: async (id) => {
      const item = await repo.get(id);
      return item === undefined ? undefined : deepFreeze(item);
    },
    create: async (item) => deepFreeze(await repo.create(deepFreeze(item))),
    update: () => {
      throw new Error(GOVERNANCE_VERSION_IMMUTABLE_HE);
    },
    remove: () => {
      throw new Error(GOVERNANCE_VERSION_IMMUTABLE_HE);
    },
    clear: () => {
      throw new Error(GOVERNANCE_VERSION_IMMUTABLE_HE);
    },
    subscribe: (listener) => repo.subscribe(listener),
  };
}

export interface GovernanceStores {
  policies: Repository<GovernancePolicy>;
  /** append-only — update/remove throw (immutability enforced) */
  policyVersions: Repository<GovernancePolicyVersion>;
  risks: Repository<GovernanceRisk>;
  incidents: Repository<GovernanceIncident>;
  reviews: Repository<GovernanceReview>;
  /** append-only — update/remove throw (immutability enforced) */
  promptVersions: Repository<PromptVersionRecord>;
  // read seams into existing canonical collections
  approvals: Repository<Approval>;
  audit: Repository<AuditEvent>;
  agents: Repository<Agent>;
  agentEvents: Repository<AgentEventRecord>;
  controls: Repository<Control>;
  evidence: Repository<Evidence>;
  learningRules: Repository<LearningRule>;
  /** generic escape hatch */
  collection<T extends BaseEntity = BaseEntity>(key: CollectionKey): Repository<T>;
}

/** Production wiring over the canonical repository factory. */
export function governanceStores(): GovernanceStores {
  return {
    policies: getRepository<GovernancePolicy>("governancePolicies"),
    policyVersions: immutableGovernanceStore(
      getRepository<GovernancePolicyVersion>("governancePolicyVersions"),
    ),
    risks: getRepository<GovernanceRisk>("governanceRisks"),
    incidents: getRepository<GovernanceIncident>("governanceIncidents"),
    reviews: getRepository<GovernanceReview>("governanceReviews"),
    promptVersions: immutableGovernanceStore(getRepository<PromptVersionRecord>("promptVersions")),
    approvals: getRepository<Approval>("approvals"),
    audit: getRepository<AuditEvent>("auditEvents"),
    agents: getRepository<Agent>("agents"),
    agentEvents: getRepository<AgentEventRecord>("agentEvents"),
    controls: getRepository<Control>("controls"),
    evidence: getRepository<Evidence>("evidence"),
    learningRules: getRepository<LearningRule>("learningRules"),
    collection: <T extends BaseEntity = BaseEntity>(key: CollectionKey) => getRepository<T>(key),
  };
}
