// /quick-start — התחלה מהירה ושימוש נכון (Wave 7, W7-D, spec chapter 16).
// Three actions, each with an HONEST live schematic demo (not a fake
// screenshot), a real "נסה זאת" navigation, the מותר/חובה לבדוק/אסור rules
// block, a printable A4 view (@media print) and a presentation view.
// Rail: deterministic "בדוק אם הפעולה שתכננת מותרת" coach.
import { useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PageRail } from "@/app/rail";
import { OsButton, Panel, SectionTitle, Tabs } from "@/design-system";
import { DEMO_DATA_LABEL } from "@/repositories/seed";
import {
  classifyPlannedAction,
  CORRECT_USE_RULES,
  MICROLEARNING_CHECK_AI,
  PLANNED_ACTION_SAMPLE,
  QUICK_START_ACTIONS,
  QUICK_START_TITLE,
  type PlannedActionAnswer,
  type QuickStartAction,
} from "@/domain/training-materials";

type ViewMode = "app" | "print" | "presentation";

// print rules are scoped to this page via .qs-print-root
const PRINT_CSS = `
@media print {
  body * { visibility: hidden; }
  .qs-print-root, .qs-print-root * { visibility: visible; }
  .qs-print-root { position: absolute; inset-inline-start: 0; inset-block-start: 0; inline-size: 100%; }
  .qs-no-print { display: none !important; }
  .qs-print-root { color: #000; background: #fff; }
  .qs-print-header { display: block !important; }
}
@page { size: A4; margin: 14mm; }
.qs-print-root { counter-reset: qspage; direction: rtl; }
.qs-print-section { counter-increment: qspage; }
.qs-print-section .qs-print-footer::after { content: "עמוד " counter(qspage); color: #555; font-size: 11px; }
.qs-print-header { display: none; font-size: 11px; color: #333; border-block-end: 1px solid #ccc; padding-block-end: 4px; margin-block-end: 8px; }
`;

/** print-only metadata header (P-2 fix): product, version, date, owner, approval */
function QsPrintHeader(): ReactElement {
  return (
    <div className="qs-print-header">
      מוצר: TERAGON AI BUSINESS OS · טרגון טכנולוגיות · חומר tm-3 "התחלה מהירה" · תאריך הפקה:{" "}
      {new Date().toISOString().slice(0, 10)} · בעלים: צחי זוסטייהם · מצב אישור: לפי רשומת החומר
      במרכז ההדרכה
    </div>
  );
}

export interface QuickStartPageProps {
  /** presentation-view prop — start in full-screen-style presentation mode */
  presentation?: boolean;
}

export default function QuickStartPage({ presentation = false }: QuickStartPageProps): ReactElement {
  const [view, setView] = useState<ViewMode>(presentation ? "presentation" : "app");

  return (
    <div className="qs-print-root" style={{ display: "grid", gap: "var(--os-space-6)" }}>
      <style>{PRINT_CSS}</style>
      <QsPrintHeader />
      <PageRail>
        <QuickStartRail />
      </PageRail>

      <div className="qs-no-print">
        <SectionTitle
          icon="target"
          title="התחלה מהירה ושימוש נכון"
          subtitle={DEMO_DATA_LABEL}
          action={
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Tabs
                ariaLabel="מצב תצוגה"
                items={[
                  { id: "app", label: "תצוגת אפליקציה" },
                  { id: "print", label: "תצוגת הדפסה A4" },
                  { id: "presentation", label: "תצוגת מצגת" },
                ]}
                activeId={view}
                onChange={(id) => setView(id as ViewMode)}
              />
              <OsButton size="sm" variant="ghost" icon="doc" onClick={() => window.print()}>
                הדפסה
              </OsButton>
            </div>
          }
        />
      </div>

      {view === "presentation" ? <PresentationView /> : <MainView compact={view === "print"} />}

      {/* Microlearning storyboard link (7.12 ↔ 7.13) */}
      <Panel className="qs-no-print" style={{ padding: "var(--os-space-4)" }}>
        <span style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-sm)" }}>
          🎬 {MICROLEARNING_CHECK_AI.label}: «{MICROLEARNING_CHECK_AI.title}» (
          <span className="os-num">{MICROLEARNING_CHECK_AI.totalSec}</span> שניות) —{" "}
          <Link to="/training-materials" style={{ color: "var(--os-cyan-text)" }}>
            לצפייה בסטוריבורד המלא במרכז חומרי ההדרכה
          </Link>
          . {MICROLEARNING_CHECK_AI.productionStatus}.
        </span>
      </Panel>
    </div>
  );
}

