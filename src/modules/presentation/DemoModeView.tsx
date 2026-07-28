// W7-F — "מצב הדגמה לבוחן" UI (7.23). The deterministic 11-step evaluator
// path: progress persisted in the demoSteps collection (survives refresh),
// highlight-next-action chip, reset-deterministic-data with a confirm dialog,
// and the demo-mode guard toggle. Works offline — routes + IndexedDB only.
import { useCallback, useMemo, useState } from "react";
import type { ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import { Modal, OsButton, Panel, SectionTitle, StatusChip } from "@/design-system";
import { useCollection, useInvalidateCollections } from "@/app/data/hooks";
import {
  completeDemoStep,
  demoProgress,
  markPresentationReturn,
  nextDemoStep,
  presentationStores,
  resetDemoProgress,
  resetDeterministicData,
  setDemoModeActive,
  useDemoModeGuard,
  type DemoStep,
} from "@/presentation";

const ALL_COLLECTIONS_HINT = [
  "demoSteps",
  "presentationSections",
  "presenterNotes",
] as const;

export function DemoModeView(): ReactElement {
  const navigate = useNavigate();
  const stepsQ = useCollection<DemoStep>("demoSteps");
  const invalidate = useInvalidateCollections();
  const { active, guard } = useDemoModeGuard();
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetSummary, setResetSummary] = useState<string | null>(null);

  const steps = useMemo(
    () => [...(stepsQ.data ?? [])].sort((a, b) => a.order - b.order),
    [stepsQ.data],
  );
  const next = nextDemoStep(steps);
  const progress = demoProgress(steps);

  const goToStep = useCallback(
    async (step: DemoStep, markDone: boolean) => {
      if (markDone) {
        await completeDemoStep(presentationStores(), step.id);
        await invalidate(["demoSteps"]);
      }
      if (step.route !== "/submission/presentation") {
        markPresentationReturn();
      }
      navigate(step.route);
    },
    [invalidate, navigate],
  );

  const onResetProgress = useCallback(async () => {
    await resetDemoProgress(presentationStores());
    await invalidate(["demoSteps"]);
  }, [invalidate]);

  const onResetData = useCallback(async () => {
    setResetBusy(true);
    try {
      const result = await resetDeterministicData(presentationStores());
      await invalidate([...ALL_COLLECTIONS_HINT]);
      // everything changed — refetch the world
      await invalidate([
        "personas",
        "trainingMaterials",
        "metricDefinitions",
        "metricObservations",
        "implementationProgrammes",
        "implementationRisks",
        "users",
      ]);
      setResetSummary(
        `הנתונים אופסו: ${result.clearedCollections} אוספים נוקו, ${result.reseededCollections} נזרעו מחדש מה-seed הדטרמיניסטי.`,
      );
    } finally {
      setResetBusy(false);
      setConfirmReset(false);
    }
  }, [invalidate]);

  return (
    <div data-testid="demo-mode-view" style={{ display: "grid", gap: "var(--os-space-5)" }}>
      <SectionTitle
        icon="target"
        title="מצב הדגמה לבוחן"
        subtitle="מסלול דטרמיניסטי של 11 צעדים · ההתקדמות נשמרת ושורדת רענון · עובד ללא רשת"
        action={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <StatusChip
              status={active ? "פעיל" : "מושבת"}
              label={active ? "מצב הדגמה פעיל" : "מצב הדגמה כבוי"}
            />
            <OsButton
              size="sm"
              variant="ghost"
              icon="shield"
              onClick={() => setDemoModeActive(!active)}
            >
              {active ? "כיבוי מצב הדגמה" : "הפעלת מצב הדגמה"}
            </OsButton>
          </div>
        }
      />

      {active && (
        <Panel
          style={{
            padding: "var(--os-space-3) var(--os-space-4)",
            color: "var(--warning-text)",
            fontSize: "var(--os-text-xs)",
          }}
        >
          🛡 {guard("שינוי נתונים").reasonHe}
        </Panel>
      )}

      {/* highlight-next-action floating guide chip */}
      {next && (
        <div
          data-testid="demo-next-chip"
          style={{
            position: "sticky",
            insetBlockStart: 8,
            zIndex: 5,
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px var(--os-space-4)",
            borderRadius: "var(--os-radius-full)",
            border: "1px solid var(--os-cyan)",
            background: "var(--os-panel)",
            boxShadow: "0 4px 24px rgba(32,196,232,0.25)",
          }}
        >
          <span style={{ color: "var(--os-cyan-text)", fontWeight: 700, fontSize: "var(--os-text-sm)" }}>
            הצעד הבא ({next.order}/11): {next.titleHe}
          </span>
          <OsButton size="sm" icon="chevron-back" onClick={() => void goToStep(next, true)}>
            עבור לצעד
          </OsButton>
          <span className="os-num" style={{ color: "var(--os-muted)", fontSize: "var(--os-text-xs)" }}>
            הושלמו {progress.done}/{progress.total}
          </span>
        </div>
      )}
      {!next && steps.length > 0 && (
        <Panel style={{ padding: "var(--os-space-4)", color: "var(--success-text)" }}>
          ✓ כל 11 צעדי ההדגמה הושלמו.
        </Panel>
      )}

      <div style={{ display: "grid", gap: "var(--os-space-3)" }} data-testid="demo-steps-list">
        {steps.map((step) => (
          <Panel
            key={step.id}
            variant={next?.id === step.id ? "highlight" : "raised"}
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
                inlineSize: 30,
                blockSize: 30,
                display: "grid",
                placeItems: "center",
                borderRadius: "var(--os-radius-full)",
                background: step.status === "בוצע" ? "rgba(33,201,129,0.15)" : "var(--os-cyan-soft)",
                color: step.status === "בוצע" ? "var(--success-text)" : "var(--os-cyan-text)",
                fontWeight: 800,
              }}
            >
              {step.status === "בוצע" ? "✓" : step.order}
            </span>
            <div style={{ display: "grid", gap: 3 }}>
              <b style={{ color: "var(--os-text)", fontSize: "var(--os-text-sm)" }}>{step.titleHe}</b>
              <span style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-xs)" }}>
                {step.objectiveHe}
              </span>
              <span style={{ color: "var(--os-muted)", fontSize: "var(--os-text-2xs)" }}>
                ראיה: {step.evidenceHe} · <span dir="ltr">{step.route}</span>
              </span>
            </div>
            <OsButton size="sm" variant="ghost" icon="chevron-back" onClick={() => void goToStep(step, true)}>
              פתח
            </OsButton>
          </Panel>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <OsButton size="sm" variant="ghost" icon="clock" onClick={() => void onResetProgress()}>
          איפוס התקדמות המסלול
        </OsButton>
        <OsButton size="sm" variant="ghost" icon="alert" onClick={() => setConfirmReset(true)}>
          איפוס נתוני הדגמה דטרמיניסטיים…
        </OsButton>
        {resetSummary && (
          <span style={{ color: "var(--success-text)", fontSize: "var(--os-text-xs)", alignSelf: "center" }}>
            {resetSummary}
          </span>
        )}
      </div>

      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="איפוס נתוני הדגמה"
        footer={
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <OsButton size="sm" variant="ghost" onClick={() => setConfirmReset(false)}>
              ביטול
            </OsButton>
            {resetBusy ? (
              <OsButton size="sm" icon="alert" disabled disabledReason="האיפוס מתבצע כעת">
                מאפס…
              </OsButton>
            ) : (
              <OsButton size="sm" icon="alert" onClick={() => void onResetData()} data-testid="confirm-reset-data">
                אפס והזרע מחדש
              </OsButton>
            )}
          </div>
        }
      >
        <p style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-sm)", lineHeight: 1.7 }}>
          פעולה זו מוחקת את <b>כל</b> האוספים המקומיים ומזריעה אותם מחדש מה-seed הדטרמיניסטי
          (אותו מסלול seedIfEmpty של עליית המערכת) — כולל איפוס התקדמות מסלול ההדגמה ומדידות
          החזרה. שינויים ידניים יאבדו. להמשיך?
        </p>
      </Modal>
    </div>
  );
}
