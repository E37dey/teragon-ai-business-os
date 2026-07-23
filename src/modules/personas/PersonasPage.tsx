// /personas — פרסונות ומסלולי הדרכה (Wave 7 Phase 7.6, spec chapter 13).
// Exactly seven persona lanes (bridged from the seeded records — Lead
// decision C1: canonical adoption set, legacy names preserved), the full
// Training Matrix, material/owner assignment views, per-persona objections
// (the W7-D FAQ export), support-path links and the "מבקר הפרסונות" rail.
// Honesty: adoption progress is "טרם נמדד" — no invented rates; targets are
// rendered separately from (absent) measurements.
import { useMemo, useState } from "react";
import type { CSSProperties, ReactElement, ReactNode } from "react";
import { Link } from "react-router-dom";
import { PageRail } from "@/app/rail";
import {
  ConfidenceBar,
  DataTable,
  Drawer,
  EmptyState,
  KpiCard,
  OsIcon,
  Panel,
  SectionTitle,
  StatusChip,
  Stepper,
  type DataTableColumn,
  type IconName,
  type OsAccent,
} from "@/design-system";
import type { Persona, TrainingMaterial, User } from "@/domain/types";
import {
  auditPersonas,
  bridgePersonas,
  exactly7Personas,
  NOT_MEASURED,
  objectionsOf,
  PERSONA_OBJECTIONS,
  SEED_BRIDGE_NOTES,
  type PersonaAuditWarning,
  type PersonaV2,
} from "@/domain/personas";
import { DEMO_DATA_LABEL } from "@/repositories/seed";
import { useCollection } from "@/app/data/hooks";
import { TrainingMatrix } from "@/modules/training-matrix";

// ── unique visual identity per canonical persona (spec: lanes, not clones) ──
interface PersonaVisual {
  accent: OsAccent;
  icon: IconName;
  /** persona-specific signature block key */
  signature: "simulation" | "team-report" | "go-nogo" | "rbac" | "policy" | "tier2" | "lace";
}
const PERSONA_VISUALS: Record<string, PersonaVisual> = {
  "per-1": { accent: "cyan", icon: "target", signature: "simulation" },
  "per-2": { accent: "blue", icon: "users", signature: "team-report" },
  "per-3": { accent: "violet", icon: "briefcase", signature: "go-nogo" },
  "per-4": { accent: "warning", icon: "gear", signature: "rbac" },
  "per-5": { accent: "danger", icon: "shield", signature: "policy" },
  "per-6": { accent: "success", icon: "sparkle", signature: "tier2" },
  "per-7": { accent: "blue", icon: "alert", signature: "lace" },
};
const ACCENT_VAR: Record<OsAccent, string> = {
  blue: "var(--os-blue)",
  cyan: "var(--os-cyan)",
  violet: "var(--os-violet)",
  success: "var(--os-success)",
  warning: "var(--os-warning)",
  danger: "var(--os-danger)",
};

const kpiRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: "var(--os-space-5)",
};

function scrollToAnchor(anchorId: string): void {
  document.getElementById(anchorId)?.scrollIntoView({ behavior: "smooth", block: "center" });
}

