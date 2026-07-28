// W8-B — /governance (Phases 8.4–8.6): the AI governance control center.
// 7 zones: active policies · human-AI boundaries · agent permissions ·
// prompt registry (checksums ONLY — protected text is never rendered) ·
// redacted audit explorer · risk register · incident management.
// PageRail hosts "מבקר הממשל" — deterministic findings over the real records.
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
  useToast,
  type DataTableColumn,
  type OsStatus,
} from "@/design-system";
import { PageRail } from "@/app/rail";
import { useCollection, useInvalidateCollections } from "@/app/data/hooks";
import type { Agent, Approval, AuditEvent, Evidence } from "@/domain/types";
import type { AgentEventRecord } from "@/domain/agents";
import type { LearningRule } from "@/domain/learning";
import {
  EMPTY_AUDIT_QUERY,
  PROMPT_PROTECTED_LABEL_HE,
  AUDIT_SEVERITIES,
  GOVERNANCE_RISK_SEVERITIES,
  RISK_TRANSITIONS,
  type AuditQuery,
  type AuditSeverity,
  type GovernanceIncident,
  type GovernancePolicy,
  type GovernancePolicyVersion,
  type GovernanceReview,
  type GovernanceRisk,
  type GovernanceRiskSeverity,
  type GovernanceRiskState,
  type PromptVersionRecord,
} from "@/domain/governance";
import { ApprovalEngine } from "@/agents";
import { agentStores } from "@/repositories/agentStores";
import { governanceStores } from "@/repositories/governanceStores";
import {
  approvePolicy,
  assignIncident,
  buildAuditExport,
  closeIncident,
  containIncident,
  deriveAuditItemDetail,
  deriveAuditSeverity,
  deriveBoundaryCategories,
  deriveModelConfiguration,
  derivePermissionMatrix,
  deriveProviderConfiguration,
  ensureGovernanceData,
  filterAuditEvents,
  openIncident,
  rejectPolicy,
  resolveIncident,
  reviewIncident,
  runGovernanceAuditor,
  submitPolicyForReview,
  transitionRisk,
  type GovernanceFinding,
} from "@/governance";
import { dateTimeHe } from "@/modules/quotations/fmt";
import { governanceMetrics, incidentRows, policyRows, riskRows } from "./lib";
import {
  closeHealthIncident,
  splitGovernanceIncidents,
} from "@/integration/wave8/healthIncidents";

const stack = (gap = "var(--os-space-4)"): CSSProperties => ({ display: "grid", gap });

const CURRENT_USER = { id: "u-tzachi", name: "צחי זוסטייהם" } as const;

const GOVERNANCE_COLLECTIONS = [
  "governancePolicies",
  "governancePolicyVersions",
  "governanceRisks",
  "governanceIncidents",
  "governanceReviews",
  "promptVersions",
  "approvals",
  "auditEvents",
  "agentEvents",
  "agents",
  "evidence",
  "learningRules",
] as const;

const POLICY_CHIP: Record<GovernancePolicy["status"], OsStatus> = {
  פעילה: "פעיל",
  "ממתין לבדיקה": "דורש אישור",
  טיוטה: "ממתין",
  בארכיון: "מושבת",
};

const RISK_CHIP: Record<GovernanceRiskState, OsStatus> = {
  פתוח: "אזהרה",
  בטיפול: "ממתין",
  התקבל: "מושהה",
  הופחת: "הושלם",
  נסגר: "מושבת",
  "נפתח מחדש": "אזהרה",
};

const INCIDENT_CHIP: Record<GovernanceIncident["status"], OsStatus> = {
  חדש: "אזהרה",
  בטיפול: "ממתין",
  מוכל: "דורש אישור",
  נפתר: "הושלם",
  בתחקיר: "דורש אישור",
  סגור: "מושבת",
};

function Field({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <div style={{ display: "grid", gap: 2, fontSize: "var(--os-text-sm, 13px)" }}>
      <span style={{ color: "var(--os-muted)", fontSize: "var(--os-text-2xs, 11px)" }}>{label}</span>
      <span>{children}</span>
    </div>
  );
}

const inputStyle: CSSProperties = {
  background: "var(--os-raised, #0A1627)",
  color: "var(--os-text)",
  border: "1px solid var(--os-border, rgba(112,158,220,.17))",
  borderRadius: 6,
  padding: "4px 8px",
  font: "inherit",
};

// ---------------------------------------------------------------------------
// contextual rail — "מבקר הממשל"
// ---------------------------------------------------------------------------

