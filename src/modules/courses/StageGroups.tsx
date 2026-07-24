// Grouped stepper — replaces the single compressed 14-step horizontal bar with
// three progress groups. A compact header shows completed/current/future state
// per group; the individual steps are rendered ONLY for the active group (the
// group holding the current stage, or the group the user selects). Reuses the
// design-system Stepper (real <button> per step) so onStepClick keeps setting
// the active stage, and keeps step a11y intact.
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactElement } from "react";
import { Stepper, StatusChip, type StepperStep } from "@/design-system";
import type { LearningPathStage } from "@/domain/types";

interface GroupDef {
  key: string;
  /** Group heading (Hebrew) combined with its range label for display. */
  title: string;
  rangeLabel: string;
  /** Inclusive lower order bound; the last group also absorbs any higher order. */
  min: number;
  max: number;
}

// Fixed three-stage grouping of the 14-step path.
const GROUPS: readonly GroupDef[] = [
  { key: "g1", title: "יסודות", rangeLabel: "שלבים 1–4", min: 1, max: 4 },
  { key: "g2", title: "תכנון והדפסה", rangeLabel: "שלבים 5–10", min: 5, max: 10 },
  {
    key: "g3",
    title: "יישום מתקדם",
    rangeLabel: "שלבים 11–14",
    min: 11,
    max: Number.MAX_SAFE_INTEGER,
  },
];

function groupKeyForOrder(order: number): string {
  for (const grp of GROUPS) {
    if (order >= grp.min && order <= grp.max) return grp.key;
  }
  return "g3";
}

interface BuiltGroup {
  def: GroupDef;
  steps: StepperStep[];
  completed: number;
  total: number;
  hasActive: boolean;
}

export function StageGroups({
  pathStages,
  steps,
  activeStepId,
  onStepClick,
}: {
  pathStages: readonly LearningPathStage[];
  steps: readonly StepperStep[];
  activeStepId: string;
  onStepClick: (step: StepperStep) => void;
}): ReactElement {
  const stepById = new Map(steps.map((s) => [s.id, s]));

  const built: BuiltGroup[] = GROUPS.map((def) => {
    const groupStages = pathStages
      .filter((st) => groupKeyForOrder(st.order) === def.key)
      .sort((a, b) => a.order - b.order);
    const groupSteps = groupStages
      .map((st) => stepById.get(st.id))
      .filter((s): s is StepperStep => s !== undefined);
    const completed = groupSteps.filter((s) => s.status === "done").length;
    const hasActive = groupSteps.some((s) => s.id === activeStepId);
    return { def, steps: groupSteps, completed, total: groupSteps.length, hasActive };
  }).filter((g) => g.total > 0);

  const currentKey = built.find((g) => g.hasActive)?.def.key ?? built[0]?.def.key ?? "g1";
  const [selectedKey, setSelectedKey] = useState<string>(currentKey);

  // Follow the current group when the active stage moves into another group.
  useEffect(() => {
    setSelectedKey(currentKey);
  }, [currentKey]);

  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (e: KeyboardEvent, index: number): void => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    // RTL: ArrowLeft advances to the next (later) group, ArrowRight goes back.
    const dir = e.key === "ArrowLeft" ? 1 : -1;
    const next = (index + dir + built.length) % built.length;
    btnRefs.current[next]?.focus();
  };

  const active = built.find((g) => g.def.key === selectedKey) ?? built[0];

  return (
    <div className="courses-stages">
      <div className="courses-stage-groups" role="group" aria-label="קבוצות שלבי המסלול">
        {built.map((g, i) => {
          const selected = g.def.key === selectedKey;
          const state =
            g.completed === g.total ? (
              <StatusChip status="הושלם" label="הושלם" />
            ) : g.hasActive ? (
              <StatusChip status="פעיל" label="פעיל" />
            ) : (
              <StatusChip status="ממתין" label="ממתין" />
            );
          return (
            <button
              key={g.def.key}
              type="button"
              ref={(el) => {
                btnRefs.current[i] = el;
              }}
              className={`courses-stage-group${selected ? " courses-stage-group--selected" : ""}`}
              aria-pressed={selected}
              aria-current={g.hasActive ? "step" : undefined}
              onClick={() => setSelectedKey(g.def.key)}
              onKeyDown={(e) => onKeyDown(e, i)}
            >
              <span className="courses-stage-group__title">
                {g.def.title} · {g.def.rangeLabel}
              </span>
              <span className="courses-stage-group__meta">
                {state}
                <span className="courses-stage-group__count os-num">
                  {g.completed}/{g.total}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {active && (
        <div className="courses-stage-steps">
          <Stepper steps={active.steps} onStepClick={onStepClick} />
        </div>
      )}
    </div>
  );
}
