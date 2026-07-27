// W5-D (Phase 5.13) — the LIVE agent-network band of the Command Center.
// Replaces the static seed band: statuses from the agents repository, current
// tasks + queue sizes from agentTasks, pending approvals from the engine
// selector, unresolved conflicts, recent agent messages, provider health from
// the registry and the honest local/remote mode label.
import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { Link } from "react-router-dom";
import { AgentCard, EmptyState, Panel, SectionTitle, type OsAccent } from "@/design-system";
import type {
  Agent,
  AgentConflict,
  AgentHandoff,
  AgentMessage,
  AgentTask,
  Approval,
} from "@/domain/types";
import type { AgentRun } from "@/domain/agents";
import type { AIProviderHealth } from "@/ai/contracts/AIProvider";
import { agentQueueSizes, pendingApprovals } from "@/agents";
import { ProviderStateBadge, getAgentEngine } from "@/components/ai";
import { dateTimeHe } from "@/modules/quotations/fmt";
import "./command-center.css";

const AGENT_ACCENT: Record<string, OsAccent> = {
  "ag-orchestrator": "blue",
  "ag-hunter": "cyan",
  "ag-fixer": "warning",
  "ag-mentor": "violet",
  "ag-nexa": "blue",
  "ag-wiki": "cyan",
  "ag-flow": "success",
};

const IN_FLIGHT: ReadonlySet<string> = new Set(["בתור", "רץ", "ממתין לאישור"]);

export interface AgentNetworkLiveProps {
  agents: readonly Agent[];
  agentTasks: readonly AgentTask[];
  runs: readonly AgentRun[];
  approvals: readonly Approval[];
  conflicts: readonly AgentConflict[];
  messages: readonly AgentMessage[];
  handoffs: readonly AgentHandoff[];
  ownerName: string;
}

