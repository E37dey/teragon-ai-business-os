// MainWorkflow — the dominant center region for the selected learner: header
// card, phase progress, the current-stage workflow (task · submission · checklist
// · instructor actions · feedback · learner-file summary) and the next-stage mini
// card. All instructor handlers, controls and copy are preserved verbatim from
// the previous StudentDetail; only the markup is recomposed for readability
// (generous measure, ≥14px body text, 1.55 line-height).
import { useState } from "react";
import type { ReactElement } from "react";
import {
  EmptyState,
  OsButton,
  Panel,
  SectionTitle,
  useToast,
  type StepperStep,
} from "@/design-system";
import type {
  Course,
  CourseSession,
  Enrollment,
  LearningPath,
  StageProgress,
} from "@/domain/types";
import { getRepository } from "@/repositories";
import { useInvalidateCollections } from "@/app/data/hooks";
import { currentStage, formatDateHe, nextExercise, todayISO } from "./lib";
import { logCourseActivity } from "./activity";
import { busyDisabled } from "./controls";
import { statusToChip } from "./statusChip";
import { PhaseProgress } from "./PhaseProgress";
import { LearnerHeaderCard } from "./LearnerHeaderCard";
import { NextStageMiniCard } from "./NextStageMiniCard";
import type { OpenDrawerController } from "./useCoursesLayout";

