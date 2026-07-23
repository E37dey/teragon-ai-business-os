// /submission — מרכז ההגשה והראיות (Wave 7, W7-E, spec chapter 19).
// Header "מוכנות להגשה" (derived — NEVER green while a blocker exists),
// 12 deliverable cards, the 12×8 quality matrix of REAL validator results,
// docs/QA references, build-state note, and the "מבקר ההגשה" rail.
// Print: ?print=1 or the print button renders the A4 print view (7.20).
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { PageRail } from "@/app/rail";
import { useCollection, useInvalidateCollections } from "@/app/data/hooks";
import {
  EmptyState,
  OsButton,
  Panel,
  SectionTitle,
  StatusChip,
  Tabs,
} from "@/design-system";
import type { OsStatus } from "@/design-system";
import type {
  Activity,
  Approval,
  Document,
  Enrollment,
  Lead,
  MemoryRecord,
  MetricDefinition,
  MetricObservation,
  Persona,
  Quotation,
  ServiceTicket,
  StageGate,
  SupportRequest,
  TrainingMaterial,
  User,
} from "@/domain/types";
import type { KnowledgeArticleV2 } from "@/domain/knowledge";
import { bridgePersonas } from "@/domain/personas";
import {
  ensureCanonicalMaterials,
  ensureCanonicalObjections,
  upgradeMaterials,
  type ObjectionRecord,
  type TrainingMaterialV2,
} from "@/domain/training-materials";
import {
  CANONICAL_STAGE_GATES,
  isStageGateV2,
  StageGateService,
  validateGate,
  type GateWithValidation,
  type StageGateContext,
  type W7RecordLike,
} from "@/domain/stage-gates";
import { stageGateStores } from "@/repositories/stageGateStores";
import { implementationStores } from "@/repositories/implementationStores";
import { ensureImplementationProgramme } from "@/domain/adoption";
import {
  buildAuditFindings,
  buildSupportArtefact,
  createSubmissionSnapshot,
  evaluateAllDeliverables,
  metricBoard,
  METRIC_GROUP_TITLES,
  ONE_PAGER,
  overallReadiness,
  type DeliverableEvaluation,
  type MetricGroupKey,
  type PresentationSectionLike,
  type PresenterNoteLike,
  type SubmissionAuditFinding,
  type SubmissionSources,
} from "@/domain/submission";
import {
  persistQualityResults,
  QUALITY_CRITERIA,
  qualitySummary,
  runQualityValidation,
  type QualityValidationResult,
} from "@/validation/submission/qualityValidator";
import { CEO_USER_ID, DEMO_DATA_LABEL } from "@/repositories/seed";
import { SUBMISSION_PRINT_CSS, SubmissionPrintView } from "./printView";

type TabId = "deliverables" | "quality" | "metrics" | "support" | "one-pager";

const INVALIDATE_KEYS = [
  "stageGates",
  "objections",
  "trainingMaterials",
  "implementationProgrammes",
  "implementationStages",
] as const;

let bootstrapInFlight: Promise<unknown> | null = null;

const STATE_TONE: Record<string, OsStatus> = {
  מלא: "הושלם",
  "ממתין לבדיקה": "ממתין",
  חלקי: "אזהרה",
  חסר: "חסום",
  חסום: "חסום",
  "פג תוקף": "מושהה",
};

