// AS-IS / TO-BE process map + human-AI boundaries (W7-A, Phase 7.3).
// The EXACT mandated content: 5 AS-IS steps, 7 TO-BE steps, 6 items that stay
// human, 5 items forbidden to AI (rewritten from the donor implementation
// package — no legacy HTML). Pure CSS/SVG-free layout, three views:
//   view="app"          — flows inside the page (dark OS theme, tokens only)
//   view="print"        — same markup; the @media print stylesheet flips to a
//                         light A4-portrait layout with no clipping
//   view="presentation" — fixed 16:9 (1280×720) export-ready layout, boxes
//                         positioned by the pure layout math (no overlaps —
//                         guaranteed by computeMapLayout + tests).
import { Fragment } from "react";
import type { CSSProperties, ReactElement } from "react";

import {
  AS_IS_STEPS,
  FORBIDDEN_AI_ITEMS,
  HUMAN_RESPONSIBILITY_ITEMS,
  PRESENTATION_HEIGHT,
  PRESENTATION_WIDTH,
  TO_BE_STEPS,
  computeMapLayout,
  type MapRect,
} from "./asIsToBeContent";

// ---------------------------------------------------------------------------
// component
// ---------------------------------------------------------------------------

export type AsIsToBeView = "app" | "print" | "presentation";

export interface AsIsToBeProps {
  view?: AsIsToBeView;
}

const STYLE_TEXT = `
.atb-root { direction: rtl; color: var(--os-text, #f5f8fd); font-size: 13px; }
.atb-band-title { font-weight: 700; font-size: 14px; margin: 12px 0 8px; letter-spacing: .2px; }
.atb-flow { display: flex; flex-direction: row; align-items: stretch; gap: 8px; flex-wrap: wrap; }
.atb-step { flex: 1 1 140px; min-width: 130px; border: 1px solid rgba(112,158,220,.28);
  border-radius: 10px; padding: 10px 12px; background: var(--os-panel, #07111f);
  display: flex; align-items: center; min-height: 64px; line-height: 1.45; }
.atb-step--ai { border-color: var(--os-cyan, #20c4e8); box-shadow: 0 0 10px rgba(32,196,232,.12); }
.atb-arrow { align-self: center; color: var(--os-text-muted, #65758b); font-size: 16px; }
.atb-panels { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 16px; }
.atb-panel { border: 1px solid rgba(112,158,220,.28); border-radius: 12px; padding: 12px 16px;
  background: var(--os-panel, #07111f); }
.atb-panel--human { border-inline-start: 3px solid var(--os-success, #21c981); }
.atb-panel--forbidden { border-inline-start: 3px solid var(--os-danger, #ec5d68); }
.atb-panel ul { margin: 8px 0 0; padding-inline-start: 18px; }
.atb-panel li { margin-block: 5px; line-height: 1.5; }
.atb-note { margin-top: 12px; color: var(--os-text-2); font-size: 12px; }

/* presentation (16:9 export frame): absolute boxes from computeMapLayout */
.atb-root--presentation { position: relative; width: ${PRESENTATION_WIDTH}px;
  height: ${PRESENTATION_HEIGHT}px; overflow: hidden;
  background: var(--os-bg, #030812); border: 1px solid rgba(112,158,220,.17); }
.atb-abs { position: absolute; box-sizing: border-box; }
.atb-abs .atb-step, .atb-abs .atb-panel { height: 100%; overflow: hidden; }
.atb-abs-label { position: absolute; font-weight: 700; font-size: 15px; }

/* print: light A4-portrait, no clipping (spec-mandated light print output) */
@media print {
  @page { size: A4 portrait; margin: 12mm; }
  .atb-root { color: #111; font-size: 11px; }
  .atb-step, .atb-panel { background: #fff; border-color: #555; box-shadow: none;
    break-inside: avoid; }
  .atb-arrow { color: #555; }
  .atb-note { color: #444; }
  .atb-root--presentation { position: static; width: auto; height: auto;
    overflow: visible; background: #fff; border: 0; }
  .atb-root--presentation .atb-abs, .atb-root--presentation .atb-abs-label { position: static; }
}
`;

function isAiStep(step: string): boolean {
  return step.startsWith("◆");
}

