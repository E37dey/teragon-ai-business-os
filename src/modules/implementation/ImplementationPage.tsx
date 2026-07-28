// /implementation — תכנית ההטמעה (Wave 7, W7-A, Phase 7.2).
// TOP: programme health + current stage · CENTER: six-stage RTL roadmap
// (canonical adoption stages, Lead decision C4) with per-stage Drawer
// (סקירה/תוצרים/ראיות/סיכונים/החלטות/היסטוריה — real records, honest empty
// states) · BOTTOM: pure-SVG Gantt timeline + the 5 rollout waves ·
// AS-IS/TO-BE map (Phase 7.3) with app/presentation views + print stylesheet.
// PageRail "מבקר ההטמעה" — every figure DERIVED from records; missing data
// shows "טרם נמדד" / "חסרות ראיות" / "לא הוגדר קו בסיס", never an invention.
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactElement, ReactNode } from "react";
import { PageRail } from "@/app/rail";
import { useCollection, useInvalidateCollections } from "@/app/data/hooks";
import {
  Drawer,
  EmptyState,
  KpiCard,
  OsButton,
  Panel,
  SectionTitle,
  StatusChip,
  Tabs,
  type OsStatus,
} from "@/design-system";
import type { AuditEvent, User } from "@/domain/types";
import type {
  AdoptionStage,
  AdoptionStageStatus,
  GoNoGoState,
  ImplementationDecision,
  ImplementationEvidence,
  ImplementationMilestone,
  ImplementationProgramme,
  ImplementationRisk,
  PilotDefinition,
  PilotResult,
  RolloutWave,
} from "@/domain/adoption/types";
import {
  MISSING_EVIDENCE_HE,
  STAGE_TO_SUBMISSION_DELIVERABLES,
  UNMEASURED_HE,
  blockingRisk,
  missingEvidence,
  nextDecision,
  nextRequiredAction,
  overdueMilestones,
  pilotReadiness,
  programmeHealth,
  stageGoNoGo,
} from "@/domain/adoption/selectors";
import { resolveEvidence, type EvidenceWithEligibility } from "@/domain/adoption/decisions";
import { ensureImplementationProgramme, PROGRAMME_ID } from "@/domain/adoption/bootstrap";
import { stageNameMismatches } from "@/domain/adoption/stageBridge";
import { implementationStores } from "@/repositories/implementationStores";
import type { CollectionKey } from "@/repositories/collections";
import { AsIsToBe, type AsIsToBeView } from "./AsIsToBe";

const INVALIDATE_KEYS: CollectionKey[] = [
  "implementationProgrammes",
  "implementationMilestones",
  "implementationRisks",
  "implementationEvidence",
  "implementationDecisions",
  "rolloutWaves",
  "pilotDefinitions",
  "pilotResults",
  "implementationStages",
];

// module-level single-flight guard (same pattern as /knowledge, W6-F defect #1)
let bootstrapOnce: ReturnType<typeof ensureImplementationProgramme> | null = null;

const STAGE_STATUS_CHIP: Record<AdoptionStageStatus, OsStatus> = {
  "לא התחיל": "מושבת",
  בתהליך: "פעיל",
  הושלם: "הושלם",
};

const GO_NO_GO_CHIP: Record<GoNoGoState, OsStatus> = {
  Go: "הושלם",
  "No-Go": "חסום",
  ממתין: "ממתין",
};

const kpiRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: "var(--os-space-5)",
};

const stageGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: "var(--os-space-5)",
};

