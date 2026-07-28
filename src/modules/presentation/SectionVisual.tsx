// W7-F — the LIVE visual of each presentation section (7.21). Embeds the
// REAL components read-only: AsIsToBe (W7-A), TrainingMatrix (W7-B),
// MicrolearningPreview (W7-D) + two live summaries (roadmap / metrics) that
// read the actual collections. No screenshots here — the backup-image mode
// is a separate, honestly-labeled view.
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactElement } from "react";
import { Panel, StatusChip } from "@/design-system";
import type {
  MetricDefinition,
  MetricObservation,
  Persona,
  TrainingMaterial,
} from "@/domain/types";
import type { ImplementationProgramme, ImplementationRisk } from "@/domain/adoption/types";
import { bridgePersonas } from "@/domain/personas";
import { MICROLEARNING_CHECK_AI, QUICK_START_ACTIONS } from "@/domain/training-materials";
import { useCollection } from "@/app/data/hooks";
import { AsIsToBe } from "@/modules/implementation";
import { TrainingMatrix } from "@/modules/training-matrix";
import { MicrolearningPreview } from "@/modules/training-materials/components/MicrolearningPreview";
import { NOT_MEASURED, type PresentationVisualKey } from "@/presentation";

// ---------------------------------------------------------------------------
// scale-to-fit wrapper for the fixed 1280×720 AsIsToBe presentation view
// ---------------------------------------------------------------------------

