// /training-materials — מרכז חומרי ההדרכה (Wave 7, W7-D, spec chapter 15).
// Two sections (7 reading + 6 teaching), 13 canonical cards bridged
// idempotently onto the seeded records, real structured-content preview,
// canonical approvals flow (never auto-approved) and the "מבקר החומרים" rail.
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import { Link } from "react-router-dom";
import { PageRail } from "@/app/rail";
import {
  Drawer,
  EmptyState,
  KpiCard,
  OsButton,
  Panel,
  SectionTitle,
  StatusChip,
  useToast,
} from "@/design-system";
import type { Activity, Approval, Persona, StageGate, User } from "@/domain/types";
import { getRepository, nextId } from "@/repositories";
import { CEO_USER_ID, DEMO_DATA_LABEL } from "@/repositories/seed";
import { useCollection, useInvalidateCollections } from "@/app/data/hooks";
import {
  auditMaterials,
  CANONICAL_MATERIALS,
  ensureCanonicalMaterials,
  MICROLEARNING_CHECK_AI,
  type MaterialFinding,
  type MaterialStatus,
  type TrainingMaterialV2,
} from "@/domain/training-materials";
import { ContentSections } from "./components/ContentRenderer";
import { MicrolearningPreview } from "./components/MicrolearningPreview";

const kpiRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: "var(--os-space-5)",
};

const cardsGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
  gap: "var(--os-space-4)",
};

function statusChipClass(status: MaterialStatus | undefined): string {
  switch (status) {
    case "מאושר":
      return "os-chip--success";
    case "ממתין לבדיקה":
      return "os-chip--blue";
    case "טיוטה":
      return "os-chip--cyan";
    case "דורש עדכון":
      return "os-chip--warning";
    case "חסר":
      return "os-chip--danger";
    case "בארכיון":
      return "os-chip--muted";
    default:
      return "os-chip--muted";
  }
}

async function logMaterialActivity(text: string, materialId: string): Promise<void> {
  const repo = getRepository<Activity>("activities");
  const all = await repo.list();
  const now = new Date().toISOString();
  await repo.create({
    id: nextId(
      "act",
      all.map((a) => a.id),
    ),
    kind: "הדרכה",
    text,
    actorId: CEO_USER_ID,
    entityRef: `trainingMaterial:${materialId}`,
    at: now,
    createdAt: now,
    updatedAt: now,
  });
}

