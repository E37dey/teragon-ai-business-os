// W5-D — /automations (Phase 5.12): automations + runs from the repositories,
// an AI-supported planning panel (6 deterministic local ops → honest
// envelopes), and approval-gated execution: every EXTERNAL action goes
// through the canonical ApprovalEngine + ApprovalPanel; the injected handlers
// create Task/Activity records as the honestly-labeled "execution".
import { useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import {
  DataTable,
  EmptyState,
  KpiCard,
  OsButton,
  Panel,
  SectionTitle,
  StatusChip,
  useToast,
  type DataTableColumn,
  type OsStatus,
} from "@/design-system";
import { PageRail } from "@/app/rail";
import { useCollection, useInvalidateCollections } from "@/app/data/hooks";
import { getRepository } from "@/repositories";
import type { Approval, Automation, AutomationRun } from "@/domain/types";
import type { AIResponseEnvelopeV2 } from "@/domain/ai/envelope";
import { CEO_USER_ID } from "@/repositories/seed";
import { EnvelopeCard, getAgentEngine } from "@/components/ai";
import { ApprovalPanel } from "@/components/approval";
import { useEmergencyFlags } from "@/administration";
import {
  automationExecutionGate,
  evaluateAutomationExecutionGate,
} from "@/integration/wave8/automationExecutionGuard";
import { dateTimeHe } from "@/modules/quotations/fmt";
import {
  classifyTriggerOp,
  detectFailurePathsOp,
  draftContentOp,
  hasExternalStep,
  identifyMissingOp,
  proposeConditionsOp,
  suggestNextActionOp,
} from "./planOps";

const stack = (gap = "var(--os-space-4)"): CSSProperties => ({ display: "grid", gap });

interface PlanOpSpec {
  id: string;
  labelHe: string;
  run: (automation: Automation, runs: readonly AutomationRun[]) => AIResponseEnvelopeV2;
}

const PLAN_OPS: readonly PlanOpSpec[] = [
  { id: "classify", labelHe: "סווג את נתוני הטריגר", run: (a) => classifyTriggerOp(a) },
  { id: "missing", labelHe: "זהה מידע חסר", run: (a, r) => identifyMissingOp(a, r) },
  { id: "conditions", labelHe: "הצע תנאי הרצה", run: (a) => proposeConditionsOp(a) },
  { id: "draft", labelHe: "נסח תוכן הודעה", run: (a) => draftContentOp(a) },
  { id: "next", labelHe: "הצע פעולה הבאה", run: (a, r) => suggestNextActionOp(a, r) },
  { id: "failures", labelHe: "אתר נתיבי כשל", run: (a, r) => detectFailurePathsOp(a, r) },
];

function outcomeChip(outcome: AutomationRun["outcome"]): ReactElement {
  const map: Record<string, OsStatus> = { הצלחה: "הושלם", כישלון: "חסום", בוטל: "מושבת" };
  return outcome === null ? (
    <StatusChip status="פעיל" label="רצה" />
  ) : (
    <StatusChip status={map[outcome] ?? "אזהרה"} label={outcome} />
  );
}

/** approvals created for an automation: id pattern `auto-<id>-ap-<n>`. */
function approvalRunId(approval: Approval): string | null {
  const m = /^(.+)-ap-\d+$/.exec(approval.id);
  return m?.[1] ?? null;
}

export default function AutomationsPage(): ReactElement {
  const { toast } = useToast();
  const invalidate = useInvalidateCollections();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [envelopes, setEnvelopes] = useState<Record<string, AIResponseEnvelopeV2>>({});
  const [busy, setBusy] = useState(false);

  const automationsQ = useCollection<Automation>("automations");
  const runsQ = useCollection<AutomationRun>("automationRuns");
  const approvalsQ = useCollection<Approval>("approvals");

  // W8-E: the W8-C emergency flag `automation-execution-disable` blocks the
  // execute path (reactive for the buttons; re-checked freshly inside the handler)
  const { flags: emergencyFlags } = useEmergencyFlags();
  const executionGate = evaluateAutomationExecutionGate(
    emergencyFlags.automationExecutionDisabled,
  );

  const isLoading = [automationsQ, runsQ, approvalsQ].some((q) => q.isLoading);
  const isError = [automationsQ, runsQ, approvalsQ].some((q) => q.isError);

  const automations = automationsQ.data ?? [];
  const runs = runsQ.data ?? [];
  const approvals = approvalsQ.data ?? [];

  const selected = automations.find((a) => a.id === selectedId) ?? automations[0] ?? null;
  const selectedRuns = selected
    ? [...runs]
        .filter((r) => r.automationId === selected.id)
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    : [];
  const selectedApprovals = selected
    ? approvals
        .filter((a) => a.subjectRef === `automation:${selected.id}`)
        .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))
    : [];

  const toggleEnabled = async (automation: Automation): Promise<void> => {
    try {
      const now = new Date().toISOString();
      await getRepository<Automation>("automations").update(automation.id, {
        enabled: !automation.enabled,
        updatedAt: now,
      });
      await invalidate(["automations"]);
      toast(
        automation.enabled
          ? `האוטומציה «${automation.name}» כובתה`
          : `האוטומציה «${automation.name}» הופעלה`,
        "info",
      );
    } catch {
      toast("עדכון האוטומציה נכשל — נסו שוב", "danger");
    }
  };

  const runPlanOp = (op: PlanOpSpec): void => {
    if (!selected) return;
    const envelope = op.run(selected, runs);
    setEnvelopes((prev) => ({ ...prev, [op.id]: envelope }));
  };

  const requestExecution = async (draft?: string): Promise<void> => {
    if (!selected) return;
    // W8-E: honest refusal under the emergency flag — fresh read at call time
    const gate = automationExecutionGate();
    if (!gate.allowed) {
      toast(gate.reasonHe ?? "הרצת אוטומציות מושבתת במצב חירום", "warning");
      return;
    }
    setBusy(true);
    try {
      const engine = getAgentEngine().approvalEngine;
      const runId = `auto-${selected.id}`;
      await engine.requestApproval({
        runId,
        subjectRef: `automation:${selected.id}`,
        action: "external-automation",
        requestedById: CEO_USER_ID,
        executionPayload: {
          kind: "external",
          action: "external-automation",
          descriptionHe: `הרצת האוטומציה «${selected.name}» (${selected.trigger})${draft ? " כולל שליחת ההודעה שנוסחה" : ""}`,
          data: {
            automationId: selected.id,
            subjectRef: `automation:${selected.id}`,
            ...(draft ? { draft } : {}),
          },
        },
        previewHe: `${selected.name} — ${selected.description}`.slice(0, 200),
      });
      await invalidate(["approvals", "agentEvents", "auditEvents"]);
      toast("נוצרה בקשת אישור להרצה — ההחלטה אנושית", "info");
    } catch {
      toast("יצירת בקשת האישור נכשלה — נסו שוב", "danger");
    } finally {
      setBusy(false);
    }
  };

  if (isError) {
    return (
      <EmptyState
        icon="alert"
        title="טעינת האוטומציות נכשלה"
        reason="קריאת הנתונים מהמאגר המקומי נכשלה. רעננו את הדף."
      />
    );
  }
  if (isLoading) {
    return (
      <div style={{ padding: "var(--os-space-6)", color: "var(--os-text-2)" }} role="status">
        טוען את האוטומציות מהמאגר המקומי…
      </div>
    );
  }

  const enabledCount = automations.filter((a) => a.enabled).length;
  const totalRuns = runs.length;
  const failedRuns = runs.filter((r) => r.outcome === "כישלון").length;
  const pendingAutoApprovals = approvals.filter(
    (a) => a.status === "ממתין" && a.subjectRef.startsWith("automation:"),
  ).length;

  const runCols: DataTableColumn<AutomationRun>[] = [
    { key: "id", header: "ריצה", render: (r) => <span className="os-ltr">{r.id}</span> },
    { key: "outcome", header: "תוצאה", render: (r) => outcomeChip(r.outcome) },
    { key: "trigger", header: "הופעל על ידי", render: (r) => r.triggeredBy },
    {
      key: "started",
      header: "התחילה",
      render: (r) => <span className="os-num">{dateTimeHe(r.startedAt)}</span>,
    },
    {
      key: "provider",
      header: "ספק / מעטפת",
      render: () => (
        <span style={{ color: "var(--os-muted)", fontSize: "var(--os-text-2xs, 11px)" }}>
          ריצת מתזמן — ללא מעטפת AI
        </span>
      ),
    },
  ];

  return (
    <div style={stack("var(--os-space-5)")} data-testid="automations-page">
      <PageRail>
        <div style={stack("var(--os-space-4)")}>
          <div style={stack("var(--os-space-2)")}>
            <div
              style={{
                fontSize: "var(--os-text-2xs, 11px)",
                fontWeight: 600,
                color: "var(--os-text-2)",
              }}
            >
              תמונת מצב
            </div>
            <div
              style={{
                fontSize: "var(--os-text-sm, 13px)",
                color: "var(--os-text-2)",
                display: "grid",
                gap: 3,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>אוטומציות פעילות</span>
                <span className="os-num">
                  {enabledCount}/{automations.length}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>ריצות שנרשמו</span>
                <span className="os-num">{totalRuns}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>אישורי הרצה ממתינים</span>
                <span className="os-num">{pendingAutoApprovals}</span>
              </div>
            </div>
          </div>
          <div style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-muted)" }}>
            כל פעולה חיצונית עוברת דרך מנוע האישורים; ביצוע מאושר יוצר רשומות משימה ופעילות — שליחה
            חיצונית אמיתית אינה נתמכת במצב הדגמה.
          </div>
        </div>
      </PageRail>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          flexWrap: "wrap",
          gap: "var(--os-space-3)",
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: "var(--os-text-xl, 20px)" }}>אוטומציות</h1>
          <div style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-sm, 13px)" }}>
            תכנון נתמך-AI מקומי · ביצוע חיצוני רק באישור אנושי · מצב הדגמה מקומי
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          gap: "var(--os-space-3)",
        }}
      >
        <KpiCard title="אוטומציות" value={automations.length} accent="blue" icon="gear" />
        <KpiCard title="פעילות" value={enabledCount} accent="success" icon="check" />
        <KpiCard title="ריצות" value={totalRuns} accent="cyan" icon="clock" />
        <KpiCard
          title="כישלונות"
          value={failedRuns}
          accent={failedRuns > 0 ? "danger" : "success"}
          icon="alert"
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.4fr)",
          gap: "var(--os-space-4)",
        }}
      >
        {/* list */}
        <Panel variant="panel" style={{ padding: "var(--os-space-4)" }}>
          <SectionTitle title="האוטומציות" subtitle="מהמאגר — לחיצה בוחרת" icon="gear" />
          <div style={{ ...stack("var(--os-space-2)"), marginBlockStart: "var(--os-space-3)" }}>
            {automations.map((a) => (
              <div
                key={a.id}
                data-testid="automation-row"
                style={{
                  display: "grid",
                  gap: 6,
                  border: `1px solid ${selected?.id === a.id ? "var(--os-cyan-border, var(--os-border-strong))" : "var(--os-border)"}`,
                  background: selected?.id === a.id ? "var(--os-highlight)" : "transparent",
                  borderRadius: "var(--os-radius-sm, 6px)",
                  paddingBlock: "var(--os-space-3)",
                  paddingInline: "var(--os-space-3)",
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(a.id);
                    setEnvelopes({});
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    textAlign: "start",
                    color: "var(--os-text)",
                    fontWeight: 600,
                    cursor: "pointer",
                    font: "inherit",
                  }}
                >
                  {a.name}
                </button>
                <div style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-text-2)" }}>
                  טריגר: {a.trigger}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <StatusChip
                    status={a.enabled ? "פעיל" : "מושבת"}
                    label={a.enabled ? "פעילה" : "כבויה"}
                  />
                  {a.requiresApproval && <StatusChip status="דורש אישור" label="דורשת אישור" />}
                  <OsButton variant="ghost" size="sm" onClick={() => void toggleEnabled(a)}>
                    {a.enabled ? "כבה" : "הפעל"}
                  </OsButton>
                </div>
              </div>
            ))}
            {automations.length === 0 && (
              <EmptyState title="אין אוטומציות" reason="אוסף automations ריק במאגר המקומי." />
            )}
          </div>
        </Panel>

        {/* detail + planning */}
        <div style={stack("var(--os-space-4)")}>
          {selected ? (
            <>
              <Panel variant="panel" style={{ padding: "var(--os-space-4)" }}>
                <SectionTitle
                  title={`ריצות: ${selected.name}`}
                  subtitle="כל ריצה עם התוצאה ויומן הצעדים שנשמרו"
                  icon="clock"
                />
                <div style={{ marginBlockStart: "var(--os-space-3)" }}>
                  <DataTable
                    columns={runCols}
                    rows={selectedRuns}
                    rowKey="id"
                    emptyText="אין ריצות"
                    emptyReason="לאוטומציה זו לא נרשמו ריצות עדיין."
                  />
                  {selectedRuns.length > 0 && (
                    <div
                      style={{
                        marginBlockStart: "var(--os-space-3)",
                        display: "grid",
                        gap: 4,
                        fontSize: "var(--os-text-2xs, 11px)",
                        color: "var(--os-text-2)",
                      }}
                    >
                      <strong style={{ color: "var(--os-text)" }}>
                        יומן הצעדים של הריצה האחרונה:
                      </strong>
                      {(selectedRuns[0]?.stepsLog ?? []).map((s, i) => (
                        <div key={i}>
                          <span className="os-num">{i + 1}.</span> {s}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Panel>

              <Panel
                variant="panel"
                style={{ padding: "var(--os-space-4)" }}
                data-testid="planning-panel"
              >
                <SectionTitle
                  title="תכנון נתמך-AI"
                  subtitle="שש פעולות דטרמיניסטיות מקומיות — כל תוצאה עם ספק, פעולה, ראיות ודרישת אישור"
                  icon="brain"
                />
                <div
                  style={{
                    display: "flex",
                    gap: "var(--os-space-2)",
                    flexWrap: "wrap",
                    marginBlockStart: "var(--os-space-3)",
                  }}
                >
                  {PLAN_OPS.map((op) => (
                    <OsButton
                      key={op.id}
                      variant="ghost"
                      size="sm"
                      onClick={() => runPlanOp(op)}
                      data-testid={`plan-op-${op.id}`}
                    >
                      {op.labelHe}
                    </OsButton>
                  ))}
                </div>
                <div
                  style={{ ...stack("var(--os-space-3)"), marginBlockStart: "var(--os-space-3)" }}
                >
                  {Object.entries(envelopes).map(([opId, envelope]) => (
                    <EnvelopeCard
                      key={opId}
                      envelope={envelope}
                      actions={
                        envelope.approval.required ? (
                          busy || !executionGate.allowed ? (
                            <OsButton
                              variant="violet"
                              size="sm"
                              disabled
                              disabledReason={
                                executionGate.reasonHe ?? "בקשה נשלחת…"
                              }
                            >
                              בקש אישור לביצוע
                            </OsButton>
                          ) : (
                            <OsButton
                              variant="violet"
                              size="sm"
                              icon="shield"
                              onClick={() => void requestExecution(envelope.recommendation)}
                              data-testid="request-execution"
                            >
                              בקש אישור לביצוע
                            </OsButton>
                          )
                        ) : undefined
                      }
                    />
                  ))}
                  {Object.keys(envelopes).length === 0 && (
                    <div style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-muted)" }}>
                      בחרו פעולת תכנון — התוצאה תוצג כמעטפת מלאה (ספק, ראיות, מגבלות, אישור)
                    </div>
                  )}
                </div>
              </Panel>

              <Panel variant="panel" style={{ padding: "var(--os-space-4)" }}>
                <SectionTitle
                  title="הרצה ואישורים"
                  subtitle="פעולה חיצונית מבוצעת רק לאחר אישור; הביצוע יוצר רשומות משימה ופעילות"
                  icon="shield"
                />
                <div
                  style={{ ...stack("var(--os-space-3)"), marginBlockStart: "var(--os-space-3)" }}
                >
                  <div style={{ display: "flex", gap: "var(--os-space-2)", flexWrap: "wrap" }}>
                    {selected.requiresApproval || hasExternalStep(selected) ? (
                      busy || !executionGate.allowed ? (
                        <OsButton
                          variant="primary"
                          disabled
                          disabledReason={executionGate.reasonHe ?? "בקשה נשלחת…"}
                          data-testid="request-run-approval-blocked"
                        >
                          בקש אישור להרצה
                        </OsButton>
                      ) : (
                        <OsButton
                          variant="primary"
                          icon="shield"
                          onClick={() => void requestExecution()}
                          data-testid="request-run-approval"
                        >
                          בקש אישור להרצה
                        </OsButton>
                      )
                    ) : (
                      <OsButton
                        variant="primary"
                        disabled
                        disabledReason="אוטומציה פנימית רצה לפי הטריגר המוגדר; הרצה ידנית של אוטומציה פנימית אינה נתמכת עדיין"
                      >
                        הרץ עכשיו
                      </OsButton>
                    )}
                    <OsButton
                      variant="ghost"
                      disabled
                      disabledReason="שליחה חיצונית אמיתית (מייל/SMS/רשת) אינה נתמכת במצב הדגמה המקומי"
                    >
                      שליחה חיצונית אמיתית
                    </OsButton>
                  </div>
                  {selectedApprovals.length === 0 ? (
                    <div style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-muted)" }}>
                      אין בקשות אישור לאוטומציה זו עדיין
                    </div>
                  ) : (
                    selectedApprovals.map((a) => {
                      const rid = approvalRunId(a);
                      return rid ? (
                        <ApprovalPanel
                          key={a.id}
                          runId={rid}
                          approvalId={a.id}
                          onChanged={() =>
                            void invalidate(["approvals", "tasks", "activities", "auditEvents"])
                          }
                        />
                      ) : null;
                    })
                  )}
                </div>
              </Panel>
            </>
          ) : (
            <EmptyState title="אין אוטומציה נבחרת" reason="בחרו אוטומציה מהרשימה." />
          )}
        </div>
      </div>
    </div>
  );
}