export default function PersonasPage(): ReactElement {
  const personasQ = useCollection<Persona>("personas");
  const materialsQ = useCollection<TrainingMaterial>("trainingMaterials");
  const usersQ = useCollection<User>("users");

  const [materialDrawerId, setMaterialDrawerId] = useState<string | null>(null);

  const seedPersonas = useMemo(() => personasQ.data ?? [], [personasQ.data]);
  const materials = useMemo(() => materialsQ.data ?? [], [materialsQ.data]);
  const users = useMemo(() => usersQ.data ?? [], [usersQ.data]);

  const bridge = useMemo(() => bridgePersonas(seedPersonas), [seedPersonas]);
  const personas = bridge.personas;
  const guard = useMemo(() => exactly7Personas(personas), [personas]);
  const warnings = useMemo(
    () => auditPersonas(personas, materials, users),
    [personas, materials, users],
  );

  const linkedMaterialIds = useMemo(
    () => new Set(personas.flatMap((p) => p.supportingMaterials.map((l) => l.materialId))),
    [personas],
  );
  const issueCount = warnings.filter((w) => w.severity === "אזהרה").length;

  if (personasQ.isError || materialsQ.isError || usersQ.isError) {
    return (
      <EmptyState
        icon="alert"
        title="שגיאה בטעינת הפרסונות"
        reason="קריאת ה-repositories נכשלה — נסו לרענן את הדף."
      />
    );
  }
  if (personasQ.isLoading || materialsQ.isLoading || usersQ.isLoading) {
    return (
      <Panel style={{ padding: "var(--os-space-8)", color: "var(--os-text-2)" }}>
        טוען פרסונות ומסלולי הדרכה…
      </Panel>
    );
  }

  const drawerMaterial = materialDrawerId
    ? (materials.find((m) => m.id === materialDrawerId) ?? null)
    : null;

  return (
    <div style={{ display: "grid", gap: "var(--os-space-6)" }}>
      <PageRail>
        <PersonasRail warnings={warnings} bridgeProblems={bridge.problems} guardOk={guard.ok} />
      </PageRail>

      <SectionTitle icon="users" title="פרסונות ומסלולי הדרכה" subtitle={DEMO_DATA_LABEL} />

      <div style={kpiRowStyle}>
        <KpiCard
          title="פרסונות קנוניות"
          value={`${personas.length} / 7`}
          accent={guard.ok ? "success" : "danger"}
          icon="users"
          glow={!guard.ok}
        />
        <KpiCard
          title="חומרי תמיכה מקושרים"
          value={`${linkedMaterialIds.size} / ${materials.length}`}
          accent="cyan"
          icon="book"
        />
        <KpiCard
          title="התנגדויות ממופות"
          value={PERSONA_OBJECTIONS.length}
          accent="violet"
          icon="mail"
        />
        <KpiCard
          title="ממצאי מבקר (אזהרות)"
          value={issueCount}
          accent={issueCount > 0 ? "warning" : "success"}
          icon="gauge"
        />
        <KpiCard title="התקדמות אימוץ" value={NOT_MEASURED} accent="blue" icon="clock" />
      </div>

      {/* seven persona lanes */}
      <div>
        <SectionTitle icon="target" title="שבע הפרסונות — מסלול לכל קהל" />
        <div style={{ display: "grid", gap: "var(--os-space-5)" }}>
          {personas.map((p) => (
            <PersonaLane
              key={p.id}
              persona={p}
              materials={materials}
              onMaterialClick={setMaterialDrawerId}
            />
          ))}
        </div>
      </div>

      {/* the canonical training matrix */}
      <div>
        <SectionTitle
          icon="book"
          title="Training Matrix — המטריצה הקנונית"
          subtitle="יעד ≠ נמדד — תוצאה בפועל מוצגת רק לאחר מדידה"
        />
        <TrainingMatrix
          personas={personas}
          materials={materials}
          onMaterialClick={setMaterialDrawerId}
          onPersonaClick={(id) => scrollToAnchor(`persona-lane-${id}`)}
        />
      </div>

      {/* assignment views */}
      <div
        style={{
          display: "grid",
          gap: "var(--os-space-5)",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          alignItems: "start",
        }}
      >
        <MaterialAssignmentView
          personas={personas}
          materials={materials}
          onMaterialClick={setMaterialDrawerId}
        />
        <OwnerAssignmentView personas={personas} users={users} />
      </div>

      {/* validation status */}
      <ValidationStatus guardOk={guard.ok} problems={[...guard.problems, ...bridge.problems]} personas={personas} />

      {drawerMaterial && (
        <MaterialDrawer
          material={drawerMaterial}
          personas={personas}
          onClose={() => setMaterialDrawerId(null)}
        />
      )}
    </div>
  );
}

// ── persona lane ────────────────────────────────────────────────────────────
function Field({
  anchor,
  label,
  children,
}: {
  anchor: string;
  label: string;
  children: ReactNode;
}): ReactElement {
  return (
    <div id={anchor} style={{ display: "grid", gap: 2 }}>
      <span
        style={{
          color: "var(--os-muted)",
          fontSize: "var(--os-text-2xs)",
          fontWeight: 600,
        }}
      >
        {label}
      </span>
      <span style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-sm)" }}>{children}</span>
    </div>
  );
}

