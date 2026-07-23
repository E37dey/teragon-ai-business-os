// TERAGON AI BUSINESS OS — typed accessors over the agent collections
// (Wave 5, W5-C; new file — existing repository files untouched).
// One seam for the orchestration engine: runs/events/errors (new record types
// from src/domain/agents) + the existing Wave-1 agent collections.
import type {
  Agent,
  AgentConflict,
  AgentHandoff,
  AgentMessage,
  AgentTask,
  Approval,
  AuditEvent,
  Evidence,
  ServiceTicket,
} from "@/domain/types";
import type { AgentErrorRecord, AgentEventRecord, AgentRun } from "@/domain/agents";
import type { BaseEntity } from "@/domain/types";
import type { Repository } from "./Repository";
import type { CollectionKey } from "./collections";
import { getRepository } from "./factory";

export interface AgentStores {
  agents: Repository<Agent>;
  runs: Repository<AgentRun>;
  events: Repository<AgentEventRecord>;
  errors: Repository<AgentErrorRecord>;
  tasks: Repository<AgentTask>;
  messages: Repository<AgentMessage>;
  handoffs: Repository<AgentHandoff>;
  conflicts: Repository<AgentConflict>;
  approvals: Repository<Approval>;
  audit: Repository<AuditEvent>;
  evidence: Repository<Evidence>;
  serviceTickets: Repository<ServiceTicket>;
  /** generic escape hatch for context counting / execution handlers */
  collection<T extends BaseEntity = BaseEntity>(key: CollectionKey): Repository<T>;
}

/** Production wiring over the canonical repository factory. */
export function agentStores(): AgentStores {
  return {
    agents: getRepository<Agent>("agents"),
    runs: getRepository<AgentRun>("agentRuns"),
    events: getRepository<AgentEventRecord>("agentEvents"),
    errors: getRepository<AgentErrorRecord>("agentErrors"),
    tasks: getRepository<AgentTask>("agentTasks"),
    messages: getRepository<AgentMessage>("agentMessages"),
    handoffs: getRepository<AgentHandoff>("agentHandoffs"),
    conflicts: getRepository<AgentConflict>("agentConflicts"),
    approvals: getRepository<Approval>("approvals"),
    audit: getRepository<AuditEvent>("auditEvents"),
    evidence: getRepository<Evidence>("evidence"),
    serviceTickets: getRepository<ServiceTicket>("serviceTickets"),
    collection: <T extends BaseEntity = BaseEntity>(key: CollectionKey) => getRepository<T>(key),
  };
}

/** All persisted records of a single run — input to the pure selectors. */
export interface RunRecords {
  run: AgentRun | null;
  events: AgentEventRecord[];
  tasks: AgentTask[];
  messages: AgentMessage[];
  handoffs: AgentHandoff[];
  conflicts: AgentConflict[];
  approvals: Approval[];
}

/**
 * Collect every record belonging to a run. Tasks come from run.taskIds;
 * messages/handoffs hang off those task ids; conflicts/approvals from the
 * run's reference lists. Events are filtered by runId directly.
 */
export async function collectRunRecords(stores: AgentStores, runId: string): Promise<RunRecords> {
  const run = (await stores.runs.get(runId)) ?? null;
  const events = (await stores.events.list())
    .filter((e) => e.runId === runId)
    .sort((a, b) => a.seq - b.seq);
  if (!run) {
    return { run, events, tasks: [], messages: [], handoffs: [], conflicts: [], approvals: [] };
  }
  const taskIds = new Set(run.taskIds);
  const conflictIds = new Set(run.conflictIds);
  const approvalIds = new Set(run.approvalIds);
  const [tasks, messages, handoffs, conflicts, approvals] = await Promise.all([
    stores.tasks.list().then((xs) => xs.filter((t) => taskIds.has(t.id))),
    stores.messages.list().then((xs) => xs.filter((m) => taskIds.has(m.taskId))),
    stores.handoffs.list().then((xs) => xs.filter((h) => taskIds.has(h.taskId))),
    stores.conflicts.list().then((xs) => xs.filter((c) => conflictIds.has(c.id))),
    stores.approvals.list().then((xs) => xs.filter((a) => approvalIds.has(a.id))),
  ]);
  return { run, events, tasks, messages, handoffs, conflicts, approvals };
}
