// /submission/presentation — מצגת ההגשה (Wave 7, W7-F, 7.22).
// The CANONICAL submission presentation is THIS HTML page — no PPTX
// dependency. Exactly 5 sections × 120s = 10 minutes. Features: full-screen
// mode (Fullscreen API + CSS-overlay fallback), RTL keyboard navigation
// (ArrowLeft=קדימה, ArrowRight=אחורה — see src/presentation/keyboard.ts),
// 10-minute countdown + per-section timer with pause/resume, presenter-notes
// drawer, real demo links with a floating "חזרה למצגת" return control
// (session state persists ⇒ return resumes the section), honest backup
// screenshots, print handout (A4, light), rehearsal mode that records REAL
// measured seconds, and the 11-step evaluator demo mode (7.23).
// NOTE: designed to run as a TOP-LEVEL route outside OsShell (like /design)
// for true full-screen — see docs/integration-requests-w7f.md. It also
// renders correctly inside OsShell (the overlay is position:fixed).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import { OsButton, Panel, SectionTitle, StatusChip, Tabs } from "@/design-system";
import { useCollection, useInvalidateCollections } from "@/app/data/hooks";
import { DEMO_DATA_LABEL } from "@/repositories/seed";
import {
  KEYBOARD_LEGEND_HE,
  NOT_MEASURED,
  beginRehearsalSection,
  clearPresentationReturn,
  countdownRemainingMs,
  elapsedSeconds,
  ensureDemoSteps,
  ensurePresentationContent,
  exactly5Sections,
  formatClock,
  isEditableTarget,
  loadPresentationState,
  markPresentationReturn,
  pauseTimer,
  presentationStores,
  recordRehearsalSeconds,
  rehearsalSeconds,
  rehearsalVerdict,
  resolvePresentationKey,
  savePresentationState,
  startTimer,
  timerFromAccumulated,
  timingVerdict,
  toggleTimer,
  TIMER_ZERO,
  type PresentationSection,
  type PresentationViewMode,
  type PresenterNote,
  type RehearsalRun,
  type TimerSnapshot,
} from "@/presentation";
import { BACKUP_ASSET_URLS } from "./backupImages";
import { DemoModeView } from "./DemoModeView";
import { SectionVisual } from "./SectionVisual";

type OverviewTab = "overview" | "demo-mode" | "handout";

// print rules — scoped: only the handout prints, A4 light
const PRINT_CSS = `
@media print {
  body * { visibility: hidden; }
  .pres-handout-root, .pres-handout-root * { visibility: visible; }
  .pres-handout-root {
    position: absolute; inset-inline-start: 0; inset-block-start: 0;
    inline-size: 100%; background: #fff !important; color: #000 !important;
  }
  .pres-handout-root * { color: #000 !important; background: #fff !important; border-color: #bbb !important; }
  .pres-no-print { display: none !important; }
  .pres-handout-section { break-inside: avoid; }
}
@page { size: A4; margin: 14mm; }

@page { size: A4; margin: 14mm; }
.pres-handout-root { counter-reset: prespage; direction: rtl; }
.pres-handout-section { counter-increment: prespage; break-after: page; }
.pres-handout-section .pres-handout-footer::after { content: "עמוד " counter(prespage); color: #555; font-size: 11px; }
.pres-handout-header { font-size: 11px; color: #333; border-block-end: 1px solid #ccc; padding-block-end: 4px; margin-block-end: 8px; }
`;

