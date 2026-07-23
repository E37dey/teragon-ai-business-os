// /stage-gates — Stage Gates · שערי מעבר וראיות (Wave 7, W7-C, Phase 7.9).
// Premium evidence workspace over the SIX canonical gates (G1-G6): RIGHT gate
// navigator, CENTER criteria + evidence with an attach-evidence picker that
// offers ELIGIBLE REAL records only, LEFT-inside-canvas evidence viewer, and
// PageRail "מבקר המוכנות". Every number derives from the deterministic
// validator — no gate can pass from a percentage, and G4 is honestly blocked
// until a real PilotResult record exists.
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import { PageRail } from "@/app/rail";
import { useCollection, useInvalidateCollections } from "@/app/data/hooks";
import {
  EmptyState,
  KpiCard,
  Modal,
  OsButton,
  Panel,
  SectionTitle,
  StatusChip,
  useToast,
  type OsStatus,
} from "@/design-system";
import type {
  Document,
  ImplementationStage,
  MemoryRecord,
  MetricDefinition,
  MetricObservation,
  Persona,
  StageGate,
  TrainingMaterial,
  User,
} from "@/domain/types";
import type { KnowledgeArticleV2 } from "@/domain/knowledge";
import {
  CANONICAL_STAGE_GATES,
  EVIDENCE_REF_TYPE_LABELS_HE,
  StageGateService,
  isStageGateV2,
  validateGate,
  type EvaluatedEvidenceRef,
  type GateValidation,
  type StageGateContext,
  type StageGateCriterionDef,
  type StageGateDef,
  type StageGateEvidenceRefType,
  type StageGateV2,
  type StageGateV2State,
  type W7RecordLike,
} from "@/domain/stage-gates";
import { evaluateEvidenceRef } from "@/domain/stage-gates";
import type { CollectionKey } from "@/repositories/collections";
import { stageGateStores } from "@/repositories/stageGateStores";
import { CEO_USER_ID, DEMO_DATA_LABEL } from "@/repositories/seed";

const INVALIDATE_KEYS: CollectionKey[] = ["stageGates", "auditEvents"];

// Module-level single-flight guard for the idempotent bridge: only ONE bridge
// runs at a time (concurrent-mount race safety); once settled it clears, so a
// later mount over a fresh store re-runs the (idempotent, cheap) bridge.
let bridgeInFlight: Promise<unknown> | null = null;

const STATE_CHIP: Record<StageGateV2State, OsStatus> = {
  "לא התחיל": "מושבת",
  בבדיקה: "דורש אישור",
  "חסרות ראיות": "אזהרה",
  Go: "הושלם",
  "No-Go": "חסום",
  "פג תוקף": "מושהה",
  "נפתח מחדש": "ממתין",
};

function service(): StageGateService {
  return new StageGateService({ stores: stageGateStores() });
}

function busyDisabled(
  busy: boolean,
  reason = "פעולה קודמת עדיין רצה",
): { disabled: true; disabledReason: string } | { disabled?: false } {
  return busy ? { disabled: true, disabledReason: reason } : {};
}

const kpiRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: "var(--os-space-5)",
};

// canvas: RIGHT navigator (first column in RTL) · CENTER detail · LEFT viewer
const canvasStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "230px minmax(0, 1fr) 290px",
  gap: "var(--os-space-5)",
  alignItems: "start",
};