export function AgentNetworkLive({
  agents,
  agentTasks,
  runs,
  approvals,
  conflicts,
  messages,
  handoffs,
  ownerName,
}: AgentNetworkLiveProps): ReactElement {
  const [health, setHealth] = useState<AIProviderHealth | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const selection = await getAgentEngine().registry.select();
      if (!selection.provider || cancelled) return;
      const h = await selection.provider.health();
      if (!cancelled) setHealth(h);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // demo-scale data — plain per-render derivation
  const queues = agentQueueSizes([...agentTasks]);
  const pending = pendingApprovals([...approvals]);
  const openConflicts = conflicts.filter((c) => c.resolution === null);
  const recentMessages = [...messages].sort((a, b) => b.sentAt.localeCompare(a.sentAt)).slice(0, 5);
  const activeRuns = runs.filter((r) => r.status === "רץ" || r.status === "ממתין לאישור");

  const agentName = (id: string): string => agents.find((a) => a.id === id)?.name ?? id;

  return (
    <Panel
      variant="panel"
      style={{ padding: "var(--os-space-5)" }}
      data-testid="agent-network-live"
    >
      <SectionTitle
        title="רשת הסוכנים התפעולית"
        subtitle="נתונים חיים ממנוע התזמור — סטטוסים, תורים, אישורים וקונפליקטים מרשומות בלבד"
        icon="network"
        action={
          <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <ProviderStateBadge provider="local-rules" healthState={health ? health.state : null} />
            <span style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-muted)" }}>
              מצב הדגמה מקומי
            </span>
          </span>
        }
      />

      <div
        style={{
          display: "flex",
          gap: "var(--os-space-4)",
          flexWrap: "wrap",
          marginBlockStart: "var(--os-space-3)",
          fontSize: "var(--os-text-sm, 13px)",
          color: "var(--os-text-2)",
        }}
      >
        <span>
          ריצות פעילות: <span className="os-num">{activeRuns.length}</span>
        </span>
        <span>
          אישורים ממתינים: <span className="os-num">{pending.length}</span>
        </span>
        <span style={{ color: openConflicts.length > 0 ? "var(--os-warning)" : undefined }}>
          קונפליקטים פתוחים: <span className="os-num">{openConflicts.length}</span>
        </span>
        <Link to="/agents/collaboration" style={{ color: "var(--os-cyan)" }}>
          לחדר התיאום ←
        </Link>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
          gap: "var(--os-space-3)",
          marginBlockStart: "var(--os-space-3)",
        }}
      >
        {agents.map((a) => {
          const inFlight = agentTasks
            .filter((t) => t.agentId === a.id && IN_FLIGHT.has(t.status))
            .sort((x, y) => y.updatedAt.localeCompare(x.updatedAt));
          const current = inFlight[0];
          const queue = queues[a.id] ?? 0;
          const lastDone = agentTasks
            .filter((t) => t.agentId === a.id)
            .sort((x, y) => y.updatedAt.localeCompare(x.updatedAt))[0];
          // VC-C: only an agent that is actually working keeps its role accent.
          // Idle agents (no in-flight task) render subdued — the network does
          // not glow every card, so an active agent genuinely stands out.
          const active = Boolean(current);
          return (
            <AgentCard
              key={a.id}
              name={a.name}
              role={a.purpose.split(":")[0] ?? a.purpose}
              accent={AGENT_ACCENT[a.id] ?? "blue"}
              className={active ? "" : "cc-agent--idle"}
              owner={ownerName}
              {...(current
                ? { input: current.title }
                : queue > 0
                  ? { input: `${queue} משימות בתור` }
                  : {})}
              {...(current
                ? { output: `${current.status} · תור ${queue}` }
                : lastDone
                  ? { output: lastDone.status }
                  : {})}
              status={a.status}
              evidenceCount={lastDone ? lastDone.evidenceIds.length : null}
            />
          );
        })}
        {agents.length === 0 && (
          <EmptyState title="אין סוכנים" reason="אוסף agents ריק במאגר המקומי." />
        )}
      </div>

      {openConflicts.length > 0 && (
        <div
          style={{
            marginBlockStart: "var(--os-space-4)",
            display: "grid",
            gap: "var(--os-space-2)",
            fontSize: "var(--os-text-2xs, 11px)",
          }}
        >
          <strong style={{ color: "var(--os-warning)" }}>קונפליקטים הממתינים להכרעה אנושית:</strong>
          {openConflicts.map((c) => (
            <div key={c.id} style={{ color: "var(--os-text-2)" }}>
              {c.description}{" "}
              <Link to="/agents/collaboration" style={{ color: "var(--os-cyan)" }}>
                להכרעה ←
              </Link>
            </div>
          ))}
        </div>
      )}

      <div
        style={{
          marginBlockStart: "var(--os-space-4)",
          display: "grid",
          gap: "var(--os-space-2)",
          fontSize: "var(--os-text-2xs, 11px)",
          color: "var(--os-text-2)",
        }}
      >
        <strong style={{ color: "var(--os-text)" }}>הודעות סוכנים אחרונות:</strong>
        {recentMessages.length === 0 ? (
          <span style={{ color: "var(--os-muted)" }}>אין הודעות סוכנים שמורות</span>
        ) : (
          recentMessages.map((m) => (
            <div key={m.id}>
              {agentName(m.fromAgentId)} ← {m.toAgentId ? agentName(m.toAgentId) : "חדר התיאום"} ·{" "}
              {m.content} · <span className="os-num">{dateTimeHe(m.sentAt)}</span>
            </div>
          ))
        )}
        {handoffs.length > 0 && (
          <>
            <strong style={{ color: "var(--os-text)" }}>מסירות (Handoffs) אחרונות:</strong>
            {[...handoffs]
              .sort((a, b) => b.at.localeCompare(a.at))
              .slice(0, 4)
              .map((h) => (
                <div key={h.id}>
                  {agentName(h.fromAgentId)} ← {agentName(h.toAgentId)} · {h.reason} ·{" "}
                  <span className="os-num">{dateTimeHe(h.at)}</span>
                </div>
              ))}
          </>
        )}
      </div>
    </Panel>
  );
}