function num(value: string): ReactElement {
  return (
    <span className="os-num" dir="ltr">
      {value}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Gantt (pure SVG — derived from the stage plan dates)
// ---------------------------------------------------------------------------

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

function GanttTimeline({
  programme,
  waves,
}: {
  programme: ImplementationProgramme;
  waves: RolloutWave[];
}): ReactElement {
  const width = 1000;
  const labelW = 250;
  const rowH = 30;
  const start = programme.startDate;
  const totalDays = Math.max(daysBetween(start, programme.targetEndDate), 1);
  const chartW = width - labelW - 20;
  const x = (iso: string): number =>
    labelW + (Math.min(Math.max(daysBetween(start, iso), 0), totalDays) / totalDays) * chartW;
  const rows = programme.stages;
  const wavesWithStart = waves.filter((w) => w.plannedStart !== null);
  const height = rows.length * rowH + 30 + (wavesWithStart.length > 0 ? rowH : 0);
  const statusColor: Record<AdoptionStageStatus, string> = {
    הושלם: "var(--os-success, #21C981)",
    בתהליך: "var(--os-cyan, #20C4E8)",
    "לא התחיל": "var(--os-text-muted, #65758B)",
  };
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="ציר זמן — תכנית ההטמעה (תאריכי יעד, לא עובדות)"
      style={{ width: "100%", height: "auto", direction: "ltr" }}
      data-testid="implementation-gantt"
    >
      {rows.map((s, i) => {
        const y = 20 + i * rowH;
        const bx = x(s.startPlanned);
        const bw = Math.max(x(s.targetDate) - bx, 4);
        return (
          <g key={s.id}>
            <text
              x={width - 4}
              y={y + 15}
              textAnchor="end"
              fontSize={12}
              fill="var(--os-text-2)"
              direction="rtl"
            >
              {s.order}. {s.name}
            </text>
            <rect
              x={bx}
              y={y + 4}
              width={bw}
              height={rowH - 12}
              rx={4}
              fill={statusColor[s.status]}
              opacity={s.status === "לא התחיל" ? 0.35 : 0.8}
            />
          </g>
        );
      })}
      {wavesWithStart.map((w) => {
        const wx = x(w.plannedStart ?? start);
        const y = 20 + rows.length * rowH + 8;
        return (
          <g key={w.id}>
            <circle cx={wx} cy={y + 6} r={5} fill="var(--os-violet, #7655FF)" />
            <text
              x={wx}
              y={y + 24}
              textAnchor="middle"
              fontSize={10}
              fill="var(--os-text-muted, #65758B)"
            >
              {w.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// stage drawer
// ---------------------------------------------------------------------------

const DRAWER_TABS = [
  { id: "overview", label: "סקירה" },
  { id: "deliverables", label: "תוצרים" },
  { id: "evidence", label: "ראיות" },
  { id: "risks", label: "סיכונים" },
  { id: "decisions", label: "החלטות" },
  { id: "history", label: "היסטוריה" },
] as const;

function Line({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <div style={{ display: "flex", gap: 8, marginBlock: 6 }}>
      <span style={{ color: "var(--os-text-muted)", minInlineSize: 110 }}>{label}</span>
      <span>{children}</span>
    </div>
  );
}

function StageDrawer({
  stage,
  ownerName,
  evidence,
  risks,
  decision,
  audit,
  onClose,
}: {
  stage: AdoptionStage;
  ownerName: string;
  evidence: EvidenceWithEligibility[];
  risks: ImplementationRisk[];
  decision: ImplementationDecision | null;
  audit: AuditEvent[];
  onClose: () => void;
}): ReactElement {
  const [tab, setTab] = useState<string>("overview");
  const go = decision?.decision ?? null;
  return (
    <Drawer open onClose={onClose} title={`שלב ${stage.order} — ${stage.name}`}>
      <Tabs items={DRAWER_TABS} activeId={tab} onChange={setTab} ariaLabel="פרטי שלב" />
      <div style={{ paddingBlock: 12 }}>
        {tab === "overview" && (
          <div data-testid="stage-tab-overview">
            <Line label="מטרה">{stage.objective}</Line>
            <Line label="אחראי (בשם)">{ownerName}</Line>
            <Line label="התחלה מתוכננת">{num(stage.startPlanned)}</Line>
            <Line label="תאריך יעד">{num(stage.targetDate)} (יעד, לא עובדה)</Line>
            <Line label="סטטוס">
              <StatusChip status={STAGE_STATUS_CHIP[stage.status]} label={stage.status} />
            </Line>
            <Line label="הפעולה הבאה">{stage.nextAction}</Line>
            <Line label="השער הבא">{stage.nextGate}</Line>
          </div>
        )}
        {tab === "deliverables" && (
          <ul data-testid="stage-tab-deliverables">
            {stage.deliverables.map((d) => (
              <li key={d} style={{ marginBlock: 6 }}>
                {d}
              </li>
            ))}
          </ul>
        )}
        {tab === "evidence" &&
          (evidence.length === 0 ? (
            <EmptyState title="אין דרישות ראיה" reason="לשלב זה לא הוגדרו דרישות ראיה" />
          ) : (
            <div data-testid="stage-tab-evidence">
              {evidence.map(({ evidence: ev, eligibility }) => (
                <Panel key={ev.id} style={{ marginBlock: 8, padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span>{ev.requirementHe}</span>
                    <StatusChip
                      status={eligibility.eligible ? "פעיל" : "אזהרה"}
                      label={eligibility.statusHe}
                    />
                  </div>
                  <div style={{ color: "var(--os-text-muted)", fontSize: 12, marginTop: 6 }}>
                    {ev.ref
                      ? `מקור: ${ev.ref.collection}/${ev.ref.recordId} (${ev.ref.route})`
                      : "לא קושרה רשומה — חסרה ראיה"}
                    {ev.noteHe ? ` · ${ev.noteHe}` : ""}
                  </div>
                </Panel>
              ))}
            </div>
          ))}
        {tab === "risks" &&
          (risks.length === 0 ? (
            <EmptyState title="אין סיכונים משויכים" reason="לא נרשם סיכון ספציפי לשלב זה" />
          ) : (
            <div data-testid="stage-tab-risks">
              {risks.map((r) => (
                <Panel key={r.id} style={{ marginBlock: 8, padding: 12 }}>
                  <div style={{ fontWeight: 600 }}>{r.title}</div>
                  <div style={{ fontSize: 12, color: "var(--os-text-2)", marginTop: 4 }}>
                    הסתברות {r.probability} · השפעה {r.impact} · {r.status}
                  </div>
                  <div style={{ fontSize: 12, marginTop: 6 }}>מיתון: {r.mitigation}</div>
                </Panel>
              ))}
            </div>
          ))}
        {tab === "decisions" &&
          (decision === null ? (
            <EmptyState title="אין רשומת החלטה" reason="לשלב זה לא נוצרה רשומת שער" />
          ) : (
            <div data-testid="stage-tab-decisions">
              <Line label="שער">{decision.gateName}</Line>
              <Line label="תאריך מתוכנן">{num(decision.plannedDate)}</Line>
              <Line label="החלטה">
                {go === null ? (
                  <StatusChip status="ממתין" label="טרם התקבלה החלטה" />
                ) : (
                  <StatusChip status={GO_NO_GO_CHIP[go]} label={go} />
                )}
              </Line>
              {decision.rationaleHe && <Line label="נימוק">{decision.rationaleHe}</Line>}
              <Line label="ראיות נבחנות">{decision.evidenceIds.length} דרישות</Line>
            </div>
          ))}
        {tab === "history" &&
          (audit.length === 0 ? (
            <EmptyState
              title="אין אירועי היסטוריה"
              reason="טרם נרשמו החלטות או שינויים מבוקרים לשלב זה — היסטוריה נכתבת רק מאירועי אמת"
            />
          ) : (
            <ul data-testid="stage-tab-history">
              {audit.map((a) => (
                <li key={a.id} style={{ marginBlock: 6, fontSize: 12 }}>
                  {num(a.at.slice(0, 10))} · {a.action} — {a.details}
                </li>
              ))}
            </ul>
          ))}
      </div>
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// page
// ---------------------------------------------------------------------------

export default function ImplementationPage(): ReactElement {
  const invalidate = useInvalidateCollections();
  const programmesQ = useCollection<ImplementationProgramme>("implementationProgrammes");
  const milestonesQ = useCollection<ImplementationMilestone>("implementationMilestones");
  const risksQ = useCollection<ImplementationRisk>("implementationRisks");
  const evidenceQ = useCollection<ImplementationEvidence>("implementationEvidence");
  const decisionsQ = useCollection<ImplementationDecision>("implementationDecisions");
  const wavesQ = useCollection<RolloutWave>("rolloutWaves");
  const pilotsQ = useCollection<PilotDefinition>("pilotDefinitions");
  const pilotResultsQ = useCollection<PilotResult>("pilotResults");
  const usersQ = useCollection<User>("users");
  const auditQ = useCollection<AuditEvent>("auditEvents");
  const seedStagesQ = useCollection("implementationStages");

  // idempotent content bootstrap (THE Teragon programme) — single-flight
  useEffect(() => {
    let cancelled = false;
    bootstrapOnce ??= ensureImplementationProgramme(implementationStores());
    bootstrapOnce
      .then(({ created }) => {
        if (!cancelled && created > 0) void invalidate(INVALIDATE_KEYS);
      })
      .catch(() => {
        bootstrapOnce = null; // idempotent — retried on next mount
      });
    return () => {
      cancelled = true;
    };
  }, [invalidate]);

  const programme = useMemo(
    () => (programmesQ.data ?? []).find((p) => p.id === PROGRAMME_ID) ?? null,
    [programmesQ.data],
  );
  const evidenceRows = useMemo(() => evidenceQ.data ?? [], [evidenceQ.data]);

  // resolve evidence refs against the real collections (async, derived)
  const [resolved, setResolved] = useState<EvidenceWithEligibility[]>([]);
  useEffect(() => {
    let cancelled = false;
    if (evidenceRows.length === 0) {
      setResolved([]);
      return;
    }
    void resolveEvidence(implementationStores(), evidenceRows).then((rows) => {
      if (!cancelled) setResolved(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [evidenceRows]);

  const users = usersQ.data ?? [];
  const nameOf = (id: string | null): string =>
    (id && users.find((u) => u.id === id)?.name) || "לא הוקצה אחראי";

  const decisions = decisionsQ.data ?? [];
  const risks = risksQ.data ?? [];
  const milestones = milestonesQ.data ?? [];
  const waves = useMemo(
    () => [...(wavesQ.data ?? [])].sort((a, b) => a.order - b.order),
    [wavesQ.data],
  );
  const pilot = (pilotsQ.data ?? []).find((p) => p.programmeId === PROGRAMME_ID) ?? null;
  const pilotResults = pilotResultsQ.data ?? [];

  const health = programme ? programmeHealth(programme, resolved, risks, decisions) : null;
  const todayISO = new Date().toISOString().slice(0, 10);
  const overdue = overdueMilestones(milestones, todayISO);
  const nextDec = nextDecision(decisions);
  const blocking = blockingRisk(risks);
  const missing = missingEvidence(resolved);
  const stage4Evidence = resolved.filter((e) => e.evidence.stageId === "as-4");
  const readiness = pilotReadiness(pilot, pilotResults, stage4Evidence);
  const mismatches = stageNameMismatches(
    (seedStagesQ.data ?? []) as Parameters<typeof stageNameMismatches>[0],
  );

  const [openStageId, setOpenStageId] = useState<string | null>(null);
  const [mapView, setMapView] = useState<AsIsToBeView>("app");

  if (!programme) {
    return (
      <div style={{ padding: "var(--os-space-6)" }}>
        <SectionTitle title="תכנית ההטמעה" subtitle="מערכת ההפעלה של האימוץ — לא אירוע חד-פעמי" />
        <EmptyState
          title="תכנית ההטמעה נטענת"
          reason="רשומת התכנית טרם נוצרה — ה-bootstrap האידמפוטנטי רץ בעליית העמוד"
        />
      </div>
    );
  }

  const currentStage =
    programme.stages.find((s) => s.id === programme.currentStageId) ?? programme.stages[0];
  const openStage = programme.stages.find((s) => s.id === openStageId) ?? null;

  return (
    <div style={{ padding: "var(--os-space-6)", display: "grid", gap: "var(--os-space-6)" }}>
      <SectionTitle
        title="תכנית ההטמעה"
        subtitle={`${programme.name} · גרסה ${programme.version} · ${programme.approvalState}`}
      />

      {/* TOP — programme health + current stage */}
      {health && (
        <div style={kpiRowStyle} data-testid="implementation-health">
          <KpiCard
            title="שלבים שהושלמו"
            value={`${health.stagesDone}/${health.stagesTotal}`}
            accent="cyan"
          />
          <KpiCard
            title="ראיות קבילות"
            value={`${health.evidenceEligible}/${health.evidenceTotal}`}
            accent={health.evidenceEligible < health.evidenceTotal ? "warning" : "success"}
          />
          <KpiCard title="סיכונים פתוחים" value={health.openRisks} accent="danger" />
          <KpiCard title="החלטות שער ממתינות" value={health.decisionsPending} accent="violet" />
          <KpiCard title="מצב פיילוט" value={readiness.statusHe} accent="warning" />
          <KpiCard title="קו בסיס" value={programme.baselineState} accent="blue" />
        </div>
      )}

      <Panel accent="cyan" style={{ padding: 16 }} data-testid="current-stage-panel">
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ color: "var(--os-text-muted)" }}>השלב הנוכחי:</span>
          <strong>
            שלב {currentStage?.order} — {currentStage?.name}
          </strong>
          {currentStage && (
            <StatusChip
              status={STAGE_STATUS_CHIP[currentStage.status]}
              label={currentStage.status}
            />
          )}
          <span style={{ color: "var(--os-text-2)", fontSize: 13 }}>
            {currentStage?.nextAction}
          </span>
        </div>
      </Panel>

      {/* CENTER — six-stage RTL roadmap */}
      <div>
        <SectionTitle title="מפת הדרך — שישה שלבים" subtitle="לחיצה על שלב פותחת פירוט מלא" />
        <div style={stageGridStyle} data-testid="stage-roadmap">
          {programme.stages.map((stage) => {
            const go = stageGoNoGo(stage, decisions);
            const stageEvidence = resolved.filter((e) => e.evidence.stageId === stage.id);
            const eligible = stageEvidence.filter((e) => e.eligibility.eligible).length;
            const stageRisks = risks.filter((r) => r.stageId === stage.id);
            return (
              <Panel
                key={stage.id}
                variant="raised"
                accent={stage.id === programme.currentStageId ? "cyan" : undefined}
                style={{ padding: 16, cursor: "pointer" }}
                data-testid={`stage-card-${stage.order}`}
                role="button"
                tabIndex={0}
                onClick={() => setOpenStageId(stage.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") setOpenStageId(stage.id);
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <strong>
                    {stage.order}. {stage.name}
                  </strong>
                  <StatusChip status={STAGE_STATUS_CHIP[stage.status]} label={stage.status} />
                </div>
                <div style={{ fontSize: 12, color: "var(--os-text-2)", marginTop: 8 }}>
                  {stage.objective}
                </div>
                <div style={{ fontSize: 12, marginTop: 10, display: "grid", gap: 4 }}>
                  <span>אחראי: {nameOf(stage.ownerId)}</span>
                  <span>
                    {num(stage.startPlanned)} ← {num(stage.targetDate)} (יעד)
                  </span>
                  <span>
                    תוצרים: {stage.deliverables.length} · ראיות: {eligible}/{stageEvidence.length}{" "}
                    קבילות · סיכונים: {stageRisks.length}
                  </span>
                  <span>הפעולה הבאה: {stage.nextAction}</span>
                  <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    {stage.nextGate}
                    <StatusChip status={GO_NO_GO_CHIP[go]} label={go} />
                  </span>
                </div>
              </Panel>
            );
          })}
        </div>
      </div>

      {/* BOTTOM — Gantt + rollout waves */}
      <div>
        <SectionTitle
          title="ציר זמן ותכנית גלים"
          subtitle="תאריכי יעד מתוך תכנית ההטמעה — לא עובדות שבוצעו"
        />
        <Panel style={{ padding: 16, overflowX: "auto" }}>
          <GanttTimeline programme={programme} waves={waves} />
        </Panel>
        <div style={{ ...stageGridStyle, marginTop: "var(--os-space-5)" }} data-testid="rollout-waves">
          {waves.map((w) => (
            <Panel key={w.id} style={{ padding: 14 }} data-testid={`rollout-wave-${w.order}`}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <strong>
                  גל {w.order} · {w.name}
                </strong>
                <StatusChip status={STAGE_STATUS_CHIP[w.status]} label={w.status} />
              </div>
              <div style={{ fontSize: 12, color: "var(--os-text-2)", marginTop: 6 }}>
                {w.audienceHe}
              </div>
              <div style={{ fontSize: 12, marginTop: 6 }}>
                {w.plannedStart ? <>התחלה מתוכננת: {num(w.plannedStart)}</> : "טרם תוזמן"}
              </div>
              <ul style={{ fontSize: 12, marginTop: 6, paddingInlineStart: 16 }}>
                {w.entryCriteria.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </Panel>
          ))}
        </div>
      </div>

      {/* AS-IS / TO-BE (Phase 7.3) */}
      <div>
        <SectionTitle
          title="מפת AS-IS / TO-BE וגבולות אדם-AI"
          subtitle="5 שלבי AS-IS · 7 שלבי TO-BE · 6 באחריות אדם · 5 אסורים ל-AI"
          action={
            <span style={{ display: "flex", gap: 8 }}>
              <OsButton
                variant={mapView === "app" ? "primary" : "ghost"}
                onClick={() => setMapView("app")}
              >
                תצוגת עמוד
              </OsButton>
              <OsButton
                variant={mapView === "presentation" ? "primary" : "ghost"}
                onClick={() => setMapView("presentation")}
              >
                תצוגת מצגת 16:9
              </OsButton>
              <OsButton variant="ghost" onClick={() => window.print()}>
                הדפסה (A4)
              </OsButton>
            </span>
          }
        />
        <Panel style={{ padding: 16, overflowX: "auto" }}>
          <AsIsToBe view={mapView} />
        </Panel>
      </div>

      {mismatches.length > 0 && (
        <Panel style={{ padding: 12, fontSize: 12 }} data-testid="stage-mismatch-note">
          הערת יישור: {mismatches.length} רשומות שלבים ב-seed טרם יושרו לשמות הקנוניים (החלטת C4)
          — ראו docs/integration-requests-w7a.md.
        </Panel>
      )}

      {openStage && (
        <StageDrawer
          stage={openStage}
          ownerName={nameOf(openStage.ownerId)}
          evidence={resolved.filter((e) => e.evidence.stageId === openStage.id)}
          risks={risks.filter((r) => r.stageId === openStage.id)}
          decision={decisions.find((d) => d.stageId === openStage.id) ?? null}
          audit={(auditQ.data ?? []).filter((a) =>
            (decisions.find((d) => d.stageId === openStage.id)?.id ?? "").length > 0
              ? a.entityRef ===
                `implementationDecision:${decisions.find((d) => d.stageId === openStage.id)?.id}`
              : false,
          )}
          onClose={() => setOpenStageId(null)}
        />
      )}

      {/* PageRail — "מבקר ההטמעה" (all derived, honest) */}
      <PageRail>
        <div style={{ display: "grid", gap: "var(--os-space-5)", padding: "var(--os-space-4)" }}>
          <SectionTitle title="מבקר ההטמעה" subtitle="נגזר מרשומות אמת בלבד" />
          <Panel style={{ padding: 12 }} data-testid="rail-blocking-risk">
            <strong style={{ fontSize: 12 }}>סיכון חוסם</strong>
            <div style={{ fontSize: 12, marginTop: 4 }}>
              {blocking ? (
                <>
                  {blocking.title} · {nameOf(blocking.ownerId)}
                </>
              ) : (
                "אין סיכון פתוח"
              )}
            </div>
          </Panel>
          <Panel style={{ padding: 12 }} data-testid="rail-missing-evidence">
            <strong style={{ fontSize: 12 }}>
              {MISSING_EVIDENCE_HE} ({missing.length})
            </strong>
            <ul style={{ fontSize: 12, marginTop: 4, paddingInlineStart: 16 }}>
              {missing.slice(0, 4).map((m) => (
                <li key={m.evidence.id}>{m.evidence.requirementHe}</li>
              ))}
            </ul>
            {missing.length === 0 && <div style={{ fontSize: 12 }}>כל דרישות הראיה קבילות</div>}
          </Panel>
          <Panel style={{ padding: 12 }} data-testid="rail-overdue-owner">
            <strong style={{ fontSize: 12 }}>אחראי באיחור</strong>
            <div style={{ fontSize: 12, marginTop: 4 }}>
              {overdue.length > 0
                ? overdue.map((m) => `${nameOf(m.ownerId)} — ${m.title}`).join(" · ")
                : "אין אבן דרך באיחור"}
            </div>
          </Panel>
          <Panel style={{ padding: 12 }} data-testid="rail-next-decision">
            <strong style={{ fontSize: 12 }}>ההחלטה הבאה</strong>
            <div style={{ fontSize: 12, marginTop: 4 }}>
              {nextDec ? (
                <>
                  {nextDec.gateName} · {num(nextDec.plannedDate)}
                </>
              ) : (
                "אין החלטות ממתינות"
              )}
            </div>
          </Panel>
          <Panel style={{ padding: 12 }} data-testid="rail-pilot-readiness">
            <strong style={{ fontSize: 12 }}>מוכנות הפיילוט</strong>
            <div style={{ fontSize: 12, marginTop: 4 }}>
              {readiness.statusHe}
              {readiness.measuredCriteria === 0 && ` · כל הקריטריונים: ${UNMEASURED_HE}`}
            </div>
          </Panel>
          <Panel style={{ padding: 12 }} data-testid="rail-next-action">
            <strong style={{ fontSize: 12 }}>הפעולה הבאה הנדרשת</strong>
            <div style={{ fontSize: 12, marginTop: 4 }}>{nextRequiredAction(programme)}</div>
          </Panel>
          <Panel style={{ padding: 12 }} data-testid="rail-submission-deliverables">
            <strong style={{ fontSize: 12 }}>תוצרי הגשה מושפעים (שלב נוכחי)</strong>
            <ul style={{ fontSize: 12, marginTop: 4, paddingInlineStart: 16 }}>
              {(STAGE_TO_SUBMISSION_DELIVERABLES[programme.currentStageId] ?? []).map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </Panel>
        </div>
      </PageRail>
    </div>
  );
}