export function GovernanceAuditorRail({
  findings,
}: {
  findings: readonly GovernanceFinding[];
}): ReactElement {
  return (
    <div style={stack("var(--os-space-3)")} data-testid="governance-auditor-rail">
      <div style={{ fontWeight: 600, fontSize: "var(--os-text-md, 14px)" }}>מבקר הממשל</div>
      <div style={{ color: "var(--os-muted)", fontSize: "var(--os-text-2xs, 11px)" }}>
        בדיקות דטרמיניסטיות מעל הרשומות האמיתיות. רשימה ריקה = לא נמצא ממצא בבדיקות אלו — לא
        הוכחת היעדר בעיה.
      </div>
      {findings.length === 0 ? (
        <div style={{ fontSize: "var(--os-text-sm, 13px)", color: "var(--os-text-2)" }}>
          אין ממצאים פתוחים בבדיקות המבקר.
        </div>
      ) : (
        <ul style={{ margin: 0, paddingInlineStart: 16, display: "grid", gap: 6 }}>
          {findings.map((f) => (
            <li key={f.id} data-testid={`finding-${f.kind}`} style={{ fontSize: "var(--os-text-2xs, 11px)" }}>
              <span
                style={{
                  color:
                    f.severityHe === "חמור" ? "var(--danger-text)" : "var(--warning-text)",
                  fontWeight: 600,
                }}
              >
                {f.severityHe}
              </span>{" "}
              · <strong>{f.titleHe}</strong> — {f.detailHe}{" "}
              <span className="os-ltr" style={{ color: "var(--os-muted)" }}>
                {f.refs.join(" · ")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// the page
// ---------------------------------------------------------------------------

export default function GovernancePage(): ReactElement {
  const { toast } = useToast();
  const invalidate = useInvalidateCollections();
  const [seeded, setSeeded] = useState(false);
  const [busy, setBusy] = useState(false);

  const policiesQ = useCollection<GovernancePolicy>("governancePolicies");
  const versionsQ = useCollection<GovernancePolicyVersion>("governancePolicyVersions");
  const risksQ = useCollection<GovernanceRisk>("governanceRisks");
  const incidentsQ = useCollection<GovernanceIncident>("governanceIncidents");
  const reviewsQ = useCollection<GovernanceReview>("governanceReviews");
  const promptsQ = useCollection<PromptVersionRecord>("promptVersions");
  const approvalsQ = useCollection<Approval>("approvals");
  const auditQ = useCollection<AuditEvent>("auditEvents");
  const agentsQ = useCollection<Agent>("agents");
  const agentEventsQ = useCollection<AgentEventRecord>("agentEvents");
  const evidenceQ = useCollection<Evidence>("evidence");
  const rulesQ = useCollection<LearningRule>("learningRules");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await ensureGovernanceData();
      } finally {
        if (!cancelled) {
          setSeeded(true);
          await invalidate(GOVERNANCE_COLLECTIONS);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time idempotent boot
  }, []);

  const queries = [
    policiesQ,
    versionsQ,
    risksQ,
    incidentsQ,
    reviewsQ,
    promptsQ,
    approvalsQ,
    auditQ,
    agentsQ,
    agentEventsQ,
    evidenceQ,
    rulesQ,
  ];
  const isLoading = !seeded || queries.some((q) => q.isLoading);
  const isError = queries.some((q) => q.isError);

  const policies = policiesQ.data ?? [];
  const versions = versionsQ.data ?? [];
  const risks = risksQ.data ?? [];
  // W8-E (integration-requests-w8d #4): the collection also hosts /system-health
  // HealthIncident records (source:"system-health") — split so each shape
  // renders in its own honest section.
  const { governance: incidents, health: healthIncidents } = splitGovernanceIncidents(
    incidentsQ.data ?? [],
  );
  const reviews = reviewsQ.data ?? [];
  const prompts = promptsQ.data ?? [];
  const approvals = approvalsQ.data ?? [];
  const audit = auditQ.data ?? [];
  const agents = agentsQ.data ?? [];
  const agentEvents = agentEventsQ.data ?? [];
  const evidence = evidenceQ.data ?? [];
  const learningRules = rulesQ.data ?? [];

  // page-local state
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(null);
  const [policyReason, setPolicyReason] = useState("");
  const [query, setQuery] = useState<AuditQuery>(EMPTY_AUDIT_QUERY);
  const [selectedAuditId, setSelectedAuditId] = useState<string | null>(null);
  const [exportPreview, setExportPreview] = useState<string | null>(null);
  const [selectedRiskId, setSelectedRiskId] = useState<string | null>(null);
  const [riskTarget, setRiskTarget] = useState<GovernanceRiskState | "">("");
  const [riskReason, setRiskReason] = useState("");
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [incidentText, setIncidentText] = useState("");
  const [newIncidentTitle, setNewIncidentTitle] = useState("");
  const [newIncidentDesc, setNewIncidentDesc] = useState("");
  const [newIncidentSeverity, setNewIncidentSeverity] = useState<GovernanceRiskSeverity>("נמוכה");

  // derived, read-only views (definitions are the single source of truth).
  // demo-scale data — plain per-render derivation keeps the selectors honest.
  const matrix = derivePermissionMatrix(agents);
  const boundaries = deriveBoundaryCategories();
  const providers = deriveProviderConfiguration();
  const modelConfig = deriveModelConfiguration();

  const findings = runGovernanceAuditor({
    policies,
    promptVersions: prompts,
    risks,
    approvals,
    audit,
    evidence,
    learningRules,
    now: new Date().toISOString(),
  });

  const metrics = governanceMetrics({
    policies,
    risks,
    incidents,
    approvals,
    audit,
    promptVersions: prompts,
    findings,
  });

  const stores = governanceStores();
  const engine = new ApprovalEngine({ stores: agentStores() });
  const clock = () => new Date().toISOString();

  const runAction = async (label: string, action: () => Promise<unknown>): Promise<void> => {
    setBusy(true);
    try {
      await action();
      await invalidate(GOVERNANCE_COLLECTIONS);
      toast(label, "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : `${label} — נכשל`, "danger");
    } finally {
      setBusy(false);
    }
  };

  if (isError) {
    return (
      <EmptyState
        icon="alert"
        title="טעינת מרכז הממשל נכשלה"
        reason="קריאת הנתונים מהמאגר המקומי נכשלה. רעננו את הדף."
      />
    );
  }
  if (isLoading) {
    return (
      <div style={{ padding: "var(--os-space-6)", color: "var(--os-text-2)" }} role="status">
        טוען את מרכז הממשל מהמאגר המקומי…
      </div>
    );
  }

  // ---- zone 1 data
  const sortedPolicies = policyRows(policies);
  const selectedPolicy = sortedPolicies.find((p) => p.id === selectedPolicyId) ?? null;
  const selectedPolicyVersion = selectedPolicy
    ? (versions.find(
        (v) => v.policyId === selectedPolicy.id && v.version === selectedPolicy.currentVersion,
      ) ?? null)
    : null;

  const policyColumns: DataTableColumn<GovernancePolicy>[] = [
    { key: "title", header: "מדיניות", render: (p) => p.titleHe },
    {
      key: "version",
      header: "גרסה",
      numeric: true,
      render: (p) => <span className="os-num">v{p.currentVersion}</span>,
    },
    {
      key: "status",
      header: "סטטוס",
      render: (p) => <StatusChip status={POLICY_CHIP[p.status]} label={p.status} />,
    },
    { key: "owner", header: "בעלים", render: (p) => p.ownerName },
    { key: "approver", header: "מאשר", render: (p) => p.approvedByName ?? "—" },
    {
      key: "effective",
      header: "תחולה",
      render: (p) =>
        p.effectiveAt ? <span className="os-num">{dateTimeHe(p.effectiveAt)}</span> : "— עד אישור",
    },
    {
      key: "review",
      header: "בדיקה הבאה",
      render: (p) =>
        p.nextReviewAt ? <span className="os-num">{dateTimeHe(p.nextReviewAt)}</span> : "—",
    },
    {
      key: "affected",
      header: "סוכנים מושפעים",
      render: (p) => <span className="os-num">{p.affectedAgentIds.length}</span>,
    },
  ];

  // ---- zone 3 columns
  const matrixColumns: DataTableColumn<(typeof matrix)[number]>[] = [
    { key: "agent", header: "סוכן", render: (r) => `${r.nameHe} (${r.codeName})` },
    {
      key: "operations",
      header: "פעולות",
      render: (r) => <span className="os-ltr">{r.operations.join(" · ")}</span>,
    },
    {
      key: "domains",
      header: "תחומים מותרים",
      render: (r) => <span className="os-ltr">{r.allowedDomains.join(", ")}</span>,
    },
    { key: "tools", header: "כלים", render: (r) => r.tools.join(" · ") },
    {
      key: "limits",
      header: "מגבלות",
      render: (r) => (
        <span className="os-num">
          {Math.round(r.maxExecutionMs / 1000)}s · {r.maxUsageBudgetILS}₪ · עומק {r.maxTaskDepth}
        </span>
      ),
    },
    {
      key: "approval",
      header: "אישור נדרש",
      render: (r) => (r.approvalRequiredFor.length > 0 ? r.approvalRequiredFor.join(" · ") : "—"),
    },
    {
      key: "status",
      header: "מצב חירום",
      render: (r) =>
        r.runtimeStatus ? (
          <StatusChip
            status={r.runtimeStatus === "פעיל" ? "פעיל" : "מושהה"}
            label={r.runtimeStatus}
          />
        ) : (
          "לא נמצא ברשומות"
        ),
    },
  ];

  // ---- zone 4 columns
  const promptColumns: DataTableColumn<PromptVersionRecord>[] = [
    { key: "label", header: "פרומפט", render: (p) => p.labelHe },
    {
      key: "version",
      header: "גרסה",
      render: (p) => <span className="os-num">{p.version}</span>,
    },
    {
      key: "active",
      header: "פעיל",
      render: (p) => <StatusChip status={p.active ? "פעיל" : "מושבת"} />,
    },
    { key: "owner", header: "בעלים", render: (p) => p.ownerName },
    {
      key: "approval",
      header: "אישור",
      render: (p) =>
        p.approvalId ? <span className="os-ltr">{p.approvalId}</span> : "ללא אישור פורמלי",
    },
    {
      key: "checksum",
      header: "Checksum (SHA-256)",
      render: (p) => (
        <span className="os-ltr" style={{ fontSize: "var(--os-text-2xs, 11px)" }}>
          {p.checksumSha256.slice(0, 16)}…
        </span>
      ),
    },
    { key: "content", header: "תוכן", render: () => PROMPT_PROTECTED_LABEL_HE },
  ];

  // ---- zone 5 data
  const visibleAudit = filterAuditEvents(audit, query);
  const selectedAudit = visibleAudit.find((e) => e.id === selectedAuditId) ?? null;
  const auditDetail = selectedAudit
    ? deriveAuditItemDetail(selectedAudit, { allEvents: audit, approvals, evidence, agentEvents })
    : null;

  const auditColumns: DataTableColumn<AuditEvent>[] = [
    {
      key: "at",
      header: "מועד",
      render: (e) => <span className="os-num">{dateTimeHe(e.at)}</span>,
    },
    { key: "actor", header: "גורם", render: (e) => <span className="os-ltr">{e.actor}</span> },
    { key: "action", header: "פעולה", render: (e) => e.action },
    {
      key: "entity",
      header: "רשומה",
      render: (e) => <span className="os-ltr">{e.entityRef ?? "—"}</span>,
    },
    { key: "severity", header: "חומרה (נגזרת)", render: (e) => deriveAuditSeverity(e) },
    {
      key: "correlation",
      header: "Correlation",
      render: (e) => <span className="os-ltr">{e.correlationId ?? "—"}</span>,
    },
  ];

  // ---- zone 6 data
  const sortedRisks = riskRows(risks);
  const selectedRisk = sortedRisks.find((r) => r.id === selectedRiskId) ?? null;
  const riskColumns: DataTableColumn<GovernanceRisk>[] = [
    { key: "title", header: "סיכון", render: (r) => r.titleHe },
    { key: "severity", header: "חומרה", render: (r) => r.severity },
    {
      key: "status",
      header: "מצב",
      render: (r) => <StatusChip status={RISK_CHIP[r.status]} label={r.status} />,
    },
    { key: "owner", header: "בעלים", render: (r) => r.ownerName },
    {
      key: "controls",
      header: "בקרות",
      render: (r) => (r.controlIds.length > 0 ? <span className="os-ltr">{r.controlIds.join(", ")}</span> : "—"),
    },
    {
      key: "source",
      header: "מקור",
      render: (r) => <span className="os-ltr">{r.sourceRef ?? "—"}</span>,
    },
  ];

  // ---- zone 7 data
  const sortedIncidents = incidentRows(incidents);
  const selectedIncident = sortedIncidents.find((i) => i.id === selectedIncidentId) ?? null;
  const selectedIncidentReview = selectedIncident?.reviewId
    ? (reviews.find((r) => r.id === selectedIncident.reviewId) ?? null)
    : null;
  const incidentColumns: DataTableColumn<GovernanceIncident>[] = [
    { key: "title", header: "אירוע", render: (i) => i.titleHe },
    { key: "severity", header: "חומרה", render: (i) => i.severity },
    {
      key: "status",
      header: "מצב",
      render: (i) => <StatusChip status={INCIDENT_CHIP[i.status]} label={i.status} />,
    },
    { key: "assigned", header: "מטופל על ידי", render: (i) => i.assignedToName ?? "—" },
    {
      key: "opened",
      header: "נפתח",
      render: (i) => <span className="os-num">{dateTimeHe(i.openedAt)}</span>,
    },
    {
      key: "related",
      header: "אירועי ביקורת",
      render: (i) =>
        i.relatedAuditEventIds.length > 0 ? (
          <span className="os-ltr">{i.relatedAuditEventIds.join(", ")}</span>
        ) : (
          "—"
        ),
    },
  ];

  const allowedRiskTargets = selectedRisk ? RISK_TRANSITIONS[selectedRisk.status] : [];

  return (
    <div style={stack("var(--os-space-5)")} data-testid="governance-page">
      <PageRail>
        <GovernanceAuditorRail findings={findings} />
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
          <h1 style={{ margin: 0, fontSize: "var(--os-text-xl, 20px)" }}>ממשל ובקרת AI</h1>
          <div style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-sm, 13px)" }}>
            מדיניות, גבולות, הרשאות, פרומפטים, ביקורת, סיכונים ותקריות — הכול נגזר מהרשומות
            ומההגדרות הקפואות. אף מדיניות אינה מאושרת אוטומטית.
          </div>
        </div>
        <span style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-muted)" }}>
          נתוני הדגמה — נגזרים מרשומות אמיתיות
        </span>
      </div>

      {/* VC-E: four primary KPIs only (action-driving); zero stays neutral (0 is
          not success and not attention). Passive totals move to "מדדים נוספים". */}
      <div
        data-testid="governance-metrics"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "var(--os-space-4)",
        }}
      >
        <KpiCard
          title="מדיניויות ממתינות לבדיקה"
          value={metrics.pendingPolicies}
          accent="warning"
          icon="shield"
          muted={metrics.pendingPolicies === 0}
        />
        <KpiCard
          title="סיכונים הדורשים טיפול"
          value={metrics.openRisks}
          accent="warning"
          icon="alert"
          muted={metrics.openRisks === 0}
        />
        <KpiCard
          title="אירועים פתוחים"
          value={metrics.openIncidents}
          accent="danger"
          icon="alert"
          muted={metrics.openIncidents === 0}
        />
        <KpiCard
          title="פעולות ממשל ממתינות לאישור"
          value={metrics.pendingApprovals}
          accent="warning"
          icon="clock"
          muted={metrics.pendingApprovals === 0}
        />
      </div>

      <details data-testid="governance-more-metrics" className="os-more-metrics">
        <summary>מדדים נוספים</summary>
        <div className="os-more-metrics__grid">
          <div className="os-more-metrics__item">
            <span>מדיניות פעילה</span>
            <span className="os-num">{metrics.activePolicies}</span>
          </div>
          <div className="os-more-metrics__item">
            <span>טיוטות מדיניות</span>
            <span className="os-num">{metrics.draftPolicies}</span>
          </div>
          <div className="os-more-metrics__item">
            <span>אירועי ביקורת</span>
            <span className="os-num">{metrics.auditEvents}</span>
          </div>
          <div className="os-more-metrics__item">
            <span>ממצאי מבקר</span>
            <span className="os-num">{metrics.findings}</span>
          </div>
        </div>
      </details>

      {/* zone 1 — active policies */}
      <Panel variant="panel" style={{ padding: "var(--os-space-5)" }} data-testid="zone-policies">
        <SectionTitle
          title="מדיניות פעילה"
          subtitle='כל 10 המדיניות הקנוניות. מדיניות נכנסת לתוקף רק לאחר אישור בשם דרך מנוע האישורים — "— עד אישור" הוא מצב אמת, לא באג'
          icon="shield"
        />
        <div style={{ marginBlockStart: "var(--os-space-3)" }}>
          <DataTable
            columns={policyColumns}
            rows={sortedPolicies}
            rowKey="id"
            onRowClick={(p) => setSelectedPolicyId(p.id)}
            emptyText="אין מדיניות במאגר"
            emptyReason="ה-bootstrap טרם רץ — רעננו את הדף."
          />
        </div>
        {selectedPolicy && (
          <div
            style={{ ...stack("var(--os-space-3)"), marginBlockStart: "var(--os-space-4)" }}
            data-testid="policy-detail"
          >
            <Field label="מדיניות נבחרת">
              {selectedPolicy.titleHe} — {selectedPolicy.summaryHe}
            </Field>
            {selectedPolicyVersion && (
              <>
                <Field label={`תוכן גרסה v${selectedPolicyVersion.version} (append-only)`}>
                  <div style={stack("var(--os-space-2)")}>
                    {selectedPolicyVersion.sections.map((s) => (
                      <div key={s.headingHe}>
                        <strong>{s.headingHe}</strong>
                        <ul style={{ margin: 0, paddingInlineStart: 16 }}>
                          {s.bulletsHe.map((b) => (
                            <li key={b} style={{ fontSize: "var(--os-text-2xs, 11px)" }}>
                              {b}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </Field>
                <Field label="Checksum תוכן (SHA-256)">
                  <span className="os-ltr" style={{ fontSize: "var(--os-text-2xs, 11px)" }}>
                    {selectedPolicyVersion.checksumSha256}
                  </span>
                </Field>
              </>
            )}
            <Field label="סוכנים ופעולות מושפעים">
              <span className="os-ltr">{selectedPolicy.affectedAgentIds.join(" · ") || "—"}</span>
              {selectedPolicy.affectedOperations.length > 0 && (
                <> · {selectedPolicy.affectedOperations.join(" · ")}</>
              )}
            </Field>
            <label style={{ display: "grid", gap: 4, fontSize: "var(--os-text-2xs, 11px)" }}>
              <span style={{ color: "var(--os-muted)" }}>נימוק (חובה לדחייה)</span>
              <textarea
                data-testid="policy-reason"
                value={policyReason}
                onChange={(e) => setPolicyReason(e.target.value)}
                rows={2}
                style={{ ...inputStyle, resize: "vertical" }}
              />
            </label>
            <div style={{ display: "flex", gap: "var(--os-space-2)", flexWrap: "wrap" }}>
              {selectedPolicy.status === "טיוטה" && (
                <OsButton
                  size="sm"
                  data-testid="submit-policy"
                  onClick={() =>
                    void runAction("המדיניות הוגשה לבדיקה", () =>
                      submitPolicyForReview(
                        stores,
                        engine,
                        { policyId: selectedPolicy.id, requestedById: CURRENT_USER.id },
                        clock,
                      ),
                    )
                  }
                >
                  הגש לבדיקה
                </OsButton>
              )}
              {selectedPolicy.status === "ממתין לבדיקה" &&
                (busy ? (
                  <OsButton size="sm" disabled disabledReason="מעבד…">
                    אשר והפעל מדיניות
                  </OsButton>
                ) : (
                  <OsButton
                    size="sm"
                    variant="success"
                    data-testid="approve-policy"
                    onClick={() =>
                      void runAction("המדיניות אושרה והופעלה", () =>
                        approvePolicy(
                          stores,
                          engine,
                          {
                            policyId: selectedPolicy.id,
                            decidedById: CURRENT_USER.id,
                            decidedByName: CURRENT_USER.name,
                          },
                          clock,
                        ),
                      )
                    }
                  >
                    אשר והפעל מדיניות
                  </OsButton>
                ))}
              {selectedPolicy.status === "ממתין לבדיקה" &&
                (busy || policyReason.trim() === "" ? (
                  <OsButton
                    size="sm"
                    variant="danger"
                    disabled
                    disabledReason={busy ? "מעבד…" : "דחייה מחייבת נימוק"}
                    data-testid="reject-policy"
                  >
                    דחה
                  </OsButton>
                ) : (
                  <OsButton
                    size="sm"
                    variant="danger"
                    data-testid="reject-policy"
                    onClick={() =>
                      void runAction("המדיניות נדחתה וחזרה לטיוטה", () =>
                        rejectPolicy(
                          stores,
                          engine,
                          {
                            policyId: selectedPolicy.id,
                            decidedById: CURRENT_USER.id,
                            decidedByName: CURRENT_USER.name,
                            reasonHe: policyReason.trim(),
                          },
                          clock,
                        ),
                      )
                    }
                  >
                    דחה
                  </OsButton>
                ))}
            </div>
          </div>
        )}
      </Panel>

      {/* zone 2 — human-AI boundaries */}
      <Panel variant="panel" style={{ padding: "var(--os-space-5)" }} data-testid="zone-boundaries">
        <SectionTitle
          title="גבולות אדם-AI"
          subtitle="4 קטגוריות הפעולה — נגזרות מ-AUTONOMOUS_OPERATIONS, מ-12 פעולות האישור ומהאיסורים הקשיחים בהגדרות הקפואות"
          icon="network"
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "var(--os-space-3)",
            marginBlockStart: "var(--os-space-3)",
          }}
        >
          {boundaries.map((cat) => (
            <Panel key={cat.key} variant="raised" style={{ padding: "var(--os-space-4)" }}>
              <div style={{ fontWeight: 600, fontSize: "var(--os-text-sm, 13px)" }}>{cat.titleHe}</div>
              <div style={{ color: "var(--os-muted)", fontSize: "var(--os-text-2xs, 11px)" }}>
                {cat.descriptionHe}
              </div>
              <ul style={{ margin: "6px 0 0", paddingInlineStart: 16 }}>
                {cat.items.map((item) => (
                  <li key={item} style={{ fontSize: "var(--os-text-2xs, 11px)" }}>
                    {item}
                  </li>
                ))}
              </ul>
              <div
                className="os-ltr"
                style={{ marginBlockStart: 6, color: "var(--os-muted)", fontSize: "var(--os-text-2xs, 10px)" }}
              >
                {cat.sourceRef}
              </div>
            </Panel>
          ))}
        </div>
      </Panel>

      {/* zone 3 — agent permissions */}
      <Panel variant="panel" style={{ padding: "var(--os-space-5)" }} data-testid="zone-permissions">
        <SectionTitle
          title="הרשאות סוכנים"
          subtitle="מטריצה נגזרת (קריאה בלבד) מ-AGENT_DEFINITIONS הקפואות + מצב ריצה חי מאוסף הסוכנים — אין שכפול ידני"
          icon="shield"
        />
        <div style={{ marginBlockStart: "var(--os-space-3)", overflowX: "auto" }}>
          <DataTable
            columns={matrixColumns}
            rows={matrix.map((m) => ({ ...m, id: m.agentId }))}
            rowKey="id"
            emptyText="אין הגדרות סוכנים"
            emptyReason="AGENT_DEFINITIONS ריקות — מצב בלתי אפשרי."
          />
        </div>
        <div style={{ marginBlockStart: "var(--os-space-3)", ...stack("var(--os-space-2)") }}>
          <Field label="תצורת ספקים (אמת)">
            {providers.map((p) => (
              <div key={p.providerId} style={{ fontSize: "var(--os-text-2xs, 11px)" }}>
                <StatusChip status={p.enabled ? "פעיל" : "מושבת"} label={`${p.displayNameHe} — ${p.statusHe}`} />{" "}
                {p.noteHe}
              </div>
            ))}
          </Field>
          <Field label="תצורת מודלים">
            <ul style={{ margin: 0, paddingInlineStart: 16 }}>
              {modelConfig.map((m) => (
                <li key={m.key} style={{ fontSize: "var(--os-text-2xs, 11px)" }}>
                  {m.labelHe}: {m.valueHe}{" "}
                  <span className="os-ltr" style={{ color: "var(--os-muted)" }}>
                    ({m.sourceRef})
                  </span>
                </li>
              ))}
            </ul>
          </Field>
        </div>
      </Panel>

      {/* zone 4 — prompt registry */}
      <Panel variant="panel" style={{ padding: "var(--os-space-5)" }} data-testid="zone-prompts">
        <SectionTitle
          title="Prompt Registry"
          subtitle={`גרסאות + checksums + מצב אישור. הטקסט המוגן לעולם אינו מוצג — ${PROMPT_PROTECTED_LABEL_HE}`}
          icon="book"
        />
        <div style={{ marginBlockStart: "var(--os-space-3)", overflowX: "auto" }}>
          <DataTable
            columns={promptColumns}
            rows={prompts}
            rowKey="id"
            emptyText="אין גרסאות פרומפט"
            emptyReason="ה-bootstrap טרם רץ."
          />
        </div>
      </Panel>

      {/* zone 5 — audit explorer */}
      <Panel variant="panel" style={{ padding: "var(--os-space-5)" }} data-testid="zone-audit">
        <SectionTitle
          title="Audit Explorer"
          subtitle="סינון לפי גורם/פעולה/רשומה/אישור/חומרה/תאריך/Correlation — הייצוא תמיד redacted, ללא סודות וללא payload מלא"
          icon="search"
        />
        <div
          style={{
            display: "flex",
            gap: "var(--os-space-2)",
            flexWrap: "wrap",
            marginBlockStart: "var(--os-space-3)",
            alignItems: "end",
          }}
        >
          <label style={{ display: "grid", gap: 2, fontSize: "var(--os-text-2xs, 11px)" }}>
            <span style={{ color: "var(--os-muted)" }}>טקסט חופשי</span>
            <input
              data-testid="audit-free-text"
              value={query.freeText ?? ""}
              onChange={(e) => setQuery({ ...query, freeText: e.target.value || null })}
              style={inputStyle}
            />
          </label>
          <label style={{ display: "grid", gap: 2, fontSize: "var(--os-text-2xs, 11px)" }}>
            <span style={{ color: "var(--os-muted)" }}>גורם (actor)</span>
            <input
              data-testid="audit-actor"
              value={query.actor ?? ""}
              onChange={(e) => setQuery({ ...query, actor: e.target.value || null })}
              style={inputStyle}
              dir="ltr"
            />
          </label>
          <label style={{ display: "grid", gap: 2, fontSize: "var(--os-text-2xs, 11px)" }}>
            <span style={{ color: "var(--os-muted)" }}>קידומת פעולה</span>
            <input
              data-testid="audit-operation"
              value={query.operation ?? ""}
              onChange={(e) => setQuery({ ...query, operation: e.target.value || null })}
              style={inputStyle}
              dir="ltr"
            />
          </label>
          <label style={{ display: "grid", gap: 2, fontSize: "var(--os-text-2xs, 11px)" }}>
            <span style={{ color: "var(--os-muted)" }}>Correlation ID</span>
            <input
              data-testid="audit-correlation"
              value={query.correlationId ?? ""}
              onChange={(e) => setQuery({ ...query, correlationId: e.target.value || null })}
              style={inputStyle}
              dir="ltr"
            />
          </label>
          <label style={{ display: "grid", gap: 2, fontSize: "var(--os-text-2xs, 11px)" }}>
            <span style={{ color: "var(--os-muted)" }}>חומרה נגזרת</span>
            <select
              data-testid="audit-severity"
              value={query.severity ?? ""}
              onChange={(e) =>
                setQuery({ ...query, severity: (e.target.value || null) as AuditSeverity | null })
              }
              style={inputStyle}
            >
              <option value="">הכול</option>
              {AUDIT_SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label
            style={{ display: "flex", gap: 4, alignItems: "center", fontSize: "var(--os-text-2xs, 11px)" }}
          >
            <input
              type="checkbox"
              data-testid="audit-approvals-only"
              checked={query.approvalsOnly}
              onChange={(e) => setQuery({ ...query, approvalsOnly: e.target.checked })}
            />
            אישורים בלבד
          </label>
          <OsButton
            size="sm"
            data-testid="audit-export"
            onClick={() => {
              const exported = buildAuditExport(audit, query, new Date().toISOString());
              setExportPreview(JSON.stringify(exported, null, 2));
              toast(`ייצוא redacted הוכן — ${exported.totalMatched} אירועים`, "success");
            }}
          >
            ייצוא (redacted)
          </OsButton>
        </div>
        <div style={{ marginBlockStart: "var(--os-space-3)", overflowX: "auto" }}>
          <DataTable
            columns={auditColumns}
            rows={visibleAudit}
            rowKey="id"
            onRowClick={(e) => setSelectedAuditId(e.id)}
            emptyText="אין אירועי ביקורת תואמים"
            emptyReason="הסינון הנוכחי לא החזיר תוצאות."
          />
        </div>
        {auditDetail && (
          <div
            style={{ ...stack("var(--os-space-2)"), marginBlockStart: "var(--os-space-4)" }}
            data-testid="audit-detail"
          >
            <Field label="אירוע נבחר">
              {auditDetail.event.action} · {auditDetail.event.details}
            </Field>
            <Field label="גורם">
              {auditDetail.actorKind} · <span className="os-ltr">{auditDetail.event.actor}</span>
            </Field>
            <Field label="רשומה מושפעת">
              <span className="os-ltr">{auditDetail.affectedRef ?? "—"}</span>
            </Field>
            <Field label="לפני / אחרי">
              {auditDetail.beforeAfterHe ?? "אין סיכום לפני/אחרי זמין לרשומה זו"}
            </Field>
            <Field label={`ראיות (${auditDetail.evidence.length})`}>
              {auditDetail.evidence.length === 0 ? (
                "לא נמצאו רשומות ראיה"
              ) : (
                <ul style={{ margin: 0, paddingInlineStart: 16 }}>
                  {auditDetail.evidence.map((ev) => (
                    <li key={ev.id} style={{ fontSize: "var(--os-text-2xs, 11px)" }}>
                      <span className="os-ltr">{ev.sourceRef}</span> — {ev.claim}
                    </li>
                  ))}
                </ul>
              )}
            </Field>
            <Field label="אישור מקושר">
              {auditDetail.approval
                ? `${auditDetail.approval.id} · ${auditDetail.approval.status} · ${auditDetail.approval.note}`
                : "—"}
            </Field>
            <Field label={`שרשרת Correlation (${auditDetail.chain.length})`}>
              {auditDetail.chain.length === 0 ? (
                "אין שרשרת — לאירוע אין correlationId"
              ) : (
                <ol style={{ margin: 0, paddingInlineStart: 16 }}>
                  {auditDetail.chain.map((e) => (
                    <li key={e.id} style={{ fontSize: "var(--os-text-2xs, 11px)" }}>
                      <span className="os-num">{dateTimeHe(e.at)}</span> · {e.action} —{" "}
                      {e.details.slice(0, 80)}
                    </li>
                  ))}
                </ol>
              )}
            </Field>
          </div>
        )}
        {exportPreview && (
          <div style={{ marginBlockStart: "var(--os-space-3)" }} data-testid="audit-export-preview">
            <Field label="תצוגת ייצוא (redacted)">
              <pre
                dir="ltr"
                style={{
                  maxHeight: 220,
                  overflow: "auto",
                  background: "var(--os-raised, #0A1627)",
                  padding: 8,
                  borderRadius: 6,
                  fontSize: "var(--os-text-2xs, 10px)",
                }}
              >
                {exportPreview}
              </pre>
            </Field>
          </div>
        )}
      </Panel>

      {/* zone 6 — risk register */}
      <Panel variant="panel" style={{ padding: "var(--os-space-5)" }} data-testid="zone-risks">
        <SectionTitle
          title="Risk Register"
          subtitle="10 הסיכונים הקנוניים — כולם נפתחו במצב פתוח עם בעלים בשם; כל מעבר מצב מחייב נימוק ונרשם ביומן"
          icon="alert"
        />
        <div style={{ marginBlockStart: "var(--os-space-3)", overflowX: "auto" }}>
          <DataTable
            columns={riskColumns}
            rows={sortedRisks}
            rowKey="id"
            onRowClick={(r) => {
              setSelectedRiskId(r.id);
              setRiskTarget("");
            }}
            emptyText="אין סיכונים במאגר"
            emptyReason="ה-bootstrap טרם רץ."
          />
        </div>
        {selectedRisk && (
          <div
            style={{ ...stack("var(--os-space-2)"), marginBlockStart: "var(--os-space-4)" }}
            data-testid="risk-detail"
          >
            <Field label="סיכון נבחר">
              {selectedRisk.titleHe} — {selectedRisk.descriptionHe}
            </Field>
            <Field label="היסטוריית מצבים">
              {selectedRisk.history.length === 0 ? (
                "ללא מעברים — הסיכון במצבו ההתחלתי"
              ) : (
                <ol style={{ margin: 0, paddingInlineStart: 16 }}>
                  {selectedRisk.history.map((h, i) => (
                    <li key={`${h.at}-${i}`} style={{ fontSize: "var(--os-text-2xs, 11px)" }}>
                      {h.from} ← {h.to} · {h.byName} · {h.reasonHe}
                    </li>
                  ))}
                </ol>
              )}
            </Field>
            <div style={{ display: "flex", gap: "var(--os-space-2)", flexWrap: "wrap", alignItems: "end" }}>
              <label style={{ display: "grid", gap: 2, fontSize: "var(--os-text-2xs, 11px)" }}>
                <span style={{ color: "var(--os-muted)" }}>מעבר למצב</span>
                <select
                  data-testid="risk-target"
                  value={riskTarget}
                  onChange={(e) => setRiskTarget(e.target.value as GovernanceRiskState | "")}
                  style={inputStyle}
                >
                  <option value="">בחרו…</option>
                  {allowedRiskTargets.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: "grid", gap: 2, fontSize: "var(--os-text-2xs, 11px)" }}>
                <span style={{ color: "var(--os-muted)" }}>נימוק (חובה)</span>
                <input
                  data-testid="risk-reason"
                  value={riskReason}
                  onChange={(e) => setRiskReason(e.target.value)}
                  style={inputStyle}
                />
              </label>
              {busy || riskTarget === "" || riskReason.trim() === "" ? (
                <OsButton
                  size="sm"
                  disabled
                  disabledReason={busy ? "מעבד…" : "בחרו מצב יעד ונימוק"}
                  data-testid="risk-transition"
                >
                  בצע מעבר
                </OsButton>
              ) : (
                <OsButton
                  size="sm"
                  data-testid="risk-transition"
                  onClick={() =>
                    void runAction("מצב הסיכון עודכן ונרשם ביומן", () =>
                      transitionRisk(
                        stores,
                        {
                          riskId: selectedRisk.id,
                          to: riskTarget as GovernanceRiskState,
                          byId: CURRENT_USER.id,
                          byName: CURRENT_USER.name,
                          reasonHe: riskReason.trim(),
                          mitigationHe: riskReason.trim(),
                        },
                        clock,
                      ),
                    )
                  }
                >
                  בצע מעבר
                </OsButton>
              )}
            </div>
          </div>
        )}
      </Panel>

      {/* zone 7 — incident management */}
      <Panel variant="panel" style={{ padding: "var(--os-space-5)" }} data-testid="zone-incidents">
        <SectionTitle
          title="ניהול תקריות"
          subtitle="פתיחה → הקצאה → הכלה → פתרון → תחקיר → סגירה. סגירה מחייבת תחקיר — אין סגירה ללא הפקת לקחים"
          icon="alert"
        />
        <div
          style={{
            display: "flex",
            gap: "var(--os-space-2)",
            flexWrap: "wrap",
            alignItems: "end",
            marginBlockStart: "var(--os-space-3)",
          }}
        >
          <label style={{ display: "grid", gap: 2, fontSize: "var(--os-text-2xs, 11px)" }}>
            <span style={{ color: "var(--os-muted)" }}>כותרת אירוע חדש</span>
            <input
              data-testid="incident-title"
              value={newIncidentTitle}
              onChange={(e) => setNewIncidentTitle(e.target.value)}
              style={inputStyle}
            />
          </label>
          <label style={{ display: "grid", gap: 2, fontSize: "var(--os-text-2xs, 11px)" }}>
            <span style={{ color: "var(--os-muted)" }}>תיאור</span>
            <input
              data-testid="incident-desc"
              value={newIncidentDesc}
              onChange={(e) => setNewIncidentDesc(e.target.value)}
              style={inputStyle}
            />
          </label>
          <label style={{ display: "grid", gap: 2, fontSize: "var(--os-text-2xs, 11px)" }}>
            <span style={{ color: "var(--os-muted)" }}>חומרה</span>
            <select
              data-testid="incident-severity"
              value={newIncidentSeverity}
              onChange={(e) => setNewIncidentSeverity(e.target.value as GovernanceRiskSeverity)}
              style={inputStyle}
            >
              {GOVERNANCE_RISK_SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          {busy || newIncidentTitle.trim() === "" || newIncidentDesc.trim() === "" ? (
            <OsButton
              size="sm"
              disabled
              disabledReason={busy ? "מעבד…" : "אירוע מחייב כותרת ותיאור"}
              data-testid="incident-open"
            >
              פתח אירוע
            </OsButton>
          ) : (
            <OsButton
              size="sm"
              data-testid="incident-open"
              onClick={() =>
                void runAction("האירוע נפתח ונרשם ביומן", async () => {
                  await openIncident(
                    stores,
                    {
                      titleHe: newIncidentTitle.trim(),
                      descriptionHe: newIncidentDesc.trim(),
                      severity: newIncidentSeverity,
                      reportedById: CURRENT_USER.id,
                      reportedByName: CURRENT_USER.name,
                    },
                    clock,
                  );
                  setNewIncidentTitle("");
                  setNewIncidentDesc("");
                })
              }
            >
              פתח אירוע
            </OsButton>
          )}
        </div>
        <div style={{ marginBlockStart: "var(--os-space-3)", overflowX: "auto" }}>
          <DataTable
            columns={incidentColumns}
            rows={sortedIncidents}
            rowKey="id"
            onRowClick={(i) => setSelectedIncidentId(i.id)}
            emptyText="אין תקריות"
            emptyReason="לא נפתחו אירועי ממשל."
          />
        </div>
        {selectedIncident && (
          <div
            style={{ ...stack("var(--os-space-2)"), marginBlockStart: "var(--os-space-4)" }}
            data-testid="incident-detail"
          >
            <Field label="אירוע נבחר">
              {selectedIncident.titleHe} — {selectedIncident.descriptionHe}
            </Field>
            <Field label="הכלה / פתרון">
              {selectedIncident.containmentHe ?? "טרם הוכל"} ·{" "}
              {selectedIncident.resolutionHe ?? "טרם נפתר"}
            </Field>
            {selectedIncidentReview && (
              <Field label="תחקיר">
                {selectedIncidentReview.summaryHe} · פעולות המשך:{" "}
                {selectedIncidentReview.followUpsHe.join(" · ") || "—"}
              </Field>
            )}
            <label style={{ display: "grid", gap: 4, fontSize: "var(--os-text-2xs, 11px)" }}>
              <span style={{ color: "var(--os-muted)" }}>
                טקסט פעולה (הכלה / פתרון / סיכום תחקיר)
              </span>
              <textarea
                data-testid="incident-text"
                value={incidentText}
                onChange={(e) => setIncidentText(e.target.value)}
                rows={2}
                style={{ ...inputStyle, resize: "vertical" }}
              />
            </label>
            <div style={{ display: "flex", gap: "var(--os-space-2)", flexWrap: "wrap" }}>
              {(selectedIncident.status === "חדש" || selectedIncident.assignedToId === null) &&
                selectedIncident.status !== "סגור" && (
                  <OsButton
                    size="sm"
                    data-testid="incident-assign"
                    onClick={() =>
                      void runAction("האירוע הוקצה", () =>
                        assignIncident(
                          stores,
                          {
                            incidentId: selectedIncident.id,
                            assignedToId: CURRENT_USER.id,
                            assignedToName: CURRENT_USER.name,
                            byId: CURRENT_USER.id,
                          },
                          clock,
                        ),
                      )
                    }
                  >
                    הקצה אליי
                  </OsButton>
                )}
              {selectedIncident.status === "בטיפול" &&
                (incidentText.trim() === "" ? (
                  <OsButton size="sm" disabled disabledReason="הכלה מחייבת תיאור" data-testid="incident-contain">
                    סמן כמוכל
                  </OsButton>
                ) : (
                  <OsButton
                    size="sm"
                    data-testid="incident-contain"
                    onClick={() =>
                      void runAction("האירוע הוכל", () =>
                        containIncident(
                          stores,
                          {
                            incidentId: selectedIncident.id,
                            containmentHe: incidentText.trim(),
                            byId: CURRENT_USER.id,
                          },
                          clock,
                        ),
                      )
                    }
                  >
                    סמן כמוכל
                  </OsButton>
                ))}
              {selectedIncident.status === "מוכל" &&
                (incidentText.trim() === "" ? (
                  <OsButton size="sm" disabled disabledReason="פתרון מחייב תיאור" data-testid="incident-resolve">
                    סמן כנפתר
                  </OsButton>
                ) : (
                  <OsButton
                    size="sm"
                    data-testid="incident-resolve"
                    onClick={() =>
                      void runAction("האירוע נפתר", () =>
                        resolveIncident(
                          stores,
                          {
                            incidentId: selectedIncident.id,
                            resolutionHe: incidentText.trim(),
                            byId: CURRENT_USER.id,
                          },
                          clock,
                        ),
                      )
                    }
                  >
                    סמן כנפתר
                  </OsButton>
                ))}
              {selectedIncident.status === "נפתר" &&
                (incidentText.trim() === "" ? (
                  <OsButton size="sm" disabled disabledReason="תחקיר מחייב סיכום" data-testid="incident-review">
                    בצע תחקיר
                  </OsButton>
                ) : (
                  <OsButton
                    size="sm"
                    data-testid="incident-review"
                    onClick={() =>
                      void runAction("התחקיר נרשם", () =>
                        reviewIncident(
                          stores,
                          {
                            incidentId: selectedIncident.id,
                            reviewerId: CURRENT_USER.id,
                            reviewerName: CURRENT_USER.name,
                            summaryHe: incidentText.trim(),
                            findingsHe: [incidentText.trim()],
                            followUpsHe: [],
                          },
                          clock,
                        ),
                      )
                    }
                  >
                    בצע תחקיר
                  </OsButton>
                ))}
              {selectedIncident.status === "בתחקיר" && (
                <OsButton
                  size="sm"
                  variant="success"
                  data-testid="incident-close"
                  onClick={() =>
                    void runAction("האירוע נסגר לאחר תחקיר", () =>
                      closeIncident(
                        stores,
                        {
                          incidentId: selectedIncident.id,
                          byId: CURRENT_USER.id,
                          byName: CURRENT_USER.name,
                        },
                        clock,
                      ),
                    )
                  }
                >
                  סגור אירוע
                </OsButton>
              )}
              {selectedIncident.status === "סגור" && (
                <OsButton size="sm" disabled disabledReason="האירוע סגור — אין פעולות נוספות">
                  האירוע סגור
                </OsButton>
              )}
            </div>
          </div>
        )}

        {/* W8-E — system-health incidents (source:"system-health", W8-D writer) */}
        <div
          style={{ ...stack("var(--os-space-2)"), marginBlockStart: "var(--os-space-4)" }}
          data-testid="zone-health-incidents"
        >
          <SectionTitle
            title="אירועי בריאות המערכת"
            subtitle="רשומות שנפתחו מעמוד בריאות המערכת (source: system-health) — סגירה נרשמת ביומן הביקורת"
            icon="alert"
          />
          {healthIncidents.length === 0 ? (
            <div style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-muted)" }}>
              לא נפתחו אירועי בריאות — עמוד בריאות המערכת פותח אירוע רק מרכיב במצב הדורש טיפול
            </div>
          ) : (
            healthIncidents.map((hi) => (
              <div
                key={hi.id}
                data-testid="health-incident-row"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "var(--os-space-3)",
                  border: "1px solid var(--os-border)",
                  borderRadius: "var(--os-radius-sm, 6px)",
                  paddingBlock: "var(--os-space-2)",
                  paddingInline: "var(--os-space-3)",
                  fontSize: "var(--os-text-sm, 13px)",
                }}
              >
                <div style={{ display: "grid", gap: 2 }}>
                  <span>{hi.titleHe}</span>
                  <span style={{ color: "var(--os-muted)", fontSize: "var(--os-text-2xs, 11px)" }}>
                    {hi.descriptionHe}
                  </span>
                </div>
                <div style={{ display: "flex", gap: "var(--os-space-2)", alignItems: "center" }}>
                  <StatusChip
                    status={hi.status === "פתוח" ? "אזהרה" : "מושבת"}
                    label={hi.status}
                  />
                  {hi.status === "פתוח" &&
                    (busy ? (
                      <OsButton size="sm" disabled disabledReason="הפעולה נשמרת…">
                        סגור אירוע
                      </OsButton>
                    ) : (
                      <OsButton
                        size="sm"
                        data-testid="health-incident-close"
                        onClick={() =>
                          void runAction("אירוע הבריאות נסגר", () =>
                            closeHealthIncident(
                              stores,
                              {
                                incidentId: hi.id,
                                byId: CURRENT_USER.id,
                                byName: CURRENT_USER.name,
                              },
                              clock,
                            ),
                          )
                        }
                      >
                        סגור אירוע
                      </OsButton>
                    ))}
                </div>
              </div>
            ))
          )}
        </div>
      </Panel>

      <Panel variant="raised" style={{ padding: "var(--os-space-4)" }}>
        <div style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-muted)" }}>
          עקרונות קשיחים: אף מדיניות אינה מאושרת אוטומטית — הפעלה רק דרך מנוע האישורים הקנוני
          ובשם; גרסאות מדיניות ופרומפטים הן append-only (עדכון/מחיקה נחסמים במאגר); טקסט פרומפט
          מוגן לעולם אינו נשמר או מוצג — {PROMPT_PROTECTED_LABEL_HE}; ייצוא ביקורת תמיד redacted.
        </div>
      </Panel>
    </div>
  );
}
