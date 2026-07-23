// TERAGON AI BUSINESS OS — shared persistence helpers for the engine
// (Wave 5, W5-C). Every lifecycle step appends exactly one AgentEventRecord
// (monotonic seq per run) and every state change writes an AuditEvent.
// Ids are deterministic: `<runId>-ev-<seq>` / `<runId>-aud-<n>`.
import type { AuditEvent } from "@/domain/types";
import type { AgentEventRecord, AgentRunEvent } from "@/domain/agents";
import type { AgentStores } from "@/repositories/agentStores";

export type Clock = () => string;

/** Append one event to the run's log. Returns the persisted record. */
export async function appendEvent(
  stores: AgentStores,
  runId: string,
  clock: Clock,
  actor: string,
  event: AgentRunEvent,
): Promise<AgentEventRecord> {
  const existing = (await stores.events.list()).filter((e) => e.runId === runId);
  let maxSeq = 0;
  for (const e of existing) if (e.seq > maxSeq) maxSeq = e.seq;
  const seq = maxSeq + 1;
  const ts = clock();
  const record: AgentEventRecord = {
    id: `${runId}-ev-${seq}`,
    createdAt: ts,
    updatedAt: ts,
    runId,
    seq,
    ts,
    actor,
    type: event.type,
    event,
  };
  return stores.events.create(record);
}

/** Write one audit record for a state change. Returns the persisted record. */
export async function writeAudit(
  stores: AgentStores,
  runId: string,
  clock: Clock,
  fields: { actor: string; action: string; entityRef: string | null; detailsHe: string; correlationId?: string },
): Promise<AuditEvent> {
  const existing = (await stores.audit.list()).filter((a) => a.id.startsWith(`${runId}-aud-`));
  let max = 0;
  const re = /-aud-(\d+)$/;
  for (const a of existing) {
    const m = re.exec(a.id);
    if (m?.[1]) {
      const n = Number.parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  const ts = clock();
  const record: AuditEvent = {
    id: `${runId}-aud-${max + 1}`,
    createdAt: ts,
    updatedAt: ts,
    at: ts,
    actor: fields.actor,
    action: fields.action,
    entityRef: fields.entityRef,
    details: fields.detailsHe,
    correlationId: fields.correlationId ?? runId,
  };
  return stores.audit.create(record);
}