export default function TrainingMaterialsPage(): ReactElement {
  const materialsQ = useCollection<TrainingMaterialV2>("trainingMaterials");
  const personasQ = useCollection<Persona>("personas");
  const usersQ = useCollection<User>("users");
  const gatesQ = useCollection<StageGate>("stageGates");
  const approvalsQ = useCollection<Approval>("approvals");
  const invalidate = useInvalidateCollections();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bridged, setBridged] = useState(false);

  // idempotent bridge — upgrades the 13 seeded records to the canonical list
  useEffect(() => {
    let cancelled = false;
    void ensureCanonicalMaterials().then((result) => {
      if (cancelled) return;
      setBridged(true);
      if (result.changedIds.length > 0) void invalidate(["trainingMaterials"]);
    });
    return () => {
      cancelled = true;
    };
  }, [invalidate]);

  const materials = useMemo(() => materialsQ.data ?? [], [materialsQ.data]);
  const personas = personasQ.data ?? [];
  const users = usersQ.data ?? [];
  const gates = gatesQ.data ?? [];
  const approvals = approvalsQ.data ?? [];

  const canonical = useMemo(
    () =>
      CANONICAL_MATERIALS.map((def) => materials.find((m) => m.id === def.seedId)).filter(
        (m): m is TrainingMaterialV2 => m !== undefined,
      ),
    [materials],
  );
  const reading = canonical.filter((m) => m.section === "חומרי קריאה");
  const teaching = canonical.filter((m) => m.section === "חומרי הוראה ותרגול");
  const findings = useMemo(() => auditMaterials(canonical), [canonical]);
  const approvedCount = canonical.filter((m) => m.status === "מאושר").length;
  const awaitingCount = canonical.filter((m) => m.status === "ממתין לבדיקה").length;

  const selected = canonical.find((m) => m.id === selectedId) ?? null;

  if (materialsQ.isError) {
    return (
      <EmptyState
        icon="alert"
        title="שגיאה בטעינת חומרי ההדרכה"
        reason="קריאת ה-repositories נכשלה — נסו לרענן את הדף."
      />
    );
  }
  if (materialsQ.isLoading || !bridged) {
    return (
      <Panel style={{ padding: "var(--os-space-8)", color: "var(--os-text-2)" }}>
        טוען את מרכז חומרי ההדרכה…
      </Panel>
    );
  }

  return (
    <div style={{ display: "grid", gap: "var(--os-space-6)" }}>
      <PageRail>
        <MaterialsRail findings={findings} />
      </PageRail>

      <SectionTitle icon="book" title="מרכז חומרי ההדרכה" subtitle={DEMO_DATA_LABEL} />

      <div style={kpiRowStyle}>
        <KpiCard title="חומרים קנוניים" value={canonical.length} accent="cyan" icon="book" />
        <KpiCard title="חומרי קריאה" value={reading.length} accent="blue" icon="doc" />
        <KpiCard title="חומרי הוראה ותרגול" value={teaching.length} accent="violet" icon="graduation" />
        <KpiCard title="מאושרים" value={approvedCount} accent="success" icon="check" />
        <KpiCard title="ממתינים לבדיקה" value={awaitingCount} accent="warning" icon="clock" />
      </div>

      <div>
        <SectionTitle icon="doc" title={`חומרי קריאה (${reading.length})`} />
        <div style={cardsGrid}>
          {reading.map((m) => (
            <MaterialCard
              key={m.id}
              material={m}
              personas={personas}
              users={users}
              findings={findings}
              onOpen={() => setSelectedId(m.id)}
            />
          ))}
        </div>
      </div>

      <div>
        <SectionTitle icon="graduation" title={`חומרי הוראה ותרגול (${teaching.length})`} />
        <div style={cardsGrid}>
          {teaching.map((m) => (
            <MaterialCard
              key={m.id}
              material={m}
              personas={personas}
              users={users}
              findings={findings}
              onOpen={() => setSelectedId(m.id)}
            />
          ))}
        </div>
      </div>

      {selected && (
        <MaterialDrawer
          key={selected.id}
          material={selected}
          personas={personas}
          users={users}
          gates={gates}
          approvals={approvals}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

// ── card ────────────────────────────────────────────────────────────────────
function MaterialCard({
  material,
  personas,
  users,
  findings,
  onOpen,
}: {
  material: TrainingMaterialV2;
  personas: readonly Persona[];
  users: readonly User[];
  findings: readonly MaterialFinding[];
  onOpen: () => void;
}): ReactElement {
  const owner = users.find((u) => u.id === material.ownerId)?.name ?? "לא הוקצה אחראי";
  const audiences = material.audiencePersonaIds
    .map((id) => personas.find((p) => p.id === id)?.name ?? id)
    .slice(0, 3);
  const warnCount = findings.filter(
    (f) => f.materialId === material.id && f.kind !== "ללא אישור",
  ).length;
  return (
    <Panel
      variant="raised"
      role="button"
      tabIndex={0}
      aria-label={`פתיחת תצוגה מקדימה: ${material.title}`}
      style={{ padding: "var(--os-space-5)", display: "grid", gap: "var(--os-space-3)", cursor: "pointer" }}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "start" }}>
        <b style={{ color: "var(--os-text)", fontSize: "var(--os-text-md)" }}>{material.title}</b>
        <span className={`os-chip ${statusChipClass(material.status)}`}>
          {material.status ?? "לא התחיל"}
        </span>
      </div>
      <div style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-xs)", lineHeight: 1.6 }}>
        {material.description}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", fontSize: "var(--os-text-2xs)" }}>
        <span className="os-chip os-chip--muted">{material.kind}</span>
        <span className="os-chip os-chip--muted">
          גרסה <span className="os-num">{material.version ?? "—"}</span>
        </span>
        {material.printable && <span className="os-chip os-chip--cyan">ניתן להדפסה</span>}
        {warnCount > 0 && (
          <span className="os-chip os-chip--warning">
            {warnCount} ממצאי מבקר
          </span>
        )}
      </div>
      <div style={{ color: "var(--os-muted)", fontSize: "var(--os-text-2xs)" }}>
        בעלים: {owner} · פרסונות: {audiences.join(", ")}
        {material.audiencePersonaIds.length > 3 ? ` +${material.audiencePersonaIds.length - 3}` : ""}
      </div>
    </Panel>
  );
}