export default function PresentationPage(): ReactElement {
  const sectionsQ = useCollection<PresentationSection>("presentationSections");
  const notesQ = useCollection<PresenterNote>("presenterNotes");
  const invalidate = useInvalidateCollections();
  const navigate = useNavigate();

  const [booted, setBooted] = useState(false);
  const [tab, setTab] = useState<OverviewTab>("overview");
  const [presenting, setPresenting] = useState(false);
  const [sectionIndex, setSectionIndex] = useState(0);
  const [overallTimer, setOverallTimer] = useState<TimerSnapshot>(TIMER_ZERO);
  const [sectionTimer, setSectionTimer] = useState<TimerSnapshot>(TIMER_ZERO);
  const [notesOpen, setNotesOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [rehearsalActive, setRehearsalActive] = useState(false);
  const [, setTick] = useState(0); // 500ms re-render while presenting
  const rehearsalRunRef = useRef<RehearsalRun | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const resumedRef = useRef(false);

  // ── idempotent bootstrap + resume persisted session ──────────────────────
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stores = presentationStores();
      const created = await ensurePresentationContent(stores);
      const demo = await ensureDemoSteps(stores);
      if (created.created + demo.created > 0) {
        await invalidate(["presentationSections", "presenterNotes", "demoSteps"]);
      }
      if (!cancelled) setBooted(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [invalidate]);

  useEffect(() => {
    if (resumedRef.current) return;
    resumedRef.current = true;
    // we are back on the presentation — the floating return control goes away
    clearPresentationReturn();
    const saved = loadPresentationState();
    if (!saved) return;
    setSectionIndex(saved.sectionIndex);
    setOverallTimer(timerFromAccumulated(saved.overallAccumulatedMs));
    setSectionTimer(timerFromAccumulated(saved.sectionAccumulatedMs));
    setNotesOpen(saved.notesOpen);
    setBackupOpen(saved.backupOpen);
    setRehearsalActive(saved.rehearsalActive);
    if (saved.mode === "present") setPresenting(true);
    if (saved.mode === "handout") setTab("handout");
  }, []);

  const sections = useMemo(
    () => [...(sectionsQ.data ?? [])].sort((a, b) => a.order - b.order),
    [sectionsQ.data],
  );
  const notes = useMemo(
    () => [...(notesQ.data ?? [])].sort((a, b) => a.order - b.order),
    [notesQ.data],
  );
  const guard = exactly5Sections(sections);
  const active: PresentationSection | undefined = sections[sectionIndex];
  const activeNotes = useMemo(
    () => notes.filter((n) => n.sectionId === active?.id),
    [notes, active?.id],
  );

  // ── persistence (session storage — resume after demo-link round trip) ────
  const persist = useCallback(
    (mode: PresentationViewMode) => {
      const now = Date.now();
      savePresentationState({
        mode,
        sectionIndex,
        overallAccumulatedMs: pauseTimer(overallTimer, now).accumulatedMs,
        sectionAccumulatedMs: pauseTimer(sectionTimer, now).accumulatedMs,
        timerWasRunning: overallTimer.running,
        notesOpen,
        backupOpen,
        rehearsalActive,
        savedAt: new Date(now).toISOString(),
      });
    },
    [sectionIndex, overallTimer, sectionTimer, notesOpen, backupOpen, rehearsalActive],
  );

  useEffect(() => {
    persist(presenting ? "present" : tab === "handout" ? "handout" : "overview");
  }, [persist, presenting, tab]);

  // ── ticking while presenting ─────────────────────────────────────────────
  useEffect(() => {
    if (!presenting) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 500);
    return () => window.clearInterval(id);
  }, [presenting]);

  // ── rehearsal recording (REAL measured seconds) ──────────────────────────
  const finishRehearsalSection = useCallback(
    async (sectionId: string) => {
      const run = rehearsalRunRef.current;
      if (!run || run.sectionId !== sectionId) return;
      rehearsalRunRef.current = null;
      const measured = rehearsalSeconds(run, Date.now());
      await recordRehearsalSeconds(presentationStores(), sectionId, measured);
      await invalidate(["presentationSections"]);
    },
    [invalidate],
  );

  // ── navigation between sections ──────────────────────────────────────────
  const goToSection = useCallback(
    (nextIndex: number) => {
      if (nextIndex < 0 || nextIndex >= sections.length) return;
      const current = sections[sectionIndex];
      if (rehearsalActive && current) void finishRehearsalSection(current.id);
      setSectionIndex(nextIndex);
      const now = Date.now();
      // per-section timer restarts; keeps running state of the overall timer
      setSectionTimer(overallTimer.running ? startTimer(TIMER_ZERO, now) : TIMER_ZERO);
      if (rehearsalActive) {
        const next = sections[nextIndex];
        if (next) rehearsalRunRef.current = beginRehearsalSection(next.id, now);
      }
      setBackupOpen(false);
    },
    [sections, sectionIndex, rehearsalActive, overallTimer.running, finishRehearsalSection],
  );

  const enterPresentMode = useCallback(() => {
    setPresenting(true);
    setTab("overview");
    const now = Date.now();
    setOverallTimer((t) => startTimer(t, now));
    setSectionTimer((t) => startTimer(t, now));
    if (rehearsalActive && sections[sectionIndex]) {
      rehearsalRunRef.current = beginRehearsalSection(sections[sectionIndex].id, now);
    }
    // Fullscreen API with a graceful fallback: the overlay below is a fixed
    // full-viewport layer, so a rejected/missing API still yields full-screen UX.
    window.setTimeout(() => {
      const el = overlayRef.current;
      if (el && typeof el.requestFullscreen === "function") {
        el.requestFullscreen().catch(() => {
          /* fallback: CSS overlay already covers the viewport */
        });
      }
    }, 0);
  }, [rehearsalActive, sections, sectionIndex]);

  const exitPresentMode = useCallback(() => {
    const current = sections[sectionIndex];
    if (rehearsalActive && current) void finishRehearsalSection(current.id);
    const now = Date.now();
    setOverallTimer((t) => pauseTimer(t, now));
    setSectionTimer((t) => pauseTimer(t, now));
    setPresenting(false);
    setNotesOpen(false);
    setBackupOpen(false);
    if (typeof document !== "undefined" && document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    }
  }, [sections, sectionIndex, rehearsalActive, finishRehearsalSection]);

  const openDemoLink = useCallback(() => {
    if (!active) return;
    persist("present");
    markPresentationReturn();
    if (typeof document !== "undefined" && document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    }
    navigate(active.demoLink.route);
  }, [active, persist, navigate]);

  // ── keyboard (RTL semantics — tested in tests/presentation/keyboard) ─────
  useEffect(() => {
    if (!presenting) return;
    const onKey = (e: KeyboardEvent): void => {
      const action = resolvePresentationKey({
        code: e.code,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        altKey: e.altKey,
        targetEditable: isEditableTarget(e.target),
      });
      if (!action) return;
      e.preventDefault();
      switch (action) {
        case "next":
          goToSection(sectionIndex + 1);
          break;
        case "prev":
          goToSection(sectionIndex - 1);
          break;
        case "exit":
          exitPresentMode();
          break;
        case "toggle-notes":
          setNotesOpen((v) => !v);
          break;
        case "toggle-timer": {
          const now = Date.now();
          setOverallTimer((t) => toggleTimer(t, now));
          setSectionTimer((t) => toggleTimer(t, now));
          break;
        }
        case "open-demo":
          openDemoLink();
          break;
        case "toggle-backup":
          setBackupOpen((v) => !v);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [presenting, sectionIndex, goToSection, exitPresentMode, openDemoLink]);

  // ── render ───────────────────────────────────────────────────────────────
  if (sectionsQ.isError || notesQ.isError) {
    return (
      <Panel style={{ padding: "var(--os-space-6)", color: "var(--os-danger)" }}>
        שגיאה בטעינת המצגת — נסו לרענן.
      </Panel>
    );
  }
  if (!booted || sectionsQ.isLoading || notesQ.isLoading) {
    return <div className="os-route-loading" aria-busy="true" data-testid="presentation-loading" />;
  }

  return (
    <div data-testid="presentation-page" style={{ display: "grid", gap: "var(--os-space-6)" }}>
      <style>{PRINT_CSS}</style>

      <div className="pres-no-print">
        <SectionTitle
          icon="doc"
          title="מצגת ההגשה — 5 שקפים · 10 דקות"
          subtitle={`${DEMO_DATA_LABEL} · המצגת הקנונית היא עמוד ה-HTML הזה — אין תלות ב-PPTX`}
          action={
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <Tabs
                ariaLabel="תצוגת המצגת"
                items={[
                  { id: "overview", label: "סקירת שקפים" },
                  { id: "demo-mode", label: "מצב הדגמה לבוחן" },
                  { id: "handout", label: "דף מודפס" },
                ]}
                activeId={tab}
                onChange={(id) => setTab(id as OverviewTab)}
              />
              <OsButton size="sm" icon="sparkle" onClick={enterPresentMode} data-testid="start-presentation">
                התחל מצגת
              </OsButton>
            </div>
          }
        />
      </div>

      {!guard.ok && (
        <Panel
          className="pres-no-print"
          style={{ padding: "var(--os-space-4)", color: "var(--os-danger)" }}
          data-testid="exactly5-problems"
        >
          {guard.problemsHe.map((p) => (
            <div key={p}>⚠ {p}</div>
          ))}
        </Panel>
      )}

      {tab === "demo-mode" ? (
        <div className="pres-no-print">
          <DemoModeView />
        </div>
      ) : tab === "handout" ? (
        <HandoutView sections={sections} notes={notes} />
      ) : (
        <OverviewView
          sections={sections}
          rehearsalActive={rehearsalActive}
          onToggleRehearsal={() => setRehearsalActive((v) => !v)}
          onOpenSection={(i) => {
            setSectionIndex(i);
            enterPresentMode();
          }}
        />
      )}

      {presenting && active && (
        <PresentOverlay
          overlayRef={overlayRef}
          sections={sections}
          active={active}
          sectionIndex={sectionIndex}
          overallTimer={overallTimer}
          sectionTimer={sectionTimer}
          notesOpen={notesOpen}
          backupOpen={backupOpen}
          rehearsalActive={rehearsalActive}
          activeNotes={activeNotes}
          onPrev={() => goToSection(sectionIndex - 1)}
          onNext={() => goToSection(sectionIndex + 1)}
          onExit={exitPresentMode}
          onToggleNotes={() => setNotesOpen((v) => !v)}
          onToggleTimer={() => {
            const now = Date.now();
            setOverallTimer((t) => toggleTimer(t, now));
            setSectionTimer((t) => toggleTimer(t, now));
          }}
          onOpenDemo={openDemoLink}
          onToggleBackup={() => setBackupOpen((v) => !v)}
        />
      )}
    </div>
  );
}

// ───────────────────────────── overview ────────────────────────────────────

function OverviewView({
  sections,
  rehearsalActive,
  onToggleRehearsal,
  onOpenSection,
}: {
  sections: readonly PresentationSection[];
  rehearsalActive: boolean;
  onToggleRehearsal: () => void;
  onOpenSection: (index: number) => void;
}): ReactElement {
  const totalTarget = sections.reduce((s, x) => s + x.timing.targetSeconds, 0);
  const measured = sections.filter((s) => s.timing.actualRehearsalSeconds !== null);
  const totalRehearsed = measured.reduce((s, x) => s + (x.timing.actualRehearsalSeconds ?? 0), 0);

  return (
    <div
      className="pres-no-print"
      data-testid="presentation-overview"
      style={{ display: "grid", gap: "var(--os-space-4)" }}
    >
      <Panel
        style={{
          padding: "var(--os-space-4)",
          display: "flex",
          gap: "var(--os-space-5)",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <span style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-sm)" }}>
          יעד כולל: <b className="os-num">{formatClock(totalTarget)}</b> דקות
        </span>
        <span style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-sm)" }} data-testid="rehearsal-total">
          חזרה אחרונה:{" "}
          {measured.length === sections.length && sections.length > 0 ? (
            <b className="os-num">{formatClock(totalRehearsed)}</b>
          ) : (
            <b>{NOT_MEASURED}</b>
          )}
          {measured.length > 0 && measured.length < sections.length
            ? ` (נמדדו ${measured.length}/${sections.length} שקפים)`
            : ""}
        </span>
        <OsButton
          size="sm"
          variant={rehearsalActive ? "primary" : "ghost"}
          icon="mic"
          onClick={onToggleRehearsal}
          data-testid="toggle-rehearsal"
        >
          {rehearsalActive ? "מצב חזרה פעיל — הזמנים יימדדו" : "הפעל מצב חזרה (מדידה אמיתית)"}
        </OsButton>
        <span style={{ color: "var(--os-muted)", fontSize: "var(--os-text-2xs)" }}>
          מדידת חזרה נרשמת רק מריצה אמיתית של המצגת — לעולם לא מוזנת ידנית.
        </span>
      </Panel>

      {sections.map((s, i) => {
        const verdict = rehearsalVerdict(s.timing.actualRehearsalSeconds, s.timing.targetSeconds);
        return (
          <Panel
            key={s.id}
            variant="raised"
            style={{
              padding: "var(--os-space-4)",
              display: "grid",
              gridTemplateColumns: "auto 1fr auto",
              gap: "var(--os-space-4)",
              alignItems: "center",
            }}
          >
            <span
              className="os-num"
              style={{
                inlineSize: 34,
                blockSize: 34,
                display: "grid",
                placeItems: "center",
                borderRadius: "var(--os-radius-full)",
                background: "var(--os-cyan-soft)",
                color: "var(--os-cyan)",
                fontWeight: 800,
              }}
            >
              {s.order}
            </span>
            <div style={{ display: "grid", gap: 4 }}>
              <b style={{ color: "var(--os-text)", fontSize: "var(--os-text-md)" }}>{s.titleHe}</b>
              <span style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-xs)" }}>
                {s.mainMessageHe}
              </span>
              <span style={{ fontSize: "var(--os-text-2xs)" }}>
                <span style={{ color: "var(--os-muted)" }}>
                  יעד: <span className="os-num">{formatClock(s.timing.targetSeconds)}</span> · חזרה:{" "}
                </span>
                <span
                  data-testid={`rehearsal-${s.id}`}
                  style={{ color: verdict.over ? "var(--os-warning)" : "var(--os-text-2)" }}
                >
                  {verdict.labelHe}
                </span>
              </span>
            </div>
            <OsButton size="sm" variant="ghost" icon="chevron-back" onClick={() => onOpenSection(i)}>
              פתח שקף
            </OsButton>
          </Panel>
        );
      })}

      <Panel style={{ padding: "var(--os-space-4)", display: "grid", gap: 6 }}>
        <b style={{ color: "var(--os-text)", fontSize: "var(--os-text-sm)" }}>קיצורי מקלדת (RTL)</b>
        {KEYBOARD_LEGEND_HE.map((k) => (
          <span key={k.keys} style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-xs)" }}>
            <b className="os-num" dir="ltr">
              {k.keys}
            </b>{" "}
            — {k.action}
          </span>
        ))}
      </Panel>
    </div>
  );
}

// ───────────────────────────── present overlay ─────────────────────────────

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 900,
  background: "var(--os-bg, #0a0f1e)",
  display: "grid",
  gridTemplateRows: "auto 1fr auto",
  padding: "var(--os-space-5)",
  gap: "var(--os-space-4)",
  overflow: "auto",
};