function SignatureBlock({ persona }: { persona: PersonaV2 }): ReactElement {
  const visual = PERSONA_VISUALS[persona.id];
  const chip = (label: string, cls: string): ReactElement => (
    <span key={label} className={`os-chip ${cls}`}>
      {label}
    </span>
  );
  switch (visual?.signature) {
    case "simulation":
      return (
        <Stepper
          steps={[
            { id: "s1", label: "קליטת ליד", icon: "inbox" },
            { id: "s2", label: "הצעת מחיר", icon: "doc" },
            { id: "s3", label: "אישור אנושי", icon: "check" },
          ]}
          activeId="s1"
        />
      );
    case "team-report":
      return (
        <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
          {chip("דוח שבועי", "os-chip--blue")}
          {chip("אישורי שלבים", "os-chip--cyan")}
          {chip("זיהוי תקוע", "os-chip--warning")}
        </span>
      );
    case "go-nogo":
      return (
        <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
          {chip("Go", "os-chip--success")}
          {chip("No-Go", "os-chip--danger")}
          {chip("מבוסס דוח — לא תחושה", "os-chip--muted")}
        </span>
      );
    case "rbac":
      return (
        <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
          {chip("RBAC", "os-chip--warning")}
          {chip("יומן ביקורת", "os-chip--cyan")}
          {chip("הגדרות סוכנים", "os-chip--violet")}
        </span>
      );
    case "policy":
      return (
        <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
          {chip("✓ מותר אוטומטית", "os-chip--success")}
          {chip("HITL — דורש אישור", "os-chip--warning")}
          {chip("✗ אסור", "os-chip--danger")}
        </span>
      );
    case "tier2":
      return (
        <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
          {chip("Tier-2 אנושי", "os-chip--success")}
          {chip("FAQ חי", "os-chip--cyan")}
          {chip("Playbook", "os-chip--blue")}
        </span>
      );
    case "lace":
      return (
        <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
          {chip("Listen", "os-chip--cyan")}
          {chip("Acknowledge", "os-chip--blue")}
          {chip("Clarify", "os-chip--violet")}
          {chip("Explore", "os-chip--success")}
        </span>
      );
    default:
      return <span />;
  }
}