// ── main two-area layout (chapter 16: actions at inline-start, rules beside) ─
function MainView({ compact }: { compact: boolean }): ReactElement {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: compact ? "1fr" : "minmax(0, 3fr) minmax(0, 2fr)",
        gap: "var(--os-space-6)",
        alignItems: "start",
      }}
    >
      <div style={{ display: "grid", gap: "var(--os-space-4)" }}>
        <SectionTitle icon="sparkle" title={QUICK_START_TITLE} />
        {QUICK_START_ACTIONS.map((action) => (
          <ActionCard key={action.order} action={action} compact={compact} />
        ))}
      </div>
      <RulesPanel />
    </div>
  );
}

// ── a single quick-start action ─────────────────────────────────────────────
const metaRow: CSSProperties = {
  display: "grid",
  gap: 4,
  fontSize: "var(--os-text-xs)",
  color: "var(--os-text-2)",
};

function ActionCard({ action, compact }: { action: QuickStartAction; compact: boolean }): ReactElement {
  const navigate = useNavigate();
  return (
    <Panel variant="raised" style={{ padding: "var(--os-space-5)", display: "grid", gap: "var(--os-space-4)" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <span
          className="os-num"
          aria-hidden="true"
          style={{
            inlineSize: 34,
            blockSize: 34,
            display: "grid",
            placeItems: "center",
            borderRadius: "var(--os-radius-full)",
            background: "var(--os-cyan-soft)",
            color: "var(--os-cyan-text)",
            fontWeight: 800,
          }}
        >
          {action.order}
        </span>
        <b style={{ color: "var(--os-text)", fontSize: "var(--os-text-lg)" }}>{action.title}</b>
      </div>

      {/* honest schematic demo — rendered live, explicitly not a screenshot */}
      {!compact && (
        <div
          aria-label={`הדגמה סכמטית: ${action.title}`}
          style={{
            border: "1px solid var(--os-border)",
            borderRadius: "var(--os-radius-md)",
            overflow: "hidden",
            background: "var(--os-panel)",
          }}
        >
          <div
            style={{
              padding: "6px var(--os-space-4)",
              background: "var(--accent-primary-soft)",
              color: "var(--accent-primary-text)",
              fontSize: "var(--os-text-xs)",
              fontWeight: 600,
            }}
          >
            {action.demo.header}
          </div>
          <div style={{ padding: "var(--os-space-3) var(--os-space-4)", display: "grid", gap: 6 }}>
            {action.demo.rows.map((row) => (
              <div key={row} style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-xs)" }}>
                ▸ {row}
              </div>
            ))}
            <div style={{ color: "var(--os-muted)", fontSize: "var(--os-text-2xs)" }}>
              ⤷ {action.demo.actionLabel} · הדגמה סכמטית חיה — לא צילום מסך
            </div>
          </div>
        </div>
      )}

      <div style={metaRow}>
        <span>
          <b style={{ color: "var(--os-text)" }}>תוצאה צפויה:</b> {action.expectedResult}
        </span>
        <span>
          <b style={{ color: "var(--os-text)" }}>זמן משוער:</b> {action.estimatedTime}
        </span>
        <span style={{ color: "var(--warning-text)" }}>
          <b>טעות נפוצה:</b> {action.commonMistake}
        </span>
        <span style={{ color: "var(--success-text)" }}>
          <b>הערת בטיחות:</b> {action.safetyNote}
        </span>
      </div>

      <div className="qs-no-print" style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <OsButton size="sm" icon="chevron-back" onClick={() => navigate(action.route)}>
          נסה זאת
        </OsButton>
        <span style={{ color: "var(--os-muted)", fontSize: "var(--os-text-2xs)" }} dir="ltr">
          {action.route}
        </span>
        <span style={{ color: "var(--os-muted)", fontSize: "var(--os-text-2xs)" }}>
          ({action.routeLabel})
        </span>
      </div>
    </Panel>
  );
}

// ── כללי שימוש נכון ─────────────────────────────────────────────────────────
function RulesColumn({
  title,
  color,
  items,
}: {
  title: string;
  color: string;
  items: readonly string[];
}): ReactElement {
  return (
    <div>
      <div style={{ color, fontWeight: 700, fontSize: "var(--os-text-sm)", marginBlockEnd: 6 }}>
        {title}
      </div>
      <ul
        style={{
          margin: 0,
          paddingInlineStart: "1.1rem",
          display: "grid",
          gap: 5,
          color: "var(--os-text-2)",
          fontSize: "var(--os-text-xs)",
        }}
      >
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function RulesPanel(): ReactElement {
  return (
    <div style={{ display: "grid", gap: "var(--os-space-4)" }}>
      <SectionTitle icon="shield" title="כללי שימוש נכון" />
      <Panel variant="raised" style={{ padding: "var(--os-space-5)", display: "grid", gap: "var(--os-space-5)" }}>
        <RulesColumn title="מותר" color="var(--success-text)" items={CORRECT_USE_RULES.allowed} />
        <RulesColumn
          title="חובה לבדוק"
          color="var(--warning-text)"
          items={CORRECT_USE_RULES.mustVerify}
        />
        <RulesColumn title="אסור" color="var(--danger-text)" items={CORRECT_USE_RULES.forbidden} />
        <div style={{ color: "var(--os-muted)", fontSize: "var(--os-text-2xs)" }}>
          הנוהל המלא: «נוהל שימוש נכון» במרכז חומרי ההדרכה. הפרת סעיפי ה"אסור" מטופלת
          כאירוע אבטחה.
        </div>
      </Panel>
    </div>
  );
}

// ── presentation view — large-type walkthrough for the training session ─────
function PresentationView(): ReactElement {
  const [slide, setSlide] = useState(0);
  const total = QUICK_START_ACTIONS.length + 1;
  const action = slide > 0 ? QUICK_START_ACTIONS[slide - 1] : undefined;

  return (
    <Panel
      variant="highlight"
      style={{
        padding: "var(--os-space-8)",
        minBlockSize: 380,
        display: "grid",
        alignContent: "center",
        gap: "var(--os-space-5)",
        textAlign: "center",
      }}
    >
      {slide === 0 ? (
        <>
          <div style={{ color: "var(--os-cyan-text)", fontSize: "var(--os-text-sm)", fontWeight: 600 }}>
            TERAGON AI BUSINESS OS
          </div>
          <div style={{ color: "var(--os-text)", fontSize: "var(--os-text-2xl)", fontWeight: 800 }}>
            {QUICK_START_TITLE}
          </div>
          <div style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-lg)" }}>
            פתח לקוח או פנייה → בקש סיכום או המלצה → בדוק ראיות ואשר
          </div>
        </>
      ) : action ? (
        <>
          <div style={{ color: "var(--os-cyan-text)", fontSize: "var(--os-text-lg)", fontWeight: 700 }}>
            פעולה <span className="os-num">{action.order}</span> / 3
          </div>
          <div style={{ color: "var(--os-text)", fontSize: "var(--os-text-2xl)", fontWeight: 800 }}>
            {action.title}
          </div>
          <div style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-lg)", maxInlineSize: 640, marginInline: "auto" }}>
            {action.expectedResult}
          </div>
          <div style={{ color: "var(--warning-text)", fontSize: "var(--os-text-md)" }}>
            טעות נפוצה: {action.commonMistake}
          </div>
        </>
      ) : null}
      <div className="qs-no-print" style={{ display: "flex", gap: 8, justifyContent: "center" }}>
        {slide > 0 ? (
          <OsButton size="sm" variant="ghost" icon="chevron-forward" onClick={() => setSlide((s) => s - 1)}>
            הקודם
          </OsButton>
        ) : (
          <OsButton size="sm" variant="ghost" icon="chevron-forward" disabled disabledReason="זהו השקף הראשון">
            הקודם
          </OsButton>
        )}
        <span className="os-num" style={{ alignSelf: "center", color: "var(--os-muted)", fontSize: "var(--os-text-xs)" }}>
          {slide + 1} / {total}
        </span>
        {slide < total - 1 ? (
          <OsButton size="sm" icon="chevron-back" onClick={() => setSlide((s) => s + 1)}>
            הבא
          </OsButton>
        ) : (
          <OsButton size="sm" icon="chevron-back" disabled disabledReason="זהו השקף האחרון">
            הבא
          </OsButton>
        )}
      </div>
    </Panel>
  );
}

// ── rail: interactive personal coach ────────────────────────────────────────
function QuickStartRail(): ReactElement {
  const [planned, setPlanned] = useState("");
  const [answer, setAnswer] = useState<PlannedActionAnswer | null>(null);

  const verdictColor = (v: PlannedActionAnswer["verdict"]): string =>
    v === "מותר"
      ? "var(--success-text)"
      : v === "חובה לבדוק"
        ? "var(--warning-text)"
        : v === "אסור"
          ? "var(--danger-text)"
          : "var(--os-muted)";

  return (
    <div style={{ display: "grid", gap: "var(--os-space-5)", fontSize: "var(--os-text-sm)" }}>
      <div style={{ color: "var(--os-text)", fontWeight: 700 }}>בדוק אם הפעולה שתכננת מותרת</div>
      <div style={{ display: "grid", gap: 6 }}>
        <label className="os-qc-label" htmlFor="qs-planned">
          מה תכננת לעשות?
        </label>
        <textarea
          id="qs-planned"
          className="os-qc-input os-qc-input--area"
          rows={2}
          value={planned}
          onChange={(e) => setPlanned(e.target.value)}
          placeholder="למשל: לשלוח ללקוח סיכום פגישה שה-AI הכין"
        />
        <OsButton size="sm" icon="shield" onClick={() => setAnswer(classifyPlannedAction(planned))}>
          בדיקה מול הנוהל
        </OsButton>
      </div>
      {answer && (
        <div style={{ display: "grid", gap: 4 }}>
          <div style={{ color: verdictColor(answer.verdict), fontWeight: 700 }}>{answer.verdict}</div>
          <div style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-xs)", lineHeight: 1.6 }}>
            {answer.answerHe}
          </div>
          {answer.matchedRule && (
            <div style={{ color: "var(--os-muted)", fontSize: "var(--os-text-2xs)" }}>
              הכלל שהתאים: «{answer.matchedRule}» · בדיקה דטרמיניסטית מול הנוהל — לא מודל
            </div>
          )}
        </div>
      )}
      <div style={{ borderBlockStart: "1px solid var(--os-border)", paddingBlockStart: "var(--os-space-4)", display: "grid", gap: 4 }}>
        <div style={{ color: "var(--os-muted)", fontSize: "var(--os-text-2xs)", fontWeight: 600 }}>
          שאלה לדוגמה
        </div>
        <div style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-xs)" }}>
          «{PLANNED_ACTION_SAMPLE.questionHe}»
        </div>
        <div style={{ color: verdictColor(PLANNED_ACTION_SAMPLE.answer.verdict), fontSize: "var(--os-text-xs)", fontWeight: 700 }}>
          {PLANNED_ACTION_SAMPLE.answer.verdict}
        </div>
        <div style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-2xs)", lineHeight: 1.6 }}>
          {PLANNED_ACTION_SAMPLE.answer.answerHe}
        </div>
      </div>
    </div>
  );
}