// ── preview + approval drawer ───────────────────────────────────────────────
function MaterialDrawer({
  material,
  personas,
  users,
  gates,
  approvals,
  onClose,
}: {
  material: TrainingMaterialV2;
  personas: readonly Persona[];
  users: readonly User[];
  gates: readonly StageGate[];
  approvals: readonly Approval[];
  onClose: () => void;
}): ReactElement {
  const { toast } = useToast();
  const invalidate = useInvalidateCollections();
  const [busy, setBusy] = useState(false);
  const def = CANONICAL_MATERIALS.find((d) => d.key === material.canonicalKey);
  const owner = users.find((u) => u.id === material.ownerId)?.name ?? "לא הוקצה אחראי";
  const gate = gates.find((g) => g.id === material.relatedGateId);
  const approval = approvals.find((a) => a.id === material.approvalId) ?? null;

  async function patchMaterial(patch: Partial<TrainingMaterialV2>, activity: string): Promise<void> {
    setBusy(true);
    try {
      const repo = getRepository<TrainingMaterialV2>("trainingMaterials");
      await repo.update(material.id, { ...patch, updatedAt: new Date().toISOString() });
      await logMaterialActivity(activity, material.id);
      await invalidate(["trainingMaterials", "activities"]);
    } finally {
      setBusy(false);
    }
  }

  async function requestApproval(): Promise<void> {
    setBusy(true);
    try {
      const repo = getRepository<Approval>("approvals");
      const all = await repo.list();
      const now = new Date().toISOString();
      const created = await repo.create({
        id: nextId(
          "ap",
          all.map((a) => a.id),
        ),
        subjectRef: `trainingMaterial:${material.id}`,
        requestedById: material.ownerId ?? CEO_USER_ID,
        requestedAt: now,
        status: "ממתין",
        decidedById: null,
        decidedAt: null,
        note: `בקשת אישור לחומר הדרכה «${material.title}»`,
        createdAt: now,
        updatedAt: now,
      });
      const materialsRepo = getRepository<TrainingMaterialV2>("trainingMaterials");
      await materialsRepo.update(material.id, {
        approvalId: created.id,
        status: "ממתין לבדיקה",
        updatedAt: now,
      });
      await logMaterialActivity(`נשלחה בקשת אישור לחומר «${material.title}»`, material.id);
      await invalidate(["approvals", "trainingMaterials", "activities"]);
      toast("בקשת האישור נוצרה — ממתינה להחלטת מאשר/ת", "success");
    } finally {
      setBusy(false);
    }
  }

  async function decideApproval(decision: "אושר" | "נדחה"): Promise<void> {
    if (!approval) return;
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const approvalsRepo = getRepository<Approval>("approvals");
      await approvalsRepo.update(approval.id, {
        status: decision,
        decidedById: CEO_USER_ID,
        decidedAt: now,
        updatedAt: now,
      });
      const materialsRepo = getRepository<TrainingMaterialV2>("trainingMaterials");
      await materialsRepo.update(material.id, {
        status: decision === "אושר" ? "מאושר" : "דורש עדכון",
        reviewDate: material.reviewDate ?? null,
        updatedAt: now,
      });
      await logMaterialActivity(
        decision === "אושר"
          ? `החומר «${material.title}» אושר על ידי צחי זוסטייהם`
          : `החומר «${material.title}» נדחה — הוחזר לעדכון`,
        material.id,
      );
      await invalidate(["approvals", "trainingMaterials", "activities"]);
      toast(decision === "אושר" ? "החומר אושר ונרשם" : "החומר הוחזר לעדכון", "success");
    } finally {
      setBusy(false);
    }
  }

  const busyProps = busy
    ? ({ disabled: true, disabledReason: "פעולה קודמת עדיין רצה" } as const)
    : ({} as const);

  return (
    <Drawer open onClose={onClose} title={material.title}>
      <div style={{ display: "grid", gap: "var(--os-space-5)" }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span className={`os-chip ${statusChipClass(material.status)}`}>
            {material.status ?? "לא התחיל"}
          </span>
          <span className="os-chip os-chip--muted">{material.section ?? "—"}</span>
          <span className="os-chip os-chip--muted">
            גרסה <span className="os-num">{material.version ?? "—"}</span>
          </span>
          {(material.exportFormats ?? []).map((f) => (
            <span key={f} className="os-chip os-chip--cyan">
              {f}
            </span>
          ))}
        </div>

        <div style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-sm)", display: "grid", gap: 4 }}>
          <span>בעלים: {owner}</span>
          <span>
            פרסונות יעד:{" "}
            {material.audiencePersonaIds
              .map((id) => personas.find((p) => p.id === id)?.name ?? id)
              .join(", ")}
          </span>
          <span>
            שלב מקושר: {material.relatedStageId ?? "—"} · שער: {gate?.name ?? material.relatedGateId ?? "—"}
          </span>
          <span>מועד בדיקה הבא: {material.reviewDate ?? "לא נקבע מועד בדיקה"}</span>
          <span>תוצאה מדידה: {material.measurableOutcome ?? "לא הוגדרה תוצאה מדידה"}</span>
        </div>

        {(material.qualityValidation ?? []).length > 0 && (
          <div>
            <SectionTitle icon="shield" title="בדיקת איכות (כנה)" />
            <ul style={{ margin: 0, paddingInlineStart: "1.25rem", color: "var(--os-text-2)", fontSize: "var(--os-text-xs)", display: "grid", gap: 4 }}>
              {(material.qualityValidation ?? []).map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
          </div>
        )}

        {/* approval flow — canonical Approval records, never auto-approved */}
        <Panel variant="raised" style={{ padding: "var(--os-space-4)", display: "grid", gap: 8 }}>
          <div style={{ color: "var(--os-text)", fontWeight: 600, fontSize: "var(--os-text-sm)" }}>
            זרימת אישור
          </div>
          {approval ? (
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-xs)" }}>
                בקשה <span className="os-num">{approval.id}</span> · סטטוס: {approval.status}
                {approval.decidedById
                  ? ` · הוחלט על ידי ${users.find((u) => u.id === approval.decidedById)?.name ?? approval.decidedById}`
                  : ""}
              </div>
              {approval.status === "ממתין" ? (
                <div style={{ display: "flex", gap: 8 }}>
                  <OsButton size="sm" variant="approve" icon="check" {...busyProps} onClick={() => void decideApproval("אושר")}>
                    אישור החומר
                  </OsButton>
                  <OsButton size="sm" variant="reject" icon="x" {...busyProps} onClick={() => void decideApproval("נדחה")}>
                    דחייה — דורש עדכון
                  </OsButton>
                </div>
              ) : (
                <StatusChip
                  status={approval.status === "אושר" ? "הושלם" : "אזהרה"}
                  label={approval.status === "אושר" ? "אושר בזרימה הקנונית" : "נדחה — דורש עדכון"}
                />
              )}
            </div>
          ) : material.status === "מאושר" || material.status === "בארכיון" ? (
            <div style={{ color: "var(--os-muted)", fontSize: "var(--os-text-xs)" }}>
              אין בקשת אישור פתוחה.
            </div>
          ) : (
            <OsButton size="sm" icon="send" {...busyProps} onClick={() => void requestApproval()}>
              שליחה לאישור
            </OsButton>
          )}
          {material.status === "מאושר" && (
            <OsButton
              size="sm"
              variant="ghost"
              icon="alert"
              {...busyProps}
              onClick={() =>
                void patchMaterial(
                  { status: "דורש עדכון" },
                  `החומר «${material.title}» סומן כדורש עדכון`,
                )
              }
            >
              סימון כדורש עדכון
            </OsButton>
          )}
        </Panel>

        {/* print — real browser print of the open preview */}
        <div style={{ display: "flex", gap: 8 }}>
          {material.printable ? (
            <OsButton size="sm" variant="ghost" icon="doc" onClick={() => window.print()}>
              הדפסה
            </OsButton>
          ) : (
            <OsButton size="sm" variant="ghost" icon="doc" disabled disabledReason="החומר אינו מסומן להדפסה">
              הדפסה
            </OsButton>
          )}
          {material.contentRoute && (
            <Link to={material.contentRoute} style={{ alignSelf: "center", color: "var(--os-cyan-text)", fontSize: "var(--os-text-sm)" }}>
              ← מעבר לעמוד החומר <span dir="ltr">({material.contentRoute})</span>
            </Link>
          )}
        </div>

        {/* the REAL structured content preview */}
        <div>
          <SectionTitle icon="book" title="תצוגה מקדימה — התוכן המלא" />
          {material.canonicalKey === "microlearning-videos" ? (
            <div style={{ display: "grid", gap: "var(--os-space-5)" }}>
              {def && <ContentSections sections={def.sections} />}
              <MicrolearningPreview concept={MICROLEARNING_CHECK_AI} />
            </div>
          ) : def ? (
            <ContentSections sections={def.sections} />
          ) : (
            <div style={{ color: "var(--os-muted)", fontSize: "var(--os-text-sm)" }}>
              לרשומה אין תוכן קנוני מקושר — סטטוס כנה: חסר.
            </div>
          )}
        </div>
      </div>
    </Drawer>
  );
}