export default function SubmissionPage(): ReactElement {
  const [searchParams] = useSearchParams();
  const printMode = searchParams.get("print") === "1";
  const [tab, setTab] = useState<TabId>("deliverables");
  const [persistNote, setPersistNote] = useState<string | null>(null);
  const invalidate = useInvalidateCollections();

  const usersQ = useCollection<User>("users");
  const personasQ = useCollection<Persona>("personas");
  const materialsQ = useCollection<TrainingMaterial>("trainingMaterials");
  const objectionsQ = useCollection<ObjectionRecord>("objections");
  const approvalsQ = useCollection<Approval>("approvals");
  const quotationsQ = useCollection<Quotation>("quotations");
  const ticketsQ = useCollection<ServiceTicket>("serviceTickets");
  const activitiesQ = useCollection<Activity>("activities");
  const leadsQ = useCollection<Lead>("leads");
  const enrollmentsQ = useCollection<Enrollment>("enrollments");
  const supportQ = useCollection<SupportRequest>("supportRequests");
  const metricDefsQ = useCollection<MetricDefinition>("metricDefinitions");
  const metricObsQ = useCollection<MetricObservation>("metricObservations");
  const programmesQ = useCollection("implementationProgrammes");
  const presenterNotesQ = useCollection<PresenterNoteLike>("presenterNotes");
  const presentationSectionsQ = useCollection<PresentationSectionLike>("presentationSections");
  const gatesQ = useCollection<StageGate>("stageGates");
  const memoryQ = useCollection<MemoryRecord>("memoryRecords");
  const articlesQ = useCollection<KnowledgeArticleV2>("knowledgeArticles");
  const documentsQ = useCollection<Document>("documents");
  const implEvidenceQ = useCollection<W7RecordLike>("implementationEvidence");
  const pilotDefsQ = useCollection<W7RecordLike>("pilotDefinitions");
  const pilotResultsQ = useCollection<W7RecordLike>("pilotResults");
  const rolloutWavesQ = useCollection<W7RecordLike>("rolloutWaves");

  // idempotent bootstraps of the sibling domains (bridge, objections,
  // canonical materials, implementation programme) — each safe to re-run
  useEffect(() => {
    let cancelled = false;
    bootstrapInFlight ??= Promise.allSettled([
      new StageGateService({ stores: stageGateStores() }).ensureBridge(),
      ensureCanonicalObjections(),
      ensureCanonicalMaterials(),
      ensureImplementationProgramme(implementationStores()),
    ]).finally(() => {
      bootstrapInFlight = null;
    });
    void bootstrapInFlight.then(() => {
      if (!cancelled) void invalidate([...INVALIDATE_KEYS]);
    });
    return () => {
      cancelled = true;
    };
  }, [invalidate]);

  const nowISO = useMemo(() => new Date().toISOString(), []);

  const loading = usersQ.isLoading || personasQ.isLoading || materialsQ.isLoading;
  const error = usersQ.isError || personasQ.isError || materialsQ.isError;

  // stage-gate validations — CONSUMED from the W7-C deterministic validator
  const gateValidations: readonly GateWithValidation[] | null = useMemo(() => {
    const all = gatesQ.data ?? [];
    const sgCtx: StageGateContext = {
      personas: personasQ.data ?? [],
      trainingMaterials: materialsQ.data ?? [],
      metricDefinitions: metricDefsQ.data ?? [],
      metricObservations: metricObsQ.data ?? [],
      memoryRecords: memoryQ.data ?? [],
      knowledgeArticles: articlesQ.data ?? [],
      documents: documentsQ.data ?? [],
      implementationEvidence: implEvidenceQ.data ?? [],
      pilotDefinitions: pilotDefsQ.data ?? [],
      pilotResults: pilotResultsQ.data ?? [],
      rolloutWaves: rolloutWavesQ.data ?? [],
      users: usersQ.data ?? [],
    };
    const rows: GateWithValidation[] = [];
    for (const def of CANONICAL_STAGE_GATES) {
      const gate = all.find((g) => g.id === def.legacyId);
      if (!gate || !isStageGateV2(gate)) return null; // bridge not run yet — honest
      rows.push({ gate, def, validation: validateGate(gate, def, sgCtx, nowISO) });
    }
    return rows;
  }, [
    gatesQ.data,
    personasQ.data,
    materialsQ.data,
    metricDefsQ.data,
    metricObsQ.data,
    memoryQ.data,
    articlesQ.data,
    documentsQ.data,
    implEvidenceQ.data,
    pilotDefsQ.data,
    pilotResultsQ.data,
    rolloutWavesQ.data,
    usersQ.data,
    nowISO,
  ]);

  const sources: SubmissionSources = useMemo(() => {
    const materialsV2 = upgradeMaterials(
      (materialsQ.data ?? []) as TrainingMaterialV2[],
    ).materials;
    return {
      users: usersQ.data ?? [],
      personas: bridgePersonas(personasQ.data ?? []).personas,
      materials: materialsV2,
      objections: objectionsQ.data ?? [],
      approvals: approvalsQ.data ?? [],
      programmes: programmesQ.data ?? [],
      gateValidations,
      presenterNotes: presenterNotesQ.data ?? [],
      presentationSections: presentationSectionsQ.data ?? [],
      supportRequests: supportQ.data ?? [],
      quotations: quotationsQ.data ?? [],
      serviceTickets: ticketsQ.data ?? [],
      activities: activitiesQ.data ?? [],
      leads: leadsQ.data ?? [],
      enrollments: enrollmentsQ.data ?? [],
      metricDefinitions: metricDefsQ.data ?? [],
      metricObservations: metricObsQ.data ?? [],
      nowISO,
    };
  }, [
    usersQ.data,
    personasQ.data,
    materialsQ.data,
    objectionsQ.data,
    approvalsQ.data,
    programmesQ.data,
    gateValidations,
    presenterNotesQ.data,
    presentationSectionsQ.data,
    supportQ.data,
    quotationsQ.data,
    ticketsQ.data,
    activitiesQ.data,
    leadsQ.data,
    enrollmentsQ.data,
    metricDefsQ.data,
    metricObsQ.data,
    nowISO,
  ]);

  const quality = useMemo(() => runQualityValidation(sources), [sources]);
  const evaluations = useMemo(
    () => evaluateAllDeliverables(sources, quality),
    [sources, quality],
  );
  const findings = useMemo(
    () => buildAuditFindings(sources, evaluations),
    [sources, evaluations],
  );
  const readiness = useMemo(
    () => overallReadiness(evaluations, findings),
    [evaluations, findings],
  );
  const summary = useMemo(() => qualitySummary(quality), [quality]);
  const blockerCount = findings.filter((f) => f.severity === "חוסם").length;

  if (error) {
    return (
      <EmptyState
        icon="alert"
        title="שגיאה בטעינת מרכז ההגשה"
        reason="קריאת ה-repositories נכשלה — נסו לרענן את הדף."
      />
    );
  }
  if (loading) {
    return <div className="os-route-loading" aria-busy="true" />;
  }

  if (printMode) {
    return (
      <div>
        <style>{SUBMISSION_PRINT_CSS}</style>
        <div className="sub-no-print" style={{ marginBlockEnd: 12, display: "flex", gap: 8 }}>
          <OsButton size="sm" icon="doc" onClick={() => window.print()}>
            הדפסה / שמירה כ-PDF
          </OsButton>
          <Link to="/submission" style={{ color: "var(--os-cyan)", alignSelf: "center" }}>
            חזרה לתצוגת המסך
          </Link>
        </div>
        <SubmissionPrintView evaluations={evaluations} dateISO={nowISO} />
      </div>
    );
  }

  const completeCount = evaluations.filter((e) => e.state === "מלא").length;

  return (
    <div style={{ display: "grid", gap: "var(--os-space-6)" }}>
      <style>{SUBMISSION_PRINT_CSS}</style>
      <PageRail>
        <SubmissionRail findings={findings} />
      </PageRail>

      <SectionTitle
        icon="evidence"
        title="מרכז ההגשה והראיות"
        subtitle={DEMO_DATA_LABEL}
        action={
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <StatusChip
              status={readiness === "מוכן להגשה" ? "הושלם" : readiness === "בהכנה" ? "אזהרה" : "חסום"}
              label={`מוכנות להגשה: ${readiness}`}
            />
            <Link to="/submission?print=1">
              <OsButton size="sm" variant="ghost" icon="doc">
                תצוגת הדפסה A4
              </OsButton>
            </Link>
            <OsButton
              size="sm"
              variant="ghost"
              icon="check"
              onClick={() => {
                void persistQualityResults(quality).then((n) => {
                  setPersistNote(`${n} תוצאות בדיקה נשמרו ל-qualityValidations`);
                  void invalidate(["qualityValidations"]);
                });
              }}
            >
              שמירת תוצאות הבדיקה
            </OsButton>
            <OsButton
              size="sm"
              variant="ghost"
              icon="target"
              onClick={() => {
                void createSubmissionSnapshot({
                  evaluations,
                  quality,
                  readiness,
                  blockerCount,
                  takenById: CEO_USER_ID,
                }).then((snap) => {
                  setPersistNote(`Snapshot ${snap.id} נשמר (${snap.takenAt.slice(0, 16)})`);
                  void invalidate(["submissionSnapshots"]);
                });
              }}
            >
              צילום מצב
            </OsButton>
          </div>
        }
      />

      <Panel style={{ padding: "var(--os-space-4)" }}>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: "var(--os-text-sm)", color: "var(--os-text-2)" }}>
          <span>
            תוצרים מלאים: <span className="os-num">{completeCount}</span>/<span className="os-num">12</span>{" "}
            (מצב כן — אין 12/12 מאולץ)
          </span>
          <span>
            איכות: <span className="os-num">{summary.pass}</span> עוברים ·{" "}
            <span className="os-num">{summary.warning}</span> אזהרות ·{" "}
            <span className="os-num">{summary.fail}</span> כשלים ·{" "}
            <span className="os-num">{summary.notApplicable}</span> לא רלוונטי
          </span>
          <span>
            חוסמים פתוחים: <span className="os-num">{blockerCount}</span>
          </span>
          {persistNote ? <span style={{ color: "var(--os-cyan)" }}>{persistNote}</span> : null}
        </div>
      </Panel>

      <Tabs
        ariaLabel="תצוגות מרכז ההגשה"
        items={[
          { id: "deliverables", label: "12 התוצרים" },
          { id: "quality", label: "מטריצת איכות 12×8" },
          { id: "metrics", label: "מדדים — 3 רמות" },
          { id: "support", label: "תמיכה Tier-3" },
          { id: "one-pager", label: "One-Pager" },
        ]}
        activeId={tab}
        onChange={(id) => setTab(id as TabId)}
      />

      {tab === "deliverables" ? <DeliverablesGrid evaluations={evaluations} /> : null}
      {tab === "quality" ? <QualityMatrix quality={quality} /> : null}
      {tab === "metrics" ? <MetricsBoard sources={sources} /> : null}
      {tab === "support" ? <SupportArtefactView sources={sources} /> : null}
      {tab === "one-pager" ? <OnePagerView /> : null}

      <DocsAndBuildPanel />
    </div>
  );
}

