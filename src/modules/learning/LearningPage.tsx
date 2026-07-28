// W6-D — /learning (Phase 6.15): the governed learning loop.
// המלצה → תגובת משתמש → תוצאה → תובנה מוצעת → בדיקת ראיות → אישור מנהל →
// כלל פעיל → מעקב. Every number derives from records; unmeasured ⇒ "טרם נמדד";
// NOTHING here implies autonomous retraining — a rule exists only after a
// named manager approved it through the canonical ApprovalEngine.
import { useEffect, useState } from "react";
import type { CSSProperties, ReactElement, ReactNode } from "react";
import {
  DataTable,
  EmptyState,
  KpiCard,
  OsButton,
  Panel,
  SectionTitle,
  StatusChip,
  Stepper,
  useToast,
  type DataTableColumn,
} from "@/design-system";
import { PageRail } from "@/app/rail";
import { useCollection, useInvalidateCollections } from "@/app/data/hooks";
import type { AIRecommendation, Approval, AuditEvent } from "@/domain/types";
import {
  LEARNING_UNMEASURED_HE,
  FORBIDDEN_RULE_AREAS_HE,
  ruleEffectivenessDisplayHe,
  type LearningEvidence,
  type LearningObservation,
  type LearningProposal,
  type LearningRollback,
  type LearningRule,
  type LearningRuleVersion,
  type RecommendationOutcome,
} from "@/domain/learning";
import { ApprovalEngine } from "@/agents";
import { agentStores } from "@/repositories/agentStores";
import {
  approveProposal,
  describeRuleEffectHe,
  ensureLearningDemoData,
  learningStores,
  rejectProposal,
  rollbackRule,
  ruleApplicationsFromAudit,
  LEARNING_DEMO_REVIEWER,
} from "@/learning";
import { dateTimeHe } from "@/modules/quotations/fmt";
import { learningMetrics, learningRows, loopSteps, type LearningRow } from "./lib";

const stack = (gap = "var(--os-space-4)"): CSSProperties => ({ display: "grid", gap });

const LEARNING_COLLECTIONS = [
  "learningObservations",
  "recommendationOutcomes",
  "learningProposals",
  "learningEvidence",
  "learningRules",
  "learningRuleVersions",
  "learningRollbacks",
  "approvals",
  "auditEvents",
  "agentEvents",
  "agentRuns",
] as const;

