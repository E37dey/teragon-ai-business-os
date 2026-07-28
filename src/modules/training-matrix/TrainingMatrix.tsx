// W7-B — the canonical Training Matrix (Phase 7.5, spec chapter 13).
// One DataTable, populated ONLY from the mandated programme definitions on
// the PersonaV2 records. Target vs measured are rendered separately — a
// target is never presented as a result. Material links resolve to the 13
// seeded trainingMaterials records; unresolved ids are shown honestly.
// Consumed by PersonasPage and exported standalone for W7-E/F.
import type { ReactElement, ReactNode } from "react";
import { DataTable, StatusChip, type DataTableColumn } from "@/design-system";
import type { TrainingMaterial } from "@/domain/types";
import { NOT_MEASURED, type PersonaV2 } from "@/domain/personas";

export interface TrainingMatrixProps {
  personas: readonly PersonaV2[];
  /** live trainingMaterials collection — resolves the 13 material links */
  materials: readonly TrainingMaterial[];
  /** click a material chip (e.g. open the material drawer) */
  onMaterialClick?: (materialId: string) => void;
  /** click a persona name (e.g. scroll to its lane) */
  onPersonaClick?: (personaId: string) => void;
  maxHeight?: string | number;
}

function materialChips(
  p: PersonaV2,
  byId: Map<string, TrainingMaterial>,
  onMaterialClick?: (id: string) => void,
): ReactNode {
  return (
    <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
      {p.supportingMaterials.map((l) => {
        const material = byId.get(l.materialId);
        const label = material ? material.title : `${l.materialId} — לא נמצא`;
        const cls = material
          ? l.role === "ראשי"
            ? "os-chip os-chip--cyan"
            : "os-chip os-chip--muted"
          : "os-chip os-chip--danger";
        return onMaterialClick ? (
          <button
            key={l.materialId}
            type="button"
            className={cls}
            style={{ cursor: "pointer", border: "none", font: "inherit" }}
            title={l.role === "ראשי" ? "חומר ראשי" : "חומר משלים"}
            onClick={() => onMaterialClick(l.materialId)}
          >
            {label}
          </button>
        ) : (
          <span key={l.materialId} className={cls} title={l.role === "ראשי" ? "חומר ראשי" : "חומר משלים"}>
            {label}
          </span>
        );
      })}
    </span>
  );
}

function successMetricCell(p: PersonaV2): ReactNode {
  const m = p.successMetric;
  return (
    <span style={{ display: "grid", gap: 2 }}>
      <span>{m.description}</span>
      <span style={{ fontSize: "var(--os-text-2xs)", color: "var(--os-text-2)" }}>
        יעד:{" "}
        {m.numericTarget !== null ? (
          <b className="os-num" style={{ color: "var(--os-cyan-text)" }}>
            {m.numericTarget}
            {m.unit ?? ""}
          </b>
        ) : (
          <span style={{ color: "var(--os-muted)" }}>{m.targetNote}</span>
        )}
      </span>
      <span style={{ fontSize: "var(--os-text-2xs)", color: "var(--os-muted)" }}>
        נמדד:{" "}
        {m.measuredValue !== null ? (
          <b className="os-num">
            {m.measuredValue}
            {m.unit ?? ""}
          </b>
        ) : (
          m.measuredNote
        )}
      </span>
    </span>
  );
}

/**
 * TrainingMatrix — the canonical 9-column matrix:
 * פרסונה / מטרת ההדרכה / פורמט / משך / תרגול / מדד הצלחה / חומרי תמיכה / אחראי / סטטוס.
 */
export function TrainingMatrix({
  personas,
  materials,
  onMaterialClick,
  onPersonaClick,
  maxHeight,
}: TrainingMatrixProps): ReactElement {
  const byId = new Map(materials.map((m) => [m.id, m]));

  const columns: DataTableColumn<PersonaV2>[] = [
    {
      key: "name",
      header: "פרסונה",
      render: (p) =>
        onPersonaClick ? (
          <button
            type="button"
            onClick={() => onPersonaClick(p.id)}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              font: "inherit",
              color: "var(--os-text)",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {p.name}
          </button>
        ) : (
          <b>{p.name}</b>
        ),
    },
    { key: "trainingObjective", header: "מטרת ההדרכה" },
    { key: "trainingFormat", header: "פורמט" },
    {
      key: "durationMinutes",
      header: "משך",
      align: "center",
      render: (p) => <span className="os-table__num">{p.durationMinutes} דק'</span>,
    },
    { key: "exercise", header: "תרגול" },
    { key: "successMetric", header: "מדד הצלחה", render: (p) => successMetricCell(p) },
    {
      key: "supportingMaterials",
      header: "חומרי תמיכה",
      render: (p) => materialChips(p, byId, onMaterialClick),
    },
    { key: "namedOwner", header: "אחראי", render: (p) => p.namedOwner.name },
    {
      key: "approvalState",
      header: "סטטוס",
      render: (p) => (
        <span style={{ display: "grid", gap: 2, justifyItems: "start" }}>
          <StatusChip
            status={
              p.approvalState === "מאושר"
                ? "הושלם"
                : p.approvalState === "ממתין לאישור"
                  ? "דורש אישור"
                  : "ממתין"
            }
            label={p.approvalState}
          />
          <span style={{ fontSize: "var(--os-text-2xs)", color: "var(--os-muted)" }}>
            אימוץ: {NOT_MEASURED}
          </span>
        </span>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={personas}
      rowKey="id"
      maxHeight={maxHeight}
      emptyText="אין פרסונות להצגה"
      emptyReason="גשר הפרסונות לא החזיר רשומות — בדקו את ה-seed."
    />
  );
}

export default TrainingMatrix;
