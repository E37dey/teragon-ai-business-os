// PhaseProgress — replaces the single 14-step horizontal circle stepper. It
// renders three phase segments (completion state + completed/total counts +
// current-phase indicator) and, BELOW, ONLY the selected phase's steps as a
// readable vertical list of real <button>s (per-step state הושלם/בתהליך/ממתין).
// The 14 individual steps are NEVER shown as one circle strip at any width.
//
// Keyboard: Arrow keys / Home / End move focus within each roving group
// (segments row and step list); Enter/Space activates a step (native button
// behaviour) which calls onStepClick — the existing "select active stage" flow.
import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactElement } from "react";
import { StatusChip, type StepperStep } from "@/design-system";
import type { LearningPathStage } from "@/domain/types";

interface GroupDef {
  key: string;
  title: string;
  rangeLabel: string;
  min: number;
  max: number;
}

// Fixed three-phase grouping of the 14-step path.
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

/** Per-step state chip — existing labels only (הושלם / בתהליך / ממתין). */
function stepChip(status: StepperStep["status"]): ReactElement {
  if (status === "done") return <StatusChip status="הושלם" label="הושלם" />;
  if (status === "active") return <StatusChip status="פעיל" label="בתהליך" />;
  return <StatusChip status="ממתין" label="ממתין" />;
}

/** Roving-focus keyboard handler for a list of buttons (Arrow/Home/End). */
function rove(
  e: KeyboardEvent,
  index: number,
  refs: (HTMLButtonElement | null)[],
  count: number,
): void {
  let next = index;
  switch (e.key) {
    case "ArrowLeft":
    case "ArrowDown":
      next = (index + 1) % count;
      break;
    case "ArrowRight":
    case "ArrowUp":
      next = (index - 1 + count) % count;
      break;
    case "Home":
      next = 0;
      break;
    case "End":
      next = count - 1;
      break;
    default:
      return;
  }
  e.preventDefault();
  refs[next]?.focus();
}

export function PhaseProgress({
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
  const built: BuiltGroup[] = useMemo(() => {
    const stepById = new Map(steps.map((s) => [s.id, s]));
    return GROUPS.map((def) => {
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
  }, [pathStages, steps, activeStepId]);

  const currentKey = built.find((g) => g.hasActive)?.def.key ?? built[0]?.def.key ?? "g1";
  const [selectedKey, setSelectedKey] = useState<string>(currentKey);

  // Follow the current phase when the active stage moves into another phase.
  useEffect(() => {
    setSelectedKey(currentKey);
  }, [currentKey]);

  const segRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const stepRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const active = built.find((g) => g.def.key === selectedKey) ?? built[0];

  return (
    <div className="courses-phases">
      <div className="courses-phase-segments" role="group" aria-label="קבוצות שלבי המסלול">
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
                segRefs.current[i] = el;
              }}
              className={`courses-phase-seg${selected ? " courses-phase-seg--selected" : ""}`}
              aria-pressed={selected}
              aria-current={g.hasActive ? "step" : undefined}
              onClick={() => setSelectedKey(g.def.key)}
              onKeyDown={(e) => rove(e, i, segRefs.current, built.length)}
            >
              <span className="courses-phase-seg__title">
                {g.def.title} · {g.def.rangeLabel}
              </span>
              <span className="courses-phase-seg__meta">
                {state}
                <span className="courses-phase-seg__count os-num">
                  {g.completed}/{g.total}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {active && (
        <div
          className="courses-phase-steps"
          role="group"
          aria-label={`${active.def.title} · ${active.def.rangeLabel}`}
        >
          {active.steps.map((s, i) => {
            const isActive = s.id === activeStepId;
            return (
              <button
                key={s.id}
                type="button"
                ref={(el) => {
                  stepRefs.current[i] = el;
                }}
                className={`courses-phase-step${isActive ? " courses-phase-step--active" : ""}`}
                aria-current={isActive ? "step" : undefined}
                onClick={() => onStepClick(s)}
                onKeyDown={(e) => rove(e, i, stepRefs.current, active.steps.length)}
              >
                <span className="courses-phase-step__label">{s.label}</span>
                {stepChip(s.status)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
