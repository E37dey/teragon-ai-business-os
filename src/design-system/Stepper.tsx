import type { ReactElement } from "react";
import { OsIcon, type IconName } from "./icons";
import "../styles/components.css";

export interface StepperStep {
  /** Unique key. */
  id: string;
  /** Step name (Hebrew). */
  label: string;
  /** Optional icon from the typed set. */
  icon?: IconName;
  /** Count shown under the step. */
  count?: number;
  /** Explicit status; if omitted, derived from activeId order. */
  status?: "done" | "active" | "pending";
}

export interface StepperProps {
  /** Ordered journey steps (first renders at inline-start = right in RTL). */
  steps: readonly StepperStep[];
  /** Id of the active step (used when steps lack explicit status). */
  activeId?: string;
  onStepClick?: (step: StepperStep) => void;
  className?: string;
}

/**
 * Stepper — horizontal RTL journey stepper with glowing icon circles.
 * Per docs/VISUAL_DNA.md pattern 2 (reference 1.png: מסע הלקוח במכירה).
 */
export function Stepper({
  steps,
  activeId,
  onStepClick,
  className = "",
}: StepperProps): ReactElement {
  const activeIndex = steps.findIndex((s) => s.id === activeId);

  return (
    <div className={`os-stepper ${className}`.trim()} role="list">
      {steps.map((step, i) => {
        const status =
          step.status ??
          (activeIndex === -1
            ? "pending"
            : i < activeIndex
              ? "done"
              : i === activeIndex
                ? "active"
                : "pending");
        // W9-A defect #1: a clickable step must be keyboard-operable — but the
        // container is role="list", so the step itself MUST stay a listitem
        // (aria-required-children). The activation affordance is therefore a
        // real <button> nested inside, which is keyboard-operable for free.
        const clickable = typeof onStepClick === "function";
        const activate = clickable ? () => onStepClick(step) : undefined;
        const body = (
          <>
            <span className="os-stepper__circle" aria-hidden="true">
              {step.icon ? (
                <OsIcon name={step.icon} size={16} />
              ) : (
                <span className="os-num">{i + 1}</span>
              )}
            </span>
            <span className="os-stepper__label">{step.label}</span>
            {typeof step.count === "number" && (
              <span className="os-stepper__count os-num">{step.count}</span>
            )}
          </>
        );
        return (
          <div
            key={step.id}
            role="listitem"
            className={`os-stepper__step os-stepper__step--${status}`}
            aria-current={status === "active" ? "step" : undefined}
          >
            {clickable ? (
              <button type="button" className="os-stepper__activate" onClick={activate}>
                {body}
              </button>
            ) : (
              body
            )}
          </div>
        );
      })}
    </div>
  );
}