function FlowRow({
  title,
  band,
  steps,
}: {
  title: string;
  band: "asis" | "tobe";
  steps: readonly string[];
}): ReactElement {
  return (
    <div>
      <div className="atb-band-title">{title}</div>
      <div className="atb-flow">
        {steps.map((step, i) => (
          <Fragment key={`${band}-${i}`}>
            {i > 0 && (
              <span className="atb-arrow" aria-hidden="true">
                ←
              </span>
            )}
            <div
              className={`atb-step${isAiStep(step) ? " atb-step--ai" : ""}`}
              data-testid={`atb-step-${band}-${i + 1}`}
            >
              {step}
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function BoundaryPanels(): ReactElement {
  return (
    <div className="atb-panels">
      <div className="atb-panel atb-panel--human" data-testid="atb-panel-human">
        <div className="atb-band-title">נשאר באחריות אדם</div>
        <ul>
          {HUMAN_RESPONSIBILITY_ITEMS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
      <div className="atb-panel atb-panel--forbidden" data-testid="atb-panel-forbidden">
        <div className="atb-band-title">אסור להעביר ל-AI</div>
        <ul>
          {FORBIDDEN_AI_ITEMS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Fixed 16:9 frame — every box positioned by the pure layout math. */
function PresentationLayout(): ReactElement {
  const rects = computeMapLayout();
  const stepFor = (r: MapRect): string =>
    r.band === "as-is" ? (AS_IS_STEPS[r.index] ?? "") : (TO_BE_STEPS[r.index] ?? "");
  // physical left/top — the layout math is physical-coordinate based
  const abs = (r: MapRect): CSSProperties => ({
    left: r.x,
    top: r.y,
    width: r.width,
    height: r.height,
  });
  const labelY = (band: "as-is" | "to-be"): number => {
    const first = rects.find((r) => r.band === band);
    return (first?.y ?? 0) - 26;
  };
  return (
    <div className="atb-root atb-root--presentation" dir="rtl" data-testid="atb-presentation">
      <div className="atb-abs-label" style={{ right: 32, top: 18 }}>
        מפת AS-IS / TO-BE וגבולות אדם-AI — מערכת טרגון
      </div>
      <div className="atb-abs-label" style={{ right: 32, top: labelY("as-is") }}>
        AS-IS — התהליך היום
      </div>
      <div className="atb-abs-label" style={{ right: 32, top: labelY("to-be") }}>
        TO-BE — התהליך עם AI (◆ = נקודת AI)
      </div>
      {rects.map((r) => {
        if (r.band === "as-is" || r.band === "to-be") {
          const step = stepFor(r);
          return (
            <div key={`${r.band}-${r.index}`} className="atb-abs" style={abs(r)}>
              <div className={`atb-step${isAiStep(step) ? " atb-step--ai" : ""}`}>{step}</div>
            </div>
          );
        }
        return (
          <div key={r.band} className="atb-abs" style={abs(r)}>
            {r.band === "human" ? (
              <div className="atb-panel atb-panel--human">
                <div className="atb-band-title">נשאר באחריות אדם</div>
                <ul>
                  {HUMAN_RESPONSIBILITY_ITEMS.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="atb-panel atb-panel--forbidden">
                <div className="atb-band-title">אסור להעביר ל-AI</div>
                <ul>
                  {FORBIDDEN_AI_ITEMS.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * The AS-IS/TO-BE process map. `view="print"` renders the same flow markup —
 * the print stylesheet (embedded) produces the light A4 output.
 */
export function AsIsToBe({ view = "app" }: AsIsToBeProps): ReactElement {
  return (
    <div data-testid="asis-tobe-map">
      <style>{STYLE_TEXT}</style>
      {view === "presentation" ? (
        <PresentationLayout />
      ) : (
        <div className="atb-root" dir="rtl">
          <FlowRow title="AS-IS — התהליך היום" band="asis" steps={AS_IS_STEPS} />
          <FlowRow title="TO-BE — התהליך עם AI (◆ = נקודת AI)" band="tobe" steps={TO_BE_STEPS} />
          <BoundaryPanels />
          <div className="atb-note">
            עקרון-העל: ה-AI מסווג, מנסח ומסכם — אך לעולם אינו שולח, מתמחר סופית או מתחייב בשם
            העסק ללא אישור אדם (HITL).
          </div>
        </div>
      )}
    </div>
  );
}

export default AsIsToBe;