function PresentOverlay(props: {
  overlayRef: React.RefObject<HTMLDivElement | null>;
  sections: readonly PresentationSection[];
  active: PresentationSection;
  sectionIndex: number;
  overallTimer: TimerSnapshot;
  sectionTimer: TimerSnapshot;
  notesOpen: boolean;
  backupOpen: boolean;
  rehearsalActive: boolean;
  activeNotes: readonly PresenterNote[];
  onPrev: () => void;
  onNext: () => void;
  onExit: () => void;
  onToggleNotes: () => void;
  onToggleTimer: () => void;
  onOpenDemo: () => void;
  onToggleBackup: () => void;
}): ReactElement {
  const {
    overlayRef,
    sections,
    active,
    sectionIndex,
    overallTimer,
    sectionTimer,
    notesOpen,
    backupOpen,
    rehearsalActive,
    activeNotes,
  } = props;
  const now = Date.now();
  const remaining = countdownRemainingMs(overallTimer, now);
  const sectionElapsed = elapsedSeconds(sectionTimer, now);
  const verdict = timingVerdict(sectionElapsed, active.timing.targetSeconds);
  const overallExpired = remaining <= 0;

  return (
    <div ref={overlayRef} data-testid="present-mode" dir="rtl" style={overlayStyle}>
      {/* top bar: progress + timers + controls */}
      <div
        className="pres-no-print"
        style={{ display: "flex", alignItems: "center", gap: "var(--os-space-4)", flexWrap: "wrap" }}
      >
        <span
          className="os-num"
          data-testid="progress-indicator"
          style={{ color: "var(--os-cyan)", fontWeight: 800, fontSize: "var(--os-text-md)" }}
        >
          {sectionIndex + 1} / {sections.length}
        </span>
        <span aria-hidden="true" style={{ display: "inline-flex", gap: 5 }}>
          {sections.map((s, i) => (
            <span
              key={s.id}
              style={{
                inlineSize: 8,
                blockSize: 8,
                borderRadius: "50%",
                background: i === sectionIndex ? "var(--os-cyan)" : "var(--os-border)",
              }}
            />
          ))}
        </span>
        <span
          className="os-num"
          data-testid="countdown"
          style={{
            color: overallExpired ? "var(--os-danger)" : "var(--os-text)",
            fontWeight: 700,
          }}
          title="ספירה לאחור — 10 דקות"
        >
          ⏱ {formatClock(Math.ceil(remaining / 1000))}
        </span>
        <span
          className="os-num"
          data-testid="section-timer"
          style={{
            color:
              verdict === "חריגה"
                ? "var(--os-danger)"
                : verdict === "מתקרב לחריגה"
                  ? "var(--os-warning)"
                  : "var(--os-text-2)",
          }}
          title="זמן בשקף הנוכחי"
        >
          שקף: {formatClock(sectionElapsed)} / {formatClock(active.timing.targetSeconds)}
        </span>
        {verdict !== "בתקציב" && (
          <StatusChip status="אזהרה" label={verdict === "חריגה" ? "חריגה מיעד השקף" : "מתקרב לחריגה"} />
        )}
        {overallExpired && <StatusChip status="חסום" label="10 הדקות הסתיימו" />}
        {rehearsalActive && <StatusChip status="פעיל" label="מצב חזרה — מודד" />}
        <span style={{ flex: 1 }} />
        <OsButton size="sm" variant="ghost" icon="clock" onClick={props.onToggleTimer} data-testid="toggle-timer">
          {overallTimer.running ? "השהה טיימר" : "המשך טיימר"}
        </OsButton>
        <OsButton size="sm" variant="ghost" icon="doc" onClick={props.onToggleNotes} data-testid="toggle-notes">
          הערות מרצה
        </OsButton>
        <OsButton size="sm" variant="ghost" icon="target" onClick={props.onOpenDemo} data-testid="open-demo-link">
          דמו: {active.demoLink.labelHe}
        </OsButton>
        <OsButton size="sm" variant="ghost" icon="evidence" onClick={props.onToggleBackup} data-testid="toggle-backup">
          {backupOpen ? "חזרה לרכיב החי" : "צילום גיבוי"}
        </OsButton>
        <OsButton size="sm" variant="ghost" icon="x" onClick={props.onExit} data-testid="exit-presentation">
          יציאה
        </OsButton>
      </div>

      {/* the slide */}
      <div style={{ display: "grid", gap: "var(--os-space-4)", alignContent: "start", minBlockSize: 0 }}>
        <div style={{ textAlign: "center", display: "grid", gap: 6 }}>
          <span style={{ color: "var(--os-cyan)", fontSize: "var(--os-text-sm)", fontWeight: 600 }}>
            TERAGON AI BUSINESS OS · מצגת ההגשה
          </span>
          <h1
            data-testid="active-section-title"
            style={{ margin: 0, color: "var(--os-text)", fontSize: "var(--os-text-2xl)", fontWeight: 800 }}
          >
            {active.titleHe}
          </h1>
          <span style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-md)" }}>
            {active.mainMessageHe}
          </span>
        </div>

        {backupOpen ? (
          <BackupImageView section={active} />
        ) : (
          <Panel style={{ padding: "var(--os-space-4)" }}>
            <SectionVisual visual={active.visual} />
            <div style={{ color: "var(--os-muted)", fontSize: "var(--os-text-2xs)", marginBlockStart: 8 }}>
              רכיב חי מהמערכת — {active.visualDescriptionHe}
            </div>
          </Panel>
        )}
      </div>

      {/* bottom nav (RTL: forward button on the LEFT side = chevron-back icon) */}
      <div
        className="pres-no-print"
        style={{ display: "flex", justifyContent: "center", gap: "var(--os-space-4)", alignItems: "center" }}
      >
        {sectionIndex === 0 ? (
          <OsButton
            size="sm"
            variant="ghost"
            icon="chevron-forward"
            disabled
            disabledReason="זהו השקף הראשון"
            data-testid="prev-section"
          >
            הקודם
          </OsButton>
        ) : (
          <OsButton size="sm" variant="ghost" icon="chevron-forward" onClick={props.onPrev} data-testid="prev-section">
            הקודם
          </OsButton>
        )}
        <span style={{ color: "var(--os-muted)", fontSize: "var(--os-text-2xs)" }}>
          ← / רווח = קדימה · → = אחורה · Esc = יציאה
        </span>
        {sectionIndex === sections.length - 1 ? (
          <OsButton size="sm" icon="chevron-back" disabled disabledReason="זהו השקף האחרון" data-testid="next-section">
            הבא
          </OsButton>
        ) : (
          <OsButton size="sm" icon="chevron-back" onClick={props.onNext} data-testid="next-section">
            הבא
          </OsButton>
        )}
      </div>

      {/* presenter-notes drawer (inline overlay panel — independent of shell) */}
      {notesOpen && (
        <div
          data-testid="notes-drawer"
          role="complementary"
          aria-label="הערות מרצה"
          style={{
            position: "fixed",
            insetBlockStart: 0,
            insetBlockEnd: 0,
            insetInlineEnd: 0,
            inlineSize: "min(380px, 90vw)",
            zIndex: 950,
            background: "var(--os-panel)",
            borderInlineStart: "1px solid var(--os-border)",
            padding: "var(--os-space-5)",
            overflow: "auto",
            display: "grid",
            gap: "var(--os-space-4)",
            alignContent: "start",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <b style={{ color: "var(--os-text)" }}>הערות מרצה — {active.titleHe}</b>
            <OsButton size="sm" variant="ghost" icon="x" onClick={props.onToggleNotes}>
              סגור
            </OsButton>
          </div>
          <span style={{ color: "var(--os-muted)", fontSize: "var(--os-text-2xs)" }}>
            מטרת השקף: {active.objectiveHe}
          </span>
          {activeNotes.map((n) => (
            <div
              key={n.id}
              style={{
                padding: "var(--os-space-3)",
                borderRadius: "var(--os-radius-md)",
                border: "1px solid var(--os-border)",
                borderInlineStartWidth: 3,
                borderInlineStartColor:
                  n.emphasis === "מסר מרכזי"
                    ? "var(--os-cyan)"
                    : n.emphasis === "הערת כנות"
                      ? "var(--os-warning)"
                      : "var(--os-border)",
                color: "var(--os-text-2)",
                fontSize: "var(--os-text-sm)",
                lineHeight: 1.7,
              }}
            >
              {n.emphasis !== "רגיל" && (
                <div
                  style={{
                    color: n.emphasis === "מסר מרכזי" ? "var(--os-cyan)" : "var(--os-warning)",
                    fontSize: "var(--os-text-2xs)",
                    fontWeight: 700,
                    marginBlockEnd: 4,
                  }}
                >
                  {n.emphasis}
                </div>
              )}
              {n.textHe}
            </div>
          ))}
          <span style={{ color: "var(--os-muted)", fontSize: "var(--os-text-2xs)" }}>
            דמו (D): {active.demoLink.noteHe}
          </span>
        </div>
      )}
    </div>
  );
}

// ───────────────────────────── backup view ─────────────────────────────────

function BackupImageView({ section }: { section: PresentationSection }): ReactElement {
  const img = section.backupImage;
  return (
    <Panel data-testid="backup-view" style={{ padding: "var(--os-space-4)", display: "grid", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <StatusChip status="ממתין" label="צילום גיבוי — לא רכיב חי" />
        <span style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-sm)" }}>{img.captionHe}</span>
      </div>
      <img
        src={BACKUP_ASSET_URLS[img.assetKey]}
        alt={img.captionHe}
        style={{ inlineSize: "100%", blockSize: "auto", borderRadius: "var(--os-radius-md)", border: "1px solid var(--os-border)" }}
      />
      <span style={{ color: "var(--os-warning)", fontSize: "var(--os-text-xs)" }}>
        הערת כנות: {img.honestyNoteHe}
      </span>
      <span dir="ltr" style={{ color: "var(--os-muted)", fontSize: "var(--os-text-2xs)" }}>
        {img.sourceFile}
      </span>
    </Panel>
  );
}

// ───────────────────────────── print handout ───────────────────────────────

function HandoutView({
  sections,
  notes,
}: {
  sections: readonly PresentationSection[];
  notes: readonly PresenterNote[];
}): ReactElement {
  return (
    <div className="pres-handout-root" data-testid="handout-view" style={{ display: "grid", gap: "var(--os-space-5)" }}>
      <div className="pres-no-print" style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <OsButton size="sm" icon="doc" onClick={() => window.print()} data-testid="print-handout">
          הדפסת דף העזר (A4)
        </OsButton>
        <span style={{ color: "var(--os-muted)", fontSize: "var(--os-text-2xs)" }}>
          ההדפסה כוללת את כל 5 השקפים + הערות המרצה, בפריסה בהירה לנייר.
        </span>
      </div>

      <div style={{ display: "grid", gap: 4 }}>
        <b style={{ fontSize: "var(--os-text-lg)", color: "var(--os-text)" }}>
          מצגת ההגשה — מערכת טרגון · 5 שקפים · 10 דקות
        </b>
        <span className="pres-handout-header">
          מוצר: TERAGON AI BUSINESS OS · טרגון טכנולוגיות · תאריך הפקה:{" "}
          {new Date().toISOString().slice(0, 10)} · בעלים: צחי זוסטייהם · מצב: דף עזר למרצה
        </span>
        <span style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-xs)" }}>
          דף עזר למרצה — כולל יעדי זמן, מסרים מרכזיים, קישורי דמו וצילומי גיבוי.
        </span>
      </div>

      {sections.map((s) => {
        const sectionNotes = notes.filter((n) => n.sectionId === s.id).sort((a, b) => a.order - b.order);
        const verdict = rehearsalVerdict(s.timing.actualRehearsalSeconds, s.timing.targetSeconds);
        return (
          <div
            key={s.id}
            className="pres-handout-section"
            style={{
              border: "1px solid var(--os-border)",
              borderRadius: "var(--os-radius-md)",
              padding: "var(--os-space-4)",
              display: "grid",
              gap: 8,
            }}
          >
            <b style={{ color: "var(--os-text)", fontSize: "var(--os-text-md)" }}>
              שקף {s.order} · {s.titleHe} ·{" "}
              <span className="os-num">{formatClock(s.timing.targetSeconds)}</span> דק׳
            </b>
            <span style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-sm)" }}>
              מטרה: {s.objectiveHe}
            </span>
            <span className="pres-handout-footer" aria-hidden="true" />
            <span style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-sm)" }}>
              מסר מרכזי: {s.mainMessageHe}
            </span>
            <span style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-xs)" }}>
              ויזואל חי: {s.visualDescriptionHe}
            </span>
            <span style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-xs)" }}>
              דמו: {s.demoLink.labelHe} (<span dir="ltr">{s.demoLink.route}</span>) — {s.demoLink.noteHe}
            </span>
            <span style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-xs)" }}>
              גיבוי: {s.backupImage.captionHe} (<span dir="ltr">{s.backupImage.sourceFile}</span>)
            </span>
            <span style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-xs)" }}>
              חזרה אחרונה: {verdict.labelHe}
            </span>
            <div style={{ display: "grid", gap: 4 }}>
              <b style={{ color: "var(--os-text)", fontSize: "var(--os-text-xs)" }}>הערות מרצה:</b>
              {sectionNotes.map((n) => (
                <span key={n.id} style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-xs)", lineHeight: 1.6 }}>
                  {n.emphasis !== "רגיל" ? `[${n.emphasis}] ` : "• "}
                  {n.textHe}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