function ScaledPresentationFrame({ children }: { children: ReactElement }): ReactElement {
  const hostRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const measure = (): void => {
      const width = host.clientWidth;
      if (width > 0) setScale(Math.min(1, width / 1280));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return; // jsdom fallback
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={hostRef} style={{ inlineSize: "100%", overflow: "hidden" }}>
      <div
        style={{
          blockSize: 720 * scale,
          inlineSize: 1280 * scale,
          overflow: "hidden",
        }}
      >
        <div style={{ transform: `scale(${scale})`, transformOrigin: "top right" }}>{children}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// roadmap summary — reads the LIVE implementation programme
// ---------------------------------------------------------------------------

function RoadmapSummary(): ReactElement {
  const programmesQ = useCollection<ImplementationProgramme>("implementationProgrammes");
  const programme = (programmesQ.data ?? [])[0] ?? null;

  if (!programme) {
    return (
      <Panel style={{ padding: "var(--os-space-5)", color: "var(--os-text-2)" }}>
        תכנית ההטמעה טרם נטענה — פתחו את מסך תכנית ההטמעה פעם אחת כדי לאתחל אותה
        (הרכיב קורא את התכנית החיה, לא עותק).
      </Panel>
    );
  }

  const stages = [...programme.stages].sort((a, b) => a.order - b.order);
  return (
    <div data-testid="roadmap-summary" style={{ display: "grid", gap: "var(--os-space-3)" }}>
      <div style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-sm)" }}>
        {programme.name} · סטטוס חי מהמערכת
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: "var(--os-space-3)",
        }}
      >
        {stages.map((s) => (
          <Panel key={s.id} variant="raised" style={{ padding: "var(--os-space-4)", display: "grid", gap: 6 }}>
            <span className="os-num" style={{ color: "var(--os-cyan-text)", fontWeight: 800 }}>
              {s.order}
            </span>
            <b style={{ color: "var(--os-text)", fontSize: "var(--os-text-sm)" }}>{s.name}</b>
            <StatusChip
              status={s.status === "הושלם" ? "הושלם" : s.status === "בתהליך" ? "פעיל" : "ממתין"}
              label={s.status}
            />
            <span style={{ color: "var(--os-muted)", fontSize: "var(--os-text-2xs)" }}>{s.nextGate}</span>
          </Panel>
        ))}
      </div>
      <div style={{ color: "var(--warning-text)", fontSize: "var(--os-text-xs)" }}>
        נקודת ההחלטה הקריטית: סוף שבוע 7 — שער G4 נשאר חסום עד תוצאת פיילוט מדודה.
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// metrics summary — reads the LIVE metric definitions/observations + main risk
// ---------------------------------------------------------------------------

const METRIC_LEVEL_ORDER = ["עסקי", "תפעולי", "AI"] as const;
const METRIC_LEVEL_LABELS: Record<(typeof METRIC_LEVEL_ORDER)[number], string> = {
  עסקי: "רמה 3 · ערך עסקי",
  תפעולי: "רמה 2 · אימוץ ותפעול",
  AI: "רמה 1 · הדרכה ו-AI",
};

function MetricsSummary(): ReactElement {
  const defsQ = useCollection<MetricDefinition>("metricDefinitions");
  const obsQ = useCollection<MetricObservation>("metricObservations");
  const risksQ = useCollection<ImplementationRisk>("implementationRisks");

  const defs = defsQ.data ?? [];
  const measuredKeys = useMemo(
    () => new Set((obsQ.data ?? []).filter((o) => o.value !== null).map((o) => o.metricKey)),
    [obsQ.data],
  );
  const mainRisk =
    (risksQ.data ?? []).find((r) => r.id === "ir-1") ?? (risksQ.data ?? [])[0] ?? null;

  return (
    <div data-testid="metrics-summary" style={{ display: "grid", gap: "var(--os-space-4)" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "var(--os-space-3)",
        }}
      >
        {METRIC_LEVEL_ORDER.map((level) => {
          const levelDefs = defs.filter((d) => d.level === level);
          return (
            <Panel key={level} variant="raised" style={{ padding: "var(--os-space-4)", display: "grid", gap: 8 }}>
              <b style={{ color: "var(--os-cyan-text)", fontSize: "var(--os-text-sm)" }}>
                {METRIC_LEVEL_LABELS[level]}
              </b>
              {levelDefs.length === 0 ? (
                <span style={{ color: "var(--os-muted)", fontSize: "var(--os-text-xs)" }}>
                  אין הגדרות מדד ברמה זו
                </span>
              ) : (
                levelDefs.map((d) => (
                  <div
                    key={d.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 8,
                      fontSize: "var(--os-text-xs)",
                    }}
                  >
                    <span style={{ color: "var(--os-text-2)" }}>{d.name}</span>
                    <span
                      style={{
                        color: measuredKeys.has(d.key) ? "var(--success-text)" : "var(--os-muted)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {measuredKeys.has(d.key) ? "נמדד" : NOT_MEASURED}
                    </span>
                  </div>
                ))
              )}
            </Panel>
          );
        })}
      </div>
      {mainRisk && (
        <Panel
          variant="raised"
          style={{
            padding: "var(--os-space-4)",
            borderInlineStart: "3px solid var(--os-danger)",
            display: "grid",
            gap: 6,
          }}
        >
          <b style={{ color: "var(--danger-text)", fontSize: "var(--os-text-sm)" }}>
            הסיכון המרכזי: {mainRisk.title}
          </b>
          <span style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-xs)" }}>
            {mainRisk.description}
          </span>
          <span style={{ color: "var(--success-text)", fontSize: "var(--os-text-xs)" }}>
            מיתון: {mainRisk.mitigation}
          </span>
        </Panel>
      )}
      <span style={{ color: "var(--os-muted)", fontSize: "var(--os-text-2xs)" }}>
        יעדי התורם (ROI 3X, ‎3,840 ₪‎/חודש, WAU ≥ 70%) הם יעדי פיילוט ממסמך ההטמעה — לא תוצאה
        מדודה; קו הבסיס {NOT_MEASURED}.
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// quick start + microlearning
// ---------------------------------------------------------------------------

function QuickStartMicrolearning(): ReactElement {
  return (
    <div data-testid="quick-start-visual" style={{ display: "grid", gap: "var(--os-space-4)" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "var(--os-space-3)",
        }}
      >
        {QUICK_START_ACTIONS.map((a) => (
          <Panel key={a.order} variant="raised" style={{ padding: "var(--os-space-4)", display: "grid", gap: 6 }}>
            <span className="os-num" style={{ color: "var(--os-cyan-text)", fontWeight: 800 }}>
              {a.order}
            </span>
            <b style={{ color: "var(--os-text)", fontSize: "var(--os-text-sm)" }}>{a.title}</b>
            <span style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-xs)" }}>
              {a.expectedResult}
            </span>
            <span dir="ltr" style={{ color: "var(--os-muted)", fontSize: "var(--os-text-2xs)" }}>
              {a.route}
            </span>
          </Panel>
        ))}
      </div>
      <div style={{ color: "var(--os-cyan-text)", fontSize: "var(--os-text-sm)", fontWeight: 700 }}>
        ⭐ הכלל: ה-AI מציע — האדם תמיד מאשר לפני ששולחים (HITL)
      </div>
      <details>
        <summary style={{ color: "var(--os-text-2)", cursor: "pointer", fontSize: "var(--os-text-sm)" }}>
          סטוריבורד ה-Microlearning (90 שניות · קונספט — לא הופק וידאו)
        </summary>
        <div style={{ paddingBlockStart: "var(--os-space-3)" }}>
          <MicrolearningPreview concept={MICROLEARNING_CHECK_AI} />
        </div>
      </details>
    </div>
  );
}

// ---------------------------------------------------------------------------
// dispatcher
// ---------------------------------------------------------------------------

export function SectionVisual({ visual }: { visual: PresentationVisualKey }): ReactElement {
  const personasQ = useCollection<Persona>("personas");
  const materialsQ = useCollection<TrainingMaterial>("trainingMaterials");

  switch (visual) {
    case "as-is-to-be":
      return (
        <ScaledPresentationFrame>
          <AsIsToBe view="presentation" />
        </ScaledPresentationFrame>
      );
    case "training-matrix": {
      const personas = bridgePersonas(personasQ.data ?? []).personas;
      // read-only embed: no click handlers ⇒ chips render as static spans
      return <TrainingMatrix personas={personas} materials={materialsQ.data ?? []} maxHeight={420} />;
    }
    case "roadmap-summary":
      return <RoadmapSummary />;
    case "quick-start-microlearning":
      return <QuickStartMicrolearning />;
    case "metrics-summary":
      return <MetricsSummary />;
  }
}