function Field({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <div style={{ display: "grid", gap: 2, fontSize: "var(--os-text-sm, 13px)" }}>
      <span style={{ color: "var(--os-muted)", fontSize: "var(--os-text-2xs, 11px)" }}>
        {label}
      </span>
      <span>{children}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// contextual rail — the selected proposal under review
// ---------------------------------------------------------------------------

export interface ProposalReviewPanelProps {
  proposal: LearningProposal;
  evidence: readonly LearningEvidence[];
  rule: LearningRule | null;
  rollback: LearningRollback | null;
  applications: readonly AuditEvent[];
  currentUserId: string;
  busy: boolean;
  onApprove: () => void;
  onReject: (reasonHe: string) => void;
  onRollback: (reasonHe: string) => void;
}

export function ProposalReviewPanel({
  proposal,
  evidence,
  rule,
  rollback,
  applications,
  currentUserId,
  busy,
  onApprove,
  onReject,
  onRollback,
}: ProposalReviewPanelProps): ReactElement {
  const [reasonHe, setReasonHe] = useState("");
  const myEvidence = evidence.filter((e) => e.proposalId === proposal.id);
  const supporting = myEvidence.filter((e) => e.direction === "supporting");
  const contrary = myEvidence.filter((e) => e.direction === "contrary");
  const isNamedReviewer = currentUserId === proposal.namedReviewerId;
  const singleCase = proposal.singleCaseMarkerHe !== null;
  const pending = proposal.approvalState === "pending";

  return (
    <div style={stack("var(--os-space-3)")} data-testid="proposal-rail">
      <div style={{ fontWeight: 600, fontSize: "var(--os-text-md, 14px)" }}>
        תובנה בבדיקה
      </div>
      <Field label="התובנה המוצעת">{proposal.proposedInsightHe}</Field>
      {singleCase && (
        <div
          data-testid="single-case-marker"
          style={{
            color: "var(--warning-text)",
            fontSize: "var(--os-text-sm, 13px)",
            fontWeight: 600,
          }}
        >
          ⚠ {proposal.singleCaseMarkerHe}
        </div>
      )}
      <Field label="בסיס הראיות">
        {proposal.evidenceBasis === "correlation"
          ? "קורלציה בלבד — לא הוכחה סיבתיות"
          : `סיבתיות (ראיה: ${proposal.causationEvidenceRef ?? ""})`}
      </Field>
      <Field label={`ראיות תומכות (${supporting.length})`}>
        <ul style={{ margin: 0, paddingInlineStart: 16 }}>
          {supporting.map((e) => (
            <li key={e.id} style={{ fontSize: "var(--os-text-2xs, 11px)" }}>
              <span className="os-ltr">{e.sourceRef}</span> — {e.claimHe}
            </li>
          ))}
        </ul>
      </Field>
      <Field label={`ראיות נגד (${contrary.length})`}>
        {contrary.length === 0 ? (
          "לא נמצאו ראיות נגד ברשומות"
        ) : (
          <ul style={{ margin: 0, paddingInlineStart: 16 }}>
            {contrary.map((e) => (
              <li key={e.id} style={{ fontSize: "var(--os-text-2xs, 11px)" }}>
                <span className="os-ltr">{e.sourceRef}</span> — {e.claimHe}
              </li>
            ))}
          </ul>
        )}
      </Field>
      <Field label="מגבלות (בכנות)">
        <ul style={{ margin: 0, paddingInlineStart: 16 }}>
          {proposal.limitationsHe.map((l) => (
            <li key={l} style={{ fontSize: "var(--os-text-2xs, 11px)" }}>
              {l}
            </li>
          ))}
        </ul>
      </Field>
      <Field label="הטיה אפשרית / סיכון">
        {proposal.possibleBiasHe.length > 0 ? proposal.possibleBiasHe.join(" · ") : "לא זוהתה"}
      </Field>
      <Field label="סוכנים ותהליכים מושפעים">
        <span className="os-ltr">{proposal.affectedAgentIds.join(" · ") || "—"}</span>
        {proposal.affectedWorkflowsHe.length > 0 && (
          <> · {proposal.affectedWorkflowsHe.join(" · ")}</>
        )}
      </Field>
      <Field label="הכלל המוצע (משטח מוגבל)">{describeRuleEffectHe(proposal.proposedEffect)}</Field>
      <Field label="תאריך בדיקה">
        {proposal.reviewDueAt ? (
          <span className="os-num">{dateTimeHe(proposal.reviewDueAt)}</span>
        ) : (
          "טרם נקבע"
        )}
      </Field>
      <Field label="מאשר בשם">
        {proposal.namedReviewerName} (<span className="os-ltr">{proposal.namedReviewerId}</span>)
      </Field>

      {rule && (
        <Field label="מצב הכלל">
          {rule.status === "active" ? (
            <>
              <StatusChip status="פעיל" label={`פעיל · גרסה ${rule.currentVersion}`} /> ·
              אפקטיביות: {ruleEffectivenessDisplayHe(rule)} · יישומים:{" "}
              <span className="os-num">{applications.length}</span>
            </>
          ) : (
            <span data-testid="rule-rolled-back">
              בוטל (rollback){rollback ? ` — ${rollback.reasonHe}` : ""} · יישומי העבר נשארים
              גלויים (<span className="os-num">{applications.length}</span>)
            </span>
          )}
        </Field>
      )}

      {(pending || (rule && rule.status === "active")) && (
        <label style={{ display: "grid", gap: 4, fontSize: "var(--os-text-2xs, 11px)" }}>
          <span style={{ color: "var(--os-muted)" }}>נימוק (חובה לדחייה / ביטול)</span>
          <textarea
            data-testid="review-reason"
            value={reasonHe}
            onChange={(e) => setReasonHe(e.target.value)}
            rows={2}
            style={{
              background: "var(--os-raised, #0A1627)",
              color: "var(--os-text)",
              border: "1px solid var(--os-border, rgba(112,158,220,.17))",
              borderRadius: 6,
              padding: 6,
              font: "inherit",
              resize: "vertical",
            }}
          />
        </label>
      )}

      <div style={{ display: "flex", gap: "var(--os-space-2)", flexWrap: "wrap" }}>
        {pending && (
          <>
            {busy ? (
              <OsButton size="sm" disabled disabledReason="מעבד…">
                אשר והפעל כלל
              </OsButton>
            ) : singleCase ? (
              <OsButton
                size="sm"
                disabled
                disabledReason={proposal.singleCaseMarkerHe ?? ""}
                data-testid="approve-proposal"
              >
                אשר והפעל כלל
              </OsButton>
            ) : !isNamedReviewer ? (
              <OsButton
                size="sm"
                disabled
                disabledReason={`רק ${proposal.namedReviewerName} רשאי לאשר`}
                data-testid="approve-proposal"
              >
                אשר והפעל כלל
              </OsButton>
            ) : (
              <OsButton size="sm" variant="success" onClick={onApprove} data-testid="approve-proposal">
                אשר והפעל כלל
              </OsButton>
            )}
            {busy || !isNamedReviewer || reasonHe.trim() === "" ? (
              <OsButton
                size="sm"
                variant="danger"
                disabled
                disabledReason={
                  busy ? "מעבד…" : !isNamedReviewer ? `רק ${proposal.namedReviewerName} רשאי` : "דחייה מחייבת נימוק"
                }
                data-testid="reject-proposal"
              >
                דחה
              </OsButton>
            ) : (
              <OsButton
                size="sm"
                variant="danger"
                onClick={() => onReject(reasonHe.trim())}
                data-testid="reject-proposal"
              >
                דחה
              </OsButton>
            )}
          </>
        )}
        {rule &&
          rule.status === "active" &&
          (busy || reasonHe.trim() === "" ? (
            <OsButton
              size="sm"
              variant="danger"
              disabled
              disabledReason={busy ? "מעבד…" : "ביטול כלל מחייב נימוק"}
              data-testid="rollback-rule"
            >
              בטל כלל (rollback)
            </OsButton>
          ) : (
            <OsButton
              size="sm"
              variant="danger"
              onClick={() => onRollback(reasonHe.trim())}
              data-testid="rollback-rule"
            >
              בטל כלל (rollback)
            </OsButton>
          ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// the page
// ---------------------------------------------------------------------------

export default function LearningPage(): ReactElement {
  const { toast } = useToast();
  const invalidate = useInvalidateCollections();
  const [seeded, setSeeded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null);

  const observationsQ = useCollection<LearningObservation>("learningObservations");
  const outcomesQ = useCollection<RecommendationOutcome>("recommendationOutcomes");
  const proposalsQ = useCollection<LearningProposal>("learningProposals");
  const evidenceQ = useCollection<LearningEvidence>("learningEvidence");
  const rulesQ = useCollection<LearningRule>("learningRules");
  const versionsQ = useCollection<LearningRuleVersion>("learningRuleVersions");
  const rollbacksQ = useCollection<LearningRollback>("learningRollbacks");
  const recsQ = useCollection<AIRecommendation>("aiRecommendations");
  const approvalsQ = useCollection<Approval>("approvals");
  const auditQ = useCollection<AuditEvent>("auditEvents");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await ensureLearningDemoData();
      } finally {
        if (!cancelled) {
          setSeeded(true);
          await invalidate(LEARNING_COLLECTIONS);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time idempotent boot
  }, []);

  const queries = [
    observationsQ,
    outcomesQ,
    proposalsQ,
    evidenceQ,
    rulesQ,
    versionsQ,
    rollbacksQ,
    recsQ,
    approvalsQ,
    auditQ,
  ];
  const isLoading = !seeded || queries.some((q) => q.isLoading);
  const isError = queries.some((q) => q.isError);

  const observations = observationsQ.data ?? [];
  const outcomes = outcomesQ.data ?? [];
  const proposals = proposalsQ.data ?? [];
  const evidence = evidenceQ.data ?? [];
  const rules = rulesQ.data ?? [];
  const rollbacks = rollbacksQ.data ?? [];
  const recommendations = recsQ.data ?? [];
  const approvals = approvalsQ.data ?? [];
  const audit = auditQ.data ?? [];

  const metrics = learningMetrics({ observations, outcomes, proposals, rules, rollbacks });
  const steps = loopSteps({ recommendations, outcomes, proposals, evidence, rules, audit });
  const rows = learningRows({ recommendations, approvals, outcomes, proposals, rules });

  // demo-scale data — plain per-render derivation keeps the selectors honest
  const sortedProposals = [...proposals].sort((a, b) => a.id.localeCompare(b.id));
  const selectedProposal =
    sortedProposals.find((p) => p.id === selectedProposalId) ??
    sortedProposals.find((p) => p.approvalState === "pending") ??
    sortedProposals[0] ??
    null;
  const selectedRule = selectedProposal
    ? (rules.find((r) => r.proposalId === selectedProposal.id) ?? null)
    : null;
  const selectedRollback = selectedRule
    ? (rollbacks.find((r) => r.ruleId === selectedRule.id) ?? null)
    : null;
  const selectedApplications = selectedRule
    ? ruleApplicationsFromAudit(audit, selectedRule.id)
    : [];

  const runAction = async (label: string, action: () => Promise<unknown>): Promise<void> => {
    setBusy(true);
    try {
      await action();
      await invalidate(LEARNING_COLLECTIONS);
      toast(label, "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : `${label} — נכשל`, "danger");
    } finally {
      setBusy(false);
    }
  };

  const stores = learningStores();
  const engine = new ApprovalEngine({ stores: agentStores() });
  const me = LEARNING_DEMO_REVIEWER;

  const columns: DataTableColumn<LearningRow>[] = [
    { key: "title", header: "המלצה", render: (r) => r.recommendation.title },
    { key: "agent", header: "סוכן", render: (r) => r.agentNameHe },
    { key: "decision", header: "תגובת משתמש", render: (r) => r.decisionLabelHe },
    { key: "edit", header: "עריכה", render: (r) => r.editHe },
    { key: "outcome", header: "תוצאה נמדדת", render: (r) => r.outcomeDisplayHe },
    {
      key: "proposal",
      header: "תובנה מוצעת",
      render: (r) => (r.proposal ? r.proposal.proposedInsightHe.slice(0, 48) + "…" : "—"),
    },
    {
      key: "sample",
      header: "מדגם",
      numeric: true,
      render: (r) => (r.sampleSize === null ? "—" : <span className="os-num">{r.sampleSize}</span>),
    },
    {
      key: "contrary",
      header: "ראיות נגד",
      numeric: true,
      render: (r) =>
        r.contraryCount === null ? "—" : <span className="os-num">{r.contraryCount}</span>,
    },
    { key: "approver", header: "מאשר", render: (r) => r.approverDisplayHe },
    { key: "status", header: "סטטוס", render: (r) => r.statusHe },
  ];

  if (isError) {
    return (
      <EmptyState
        icon="alert"
        title="טעינת לולאת הלמידה נכשלה"
        reason="קריאת הנתונים מהמאגר המקומי נכשלה. רעננו את הדף."
      />
    );
  }
  if (isLoading) {
    return (
      <div style={{ padding: "var(--os-space-6)", color: "var(--os-text-2)" }} role="status">
        טוען את לולאת הלמידה מהמאגר המקומי…
      </div>
    );
  }

  return (
    <div style={stack("var(--os-space-5)")} data-testid="learning-page">
      <PageRail>
        {selectedProposal ? (
          <ProposalReviewPanel
            proposal={selectedProposal}
            evidence={evidence}
            rule={selectedRule}
            rollback={selectedRollback}
            applications={selectedApplications}
            currentUserId={me.id}
            busy={busy}
            onApprove={() =>
              void runAction("הכלל אושר והופעל — בפיקוח, ניתן לביטול", () =>
                approveProposal(
                  stores,
                  engine,
                  {
                    proposalId: selectedProposal.id,
                    decidedById: me.id,
                    decidedByName: me.name,
                  },
                  () => new Date().toISOString(),
                ),
              )
            }
            onReject={(reasonHe) =>
              void runAction("ההצעה נדחתה ונרשמה ביומן", () =>
                rejectProposal(
                  stores,
                  engine,
                  {
                    proposalId: selectedProposal.id,
                    decidedById: me.id,
                    decidedByName: me.name,
                    reasonHe,
                  },
                  () => new Date().toISOString(),
                ),
              )
            }
            onRollback={(reasonHe) =>
              void runAction("הכלל בוטל — יישומי העבר נשארים גלויים", () =>
                selectedRule
                  ? rollbackRule(
                      stores,
                      { ruleId: selectedRule.id, reasonHe, actorId: me.id, actorName: me.name },
                      () => new Date().toISOString(),
                    )
                  : Promise.resolve(null),
              )
            }
          />
        ) : (
          <div style={{ fontSize: "var(--os-text-sm, 13px)", color: "var(--os-text-2)" }}>
            אין תובנות מוצעות עדיין — הלולאה ממתינה לתצפיות נוספות.
          </div>
        )}
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
          <h1 style={{ margin: 0, fontSize: "var(--os-text-xl, 20px)" }}>מרכז למידה ושיפור</h1>
          <div style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-sm, 13px)" }}>
            לולאת למידה מנוהלת — אין למידה אוטונומית: כל כלל נכנס לתוקף רק לאחר אישור מנהל בשם,
            וניתן לביטול (rollback) בכל רגע
          </div>
        </div>
        <span style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-muted)" }}>
          נתוני הדגמה — נגזרים מרשומות אמיתיות
        </span>
      </div>

      {/* VC-E: four primary KPIs only — the governance state of the loop
          (what needs a manager, what is monitored, what is live, what was
          reverted). Zero stays neutral (0 is not attention). Passive history
          tallies move to "מדדים נוספים". */}
      <div
        data-testid="learning-metrics"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "var(--os-space-4)",
        }}
      >
        <KpiCard
          title="תובנות ממתינות לבדיקה"
          value={metrics.proposalsPending}
          accent="warning"
          icon="shield"
          muted={metrics.proposalsPending === 0}
        />
        <KpiCard
          title="במעקב (טרם נמדדו)"
          value={metrics.underReview}
          accent="warning"
          icon="clock"
          muted={metrics.underReview === 0}
        />
        <KpiCard
          title="כללים פעילים"
          value={metrics.activeRules}
          accent="blue"
          icon="book"
          muted={metrics.activeRules === 0}
        />
        <KpiCard
          title="ביטולים (rollback)"
          value={metrics.rollbackCount}
          accent="danger"
          icon="alert"
          muted={metrics.rollbackCount === 0}
        />
      </div>

      <details data-testid="learning-more-metrics" className="os-more-metrics">
        <summary>מדדים נוספים</summary>
        <div className="os-more-metrics__grid">
          <div className="os-more-metrics__item">
            <span>המלצות שאושרו</span>
            <span className="os-num">{metrics.approvedCount}</span>
          </div>
          <div className="os-more-metrics__item">
            <span>המלצות שנערכו</span>
            <span className="os-num">{metrics.editedCount}</span>
          </div>
          <div className="os-more-metrics__item">
            <span>המלצות שנדחו</span>
            <span className="os-num">{metrics.rejectedCount}</span>
          </div>
          <div className="os-more-metrics__item">
            <span>תוצאות שנמדדו</span>
            <span className="os-num">{metrics.measuredOutcomeDisplay}</span>
          </div>
        </div>
      </details>

      <Panel variant="panel" style={{ padding: "var(--os-space-5)" }}>
        <SectionTitle
          title="לולאת הלמידה המנוהלת"
          subtitle="כל שלב נספר מרשומות אמיתיות — אין שלב אוטומטי בין תובנה לכלל: רק אישור מנהל בשם"
          icon="network"
        />
        <div style={{ marginBlockStart: "var(--os-space-3)", overflowX: "auto" }}>
          <Stepper
            steps={steps.map((s) => ({ id: s.id, label: s.label, count: s.count }))}
            activeId="manager-approval"
          />
        </div>
      </Panel>

      <Panel variant="panel" style={{ padding: "var(--os-space-5)" }}>
        <SectionTitle
          title="המלצות ותובנות"
          subtitle="בחרו שורה כדי לבדוק את התובנה, הראיות והמגבלות ברייל"
          icon="book"
        />
        <div style={{ marginBlockStart: "var(--os-space-3)" }} data-testid="learning-table">
          <DataTable
            columns={columns}
            rows={rows}
            rowKey="id"
            onRowClick={(row) => {
              if (row.proposal) setSelectedProposalId(row.proposal.id);
            }}
            emptyText="אין המלצות במאגר"
            emptyReason="אוסף ההמלצות ריק — אפסו את נתוני ההדגמה."
          />
        </div>
      </Panel>

      <Panel variant="raised" style={{ padding: "var(--os-space-4)" }}>
        <div style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-muted)" }}>
          גבולות קשיחים: כלל למידה משפיע רק על דירוג, פעולה מוצעת, מבנה טיוטה, תזמון מעקב, משקול
          שליפת ידע וסדר פתרון תקלות. כלל לעולם אינו נוגע ב: {FORBIDDEN_RULE_AREAS_HE.join(" · ")}.
          אפקטיביות שלא נמדדה מוצגת "{LEARNING_UNMEASURED_HE}".
        </div>
      </Panel>
    </div>
  );
}