export default function StageGatesPage(): ReactElement {
  const invalidate = useInvalidateCollections();
  const gatesQ = useCollection<StageGate>("stageGates");
  const personasQ = useCollection<Persona>("personas");
  const materialsQ = useCollection<TrainingMaterial>("trainingMaterials");
  const metricDefsQ = useCollection<MetricDefinition>("metricDefinitions");
  const metricObsQ = useCollection<MetricObservation>("metricObservations");
  const memoryQ = useCollection<MemoryRecord>("memoryRecords");
  const articlesQ = useCollection<KnowledgeArticleV2>("knowledgeArticles");
  const documentsQ = useCollection<Document>("documents");
  const implEvidenceQ = useCollection<W7RecordLike>("implementationEvidence");
  const pilotDefsQ = useCollection<W7RecordLike>("pilotDefinitions");
  const pilotResultsQ = useCollection<W7RecordLike>("pilotResults");
  const rolloutWavesQ = useCollection<W7RecordLike>("rolloutWaves");
  const usersQ = useCollection<User>("users");
  const stagesQ = useCollection<ImplementationStage>("implementationStages");

  // idempotent V2 bridge over the six seeded records
  useEffect(() => {
    let cancelled = false;
    bridgeInFlight ??= service()
      .ensureBridge()
      .finally(() => {
        bridgeInFlight = null;
      });
    bridgeInFlight
      .then(() => {
        if (!cancelled) void invalidate(INVALIDATE_KEYS);
      })
      .catch(() => {
        // idempotent — a transient failure retries on next mount
      });
    return () => {
      cancelled = true;
    };
  }, [invalidate]);

  const ctx: StageGateContext = useMemo(
    () => ({
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
    }),
    [
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
    ],
  );

  const nowISO = useMemo(() => new Date().toISOString(), []);

  // the six bridged gates, canonical order, with deterministic validation
  const gateRows = useMemo(() => {
    const all = gatesQ.data ?? [];
    const rows: { def: StageGateDef; gate: StageGateV2; validation: GateValidation }[] = [];
    for (const def of CANONICAL_STAGE_GATES) {
      const gate = all.find((g) => g.id === def.legacyId);
      if (!gate || !isStageGateV2(gate)) continue;
      rows.push({ def, gate, validation: validateGate(gate, def, ctx, nowISO) });
    }
    return rows;
  }, [gatesQ.data, ctx, nowISO]);

  const [selectedGateId, setSelectedGateId] = useState<string>("sg-1");
  const [viewerRef, setViewerRef] = useState<EvaluatedEvidenceRef | null>(null);
  const stages = stagesQ.data ?? [];

  const selected = gateRows.find((r) => r.gate.id === selectedGateId) ?? gateRows[0] ?? null;

  if (gatesQ.isError) {
    return (
      <EmptyState
        icon="alert"
        title="שגיאה בטעינת שערי המעבר"
        reason="קריאת ה-repositories נכשלה — נסו לרענן את הדף."
      />
    );
  }
  if (gatesQ.isLoading || gateRows.length === 0) {
    return (
      <Panel style={{ padding: "var(--os-space-8)", color: "var(--os-text-2)" }}>
        טוען את שערי המעבר… (גשר V2 רץ באופן אידמפוטנטי על 6 השערים הקנוניים)
      </Panel>
    );
  }

  const goCount = gateRows.filter((r) => r.validation.state === "Go").length;
  const inReview = gateRows.filter((r) => r.validation.state === "בבדיקה").length;
  const missingEvidence = gateRows.filter((r) => r.validation.state === "חסרות ראיות").length;
  const expiredEvidence = gateRows.reduce((n, r) => n + r.validation.expiredCount, 0);
  const attachedTotal = gateRows.reduce((n, r) => n + r.gate.v2.attachedEvidence.length, 0);

  return (
    <div style={{ display: "grid", gap: "var(--os-space-6)" }}>
      <PageRail>
        <ReadinessRail rows={gateRows} stages={stages} />
      </PageRail>

      <SectionTitle
        icon="shield"
        title="Stage Gates · שערי מעבר וראיות"
        subtitle={`6 שערים קנוניים · ${DEMO_DATA_LABEL} · אף שער אינו עובר על סמך אחוז התקדמות`}
      />

      <div style={kpiRowStyle}>
        <KpiCard title="שערי Go" value={goCount} accent="success" icon="check" />
        <KpiCard title="בבדיקה" value={inReview} accent="violet" icon="clock" />
        <KpiCard
          title="חסרות ראיות"
          value={missingEvidence}
          accent="warning"
          icon="alert"
          glow={missingEvidence > 0}
        />
        <KpiCard title="ראיות פגות תוקף" value={expiredEvidence} accent="danger" icon="clock" />
        <KpiCard title="ראיות מצורפות" value={attachedTotal} accent="cyan" icon="evidence" />
      </div>

      <div style={canvasStyle}>
        {/* RIGHT — gate navigator */}
        <GateNavigator
          rows={gateRows}
          selectedId={selected?.gate.id ?? null}
          onSelect={(id) => {
            setSelectedGateId(id);
            setViewerRef(null);
          }}
        />

        {/* CENTER — selected gate criteria + evidence */}
        {selected ? (
          <GateDetail
            key={selected.gate.id}
            row={selected}
            ctx={ctx}
            users={usersQ.data ?? []}
            nowISO={nowISO}
            onSelectEvidence={setViewerRef}
            onChanged={() => void invalidate(INVALIDATE_KEYS)}
          />
        ) : (
          <EmptyState icon="shield" title="אין שער נבחר" reason="בחרו שער מהנווט מימין." />
        )}

        {/* LEFT-inside-canvas — evidence viewer */}
        <EvidenceViewer evaluated={viewerRef} ctx={ctx} />
      </div>
    </div>
  );
}