function PersonaLane({
  persona,
  materials,
  onMaterialClick,
}: {
  persona: PersonaV2;
  materials: readonly TrainingMaterial[];
  onMaterialClick: (id: string) => void;
}): ReactElement {
  const visual = PERSONA_VISUALS[persona.id] ?? {
    accent: "blue" as OsAccent,
    icon: "users" as IconName,
    signature: "simulation" as const,
  };
  const accentColor = ACCENT_VAR[visual.accent];
  const objections = objectionsOf(persona.id);
  const materialById = new Map(materials.map((m) => [m.id, m]));
  const metric = persona.successMetric;

  return (
    <Panel
      id={`persona-lane-${persona.id}`}
      style={{
        padding: "var(--os-space-5)",
        borderInlineStart: `3px solid ${accentColor}`,
        display: "grid",
        gap: "var(--os-space-4)",
      }}
    >
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--os-space-3)", flexWrap: "wrap" }}>
        <span style={{ color: accentColor, display: "inline-flex" }}>
          <OsIcon name={visual.icon} size={20} />
        </span>
        <b style={{ fontSize: "var(--os-text-lg)", color: "var(--os-text)" }}>{persona.name}</b>
        <span className="os-chip os-chip--muted">{persona.role}</span>
        <StatusChip
          status={
            persona.approvalState === "מאושר"
              ? "הושלם"
              : persona.approvalState === "ממתין לאישור"
                ? "דורש אישור"
                : "ממתין"
          }
          label={persona.approvalState}
        />
        <span
          style={{
            marginInlineStart: "auto",
            color: "var(--os-muted)",
            fontSize: "var(--os-text-2xs)",
          }}
          title={SEED_BRIDGE_NOTES[persona.id] ?? ""}
        >
          seed: {persona.legacyName} · v{persona.version}
        </span>
      </div>

      <SignatureBlock persona={persona} />

      {/* field grid */}
      <div
        style={{
          display: "grid",
          gap: "var(--os-space-4)",
          gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
        }}
      >
        <Field anchor={`persona-${persona.id}-primaryQuestion`} label="השאלה המרכזית">
          {persona.primaryQuestion}
        </Field>
        <Field anchor={`persona-${persona.id}-desiredValue`} label="הערך המבוקש">
          {persona.desiredValue}
        </Field>
        <Field anchor={`persona-${persona.id}-adoptionBarrier`} label="חסם האימוץ">
          {persona.adoptionBarrier}
        </Field>
        <Field anchor={`persona-${persona.id}-knowledge`} label="ידע: קיים ← נדרש ← יכולת">
          {persona.currentKnowledge}
          <br />← {persona.requiredKnowledge}
          <br />← {persona.requiredAbility}
        </Field>
        <Field anchor={`persona-${persona.id}-trainingObjective`} label="מטרת ההדרכה">
          {persona.trainingObjective}
        </Field>
        <Field anchor={`persona-${persona.id}-format`} label="פורמט ומשך">
          {persona.trainingFormat} ·{" "}
          <span className="os-num" style={{ color: accentColor }}>
            {persona.durationMinutes} דק'
          </span>
        </Field>
        <Field anchor={`persona-${persona.id}-exercise`} label="תרגול">
          {persona.exercise}
        </Field>
        <Field anchor={`persona-${persona.id}-successMetric`} label="מדד הצלחה — יעד ≠ נמדד">
          {metric.description}
          <br />
          <span style={{ fontSize: "var(--os-text-2xs)" }}>
            יעד:{" "}
            {metric.numericTarget !== null ? (
              <b className="os-num" style={{ color: accentColor }}>
                {metric.numericTarget}
                {metric.unit ?? ""}
              </b>
            ) : (
              <span style={{ color: "var(--os-muted)" }}>{metric.targetNote}</span>
            )}{" "}
            · נמדד: <span style={{ color: "var(--os-muted)" }}>{metric.measuredNote}</span>
          </span>
        </Field>
        <Field anchor={`persona-${persona.id}-supportingMaterials`} label="חומרי תמיכה">
          <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
            {persona.supportingMaterials.map((l) => {
              const m = materialById.get(l.materialId);
              return (
                <button
                  key={l.materialId}
                  type="button"
                  className={`os-chip ${m ? (l.role === "ראשי" ? "os-chip--cyan" : "os-chip--muted") : "os-chip--danger"}`}
                  style={{ cursor: "pointer", border: "none", font: "inherit" }}
                  onClick={() => onMaterialClick(l.materialId)}
                >
                  {m ? m.title : `${l.materialId} — לא נמצא`}
                </button>
              );
            })}
          </span>
        </Field>
        <Field anchor={`persona-${persona.id}-namedOwner`} label="אחראי (אדם, בשם)">
          {persona.namedOwner.name}
        </Field>
        <Field anchor={`persona-${persona.id}-supportTier`} label="מסלול תמיכה">
          <Link to="/support" style={{ color: accentColor }}>
            Tier {persona.supportTier} — מעבר לתמיכה
          </Link>
        </Field>
        <Field anchor={`persona-${persona.id}-adoption`} label="התקדמות אימוץ">
          <ConfidenceBar value={null} label={NOT_MEASURED} />
        </Field>
      </div>

      {/* objections (W7-D FAQ feed) */}
      <div id={`persona-${persona.id}-objections`}>
        <span
          style={{
            color: "var(--os-muted)",
            fontSize: "var(--os-text-2xs)",
            fontWeight: 600,
          }}
        >
          התנגדויות ({objections.length}) — מוזנות ל-FAQ
        </span>
        {objections.length === 0 ? (
          <div style={{ color: "var(--os-muted)", fontSize: "var(--os-text-xs)" }}>
            לא מופתה התנגדות לפרסונה זו.
          </div>
        ) : (
          objections.map((o) => (
            <div
              key={o.id}
              style={{
                fontSize: "var(--os-text-sm)",
                color: "var(--os-text-2)",
                marginBlockStart: 4,
              }}
            >
              <b style={{ color: "var(--os-text)" }}>«{o.quote}»</b>
              <div style={{ fontSize: "var(--os-text-2xs)", color: "var(--os-muted)" }}>
                LACE: {o.clarify} ← {o.explore}
              </div>
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}

// ── assignment views ────────────────────────────────────────────────────────
interface MaterialRow {
  material: TrainingMaterial;
  personas: PersonaV2[];
  primaryOf: PersonaV2 | null;
}

function MaterialAssignmentView({
  personas,
  materials,
  onMaterialClick,
}: {
  personas: readonly PersonaV2[];
  materials: readonly TrainingMaterial[];
  onMaterialClick: (id: string) => void;
}): ReactElement {
  const rows: MaterialRow[] = materials.map((material) => {
    const linked = personas.filter((p) =>
      p.supportingMaterials.some((l) => l.materialId === material.id),
    );
    const primaryOf =
      personas.find((p) =>
        p.supportingMaterials.some((l) => l.materialId === material.id && l.role === "ראשי"),
      ) ?? null;
    return { material, personas: linked, primaryOf };
  });
  const columns: DataTableColumn<MaterialRow>[] = [
    { key: "title", header: "חומר", render: (r) => <b>{r.material.title}</b> },
    { key: "kind", header: "סוג", render: (r) => r.material.kind },
    {
      key: "personas",
      header: "פרסונות",
      render: (r) =>
        r.personas.length === 0 ? (
          <span style={{ color: "var(--os-muted)" }}>לא משויך</span>
        ) : (
          r.personas.map((p) => p.name).join(" · ")
        ),
    },
    {
      key: "primary",
      header: "ראשי אצל",
      render: (r) =>
        r.primaryOf ? (
          <span className="os-chip os-chip--cyan">{r.primaryOf.name}</span>
        ) : (
          <span style={{ color: "var(--os-muted)", fontSize: "var(--os-text-xs)" }}>—</span>
        ),
    },
  ];
  return (
    <div>
      <SectionTitle icon="doc" title={`שיוך חומרים (${materials.length})`} />
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.material.id}
        onRowClick={(r) => onMaterialClick(r.material.id)}
        emptyText="אין חומרי הדרכה"
        emptyReason="אוסף trainingMaterials ריק."
        maxHeight={360}
      />
    </div>
  );
}

interface OwnerRow {
  user: User;
  personas: PersonaV2[];
}

function OwnerAssignmentView({
  personas,
  users,
}: {
  personas: readonly PersonaV2[];
  users: readonly User[];
}): ReactElement {
  const rows: OwnerRow[] = users
    .map((user) => ({
      user,
      personas: personas.filter((p) => p.namedOwner.userId === user.id),
    }))
    .filter((r) => r.personas.length > 0);
  const columns: DataTableColumn<OwnerRow>[] = [
    { key: "name", header: "אחראי", render: (r) => <b>{r.user.name}</b> },
    { key: "role", header: "תפקיד", render: (r) => r.user.role },
    {
      key: "personas",
      header: "פרסונות באחריותו",
      render: (r) => r.personas.map((p) => p.name).join(" · "),
    },
    {
      key: "load",
      header: "עומס",
      align: "center",
      render: (r) => <span className="os-table__num">{r.personas.length}</span>,
    },
  ];
  return (
    <div>
      <SectionTitle icon="users" title="שיוך אחראים (אנשים בשם)" />
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.user.id}
        emptyText="אין אחראים משויכים"
        emptyReason="אף פרסונה לא הוקצתה לאחראי."
        maxHeight={360}
      />
    </div>
  );
}

// ── validation status ───────────────────────────────────────────────────────
function ValidationStatus({
  guardOk,
  problems,
  personas,
}: {
  guardOk: boolean;
  problems: readonly string[];
  personas: readonly PersonaV2[];
}): ReactElement {
  const approved = personas.filter((p) => p.approvalState === "מאושר").length;
  return (
    <Panel variant="raised" style={{ padding: "var(--os-space-5)", display: "grid", gap: 8 }}>
      <SectionTitle icon="check" title="סטטוס ולידציה" />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <StatusChip
          status={guardOk ? "הושלם" : "חסום"}
          label={guardOk ? "בדיוק 7 פרסונות קנוניות" : "כשל בשומר ה-7"}
        />
        <span className="os-chip os-chip--success">
          {approved}/{personas.length} מאושרות
        </span>
        <span className="os-chip os-chip--muted">אימוץ: {NOT_MEASURED}</span>
      </div>
      {problems.length > 0 && (
        <ul style={{ margin: 0, paddingInlineStart: "1.2em", color: "var(--os-danger)" }}>
          {problems.map((p) => (
            <li key={p} style={{ fontSize: "var(--os-text-sm)" }}>
              {p}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

// ── material drawer ─────────────────────────────────────────────────────────
function MaterialDrawer({
  material,
  personas,
  onClose,
}: {
  material: TrainingMaterial;
  personas: readonly PersonaV2[];
  onClose: () => void;
}): ReactElement {
  const linked = personas.filter((p) =>
    p.supportingMaterials.some((l) => l.materialId === material.id),
  );
  return (
    <Drawer open onClose={onClose} title={material.title}>
      <div style={{ display: "grid", gap: "var(--os-space-4)" }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <span className="os-chip os-chip--cyan">{material.kind}</span>
          <span className="os-chip os-chip--muted">{material.id}</span>
        </div>
        <div style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-sm)" }}>
          {material.description}
        </div>
        <div>
          <SectionTitle icon="users" title="פרסונות מקושרות" />
          {linked.length === 0 ? (
            <div style={{ color: "var(--os-muted)", fontSize: "var(--os-text-sm)" }}>
              אף פרסונה אינה מקשרת לחומר זה.
            </div>
          ) : (
            linked.map((p) => {
              const l = p.supportingMaterials.find((x) => x.materialId === material.id);
              const fresh = l ? l.expectedUpdatedAt === material.updatedAt : false;
              return (
                <div
                  key={p.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                    marginBlockEnd: 4,
                    fontSize: "var(--os-text-sm)",
                  }}
                >
                  <span>
                    {p.name}{" "}
                    <span style={{ color: "var(--os-muted)", fontSize: "var(--os-text-2xs)" }}>
                      ({l?.role})
                    </span>
                  </span>
                  <StatusChip
                    status={fresh ? "הושלם" : "אזהרה"}
                    label={fresh ? "גרסה תואמת" : "גרסה לא תואמת"}
                  />
                </div>
              );
            })
          )}
        </div>
      </div>
    </Drawer>
  );
}

// ── rail: מבקר הפרסונות ─────────────────────────────────────────────────────
const railTitle: CSSProperties = {
  color: "var(--os-text)",
  fontWeight: 600,
  marginBlockEnd: "var(--os-space-3)",
};

function PersonasRail({
  warnings,
  bridgeProblems,
  guardOk,
}: {
  warnings: readonly PersonaAuditWarning[];
  bridgeProblems: readonly string[];
  guardOk: boolean;
}): ReactElement {
  const issues = warnings.filter((w) => w.severity === "אזהרה");
  const infos = warnings.filter((w) => w.severity === "מידע");
  return (
    <div style={{ display: "grid", gap: "var(--os-space-6)", fontSize: "var(--os-text-sm)" }}>
      <div>
        <div style={railTitle}>מבקר הפרסונות</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <StatusChip status={guardOk ? "הושלם" : "חסום"} label={guardOk ? "7/7" : "שומר ה-7 נכשל"} />
          <span className={`os-chip ${issues.length > 0 ? "os-chip--warning" : "os-chip--success"}`}>
            {issues.length} אזהרות
          </span>
          <span className="os-chip os-chip--muted">{infos.length} הערות</span>
        </div>
      </div>

      {bridgeProblems.length > 0 && (
        <div>
          <div style={railTitle}>בעיות גשר seed</div>
          {bridgeProblems.map((p) => (
            <div key={p} style={{ color: "var(--os-danger)", fontSize: "var(--os-text-xs)" }}>
              {p}
            </div>
          ))}
        </div>
      )}

      <div>
        <div style={railTitle}>בדיקת התאמה ({issues.length})</div>
        {issues.length === 0 && (
          <div style={{ color: "var(--os-muted)", fontSize: "var(--os-text-xs)" }}>
            לא נמצאו פערים — כל פרסונה עם חומר, תרגול, אחראי בשם ומסלול תמיכה.
          </div>
        )}
        {issues.map((w) => (
          <RailWarning key={w.id} warning={w} />
        ))}
      </div>

      {infos.length > 0 && (
        <div>
          <div style={railTitle}>מצבים כנים ({infos.length})</div>
          {infos.map((w) => (
            <RailWarning key={w.id} warning={w} />
          ))}
        </div>
      )}

      <div>
        <div style={railTitle}>התקדמות אימוץ</div>
        <ConfidenceBar value={null} label="אימוץ בפועל" />
        <div style={{ color: "var(--os-muted)", fontSize: "var(--os-text-2xs)", marginBlockStart: 4 }}>
          נמדד רק מהתנהגות בפועל — אין אחוזי אימוץ מומצאים.
        </div>
      </div>
    </div>
  );
}

function RailWarning({ warning }: { warning: PersonaAuditWarning }): ReactElement {
  return (
    <button
      type="button"
      onClick={() => scrollToAnchor(warning.anchorId)}
      style={{
        display: "block",
        inlineSize: "100%",
        textAlign: "start",
        background: "none",
        border: "none",
        padding: "4px 0",
        cursor: "pointer",
        font: "inherit",
      }}
      title={`מעבר אל ${warning.personaName}`}
    >
      <span
        style={{
          color: warning.severity === "אזהרה" ? "var(--os-warning)" : "var(--os-muted)",
          fontSize: "var(--os-text-2xs)",
          fontWeight: 600,
        }}
      >
        {warning.kind} · {warning.personaName}
      </span>
      <div style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-xs)" }}>{warning.message}</div>
    </button>
  );
}