// ── deliverable cards ───────────────────────────────────────────────────────

function DeliverablesGrid({
  evaluations,
}: {
  evaluations: readonly DeliverableEvaluation[];
}): ReactElement {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
        gap: "var(--os-space-4)",
      }}
    >
      {evaluations.map((ev) => (
        <Panel key={ev.key} style={{ padding: "var(--os-space-4)", display: "grid", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <strong style={{ color: "var(--os-text-1)" }}>
              {ev.order}. {ev.title}
            </strong>
            <StatusChip status={STATE_TONE[ev.state] ?? "ממתין"} label={ev.state} />
          </div>
          <div style={{ fontSize: "var(--os-text-xs)", color: "var(--os-text-2)", display: "grid", gap: 4 }}>
            <span>בעלים: {ev.ownerNameHe ?? "לא הוקצה אחראי"}</span>
            <span>אישור: {ev.approvalStatusHe}</span>
            <span>מצגת: {ev.presentationStatusHe}</span>
            <span>
              מסך תפעולי:{" "}
              <Link to={ev.route} style={{ color: "var(--os-cyan)" }}>
                {ev.route}
              </Link>{" "}
              · <Link to="/submission?print=1" style={{ color: "var(--os-cyan)" }}>הדפסה</Link>
            </span>
          </div>
          <div style={{ fontSize: "var(--os-text-xs)", color: "var(--os-text-2)" }}>
            {ev.evidence.map((e) => (
              <div key={e.label}>
                {e.resolved ? "✓" : "✕"} {e.label} — {e.statusHe}
              </div>
            ))}
          </div>
          {ev.stateReasonsHe.length > 0 ? (
            <ul style={{ margin: 0, paddingInlineStart: 16, fontSize: "var(--os-text-xs)", color: "var(--os-amber, #E8B93E)" }}>
              {ev.stateReasonsHe.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          ) : null}
        </Panel>
      ))}
    </div>
  );
}

// ── 12×8 quality matrix ─────────────────────────────────────────────────────

const CELL_GLYPH: Record<string, string> = {
  pass: "✓",
  warning: "⚠",
  fail: "✕",
  not_applicable: "—",
};

const CELL_COLOR: Record<string, string> = {
  pass: "var(--os-green, #3ECF8E)",
  warning: "var(--os-amber, #E8B93E)",
  fail: "var(--os-red, #E85C5C)",
  not_applicable: "var(--os-text-3, #6B7A90)",
};

function QualityMatrix({
  quality,
}: {
  quality: readonly QualityValidationResult[];
}): ReactElement {
  const keys = [...new Set(quality.map((q) => q.deliverableKey))];
  const cellStyle: CSSProperties = {
    border: "1px solid var(--os-border, #22304a)",
    padding: "4px 8px",
    textAlign: "center",
  };
  return (
    <Panel style={{ padding: "var(--os-space-4)", overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", fontSize: "var(--os-text-xs)", inlineSize: "100%" }}>
        <thead>
          <tr>
            <th style={{ ...cellStyle, textAlign: "right" }}>תוצר</th>
            {QUALITY_CRITERIA.map((c) => (
              <th key={c} style={cellStyle}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => (
            <tr key={k}>
              <td style={{ ...cellStyle, textAlign: "right", color: "var(--os-text-1)" }}>{k}</td>
              {QUALITY_CRITERIA.map((c) => {
                const r = quality.find((q) => q.deliverableKey === k && q.criterion === c);
                return (
                  <td
                    key={c}
                    style={{ ...cellStyle, color: CELL_COLOR[r?.state ?? "not_applicable"] }}
                    title={r ? `${r.reasonHe}${r.recommendedFixHe ? ` · תיקון: ${r.recommendedFixHe}` : ""}` : ""}
                  >
                    {CELL_GLYPH[r?.state ?? "not_applicable"]}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ fontSize: "var(--os-text-xs)", color: "var(--os-text-2)", marginBlockEnd: 0 }}>
        תוצאות אמת של הוולידטור הדטרמיניסטי (גרסה נבדקת) — אזהרות וכשלים הם המצב הכן, לא תקלה.
        ריחוף על תא מציג את הנימוק המלא.
      </p>
    </Panel>
  );
}

// ── metrics board (3 levels) ────────────────────────────────────────────────

function MetricsBoard({ sources }: { sources: SubmissionSources }): ReactElement {
  const board = useMemo(
    () =>
      metricBoard({
        leads: sources.leads,
        activities: sources.activities,
        quotations: sources.quotations,
        serviceTickets: sources.serviceTickets,
        approvals: sources.approvals,
        supportRequests: sources.supportRequests,
        enrollments: sources.enrollments,
        metricObservations: sources.metricObservations,
        nowMs: Date.parse(sources.nowISO),
      }),
    [sources],
  );
  const groups: MetricGroupKey[] = ["A", "B", "C"];
  return (
    <div style={{ display: "grid", gap: "var(--os-space-4)" }}>
      {groups.map((g) => (
        <Panel key={g} style={{ padding: "var(--os-space-4)" }}>
          <h3 style={{ margin: "0 0 8px", color: "var(--os-text-1)", fontSize: "var(--os-text-md)" }}>
            {METRIC_GROUP_TITLES[g]}
          </h3>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", fontSize: "var(--os-text-xs)", inlineSize: "100%" }}>
              <thead>
                <tr style={{ color: "var(--os-text-2)", textAlign: "right" }}>
                  <th style={{ padding: 4 }}>מדד</th>
                  <th style={{ padding: 4 }}>סוג</th>
                  <th style={{ padding: 4 }}>מקור</th>
                  <th style={{ padding: 4 }}>תקופה</th>
                  <th style={{ padding: 4 }}>קו בסיס</th>
                  <th style={{ padding: 4 }}>יעד (לא מדידה)</th>
                  <th style={{ padding: 4 }}>נמדד עכשיו</th>
                  <th style={{ padding: 4 }}>בעלים</th>
                </tr>
              </thead>
              <tbody>
                {board[g].map(({ def, measurement, baselineHe, currentHe }) => (
                  <tr key={def.key} style={{ borderBlockStart: "1px solid var(--os-border, #22304a)" }}>
                    <td style={{ padding: 4, color: "var(--os-text-1)" }} title={`${def.definitionHe}${def.limitationsHe.length ? ` · מגבלות: ${def.limitationsHe.join(" · ")}` : ""}`}>
                      {def.nameHe}
                    </td>
                    <td style={{ padding: 4 }}>{def.type}</td>
                    <td style={{ padding: 4 }}>{def.sourceHe}</td>
                    <td style={{ padding: 4 }}>{def.periodHe}</td>
                    <td style={{ padding: 4 }}>{baselineHe}</td>
                    <td style={{ padding: 4 }}>{def.targetHe ?? "—"}</td>
                    <td style={{ padding: 4, color: measurement ? "var(--os-green, #3ECF8E)" : "var(--os-text-3, #6B7A90)" }} title={measurement?.methodHe ?? "טרם נמדד"}>
                      {currentHe}
                    </td>
                    <td style={{ padding: 4 }}>{def.ownerId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ))}
      <p style={{ fontSize: "var(--os-text-xs)", color: "var(--os-text-2)", margin: 0 }}>
        יעד מוצג תמיד בעמודה נפרדת ולעולם לא כערך מדוד. "טרם נמדד" ו"לא הוגדר קו בסיס" הם מצבים
        כנים — אף מספר דונור לא יובא כמדידה.
      </p>
    </div>
  );
}

// ── support artefact ────────────────────────────────────────────────────────

function SupportArtefactView({ sources }: { sources: SubmissionSources }): ReactElement {
  const artefact = useMemo(
    () => buildSupportArtefact(sources.supportRequests, Date.parse(sources.nowISO)),
    [sources],
  );
  return (
    <div style={{ display: "grid", gap: "var(--os-space-4)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "var(--os-space-4)" }}>
        {artefact.tiers.map((t) => {
          const m = artefact.measured.find((x) => x.tier === t.tier);
          return (
            <Panel key={t.tier} style={{ padding: "var(--os-space-4)", display: "grid", gap: 6 }}>
              <strong style={{ color: "var(--os-text-1)" }}>{t.titleHe}</strong>
              <span style={{ fontSize: "var(--os-text-xs)", color: "var(--os-text-2)" }}>{t.audienceHe}</span>
              <span style={{ fontSize: "var(--os-text-xs)", color: "var(--os-text-2)" }}>
                ערוצים: {t.channelsHe.join(" · ")}
              </span>
              <span style={{ fontSize: "var(--os-text-sm)" }}>
                SLA יעד: <strong>{t.targetSlaHe}</strong>
              </span>
              <span style={{ fontSize: "var(--os-text-sm)", color: m?.medianResolutionHours === null || m === undefined ? "var(--os-text-3, #6B7A90)" : "var(--os-green, #3ECF8E)" }}>
                SLA מדוד: {m?.measuredHe ?? "טרם נמדד"}
              </span>
              <span style={{ fontSize: "var(--os-text-xs)", color: "var(--os-text-2)" }}>
                פתוחות: <span className="os-num">{m?.openCount ?? 0}</span> · אסקלציה:{" "}
                {t.escalatesToTier === null ? "שכבה אחרונה" : `Tier ${t.escalatesToTier}`}
              </span>
            </Panel>
          );
        })}
      </div>
      <Panel style={{ padding: "var(--os-space-4)", display: "grid", gap: 6 }}>
        <strong style={{ color: "var(--os-text-1)" }}>שגרת רענון ותחזוקה</strong>
        {artefact.refreshCadenceHe.map((c) => (
          <span key={c} style={{ fontSize: "var(--os-text-xs)", color: "var(--os-text-2)" }}>
            • {c}
          </span>
        ))}
        <span style={{ fontSize: "var(--os-text-xs)", color: "var(--os-text-2)" }}>
          נושאים חוזרים (מזוהים דטרמיניסטית):{" "}
          {artefact.recurring.length === 0
            ? "אין נושא חוזר ב-30 הימים האחרונים"
            : artefact.recurring.map((r) => `${r.category} (${r.count})`).join(" · ")}
        </span>
        <span style={{ fontSize: "var(--os-text-xs)" }}>
          {artefact.links.map((l) => (
            <Link key={l.route} to={l.route} style={{ color: "var(--os-cyan)", marginInlineEnd: 12 }}>
              {l.labelHe}
            </Link>
          ))}
        </span>
      </Panel>
    </div>
  );
}

// ── one-pager view ──────────────────────────────────────────────────────────

function OnePagerView(): ReactElement {
  return (
    <Panel style={{ padding: "var(--os-space-5)", display: "grid", gap: "var(--os-space-4)" }}>
      <h3 style={{ margin: 0, color: "var(--os-text-1)" }}>{ONE_PAGER.title}</h3>
      <div>
        <strong style={{ color: "var(--os-text-1)" }}>הבעיה העסקית</strong>
        <ul style={{ margin: "6px 0", paddingInlineStart: 18, color: "var(--os-text-2)", fontSize: "var(--os-text-sm)" }}>
          {ONE_PAGER.businessProblemHe.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </div>
      <div>
        <strong style={{ color: "var(--os-text-1)" }}>הפתרון</strong>
        <ul style={{ margin: "6px 0", paddingInlineStart: 18, color: "var(--os-text-2)", fontSize: "var(--os-text-sm)" }}>
          {ONE_PAGER.solutionHe.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </div>
      <div>
        <strong style={{ color: "var(--os-text-1)" }}>ערך — כל טענה מסומנת-סוג</strong>
        <ul style={{ margin: "6px 0", paddingInlineStart: 18, color: "var(--os-text-2)", fontSize: "var(--os-text-sm)" }}>
          {ONE_PAGER.valueClaims.map((c) => (
            <li key={c.claimHe}>
              <StatusChip status={c.kindHe === "עיקרון" ? "הושלם" : "ממתין"} label={c.kindHe} /> {c.claimHe}{" "}
              <span style={{ color: "var(--os-text-3, #6B7A90)" }}>({c.basisHe})</span>
            </li>
          ))}
        </ul>
      </div>
      <p style={{ margin: 0, fontSize: "var(--os-text-xs)", color: "var(--os-text-3, #6B7A90)" }}>
        {ONE_PAGER.honestyNoteHe}
      </p>
    </Panel>
  );
}

// ── docs / QA / build panel ─────────────────────────────────────────────────

function DocsAndBuildPanel(): ReactElement {
  return (
    <Panel style={{ padding: "var(--os-space-4)", display: "grid", gap: 4 }}>
      <strong style={{ color: "var(--os-text-1)", fontSize: "var(--os-text-sm)" }}>
        צילומי מסך, דוחות QA ומצב Build
      </strong>
      <span style={{ fontSize: "var(--os-text-xs)", color: "var(--os-text-2)" }}>
        דוחות הגל: docs/WAVE_7_BASELINE.md · docs/WAVE_7_CONTRADICTION_REPORT.md ·
        docs/SUBMISSION_GUIDE.md · צילומי מסך ודוח QA ויזואלי ייווצרו בסגירת הגל
        (docs/WAVE_7_VISUAL_QA) — עד אז מוצג כאן בכנות שאין צילומים מתועדים.
      </span>
      <span style={{ fontSize: "var(--os-text-xs)", color: "var(--os-text-2)" }}>
        מצב Build: נבדק בשערי הגל (oxlint / tsc / vitest / build) בזמן הפיתוח — אין ניטור Build חי
        בדפדפן, ולכן לא מוצג כאן סטטוס "ירוק" בזמן אמת.
      </span>
    </Panel>
  );
}

// ── rail — "מבקר ההגשה" ─────────────────────────────────────────────────────

function SubmissionRail({
  findings,
}: {
  findings: readonly SubmissionAuditFinding[];
}): ReactElement {
  const navigate = useNavigate();
  const blockers = findings.filter((f) => f.severity === "חוסם");
  const warnings = findings.filter((f) => f.severity === "אזהרה");
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <strong style={{ color: "var(--os-text-1)", fontSize: "var(--os-text-sm)" }}>מבקר ההגשה</strong>
      <span style={{ fontSize: "var(--os-text-xs)", color: "var(--os-text-2)" }}>
        <span className="os-num">{blockers.length}</span> חוסמים ·{" "}
        <span className="os-num">{warnings.length}</span> אזהרות — לחיצה פותחת את היעד
      </span>
      {findings.length === 0 ? (
        <span style={{ fontSize: "var(--os-text-xs)", color: "var(--os-green, #3ECF8E)" }}>
          אין ממצאים פתוחים
        </span>
      ) : (
        [...blockers, ...warnings].map((f) => (
          <button
            key={`${f.kind}-${f.titleHe}`}
            type="button"
            onClick={() => navigate(f.targetRoute)}
            style={{
              textAlign: "right",
              background: "transparent",
              border: "1px solid var(--os-border, #22304a)",
              borderRadius: 8,
              padding: "6px 8px",
              cursor: "pointer",
              color: "var(--os-text-2)",
              display: "grid",
              gap: 2,
            }}
          >
            <span style={{ color: f.severity === "חוסם" ? "var(--os-red, #E85C5C)" : "var(--os-amber, #E8B93E)", fontSize: "var(--os-text-xs)", fontWeight: 600 }}>
              {f.severity} · {f.titleHe}
            </span>
            <span style={{ fontSize: "var(--os-text-xs)" }}>{f.detailHe}</span>
          </button>
        ))
      )}
    </div>
  );
}