// ── rail: מבקר החומרים ──────────────────────────────────────────────────────
function MaterialsRail({ findings }: { findings: readonly MaterialFinding[] }): ReactElement {
  const byKind = new Map<string, MaterialFinding[]>();
  for (const f of findings) {
    const list = byKind.get(f.kind) ?? [];
    list.push(f);
    byKind.set(f.kind, list);
  }
  return (
    <div style={{ display: "grid", gap: "var(--os-space-5)", fontSize: "var(--os-text-sm)" }}>
      <div style={{ color: "var(--os-text)", fontWeight: 700 }}>מבקר החומרים</div>
      {findings.length === 0 && (
        <div style={{ color: "var(--os-muted)", fontSize: "var(--os-text-xs)" }}>
          לא נמצאו ממצאים — כל הכללים עברו.
        </div>
      )}
      {[...byKind.entries()].map(([kind, list]) => (
        <div key={kind}>
          <div style={{ color: "var(--warning-text)", fontWeight: 600, marginBlockEnd: 4 }}>
            {kind} ({list.length})
          </div>
          {list.slice(0, 4).map((f) => (
            <div key={`${f.materialId}-${f.kind}`} style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-xs)", marginBlockEnd: 4 }}>
              {f.materialTitle} — {f.detailHe}
            </div>
          ))}
          {list.length > 4 && (
            <div style={{ color: "var(--os-muted)", fontSize: "var(--os-text-2xs)" }}>
              ועוד {list.length - 4}…
            </div>
          )}
        </div>
      ))}
      <div style={{ color: "var(--os-muted)", fontSize: "var(--os-text-2xs)" }}>
        הממצאים נגזרים מכללים דטרמיניסטיים על הרשומות — לא ממודל.
      </div>
    </div>
  );
}
