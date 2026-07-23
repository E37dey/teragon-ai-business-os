// W5-D — /agents/collaboration (Phase 5.11): the coordination room.
// RIGHT (first in RTL): task graph derived ONLY from runGraph() over persisted
// records. CENTER: conversation + handoffs + evidence events (runTimeline +
// agentMessages). LEFT rail: evidence, affected records, conflicts with the 5
// human resolution actions + the canonical ApprovalPanel.
// "הפעל תרחיש הדגמה" runs the idempotent REAL engine scenario.
import { useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import {
  EmptyState,
  OsButton,
  OsIcon,
  Panel,
  SectionTitle,
  StatusChip,
  useToast,
  type OsStatus,
} from "@/design-system";
import { PageRail } from "@/app/rail";
import { useCollection, useInvalidateCollections } from "@/app/data/hooks";
import type {
  Agent,
  AgentConflict,
  AgentHandoff,
  AgentMessage,
  AgentTask,
  Approval,
  Evidence,
} from "@/domain/types";
import type { AgentEventRecord, AgentRun, ConflictDetail } from "@/domain/agents";
import {
  CONFLICT_RESOLUTION_ACTIONS,
  DEMO_RUN_ID,
  resolveConflict,
  runDemoScenario,
  runGraph,
  runTimeline,
  AgentGovernanceError,
  type RunGraphNode,
} from "@/agents";
import type { RunRecords } from "@/repositories/agentStores";
import { CEO_USER_ID } from "@/repositories/seed";
import { getAgentEngine } from "@/components/ai";
import { ApprovalPanel } from "@/components/approval";
import { dateTimeHe } from "@/modules/quotations/fmt";
import { layoutRunGraph, NODE_H, NODE_W } from "./graphLayout";

const stack = (gap = "var(--os-space-4)"): CSSProperties => ({ display: "grid", gap });

const RUN_STATUS_CHIP: Record<AgentRun["status"], OsStatus> = {
  טיוטה: "ממתין",
  רץ: "פעיל",
  "ממתין לאישור": "דורש אישור",
  הושלם: "הושלם",
  נכשל: "חסום",
  בוטל: "מושבת",
};

const NODE_COLOR: Record<RunGraphNode["kind"], string> = {
  run: "var(--os-blue)",
  agent: "var(--os-cyan)",
  task: "var(--os-violet)",
  conflict: "var(--os-warning)",
  approval: "var(--os-success)",
};

const KIND_LABEL_HE: Record<RunGraphNode["kind"], string> = {
  run: "ריצה",
  agent: "סוכן",
  task: "משימה",
  conflict: "קונפליקט",
  approval: "אישור",
};

type ProviderFilter = "הכל" | "מקומי" | "מרוחק";
type StatusFilter = "הכל" | AgentRun["status"];

/** provider of a run — derived from its persisted specialist envelopes. */
function runProvider(events: readonly AgentEventRecord[], runId: string): "מקומי" | "מרוחק" | null {
  for (const rec of events) {
    if (rec.runId !== runId) continue;
    const e = rec.event;
    if (e.type === "SpecialistTaskCompleted") {
      return e.envelope.provider === "local-rules" ? "מקומי" : "מרוחק";
    }
  }
  return null;
}

export default function AgentCollaborationPage(): ReactElement {
  const { toast } = useToast();
  const invalidate = useInvalidateCollections();
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("הכל");
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>("הכל");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [demoBusy, setDemoBusy] = useState(false);
  const [conflictBusy, setConflictBusy] = useState(false);
  const [conflictNote, setConflictNote] = useState("");

  const runsQ = useCollection<AgentRun>("agentRuns");
  const eventsQ = useCollection<AgentEventRecord>("agentEvents");
  const tasksQ = useCollection<AgentTask>("agentTasks");
  const messagesQ = useCollection<AgentMessage>("agentMessages");
  const handoffsQ = useCollection<AgentHandoff>("agentHandoffs");
  const conflictsQ = useCollection<AgentConflict>("agentConflicts");
  const approvalsQ = useCollection<Approval>("approvals");
  const evidenceQ = useCollection<Evidence>("evidence");
  const agentsQ = useCollection<Agent>("agents");

  const queries = [
    runsQ,
    eventsQ,
    tasksQ,
    messagesQ,
    handoffsQ,
    conflictsQ,
    approvalsQ,
    evidenceQ,
    agentsQ,
  ];
  const isLoading = queries.some((q) => q.isLoading);
  const isError = queries.some((q) => q.isError);

  const runs = runsQ.data ?? [];
  const events = eventsQ.data ?? [];
  const tasks = tasksQ.data ?? [];
  const messages = messagesQ.data ?? [];
  const handoffs = handoffsQ.data ?? [];
  const conflicts = conflictsQ.data ?? [];
  const approvals = approvalsQ.data ?? [];
  const evidence = evidenceQ.data ?? [];
  const agents = agentsQ.data ?? [];

  const agentName = (id: string): string => agents.find((a) => a.id === id)?.name ?? id;

  const filteredRuns = [...runs]
    .filter((r) => statusFilter === "הכל" || r.status === statusFilter)
    .filter((r) => {
      if (providerFilter === "הכל") return true;
      return runProvider(events, r.id) === providerFilter;
    })
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt) || b.id.localeCompare(a.id));

  const activeRunId = selectedRunId ?? filteredRuns[0]?.id ?? null;
  const activeRun = runs.find((r) => r.id === activeRunId) ?? null;

  // assemble RunRecords from live query data (mirrors collectRunRecords) —
  // plain per-render derivation, demo-scale data
  const records: RunRecords | null = activeRun
    ? {
        run: activeRun,
        events: events.filter((e) => e.runId === activeRun.id).sort((a, b) => a.seq - b.seq),
        tasks: tasks.filter((t) => activeRun.taskIds.includes(t.id)),
        messages: messages.filter((m) => activeRun.taskIds.includes(m.taskId)),
        handoffs: handoffs.filter((h) => activeRun.taskIds.includes(h.taskId)),
        conflicts: conflicts.filter((c) => activeRun.conflictIds.includes(c.id)),
        approvals: approvals.filter((a) => activeRun.approvalIds.includes(a.id)),
      }
    : null;

  const graph = records ? runGraph(records) : null;
  const layout = graph ? layoutRunGraph(graph) : null;
  const timeline = records ? runTimeline(records) : [];

  const runEvidence = activeRun
    ? evidence.filter((ev) => ev.subjectRef.startsWith(`agent-task:${activeRun.id}-`))
    : [];

  const conflictDetail = (conflictId: string): ConflictDetail | null => {
    for (const rec of records?.events ?? []) {
      const e = rec.event;
      if (e.type === "ConflictDetected" && e.conflictId === conflictId) return e.detail;
    }
    return null;
  };

  const runDemo = async (): Promise<void> => {
    setDemoBusy(true);
    try {
      const result = await runDemoScenario();
      await invalidate([
        "agentRuns",
        "agentEvents",
        "agentTasks",
        "agentMessages",
        "agentHandoffs",
        "agentConflicts",
        "approvals",
        "auditEvents",
        "evidence",
      ]);
      setSelectedRunId(DEMO_RUN_ID);
      toast(
        result.created
          ? "תרחיש ההדגמה רץ דרך המנוע האמיתי — נוצרו רשומות, קונפליקט ואישור ממתין"
          : "תרחיש ההדגמה כבר קיים (אידמפוטנטי) — מוצגות הרשומות הקיימות",
        "success",
      );
    } catch (err) {
      toast(
        err instanceof AgentGovernanceError ? err.userMessageHe : "הרצת התרחיש נכשלה",
        "danger",
      );
    } finally {
      setDemoBusy(false);
    }
  };

  const resolve = async (
    conflict: AgentConflict,
    action: (typeof CONFLICT_RESOLUTION_ACTIONS)[number],
  ): Promise<void> => {
    if (!activeRun) return;
    setConflictBusy(true);
    try {
      await resolveConflict(getAgentEngine().stores, () => new Date().toISOString(), {
        runId: activeRun.id,
        conflictId: conflict.id,
        action,
        resolvedById: CEO_USER_ID,
        ...(conflictNote.trim() ? { noteHe: conflictNote.trim() } : {}),
      });
      setConflictNote("");
      await invalidate(["agentConflicts", "agentEvents", "auditEvents"]);
      toast(`הקונפליקט הוכרע: ${action}`, "success");
    } catch (err) {
      toast(
        err instanceof AgentGovernanceError ? err.userMessageHe : "הכרעת הקונפליקט נכשלה",
        "danger",
      );
    } finally {
      setConflictBusy(false);
    }
  };

  if (isError) {
    return (
      <EmptyState
        icon="alert"
        title="טעינת חדר התיאום נכשלה"
        reason="קריאת הנתונים מהמאגר המקומי נכשלה. רעננו את הדף."
      />
    );
  }
  if (isLoading) {
    return (
      <div style={{ padding: "var(--os-space-6)", color: "var(--os-text-2)" }} role="status">
        טוען את חדר התיאום מהמאגר המקומי…
      </div>
    );
  }

  const selectedNode = layout?.nodes.find((n) => n.id === selectedNodeId) ?? null;
  const pendingApprovalOfRun = records?.approvals.find((a) => a.status === "ממתין") ?? null;
  const anyApprovalOfRun = records?.approvals[0] ?? null;
  const panelApproval = pendingApprovalOfRun ?? anyApprovalOfRun;

  return (
    <div style={stack("var(--os-space-5)")} data-testid="collaboration-page">
      <PageRail>
        <div style={stack("var(--os-space-4)")}>
          {selectedNode && (
            <div style={stack("var(--os-space-2)")}>
              <div
                style={{
                  fontSize: "var(--os-text-2xs, 11px)",
                  fontWeight: 600,
                  color: "var(--os-text-2)",
                }}
              >
                נבחר: {KIND_LABEL_HE[selectedNode.kind]}
              </div>
              <div
                style={{
                  fontSize: "var(--os-text-sm, 13px)",
                  border: `1px solid ${NODE_COLOR[selectedNode.kind]}`,
                  borderRadius: "var(--os-radius-sm, 6px)",
                  paddingBlock: "var(--os-space-2)",
                  paddingInline: "var(--os-space-3)",
                }}
              >
                <div>
                  {selectedNode.kind === "agent"
                    ? agentName(selectedNode.id)
                    : selectedNode.labelHe}
                </div>
                {selectedNode.status !== "" && (
                  <div style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-2xs, 11px)" }}>
                    סטטוס: {selectedNode.status}
                  </div>
                )}
                <div
                  className="os-ltr"
                  style={{ color: "var(--os-muted)", fontSize: "var(--os-text-2xs, 11px)" }}
                >
                  {selectedNode.id}
                </div>
              </div>
            </div>
          )}

          <div style={stack("var(--os-space-2)")}>
            <div
              style={{
                fontSize: "var(--os-text-2xs, 11px)",
                fontWeight: 600,
                color: "var(--os-text-2)",
              }}
            >
              ראיות הריצה ({runEvidence.length})
            </div>
            {runEvidence.length === 0 ? (
              <div style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-muted)" }}>
                אין רשומות ראיה לריצה שנבחרה
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gap: 4,
                  fontSize: "var(--os-text-2xs, 11px)",
                  color: "var(--os-text-2)",
                }}
              >
                {runEvidence.slice(0, 8).map((ev) => (
                  <div
                    key={ev.id}
                    style={{ borderBlockEnd: "1px solid var(--os-border)", paddingBlockEnd: 3 }}
                  >
                    {ev.claim}{" "}
                    <span className="os-ltr" style={{ color: "var(--os-muted)" }}>
                      ({ev.sourceRef})
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={stack("var(--os-space-2)")}>
            <div
              style={{
                fontSize: "var(--os-text-2xs, 11px)",
                fontWeight: 600,
                color: "var(--os-text-2)",
              }}
            >
              רשומות מושפעות
            </div>
            <div style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-text-2)" }}>
              {runEvidence.length === 0
                ? "—"
                : [...new Set(runEvidence.map((ev) => ev.sourceRef))].join(" · ")}
            </div>
          </div>

          {records && records.conflicts.length > 0 && (
            <div style={stack("var(--os-space-2)")} data-testid="conflict-rail">
              <div
                style={{
                  fontSize: "var(--os-text-2xs, 11px)",
                  fontWeight: 600,
                  color: "var(--os-warning)",
                }}
              >
                קונפליקטים ({records.conflicts.length})
              </div>
              {records.conflicts.map((c) => {
                const detail = conflictDetail(c.id);
                return (
                  <div
                    key={c.id}
                    style={{
                      display: "grid",
                      gap: 6,
                      fontSize: "var(--os-text-2xs, 11px)",
                      border: "1px solid var(--os-warning-border, var(--os-border))",
                      borderRadius: "var(--os-radius-sm, 6px)",
                      paddingBlock: "var(--os-space-2)",
                      paddingInline: "var(--os-space-3)",
                    }}
                  >
                    <div style={{ color: "var(--os-text)" }}>{c.description}</div>
                    {detail && (
                      <div style={{ display: "grid", gap: 4, color: "var(--os-text-2)" }}>
                        {detail.claims.map((claim) => (
                          <div key={claim.agentId}>
                            <strong>{agentName(claim.agentId)}:</strong> {claim.claimHe}{" "}
                            <span className="os-ltr" style={{ color: "var(--os-muted)" }}>
                              ({claim.evidenceRefs.join(", ")})
                            </span>
                          </div>
                        ))}
                        <div style={{ color: "var(--os-warning)" }}>
                          ראיות חסרות: {detail.missingEvidenceHe.join(" · ")}
                        </div>
                        <div>
                          חומרה: {detail.severity} · מתווה מוצע: {detail.suggestedResolutionPathHe}
                        </div>
                      </div>
                    )}
                    {c.resolution === null ? (
                      <div style={{ display: "grid", gap: 6 }}>
                        <input
                          type="text"
                          value={conflictNote}
                          onChange={(e) => setConflictNote(e.target.value)}
                          placeholder="הערת הכרעה (רשות)"
                          aria-label="הערת הכרעה"
                        />
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          {CONFLICT_RESOLUTION_ACTIONS.map((action) =>
                            conflictBusy ? (
                              <OsButton
                                key={action}
                                variant="ghost"
                                size="sm"
                                disabled
                                disabledReason="הכרעה נשמרת…"
                              >
                                {action}
                              </OsButton>
                            ) : (
                              <OsButton
                                key={action}
                                variant={action === "דחה את ההמלצה" ? "reject" : "ghost"}
                                size="sm"
                                onClick={() => void resolve(c, action)}
                                data-testid={`conflict-action`}
                              >
                                {action}
                              </OsButton>
                            ),
                          )}
                        </div>
                      </div>
                    ) : (
                      <div style={{ color: "var(--os-success)" }}>
                        הוכרע: {c.resolution} · {c.resolvedAt ? dateTimeHe(c.resolvedAt) : ""}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {activeRun && panelApproval && (
            <ApprovalPanel
              runId={activeRun.id}
              approvalId={panelApproval.id}
              compact
              onChanged={() =>
                void invalidate(["agentRuns", "approvals", "agentEvents", "auditEvents"])
              }
            />
          )}
        </div>
      </PageRail>

      {/* header + run selector */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "var(--os-space-3)",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: "var(--os-text-xl, 20px)" }}>חדר התיאום של הסוכנים</h1>
          <div style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-sm, 13px)" }}>
            הגרף, השיחות והקונפליקטים נגזרים אך ורק מרשומות שנשמרו · מצב הדגמה מקומי
          </div>
        </div>
        {demoBusy ? (
          <OsButton variant="cyan" disabled disabledReason="התרחיש רץ…">
            הפעל תרחיש הדגמה
          </OsButton>
        ) : (
          <OsButton
            variant="cyan"
            icon="sparkle"
            onClick={() => void runDemo()}
            data-testid="run-demo"
          >
            הפעל תרחיש הדגמה
          </OsButton>
        )}
      </div>

      <div
        style={{
          display: "flex",
          gap: "var(--os-space-3)",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <label
          style={{
            display: "inline-flex",
            gap: 6,
            alignItems: "center",
            fontSize: "var(--os-text-sm, 13px)",
          }}
        >
          ריצה:
          <select
            value={activeRunId ?? ""}
            onChange={(e) => {
              setSelectedRunId(e.target.value === "" ? null : e.target.value);
              setSelectedNodeId(null);
            }}
            data-testid="run-selector"
            style={{ maxInlineSize: 320 }}
          >
            {filteredRuns.length === 0 && <option value="">— אין ריצות —</option>}
            {filteredRuns.map((r) => (
              <option key={r.id} value={r.id}>
                {r.goal} ({r.status})
              </option>
            ))}
          </select>
        </label>
        <label
          style={{
            display: "inline-flex",
            gap: 6,
            alignItems: "center",
            fontSize: "var(--os-text-sm, 13px)",
          }}
        >
          סטטוס:
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          >
            {(["הכל", "רץ", "ממתין לאישור", "הושלם", "נכשל", "בוטל"] as const).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label
          style={{
            display: "inline-flex",
            gap: 6,
            alignItems: "center",
            fontSize: "var(--os-text-sm, 13px)",
          }}
        >
          מנוע:
          <select
            value={providerFilter}
            onChange={(e) => setProviderFilter(e.target.value as ProviderFilter)}
          >
            {(["הכל", "מקומי", "מרוחק"] as const).map((p) => (
              <option key={p} value={p}>
                {p === "מקומי" ? "מקומי (local-rules)" : p === "מרוחק" ? "מרוחק (remote)" : p}
              </option>
            ))}
          </select>
        </label>
        {activeRun && (
          <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            <StatusChip status={RUN_STATUS_CHIP[activeRun.status]} label={activeRun.status} />
            {activeRun.demo && (
              <span style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-muted)" }}>
                מצב הדגמה מקומי
              </span>
            )}
          </span>
        )}
      </div>

      {!activeRun ? (
        <EmptyState
          icon="network"
          title="אין ריצות תזמור להצגה"
          reason='טרם נשמרו ריצות (או שהמסננים ריקנו את הרשימה). לחצו "הפעל תרחיש הדגמה" כדי להריץ תרחיש אמיתי דרך המנוע.'
        />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.15fr) minmax(0, 1fr)",
            gap: "var(--os-space-4)",
          }}
        >
          {/* RIGHT column (first in RTL): the task graph */}
          <Panel variant="panel" style={{ padding: "var(--os-space-4)" }}>
            <SectionTitle
              title="גרף המשימות"
              subtitle="נגזר מרשומות הריצה בלבד — ריצה · סוכנים · משימות · קונפליקטים · אישורים"
              icon="network"
            />
            {layout && layout.nodes.length > 0 ? (
              <div dir="ltr" style={{ overflow: "auto", marginBlockStart: "var(--os-space-3)" }}>
                <div
                  style={{ position: "relative", width: layout.width, height: layout.height }}
                  data-testid="run-graph"
                >
                  <svg
                    width={layout.width}
                    height={layout.height}
                    style={{ position: "absolute", insetInlineStart: 0, insetBlockStart: 0 }}
                    aria-hidden="true"
                  >
                    {layout.edges.map((e, i) => {
                      const highlighted =
                        selectedNodeId !== null &&
                        (e.from === selectedNodeId || e.to === selectedNodeId);
                      return (
                        <line
                          key={`${e.from}-${e.to}-${i}`}
                          x1={e.x1}
                          y1={e.y1}
                          x2={e.x2}
                          y2={e.y2}
                          stroke={highlighted ? "#20C4E8" : "rgba(112,158,220,.35)"}
                          strokeWidth={highlighted ? 2 : 1}
                          strokeDasharray={e.kind === "message" ? "4 4" : undefined}
                        />
                      );
                    })}
                  </svg>
                  {layout.nodes.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => setSelectedNodeId(n.id === selectedNodeId ? null : n.id)}
                      data-testid="graph-node"
                      data-node-kind={n.kind}
                      dir="rtl"
                      style={{
                        position: "absolute",
                        left: n.x,
                        top: n.y,
                        width: NODE_W,
                        height: NODE_H,
                        display: "grid",
                        alignContent: "center",
                        gap: 2,
                        paddingInline: 8,
                        textAlign: "start",
                        background:
                          n.id === selectedNodeId ? "var(--os-highlight)" : "var(--os-raised)",
                        border: `1px solid ${NODE_COLOR[n.kind]}`,
                        boxShadow:
                          n.id === selectedNodeId ? `0 0 8px ${"rgba(32,196,232,.35)"}` : "none",
                        borderRadius: "var(--os-radius-sm, 6px)",
                        color: "var(--os-text)",
                        cursor: "pointer",
                        overflow: "hidden",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "10px",
                          // axe: kind label uses readable text-2; node identity stays in the colored border
                          color: "var(--os-text-2)",
                          lineHeight: 1,
                        }}
                      >
                        {KIND_LABEL_HE[n.kind]}
                        {n.status !== "" ? ` · ${n.status}` : ""}
                      </span>
                      <span
                        style={{
                          fontSize: "11px",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {n.kind === "agent" ? agentName(n.id) : n.labelHe}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <EmptyState title="אין רשומות גרף" reason="לריצה שנבחרה אין משימות/אירועים שמורים." />
            )}
            <div
              style={{
                display: "flex",
                gap: "var(--os-space-3)",
                flexWrap: "wrap",
                marginBlockStart: "var(--os-space-3)",
                fontSize: "var(--os-text-2xs, 11px)",
                color: "var(--os-text-2)",
              }}
            >
              {(Object.keys(KIND_LABEL_HE) as RunGraphNode["kind"][]).map((kind) => (
                <span key={kind} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <span
                    style={{
                      inlineSize: 10,
                      blockSize: 10,
                      borderRadius: 2,
                      border: `1px solid ${NODE_COLOR[kind]}`,
                      display: "inline-block",
                    }}
                  />
                  {KIND_LABEL_HE[kind]}
                </span>
              ))}
            </div>
          </Panel>

          {/* CENTER column: conversation + handoffs + evidence events */}
          <Panel variant="panel" style={{ padding: "var(--os-space-4)" }}>
            <SectionTitle
              title="שיחות והעברות"
              subtitle="הודעות סוכנים, העברות ואירועי ראיות — מרשומות בלבד"
              icon="inbox"
            />
            <div
              style={{
                ...stack("var(--os-space-2)"),
                marginBlockStart: "var(--os-space-3)",
                maxBlockSize: 520,
                overflowY: "auto",
              }}
              data-testid="run-timeline" tabIndex={0} role="region" aria-label="ציר הזמן של הריצה"
            >
              {records && records.messages.length > 0 && (
                <div style={stack("var(--os-space-2)")}>
                  {[...records.messages]
                    .sort((a, b) => a.sentAt.localeCompare(b.sentAt) || a.id.localeCompare(b.id))
                    .map((m) => (
                      <div
                        key={m.id}
                        style={{
                          display: "grid",
                          gap: 2,
                          fontSize: "var(--os-text-2xs, 12px)",
                          border: "1px solid var(--os-border)",
                          borderRadius: "var(--os-radius-sm, 6px)",
                          paddingBlock: "var(--os-space-2)",
                          paddingInline: "var(--os-space-3)",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            color: "var(--os-cyan)",
                          }}
                        >
                          <span>
                            {agentName(m.fromAgentId)} ←{" "}
                            {m.toAgentId ? agentName(m.toAgentId) : "חדר התיאום"}
                          </span>
                          <span className="os-num" style={{ color: "var(--os-muted)" }}>
                            {dateTimeHe(m.sentAt)}
                          </span>
                        </div>
                        <div style={{ color: "var(--os-text-2)" }}>{m.content}</div>
                      </div>
                    ))}
                </div>
              )}
              <div
                style={{
                  fontSize: "var(--os-text-2xs, 11px)",
                  fontWeight: 600,
                  color: "var(--os-text-2)",
                }}
              >
                ציר האירועים ({timeline.length})
              </div>
              {timeline.map((t) => (
                <div
                  key={t.seq}
                  style={{
                    display: "flex",
                    gap: 8,
                    fontSize: "var(--os-text-2xs, 11px)",
                    color: "var(--os-text-2)",
                    alignItems: "baseline",
                  }}
                >
                  <span className="os-num" style={{ color: "var(--os-muted)", minInlineSize: 20 }}>
                    {t.seq}
                  </span>
                  <span
                    style={{
                      color:
                        t.type === "ConflictDetected"
                          ? "var(--os-warning)"
                          : t.type === "ApprovalRequested"
                            ? "var(--os-violet-text, var(--os-violet))"
                            : "var(--os-text-2)",
                    }}
                  >
                    {t.labelHe}
                  </span>
                  <span style={{ color: "var(--os-muted)" }}>{agentName(t.actor)}</span>
                  <span
                    className="os-num"
                    style={{ color: "var(--os-muted)", marginInlineStart: "auto" }}
                  >
                    {dateTimeHe(t.ts)}
                  </span>
                </div>
              ))}
              {timeline.length === 0 && (
                <EmptyState title="אין אירועים" reason="לריצה זו לא נשמרו אירועים." />
              )}
            </div>
            <div
              style={{
                marginBlockStart: "var(--os-space-3)",
                fontSize: "var(--os-text-2xs, 11px)",
                color: "var(--os-muted)",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <OsIcon name="shield" size={12} />
              מנהל התזמור לעולם אינו מכריע בקונפליקט לבד — ההחלטה תמיד אנושית
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}