export function MainWorkflow({
  enrollment,
  course,
  path,
  upcoming,
  instructorName,
  drawer,
}: {
  enrollment: Enrollment;
  course: Course | undefined;
  path: LearningPath | undefined;
  upcoming: readonly CourseSession[];
  instructorName: string | null;
  drawer: OpenDrawerController;
}): ReactElement {
  const { toast } = useToast();
  const invalidate = useInvalidateCollections();
  const [activeStageId, setActiveStageId] = useState<string | null>(null);
  const [returnNote, setReturnNote] = useState("");
  const [memoryNote, setMemoryNote] = useState("");
  const [busy, setBusy] = useState(false);

  const cur = currentStage(enrollment);
  const activeStage =
    enrollment.stages.find((s) => s.stageId === activeStageId) ?? cur ?? enrollment.stages[0];
  const stageMeta = path?.stages.find((s) => s.id === activeStage?.stageId);
  const rec = nextExercise(enrollment, path);
  const totalStages = path?.stages.length ?? 0;
  const courseUpcoming = upcoming.filter((s) => s.courseId === enrollment.courseId);

  const steps: StepperStep[] = (path?.stages ?? []).map((st) => {
    const sp = enrollment.stages.find((s) => s.stageId === st.id);
    const status: StepperStep["status"] =
      sp && sp.status === "אושר"
        ? "done"
        : sp && sp.stageId === activeStage?.stageId
          ? "active"
          : "pending";
    return { id: st.id, label: `${st.order}. ${st.name}`, status };
  });

  async function patchStage(
    stageId: string,
    patch: Partial<StageProgress>,
    activityText: string,
  ): Promise<void> {
    setBusy(true);
    try {
      const repo = getRepository<Enrollment>("enrollments");
      const fresh = await repo.get(enrollment.id);
      if (!fresh) throw new Error("הרישום לא נמצא");
      const stages = fresh.stages.map((s) =>
        s.stageId === stageId ? { ...s, ...patch, updated: todayISO() } : s,
      );
      await repo.update(enrollment.id, { stages, updatedAt: new Date().toISOString() });
      await logCourseActivity(activityText, `enrollment:${enrollment.id}`);
      await invalidate(["enrollments", "activities"]);
    } finally {
      setBusy(false);
    }
  }

  if (!path || enrollment.stages.length === 0) {
    return (
      <EmptyState
        title="אין מסלול למידה מובנה לקורס זה"
        reason="לקורס זה אין LearningPath מוגדר — ההתקדמות מנוהלת ידנית מול המדריך."
      />
    );
  }
  if (!activeStage) {
    return <EmptyState title="אין שלבים" reason="לרישום זה אין שלבי התקדמות." />;
  }

  const awaiting =
    activeStage.status === "הוגש לבדיקה" || activeStage.status === "ממתין לאישור מדריך";

  return (
    <div className="courses-center">
      <LearnerHeaderCard
        enrollment={enrollment}
        course={course}
        path={path}
        instructorName={instructorName}
      />

      <Panel style={{ padding: "var(--os-space-5)", display: "grid", gap: "var(--os-space-4)" }}>
        <PhaseProgress
          pathStages={path.stages}
          steps={steps}
          activeStepId={activeStage.stageId}
          onStepClick={(s) => setActiveStageId(s.id)}
        />
      </Panel>

      <Panel className="courses-workflow">
        <SectionTitle
          title={
            stageMeta
              ? `שלב ${stageMeta.order} מתוך ${totalStages} · ${stageMeta.name}`
              : activeStage.stageId
          }
          action={statusToChip(activeStage.status)}
        />
        {stageMeta && (
          <div className="courses-workflow__block">
            <div className="courses-field-label">מטלת השלב</div>
            <div className="courses-workflow__text">{stageMeta.description}</div>
          </div>
        )}
        <div style={{ fontSize: "var(--os-text-md)" }}>
          <span style={{ color: "var(--os-muted)" }}>יעד: </span>
          <span className="os-num">{formatDateHe(activeStage.due)}</span>
          <span style={{ color: "var(--os-muted)" }}> · עודכן: </span>
          <span className="os-num">{formatDateHe(activeStage.updated)}</span>
        </div>
        {activeStage.text && (
          <Panel
            variant="raised"
            className="courses-workflow__block"
            style={{ padding: "var(--os-space-4)" }}
          >
            <div
              style={{ color: "var(--os-muted)", marginBlockEnd: 4 }}
            >{`ההגשה של ${enrollment.studentName}`}</div>
            <div className="courses-workflow__text">{activeStage.text}</div>
          </Panel>
        )}
        {activeStage.help && (
          <Panel
            variant="raised"
            accent="danger"
            className="courses-workflow__block"
            style={{ padding: "var(--os-space-4)" }}
          >
            <div style={{ color: "var(--os-danger)", marginBlockEnd: 4 }}>בקשת עזרה</div>
            <div className="courses-workflow__text">{activeStage.help}</div>
          </Panel>
        )}
        {(activeStage.files.length > 0 || activeStage.links.length > 0) && (
          <div style={{ fontSize: "var(--os-text-md)", display: "grid", gap: 4 }}>
            {activeStage.files.map((f) => (
              <div key={f.name} style={{ color: "var(--os-text-2)" }}>
                📎 צפייה בצילום המסך שצורף — {f.name} <span className="os-num">({f.size})</span>
              </div>
            ))}
            {activeStage.links.map((l) => (
              <div key={l.url} style={{ color: "var(--os-cyan)" }}>
                🔗 {l.label}
              </div>
            ))}
          </div>
        )}
        {stageMeta && stageMeta.checklist.length > 0 && (
          <div style={{ fontSize: "var(--os-text-md)", display: "grid", gap: 4 }}>
            <div style={{ color: "var(--os-muted)" }}>רשימת בדיקה לשלב</div>
            {stageMeta.checklist.map((item) => {
              const done = activeStage.checklistDone.includes(item);
              return (
                <div key={item} style={{ color: done ? "var(--os-success)" : "var(--os-text-2)" }}>
                  {done ? "✓" : "○"} {item}
                </div>
              );
            })}
          </div>
        )}
        {activeStage.notes.length > 0 && (
          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ color: "var(--os-muted)", fontSize: "var(--os-text-md)" }}>
              סיכומי מדריך קודמים ({activeStage.notes.length})
            </div>
            {activeStage.notes.map((n, i) => (
              <Panel
                key={i}
                variant="raised"
                style={{ padding: "var(--os-space-3)", fontSize: "var(--os-text-xs)" }}
              >
                <span style={{ color: "var(--os-cyan)" }}>{n.author}</span>
                <span style={{ color: "var(--os-muted)" }}>
                  {" · "}
                  <span className="os-num">{formatDateHe(n.date)}</span>
                </span>
                <div>{n.text}</div>
              </Panel>
            ))}
          </div>
        )}

        {/* instructor actions */}
        <div className="courses-actions">
          <div className="courses-actions__row">
            {awaiting ? (
              <OsButton
                variant="approve"
                icon="check"
                {...busyDisabled(busy)}
                onClick={() => {
                  void patchStage(
                    activeStage.stageId,
                    { status: "אושר" },
                    `המדריך אישר את שלב «${stageMeta?.name ?? activeStage.stageId}» של ${enrollment.studentName}`,
                  ).then(() => toast("השלב אושר ונרשם ביומן הפעילות", "success"));
                }}
              >
                אישור השלמת השלב
              </OsButton>
            ) : (
              <OsButton
                variant="approve"
                icon="check"
                disabled
                disabledReason="אישור אפשרי רק לאחר שהשלב הוגש לבדיקת המדריך"
              >
                אישור השלמת השלב
              </OsButton>
            )}
          </div>
          <div className="courses-actions__field">
            <label className="os-qc-label" htmlFor="return-note">
              {`משוב המדריך — כתבו משוב קצר וברור שיעזור ל${enrollment.studentName} להתקדם לשלב הבא`}
            </label>
            <textarea
              id="return-note"
              className="os-qc-input os-qc-input--area"
              value={returnNote}
              onChange={(e) => setReturnNote(e.target.value)}
              placeholder={`מה נדרש לתקן? המשוב יוצג ל${enrollment.studentName}.`}
              rows={2}
            />
            <div>
              {awaiting && returnNote.trim().length > 0 ? (
                <OsButton
                  variant="reject"
                  icon="x"
                  onClick={() => {
                    const note = {
                      author: "צחי זוסטייהם",
                      text: returnNote.trim(),
                      date: todayISO(),
                    };
                    void patchStage(
                      activeStage.stageId,
                      { status: "נדרש תיקון", notes: [...activeStage.notes, note] },
                      `המדריך החזיר לתיקון את שלב «${stageMeta?.name ?? activeStage.stageId}» של ${enrollment.studentName}`,
                    ).then(() => {
                      setReturnNote("");
                      toast("השלב הוחזר לתיקון עם הערה", "warning");
                    });
                  }}
                >
                  החזרה לתיקון
                </OsButton>
              ) : (
                <OsButton
                  variant="reject"
                  icon="x"
                  disabled
                  disabledReason={
                    awaiting
                      ? "החזרה לתיקון מחייבת משוב כתוב ללומד"
                      : "החזרה אפשרית רק כשהשלב ממתין לבדיקת המדריך"
                  }
                >
                  החזרה לתיקון
                </OsButton>
              )}
            </div>
          </div>
          <div className="courses-actions__field">
            <label className="os-qc-label" htmlFor="memory-note">
              סיכום לתיק הלומד — נקודות חשובות להמשך הליווי
            </label>
            <div className="courses-actions__inline">
              <input
                id="memory-note"
                className="os-qc-input"
                value={memoryNote}
                onChange={(e) => setMemoryNote(e.target.value)}
                placeholder={`תובנה על ${enrollment.studentName} שתישמר בתיק הלמידה`}
              />
              {memoryNote.trim().length > 0 ? (
                <OsButton
                  variant="ghost"
                  icon="memory"
                  onClick={() => {
                    const note = {
                      author: "צחי זוסטייהם",
                      text: memoryNote.trim(),
                      date: todayISO(),
                    };
                    void patchStage(
                      activeStage.stageId,
                      { notes: [...activeStage.notes, note] },
                      `נוספה הערת למידה עבור ${enrollment.studentName}`,
                    ).then(() => {
                      setMemoryNote("");
                      toast("הערת הלמידה נשמרה", "success");
                    });
                  }}
                >
                  שמירת הסיכום
                </OsButton>
              ) : (
                <OsButton
                  variant="ghost"
                  icon="memory"
                  disabled
                  disabledReason="כתבו סיכום לפני השמירה"
                >
                  שמירת הסיכום
                </OsButton>
              )}
            </div>
          </div>
        </div>
      </Panel>

      <NextStageMiniCard
        rec={rec}
        courseUpcoming={courseUpcoming}
        onOpenDetails={() => drawer.open("nextStage")}
      />
    </div>
  );
}