// ── RIGHT: gate navigator ───────────────────────────────────────────────────
function GateNavigator({
  rows,
  selectedId,
  onSelect,
}: {
  rows: readonly { def: StageGateDef; gate: StageGateV2; validation: GateValidation }[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}): ReactElement {
  return (
    <div style={{ display: "grid", gap: "var(--os-space-3)" }}>
      {rows.map(({ def, gate, validation }) => {
        const active = gate.id === selectedId;
        return (
          <Panel
            key={gate.id}
            variant={active ? "highlight" : "raised"}
            accent={active ? "cyan" : undefined}
            role="button"
            tabIndex={0}
            aria-pressed={active}
            aria-label={`שער ${def.gateKey} — ${def.nameHe}`}
            style={{ padding: "var(--os-space-4)", cursor: "pointer", display: "grid", gap: 6 }}
            onClick={() => onSelect(gate.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") onSelect(gate.id);
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <b style={{ fontSize: "var(--os-text-sm)" }}>
                <span className="os-num">{def.gateKey}</span> · {def.nameHe}
              </b>
            </div>
            <StatusChip status={STATE_CHIP[validation.state]} label={validation.state} />
            <div style={{ color: "var(--os-muted)", fontSize: "var(--os-text-2xs)" }}>
              ראיות תקפות{" "}
              <span className="os-num">
                {validation.criteria.reduce((n, c) => n + c.validCount, 0)}
              </span>
              {" · "}חסרים <span className="os-num">{validation.missingCount}</span>
            </div>
          </Panel>
        );
      })}
    </div>
  );
}

// ── CENTER: gate detail ─────────────────────────────────────────────────────
function GateDetail({
  row,
  ctx,
  users,
  nowISO,
  onSelectEvidence,
  onChanged,
}: {
  row: { def: StageGateDef; gate: StageGateV2; validation: GateValidation };
  ctx: StageGateContext;
  users: readonly User[];
  nowISO: string;
  onSelectEvidence: (e: EvaluatedEvidenceRef) => void;
  onChanged: () => void;
}): ReactElement {
  const { def, gate, validation } = row;
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [pickerFor, setPickerFor] = useState<StageGateCriterionDef | null>(null);

  async function run(fn: () => Promise<unknown>, successMsg: string): Promise<void> {
    setBusy(true);
    try {
      await fn();
      onChanged();
      toast(successMsg, "success");
      setNote("");
    } catch (err) {
      toast(err instanceof Error ? err.message : "שגיאה לא מזוהה", "warning");
    } finally {
      setBusy(false);
    }
  }

  const trimmedNote = note.trim();

  return (
    <div style={{ display: "grid", gap: "var(--os-space-5)", minInlineSize: 0 }}>
      <Panel variant="raised" style={{ padding: "var(--os-space-5)", display: "grid", gap: 8 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <b style={{ fontSize: "var(--os-text-lg)" }}>
            <span className="os-num">{def.gateKey}</span> · {def.nameHe}
          </b>
          <StatusChip status={STATE_CHIP[validation.state]} label={validation.state} />
        </div>
        <div style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-sm)" }}>
          {def.descriptionHe}
        </div>
        <div style={{ color: "var(--os-warning)", fontSize: "var(--os-text-xs)" }}>
          סיכון: {def.riskHe}
        </div>

        {/* owner / reviewer / decision meta */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <RoleSelect
            label="אחראי"
            value={gate.v2.ownerId}
            users={users}
            busy={busy}
            onAssign={(userId) =>
              void run(
                () => service().assignOwner(gate.id, userId, CEO_USER_ID),
                "הוקצה אחראי לשער — נרשם ביומן הביקורת",
              )
            }
          />
          <RoleSelect
            label="בודק"
            value={gate.v2.reviewerId}
            users={users}
            busy={busy}
            onAssign={(userId) =>
              void run(
                () => service().assignReviewer(gate.id, userId, CEO_USER_ID),
                "הוקצה בודק לשער — נרשם ביומן הביקורת",
              )
            }
          />
          <span style={{ color: "var(--os-muted)", fontSize: "var(--os-text-xs)" }}>
            מועד החלטה מתוכנן:{" "}
            <span className="os-num">
              {validation.nextDecisionDate ? validation.nextDecisionDate.slice(0, 10) : "לא נקבע"}
            </span>
          </span>
          {validation.decision && (
            <span style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-xs)" }}>
              החלטה: <b>{validation.decision}</b> ·{" "}
              <span className="os-num">{(validation.decisionDate ?? "").slice(0, 10)}</span>
            </span>
          )}
        </div>

        {/* blocking reasons — the honest "why not Go" */}
        {validation.blockingReasonsHe.length > 0 && (
          <Panel
            style={{
              padding: "var(--os-space-4)",
              borderInlineStart: "3px solid var(--os-warning)",
              display: "grid",
              gap: 4,
            }}
          >
            <b style={{ fontSize: "var(--os-text-xs)" }}>
              חוסם Go ({validation.blockingReasonsHe.length})
            </b>
            {validation.blockingReasonsHe.map((r) => (
              <div key={r} style={{ fontSize: "var(--os-text-2xs)", color: "var(--os-text-2)" }}>
                ⚠ {r}
              </div>
            ))}
          </Panel>
        )}

        {/* decision actions */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {validation.readyForGo && gate.v2.decision !== "Go" ? (
            <OsButton
              size="sm"
              variant="approve"
              icon="check"
              {...busyDisabled(busy)}
              onClick={() =>
                void run(
                  () => service().decideGo(gate.id, CEO_USER_ID, trimmedNote),
                  "השער הוכרע Go — כל הקריטריונים מולאו בראיות תקפות",
                )
              }
            >
              Go
            </OsButton>
          ) : (
            <OsButton
              size="sm"
              variant="approve"
              icon="check"
              disabled
              disabledReason={
                gate.v2.decision === "Go"
                  ? "השער כבר הוכרע Go — לשינוי פתחו מחדש"
                  : `Go חסום: ${validation.blockingReasonsHe[0] ?? "נדרשות ראיות תקפות"}`
              }
            >
              Go
            </OsButton>
          )}
          {gate.v2.decision === null ? (
            trimmedNote ? (
              <OsButton
                size="sm"
                variant="reject"
                icon="x"
                {...busyDisabled(busy)}
                onClick={() =>
                  void run(
                    () => service().decideNoGo(gate.id, CEO_USER_ID, trimmedNote),
                    "השער הוכרע No-Go עם נימוק",
                  )
                }
              >
                No-Go
              </OsButton>
            ) : (
              <OsButton
                size="sm"
                variant="reject"
                icon="x"
                disabled
                disabledReason="No-Go מחייב נימוק — כתבו אותו בשדה ההערה"
              >
                No-Go
              </OsButton>
            )
          ) : trimmedNote ? (
            <OsButton
              size="sm"
              variant="ghost"
              icon="clock"
              {...busyDisabled(busy)}
              onClick={() =>
                void run(
                  () => service().reopen(gate.id, CEO_USER_ID, trimmedNote),
                  "השער נפתח מחדש — ההחלטה נוקתה",
                )
              }
            >
              פתח מחדש
            </OsButton>
          ) : (
            <OsButton
              size="sm"
              variant="ghost"
              icon="clock"
              disabled
              disabledReason="פתיחה מחדש מחייבת נימוק — כתבו אותו בשדה ההערה"
            >
              פתח מחדש
            </OsButton>
          )}
          {trimmedNote ? (
            <OsButton
              size="sm"
              variant="ghost"
              icon="send"
              {...busyDisabled(busy)}
              onClick={() =>
                void run(
                  () => service().requestCompletion(gate.id, trimmedNote, CEO_USER_ID),
                  "בקשת השלמת ראיות נרשמה ונשלחה לאחראי",
                )
              }
            >
              בקש השלמה
            </OsButton>
          ) : (
            <OsButton
              size="sm"
              variant="ghost"
              icon="send"
              disabled
              disabledReason="בקשת השלמה מחייבת נימוק — כתבו אותו בשדה ההערה"
            >
              בקש השלמה
            </OsButton>
          )}
        </div>
        <textarea
          className="os-qc-input os-qc-input--area"
          rows={2}
          aria-label="הערת החלטה"
          placeholder="הערת החלטה (חובה ל-No-Go / פתיחה מחדש / בקשת השלמה)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Panel>

      {/* criteria + evidence */}
      {validation.criteria.map((c) => (
        <Panel
          key={c.def.key}
          variant="raised"
          style={{ padding: "var(--os-space-4)", display: "grid", gap: 8 }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <b style={{ fontSize: "var(--os-text-sm)" }}>{c.def.titleHe}</b>
            <span
              className={`os-chip ${c.state === "מולא" ? "os-chip--cyan" : "os-chip--muted"}`}
            >
              {c.state}
            </span>
          </div>
          <div style={{ color: "var(--os-muted)", fontSize: "var(--os-text-2xs)" }}>
            ראיות נדרשות: {c.requiredEvidenceHe}
          </div>
          {c.missingHe.map((m) => (
            <div key={m} style={{ color: "var(--os-warning)", fontSize: "var(--os-text-2xs)" }}>
              ⚠ {m}
            </div>
          ))}
          {c.attachedEvidence.length === 0 ? (
            <div style={{ color: "var(--os-muted)", fontSize: "var(--os-text-xs)" }}>
              אין ראיות מצורפות לקריטריון זה.
            </div>
          ) : (
            c.attachedEvidence.map((e) => (
              <div
                key={e.ref.id}
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  fontSize: "var(--os-text-xs)",
                }}
              >
                <button
                  type="button"
                  className="os-chip os-chip--blue"
                  style={{ cursor: "pointer" }}
                  aria-label={`הצג ראיה ${e.recordTitleHe}`}
                  onClick={() => onSelectEvidence(e)}
                >
                  📎 {EVIDENCE_REF_TYPE_LABELS_HE[e.ref.refType]} · {e.recordTitleHe}
                </button>
                <span
                  style={{
                    color:
                      e.status === "תקפה"
                        ? "var(--os-success)"
                        : e.status === "פג תוקף"
                          ? "var(--os-warning)"
                          : "var(--os-danger)",
                    fontSize: "var(--os-text-2xs)",
                  }}
                >
                  {e.status}
                  {e.reasonHe ? ` — ${e.reasonHe}` : ""}
                </span>
                <OsButton
                  size="sm"
                  variant="ghost"
                  icon="x"
                  {...busyDisabled(busy)}
                  onClick={() =>
                    void run(
                      () => service().detachEvidence(gate.id, e.ref.id, CEO_USER_ID),
                      "הראיה הוסרה מהשער",
                    )
                  }
                >
                  הסרה
                </OsButton>
              </div>
            ))
          )}
          <div>
            <OsButton
              size="sm"
              icon="plus"
              {...busyDisabled(busy)}
              onClick={() => setPickerFor(c.def)}
            >
              צרף ראיה…
            </OsButton>
          </div>
        </Panel>
      ))}

      {pickerFor && (
        <AttachEvidenceModal
          gate={gate}
          criterion={pickerFor}
          ctx={ctx}
          nowISO={nowISO}
          busy={busy}
          onAttach={(refType, refId) =>
            void run(
              () =>
                service().attachEvidence(
                  gate.id,
                  { refType, refId, criterionKey: pickerFor.key },
                  CEO_USER_ID,
                ),
              "הראיה צורפה — נרשמה ביומן הביקורת",
            ).then(() => setPickerFor(null))
          }
          onClose={() => setPickerFor(null)}
        />
      )}
    </div>
  );
}

function RoleSelect({
  label,
  value,
  users,
  busy,
  onAssign,
}: {
  label: string;
  value: string | null;
  users: readonly User[];
  busy: boolean;
  onAssign: (userId: string) => void;
}): ReactElement {
  return (
    <label
      style={{
        display: "flex",
        gap: 6,
        alignItems: "center",
        fontSize: "var(--os-text-xs)",
        color: "var(--os-text-2)",
      }}
    >
      {label}:
      <select
        className="os-qc-input"
        style={{ maxInlineSize: 150 }}
        aria-label={`הקצאת ${label} לשער`}
        value={value ?? ""}
        disabled={busy}
        onChange={(e) => {
          if (e.target.value) onAssign(e.target.value);
        }}
      >
        <option value="">{value === null ? "לא הוקצה" : ""}</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
    </label>
  );
}

// ── attach-evidence picker — ELIGIBLE REAL records only ─────────────────────
interface PickerCandidate {
  refType: StageGateEvidenceRefType;
  refId: string;
  titleHe: string;
}

function candidateLists(
  criterion: StageGateCriterionDef,
  ctx: StageGateContext,
): { all: PickerCandidate[] } {
  const byType: Record<StageGateEvidenceRefType, readonly { id: string }[]> = {
    persona: ctx.personas,
    trainingMaterial: ctx.trainingMaterials,
    metricDefinition: ctx.metricDefinitions,
    metricObservation: ctx.metricObservations,
    memoryRecord: ctx.memoryRecords,
    knowledgeArticle: ctx.knowledgeArticles,
    implementationEvidence: ctx.implementationEvidence,
    document: ctx.documents,
    pilotDefinition: ctx.pilotDefinitions,
    pilotResult: ctx.pilotResults,
    rolloutWave: ctx.rolloutWaves,
  };
  const all: PickerCandidate[] = [];
  for (const t of criterion.requiredRefTypes) {
    for (const r of byType[t]) {
      const rec = r as { name?: string; title?: string; titleHe?: string; metricKey?: string };
      all.push({
        refType: t,
        refId: r.id,
        titleHe: rec.titleHe ?? rec.title ?? rec.name ?? rec.metricKey ?? r.id,
      });
    }
  }
  return { all };
}

function AttachEvidenceModal({
  gate,
  criterion,
  ctx,
  nowISO,
  busy,
  onAttach,
  onClose,
}: {
  gate: StageGateV2;
  criterion: StageGateCriterionDef;
  ctx: StageGateContext;
  nowISO: string;
  busy: boolean;
  onAttach: (refType: StageGateEvidenceRefType, refId: string) => void;
  onClose: () => void;
}): ReactElement {
  const { all } = candidateLists(criterion, ctx);
  const attached = new Set(
    gate.v2.attachedEvidence
      .filter((r) => r.criterionKey === criterion.key)
      .map((r) => `${r.refType}:${r.refId}`),
  );
  // eligibility through the SAME deterministic evaluator the validator uses
  const evaluated = all
    .filter((c) => !attached.has(`${c.refType}:${c.refId}`))
    .map((c) => ({
      candidate: c,
      result: evaluateEvidenceRef(
        {
          id: "picker-preview",
          refType: c.refType,
          refId: c.refId,
          criterionKey: criterion.key,
          attachedAt: nowISO,
          attachedById: "picker",
          noteHe: "",
        },
        criterion,
        ctx,
        nowISO,
      ),
    }));
  const eligible = evaluated.filter((e) => e.result.status === "תקפה");
  const hiddenCount = evaluated.length - eligible.length;

  return (
    <Modal open onClose={onClose} title={`צירוף ראיה — ${criterion.titleHe}`}>
      <div style={{ display: "grid", gap: "var(--os-space-3)" }}>
        <div style={{ color: "var(--os-muted)", fontSize: "var(--os-text-2xs)" }}>
          מוצגות אך ורק רשומות אמת כשירות (עברו את מבחן הכשירות הדטרמיניסטי). אין ראיות חופשיות.
        </div>
        {eligible.length === 0 ? (
          <EmptyState
            icon="evidence"
            title="אין רשומות כשירות לצירוף"
            reason="לא קיימת רשומה אמיתית שעומדת בדרישות הקריטריון — יש ליצור אותה קודם (למשל הגדרת פיילוט, תצפית מדד עם ערך, או מאמר ידע מאושר)."
          />
        ) : (
          eligible.map(({ candidate }) => (
            <div
              key={`${candidate.refType}:${candidate.refId}`}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
                fontSize: "var(--os-text-sm)",
              }}
            >
              <span>
                <span className="os-chip os-chip--muted" style={{ marginInlineEnd: 6 }}>
                  {EVIDENCE_REF_TYPE_LABELS_HE[candidate.refType]}
                </span>
                {candidate.titleHe}
              </span>
              <OsButton
                size="sm"
                icon="plus"
                {...busyDisabled(busy)}
                onClick={() => onAttach(candidate.refType, candidate.refId)}
              >
                צרף
              </OsButton>
            </div>
          ))
        )}
        {hiddenCount > 0 && (
          <div style={{ color: "var(--os-muted)", fontSize: "var(--os-text-2xs)" }}>
            {hiddenCount} רשומות לא-כשירות הוסתרו (טיוטות, תצפיות ללא ערך, רשומות שפג תוקפן).
          </div>
        )}
      </div>
    </Modal>
  );
}

// ── LEFT-inside-canvas: evidence viewer ─────────────────────────────────────
function EvidenceViewer({
  evaluated,
  ctx,
}: {
  evaluated: EvaluatedEvidenceRef | null;
  ctx: StageGateContext;
}): ReactElement {
  if (!evaluated) {
    return (
      <Panel variant="raised" style={{ padding: "var(--os-space-5)" }}>
        <b style={{ fontSize: "var(--os-text-sm)" }}>מציג הראיות</b>
        <div
          style={{
            color: "var(--os-muted)",
            fontSize: "var(--os-text-xs)",
            marginBlockStart: 8,
          }}
        >
          בחרו ראיה מצורפת מהקריטריונים כדי לצפות ברשומה האמיתית שמאחוריה.
        </div>
      </Panel>
    );
  }
  const { ref } = evaluated;
  return (
    <Panel
      variant="raised"
      style={{ padding: "var(--os-space-5)", display: "grid", gap: 8, minInlineSize: 0 }}
    >
      <b style={{ fontSize: "var(--os-text-sm)" }}>מציג הראיות</b>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <span className="os-chip os-chip--blue">{EVIDENCE_REF_TYPE_LABELS_HE[ref.refType]}</span>
        <span className="os-chip os-chip--muted os-ltr">{ref.refId}</span>
      </div>
      <div
        style={{
          color:
            evaluated.status === "תקפה"
              ? "var(--os-success)"
              : evaluated.status === "פג תוקף"
                ? "var(--os-warning)"
                : "var(--os-danger)",
          fontSize: "var(--os-text-xs)",
        }}
      >
        {evaluated.status}
        {evaluated.reasonHe ? ` — ${evaluated.reasonHe}` : " — כשירה כראיה"}
      </div>
      <RecordPreview refType={ref.refType} refId={ref.refId} ctx={ctx} />
      <div style={{ color: "var(--os-muted)", fontSize: "var(--os-text-2xs)" }}>
        צורפה {ref.attachedAt.slice(0, 10)} על ידי {ref.attachedById}
        {ref.noteHe ? ` · ${ref.noteHe}` : ""}
      </div>
    </Panel>
  );
}

function RecordPreview({
  refType,
  refId,
  ctx,
}: {
  refType: StageGateEvidenceRefType;
  refId: string;
  ctx: StageGateContext;
}): ReactElement {
  const line = (label: string, value: string): ReactElement => (
    <div style={{ fontSize: "var(--os-text-xs)" }}>
      <span style={{ color: "var(--os-muted)" }}>{label}: </span>
      <span style={{ color: "var(--os-text-2)" }}>{value}</span>
    </div>
  );
  if (refType === "persona") {
    const p = ctx.personas.find((x) => x.id === refId);
    if (!p) return <MissingRecord />;
    return (
      <div style={{ display: "grid", gap: 4 }}>
        <b style={{ fontSize: "var(--os-text-sm)" }}>{p.name}</b>
        {line("תיאור", p.description)}
        {line("מסלול הדרכה", p.trainingTrack)}
        {line("מטרות", p.goals.join(" · "))}
      </div>
    );
  }
  if (refType === "trainingMaterial") {
    const m = ctx.trainingMaterials.find((x) => x.id === refId);
    if (!m) return <MissingRecord />;
    const personaNames = m.audiencePersonaIds
      .map((id) => ctx.personas.find((p) => p.id === id)?.name ?? id)
      .join(" · ");
    return (
      <div style={{ display: "grid", gap: 4 }}>
        <b style={{ fontSize: "var(--os-text-sm)" }}>{m.title}</b>
        {line("סוג", m.kind)}
        {line("תיאור", m.description)}
        {line("קהל יעד", personaNames || "לא הוגדר")}
      </div>
    );
  }
  if (refType === "metricObservation") {
    const o = ctx.metricObservations.find((x) => x.id === refId);
    if (!o) return <MissingRecord />;
    const def = ctx.metricDefinitions.find((d) => d.key === o.metricKey);
    return (
      <div style={{ display: "grid", gap: 4 }}>
        <b style={{ fontSize: "var(--os-text-sm)" }}>{def?.name ?? o.metricKey}</b>
        {line("נצפה", o.observedAt.slice(0, 10))}
        {line("ערך", o.value === null ? "טרם נמדד" : `${o.value}${def ? ` ${def.unit}` : ""}`)}
        {line("שיטה", o.method)}
      </div>
    );
  }
  if (refType === "metricDefinition") {
    const d = ctx.metricDefinitions.find((x) => x.id === refId);
    if (!d) return <MissingRecord />;
    return (
      <div style={{ display: "grid", gap: 4 }}>
        <b style={{ fontSize: "var(--os-text-sm)" }}>{d.name}</b>
        {line("רמה", d.level)}
        {line("נגזר מ", d.derivation)}
      </div>
    );
  }
  if (refType === "memoryRecord") {
    const m = ctx.memoryRecords.find((x) => x.id === refId);
    if (!m) return <MissingRecord />;
    return (
      <div style={{ display: "grid", gap: 4 }}>
        <b style={{ fontSize: "var(--os-text-sm)" }}>{m.title}</b>
        {/* escaped preview — React text nodes only */}
        <div
          style={{
            fontSize: "var(--os-text-2xs)",
            color: "var(--os-text-2)",
            whiteSpace: "pre-wrap",
            maxBlockSize: 180,
            overflowY: "auto",
          }}
        >
          {m.markdown}
        </div>
      </div>
    );
  }
  if (refType === "knowledgeArticle") {
    const a = ctx.knowledgeArticles.find((x) => x.id === refId);
    if (!a) return <MissingRecord />;
    return (
      <div style={{ display: "grid", gap: 4 }}>
        <b style={{ fontSize: "var(--os-text-sm)" }}>{a.title}</b>
        {line("מצב", a.approval.state)}
        {line("גרסה", `v${a.version}`)}
        {line("תקציר", a.summary)}
      </div>
    );
  }
  if (refType === "document") {
    const d = ctx.documents.find((x) => x.id === refId);
    if (!d) return <MissingRecord />;
    return (
      <div style={{ display: "grid", gap: 4 }}>
        <b style={{ fontSize: "var(--os-text-sm)" }}>{d.name}</b>
        {line("סוג", d.type)}
        {line("תיאור", d.description)}
      </div>
    );
  }
  // Wave-7 collections (implementationEvidence / pilot / rollout)
  const listByType: Record<string, readonly W7RecordLike[]> = {
    implementationEvidence: ctx.implementationEvidence,
    pilotDefinition: ctx.pilotDefinitions,
    pilotResult: ctx.pilotResults,
    rolloutWave: ctx.rolloutWaves,
  };
  const rec = (listByType[refType] ?? []).find((x) => x.id === refId);
  if (!rec) return <MissingRecord />;
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <b style={{ fontSize: "var(--os-text-sm)" }}>
        {rec.titleHe ?? rec.title ?? rec.name ?? rec.id}
      </b>
      {rec.status ? line("סטטוס", rec.status) : null}
      {rec.outcome ? line("תוצאה", rec.outcome) : null}
      {line("נוצר", rec.createdAt.slice(0, 10))}
    </div>
  );
}

function MissingRecord(): ReactElement {
  return (
    <div style={{ color: "var(--os-danger)", fontSize: "var(--os-text-xs)" }}>
      הרשומה לא נמצאה באוסף — הראיה פסולה.
    </div>
  );
}

// ── PageRail: "מבקר המוכנות" ───────────────────────────────────────────────
function ReadinessRail({
  rows,
  stages,
}: {
  rows: readonly { def: StageGateDef; gate: StageGateV2; validation: GateValidation }[];
  stages: readonly ImplementationStage[];
}): ReactElement {
  const missing = rows.reduce((n, r) => n + r.validation.missingCount, 0);
  const invalid = rows.reduce((n, r) => n + r.validation.invalidCount, 0);
  const expired = rows.reduce((n, r) => n + r.validation.expiredCount, 0);
  const noReviewer = rows.filter((r) => r.validation.reviewerId === null);
  const pendingDecision = rows.filter((r) => r.validation.state === "בבדיקה");
  const nextDates = rows
    .map((r) => r.validation.nextDecisionDate)
    .filter((d): d is string => d !== null)
    .sort();
  const blocked = rows.filter(
    (r) => r.validation.state === "חסרות ראיות" || r.validation.state === "פג תוקף",
  );

  return (
    <div style={{ display: "grid", gap: "var(--os-space-5)", fontSize: "var(--os-text-sm)" }}>
      <div style={{ color: "var(--os-text)", fontWeight: 600 }}>מבקר המוכנות</div>
      <RailRow label="ראיות חסרות" value={missing} warn={missing > 0} />
      <RailRow label="ערכים סותרים / ראיות פסולות" value={invalid} warn={invalid > 0} />
      <RailRow label="מקורות שפג תוקפם" value={expired} warn={expired > 0} />
      <RailRow label="שערים ללא בודק" value={noReviewer.length} warn={noReviewer.length > 0} />
      <RailRow label="ממתינים להחלטה (בבדיקה)" value={pendingDecision.length} warn={false} />
      <div>
        <div style={railSub}>מועד ההחלטה הבא</div>
        <div className="os-num" style={{ color: "var(--os-text)" }}>
          {nextDates[0] ? nextDates[0].slice(0, 10) : "לא נקבע"}
        </div>
      </div>
      <div>
        <div style={railSub}>שלבי הטמעה מושפעים</div>
        {blocked.length === 0 ? (
          <div style={{ color: "var(--os-muted)", fontSize: "var(--os-text-xs)" }}>
            אין שער חוסם שלב הטמעה כרגע.
          </div>
        ) : (
          blocked.map((r) => {
            const stage = stages.find((s) => s.gateId === r.gate.id);
            return (
              <div
                key={r.gate.id}
                style={{ fontSize: "var(--os-text-xs)", color: "var(--os-text-2)", marginBlockEnd: 4 }}
              >
                <span className="os-num">{r.def.gateKey}</span> {r.def.nameHe} ←{" "}
                {stage ? `שלב «${stage.name}»` : "שלב לא מקושר"} ({r.validation.state})
              </div>
            );
          })
        )}
      </div>
      <div style={{ color: "var(--os-muted)", fontSize: "var(--os-text-2xs)" }}>
        כל המספרים נגזרים מהמאמת הדטרמיניסטי — אין שער שעובר על סמך אחוז.
      </div>
    </div>
  );
}

function RailRow({
  label,
  value,
  warn,
}: {
  label: string;
  value: number;
  warn: boolean;
}): ReactElement {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: "var(--os-space-3)",
        marginBlockEnd: 4,
      }}
    >
      <span style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-xs)" }}>{label}</span>
      <span className="os-num" style={{ color: warn ? "var(--os-warning)" : "var(--os-text)" }}>
        {value}
      </span>
    </div>
  );
}

const railSub: CSSProperties = {
  color: "var(--os-text)",
  fontWeight: 600,
  fontSize: "var(--os-text-xs)",
  marginBlockEnd: 4,
};
