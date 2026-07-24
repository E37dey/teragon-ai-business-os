// /courses — קורסים והכשרות (Wave 4). Instructor workbench: catalogue,
// learning paths, student progress + approval flow, sessions & attendance,
// certificates, delayed queue. Data only through repositories (TanStack Query);
// every derived number comes from src/modules/courses/lib.ts.
import { useMemo, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import { PageRail } from "@/app/rail";
import {
  ConfidenceBar,
  DataTable,
  EmptyState,
  KpiCard,
  Modal,
  OsButton,
  Panel,
  SectionTitle,
  StatusChip,
  Stepper,
  Tabs,
  useToast,
  type DataTableColumn,
  type StepperStep,
} from "@/design-system";
import type {
  Activity,
  Course,
  CourseSession,
  Enrollment,
  LearningPath,
  StageProgress,
  StageProgressStatus,
  User,
} from "@/domain/types";
import { getRepository, nextId } from "@/repositories";
import { CEO_USER_ID, DEMO_DATA_LABEL } from "@/repositories/seed";
import { useCollection, useInvalidateCollections } from "@/app/data/hooks";
import {
  approvalQueue,
  certificateEligible,
  completionStats,
  currentStage,
  delayedQueue,
  formatDateHe,
  nextExercise,
  progressPercent,
  RULES_ENGINE_LABEL,
  studentCount,
  todayISO,
  upcomingSessions,
} from "./lib";

// ── shared layout bits ──────────────────────────────────────────────────────
const kpiRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: "var(--os-space-5)",
};
const twoPaneStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(260px, 340px) 1fr",
  gap: "var(--os-space-6)",
  alignItems: "start",
};

function statusToChip(status: StageProgressStatus): ReactElement {
  switch (status) {
    case "אושר":
      return <StatusChip status="הושלם" label="אושר" />;
    case "הוגש לבדיקה":
    case "ממתין לאישור מדריך":
      return <StatusChip status="דורש אישור" label={status} />;
    case "בעבודה":
      return <StatusChip status="פעיל" label="בעבודה" />;
    case "נדרש תיקון":
    case "באיחור":
      return <StatusChip status="אזהרה" label={status} />;
    case "חסום / צריך עזרה":
      return <StatusChip status="חסום" label="חסום / צריך עזרה" />;
    default:
      return <StatusChip status="ממתין" label={status} />;
  }
}

/** Disabled-with-reason props while an async action runs (OsButton honesty contract). */
function busyDisabled(
  busy: boolean,
): { disabled: true; disabledReason: string } | { disabled?: false } {
  return busy ? { disabled: true, disabledReason: "פעולה קודמת עדיין רצה" } : {};
}

async function logCourseActivity(text: string, entityRef: string | null): Promise<void> {
  const repo = getRepository<Activity>("activities");
  const all = await repo.list();
  const now = new Date().toISOString();
  await repo.create({
    id: nextId(
      "act",
      all.map((a) => a.id),
    ),
    kind: "קורס",
    text,
    actorId: CEO_USER_ID,
    entityRef,
    at: now,
    createdAt: now,
    updatedAt: now,
  });
}

// ── page ────────────────────────────────────────────────────────────────────
export default function CoursesPage(): ReactElement {
  const coursesQ = useCollection<Course>("courses");
  const pathsQ = useCollection<LearningPath>("learningPaths");
  const enrollmentsQ = useCollection<Enrollment>("enrollments");
  const sessionsQ = useCollection<CourseSession>("courseSessions");
  const usersQ = useCollection<User>("users");

  const [tab, setTab] = useState("students");
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState<string | null>(null);
  const [newCourseOpen, setNewCourseOpen] = useState(false);

  const loading =
    coursesQ.isLoading || pathsQ.isLoading || enrollmentsQ.isLoading || sessionsQ.isLoading;
  const error = coursesQ.isError || pathsQ.isError || enrollmentsQ.isError || sessionsQ.isError;

  const courses = useMemo(() => coursesQ.data ?? [], [coursesQ.data]);
  const paths = useMemo(() => pathsQ.data ?? [], [pathsQ.data]);
  const enrollments = useMemo(() => enrollmentsQ.data ?? [], [enrollmentsQ.data]);
  const sessions = useMemo(() => sessionsQ.data ?? [], [sessionsQ.data]);
  const users = useMemo(() => usersQ.data ?? [], [usersQ.data]);

  const today = todayISO();
  const nowIso = new Date().toISOString();

  const approvals = useMemo(() => approvalQueue(enrollments), [enrollments]);
  const delayed = useMemo(() => delayedQueue(enrollments, today), [enrollments, today]);
  const upcoming = useMemo(() => upcomingSessions(sessions, nowIso), [sessions, nowIso]);
  const stats = useMemo(() => completionStats(courses, enrollments), [courses, enrollments]);

  const activeCourses = courses.filter((c) => c.status === "פעיל" || c.status === "מלא").length;

  if (error) {
    return (
      <EmptyState
        icon="alert"
        title="שגיאה בטעינת נתוני הקורסים"
        reason="קריאת ה-repositories נכשלה — נסו לרענן את הדף."
      />
    );
  }
  if (loading) {
    return (
      <Panel style={{ padding: "var(--os-space-8)", color: "var(--os-text-2)" }}>
        טוען נתוני קורסים…
      </Panel>
    );
  }

  return (
    <div style={{ display: "grid", gap: "var(--os-space-6)" }}>
      <PageRail>
        <CoursesRail
          courses={courses}
          stats={stats}
          delayed={delayed}
          upcoming={upcoming.slice(0, 3)}
        />
      </PageRail>

      <SectionTitle
        icon="graduation"
        title="קורסים והכשרות"
        subtitle={DEMO_DATA_LABEL}
        action={
          <OsButton icon="plus" onClick={() => setNewCourseOpen(true)}>
            קורס חדש
          </OsButton>
        }
      />

      <div style={kpiRowStyle}>
        <KpiCard title="קורסים פעילים" value={activeCourses} accent="cyan" icon="graduation" />
        <KpiCard title="לומדים פעילים" value={enrollments.length} accent="blue" icon="users" />
        <KpiCard
          title="ממתינים לבדיקת מדריך"
          value={approvals.length}
          accent="violet"
          icon="check"
          glow={approvals.length > 0}
        />
        <KpiCard title="לומדים הדורשים מעקב" value={delayed.length} accent="danger" icon="alert" />
        <KpiCard
          title="מפגשים בשבעת הימים הקרובים"
          value={upcoming.length}
          accent="success"
          icon="clock"
        />
      </div>

      <Tabs
        ariaLabel="אזורי העבודה של מודול הקורסים"
        items={[
          { id: "students", label: "לומדים והתקדמות", badge: enrollments.length },
          { id: "approvals", label: "מטלות והגשות", badge: approvals.length },
          { id: "catalog", label: "קטלוג הקורסים", badge: courses.length },
          { id: "paths", label: "מסלולים וקורסים", badge: paths.length },
          { id: "sessions", label: "לוח מפגשים", badge: sessions.length },
          { id: "certs", label: "תעודות והסמכות" },
        ]}
        activeId={tab}
        onChange={setTab}
      />

      {tab === "students" && (
        <StudentsWorkbench
          enrollments={enrollments}
          courses={courses}
          paths={paths}
          selectedId={selectedEnrollmentId}
          onSelect={setSelectedEnrollmentId}
        />
      )}
      {tab === "approvals" && (
        <ApprovalsQueue
          approvals={approvals}
          courses={courses}
          paths={paths}
          onOpenStudent={(id) => {
            setSelectedEnrollmentId(id);
            setTab("students");
          }}
        />
      )}
      {tab === "catalog" && (
        <CourseCatalog courses={courses} enrollments={enrollments} users={users} />
      )}
      {tab === "paths" && <PathsView paths={paths} courses={courses} />}
      {tab === "sessions" && (
        <SessionsView sessions={sessions} courses={courses} enrollments={enrollments} />
      )}
      {tab === "certs" && <CertificatesView enrollments={enrollments} courses={courses} />}

      <NewCourseModal open={newCourseOpen} onClose={() => setNewCourseOpen(false)} users={users} />
    </div>
  );
}

// ── rail ────────────────────────────────────────────────────────────────────
function CoursesRail({
  courses,
  stats,
  delayed,
  upcoming,
}: {
  courses: readonly Course[];
  stats: ReturnType<typeof completionStats>;
  delayed: ReturnType<typeof delayedQueue>;
  upcoming: readonly CourseSession[];
}): ReactElement {
  const nameOf = (id: string): string => courses.find((c) => c.id === id)?.name ?? id;
  const withStudents = stats.filter((s) => s.students > 0);
  return (
    <div style={{ display: "grid", gap: "var(--os-space-6)", fontSize: "var(--os-text-sm)" }}>
      <div>
        <div style={railTitleStyle}>התקדמות במסלולים</div>
        {withStudents.length === 0 && <div style={railMutedStyle}>אין רישומים פעילים למדידה.</div>}
        {withStudents.map((s) => (
          <div key={s.courseId} style={{ marginBlockEnd: "var(--os-space-4)" }}>
            <ConfidenceBar
              value={s.avgProgress}
              label={`${nameOf(s.courseId)} · ${s.students} לומדים`}
            />
          </div>
        ))}
      </div>
      <div>
        <div style={railTitleStyle}>לומדים הדורשים מעקב ({delayed.length})</div>
        {delayed.length === 0 && <div style={railMutedStyle}>אין כרגע לומדים הדורשים מעקב.</div>}
        {delayed.slice(0, 5).map((d, i) => (
          <div key={`${d.enrollment.id}-${d.stage.stageId}-${i}`} style={railRowStyle}>
            <span>{d.enrollment.studentName}</span>
            <StatusChip status={d.kind === "חסום / צריך עזרה" ? "חסום" : "אזהרה"} label={d.kind} />
          </div>
        ))}
      </div>
      <div>
        <div style={railTitleStyle}>מפגשים בשבעת הימים הקרובים</div>
        {upcoming.length === 0 && <div style={railMutedStyle}>אין מפגשים מתוזמנים קדימה.</div>}
        {upcoming.map((s) => (
          <div key={s.id} style={{ marginBlockEnd: "var(--os-space-3)" }}>
            <div>{s.title}</div>
            <div style={railMutedStyle}>
              <span className="os-num" dir="ltr">
                {new Date(s.scheduledAt).toLocaleString("he-IL", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              {" · "}
              {nameOf(s.courseId)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const railTitleStyle: CSSProperties = {
  color: "var(--os-text)",
  fontWeight: "var(--os-weight-semibold)" as CSSProperties["fontWeight"],
  marginBlockEnd: "var(--os-space-3)",
};
const railMutedStyle: CSSProperties = { color: "var(--os-muted)", fontSize: "var(--os-text-xs)" };
const railRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "var(--os-space-3)",
  marginBlockEnd: "var(--os-space-3)",
};

// ── students workbench ─────────────────────────────────────────────────────
function StudentsWorkbench({
  enrollments,
  courses,
  paths,
  selectedId,
  onSelect,
}: {
  enrollments: readonly Enrollment[];
  courses: readonly Course[];
  paths: readonly LearningPath[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}): ReactElement {
  const [courseFilter, setCourseFilter] = useState("all");
  const filtered = enrollments.filter((e) => courseFilter === "all" || e.courseId === courseFilter);
  const selected = enrollments.find((e) => e.id === selectedId) ?? filtered[0] ?? null;
  const courseOf = (id: string): Course | undefined => courses.find((c) => c.id === id);

  return (
    <div style={twoPaneStyle}>
      <Panel style={{ padding: "var(--os-space-5)" }}>
        <div style={{ marginBlockEnd: "var(--os-space-4)" }}>
          <label className="os-qc-label" htmlFor="course-filter">
            סינון לפי קורס
          </label>
          <select
            id="course-filter"
            className="os-qc-input"
            value={courseFilter}
            onChange={(e) => setCourseFilter(e.target.value)}
          >
            <option value="all">כל הקורסים</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        {filtered.length === 0 && (
          <EmptyState title="אין רישומים" reason="לא נמצאו רישומי תלמידים לקורס שנבחר." />
        )}
        <div style={{ display: "grid", gap: "var(--os-space-3)" }}>
          {filtered.map((enr) => {
            const pct = progressPercent(enr);
            const active = selected?.id === enr.id;
            return (
              <button
                key={enr.id}
                type="button"
                onClick={() => onSelect(enr.id)}
                style={{
                  textAlign: "start",
                  background: active ? "var(--os-highlight)" : "var(--os-raised)",
                  border: active ? "1px solid var(--os-cyan-border)" : "1px solid var(--os-border)",
                  borderRadius: "var(--os-radius-md)",
                  padding: "var(--os-space-4)",
                  color: "var(--os-text)",
                  cursor: "pointer",
                  font: "inherit",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontWeight: 600 }}>{enr.studentName}</span>
                  {pct !== null ? (
                    <span className="os-num" style={{ color: "var(--os-cyan)" }}>
                      {pct}%
                    </span>
                  ) : (
                    <span style={{ color: "var(--os-muted)", fontSize: "var(--os-text-2xs)" }}>
                      ללא מסלול
                    </span>
                  )}
                </div>
                <div style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-xs)" }}>
                  {courseOf(enr.courseId)?.name ?? enr.courseId} · תשלום: {enr.payment}
                </div>
              </button>
            );
          })}
        </div>
      </Panel>

      {selected ? (
        <StudentDetail
          key={selected.id}
          enrollment={selected}
          course={courseOf(selected.courseId)}
          path={paths.find((p) => p.courseId === selected.courseId)}
        />
      ) : (
        <EmptyState title="בחרו תלמיד" reason="בחרו רישום מהרשימה כדי לצפות בהתקדמות." />
      )}
    </div>
  );
}

function StudentDetail({
  enrollment,
  course,
  path,
}: {
  enrollment: Enrollment;
  course: Course | undefined;
  path: LearningPath | undefined;
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
  // copy helpers (display only): total stages + how many the learner has cleared
  const totalStages = path?.stages.length ?? 0;
  const completedStages = enrollment.stages.filter((s) => s.status === "אושר").length;

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
    <div style={{ display: "grid", gap: "var(--os-space-5)" }}>
      <Panel style={{ padding: "var(--os-space-5)" }}>
        <SectionTitle
          title={enrollment.studentName}
          subtitle={`מסלול: ${course?.name ?? path.name} · ${completedStages} מתוך ${totalStages} שלבים הושלמו`}
        />
        <div
          className="os-table-scroll"
          style={{ overflowX: "auto", paddingBlock: "var(--os-space-3)" }}
        >
          <Stepper steps={steps} onStepClick={(s) => setActiveStageId(s.id)} />
        </div>
      </Panel>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr minmax(220px, 280px)",
          gap: "var(--os-space-5)",
          alignItems: "start",
        }}
      >
        <Panel style={{ padding: "var(--os-space-5)", display: "grid", gap: "var(--os-space-4)" }}>
          <SectionTitle
            title={
              stageMeta
                ? `שלב ${stageMeta.order} מתוך ${totalStages} · ${stageMeta.name}`
                : activeStage.stageId
            }
            action={statusToChip(activeStage.status)}
          />
          {stageMeta && (
            <div style={{ display: "grid", gap: 4 }}>
              <div
                style={{
                  color: "var(--os-muted)",
                  fontSize: "var(--os-text-xs)",
                  fontWeight: 600,
                }}
              >
                מטלת השלב
              </div>
              <div style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-sm)" }}>
                {stageMeta.description}
              </div>
            </div>
          )}
          <div style={{ fontSize: "var(--os-text-sm)" }}>
            <span style={{ color: "var(--os-muted)" }}>יעד: </span>
            <span className="os-num">{formatDateHe(activeStage.due)}</span>
            <span style={{ color: "var(--os-muted)" }}> · עודכן: </span>
            <span className="os-num">{formatDateHe(activeStage.updated)}</span>
          </div>
          {activeStage.text && (
            <Panel
              variant="raised"
              style={{ padding: "var(--os-space-4)", fontSize: "var(--os-text-sm)" }}
            >
              <div
                style={{ color: "var(--os-muted)", marginBlockEnd: 4 }}
              >{`ההגשה של ${enrollment.studentName}`}</div>
              {activeStage.text}
            </Panel>
          )}
          {activeStage.help && (
            <Panel
              variant="raised"
              accent="danger"
              style={{ padding: "var(--os-space-4)", fontSize: "var(--os-text-sm)" }}
            >
              <div style={{ color: "var(--os-danger)", marginBlockEnd: 4 }}>בקשת עזרה</div>
              {activeStage.help}
            </Panel>
          )}
          {(activeStage.files.length > 0 || activeStage.links.length > 0) && (
            <div style={{ fontSize: "var(--os-text-sm)", display: "grid", gap: 4 }}>
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
            <div style={{ fontSize: "var(--os-text-sm)", display: "grid", gap: 4 }}>
              <div style={{ color: "var(--os-muted)" }}>רשימת בדיקה לשלב</div>
              {stageMeta.checklist.map((item) => {
                const done = activeStage.checklistDone.includes(item);
                return (
                  <div
                    key={item}
                    style={{ color: done ? "var(--os-success)" : "var(--os-text-2)" }}
                  >
                    {done ? "✓" : "○"} {item}
                  </div>
                );
              })}
            </div>
          )}
          {activeStage.notes.length > 0 && (
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ color: "var(--os-muted)", fontSize: "var(--os-text-sm)" }}>
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
          <div style={{ display: "grid", gap: "var(--os-space-3)" }}>
            <div style={{ display: "flex", gap: "var(--os-space-3)", flexWrap: "wrap" }}>
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
            <div style={{ display: "grid", gap: 6 }}>
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
            <div style={{ display: "grid", gap: 6 }}>
              <label className="os-qc-label" htmlFor="memory-note">
                סיכום לתיק הלומד — נקודות חשובות להמשך הליווי
              </label>
              <div style={{ display: "flex", gap: "var(--os-space-3)" }}>
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

        {/* deterministic recommendation */}
        <Panel
          variant="raised"
          accent="cyan"
          style={{ padding: "var(--os-space-5)", display: "grid", gap: "var(--os-space-3)" }}
        >
          <SectionTitle icon="sparkle" title="השלב הבא" subtitle={RULES_ENGINE_LABEL} />
          {rec ? (
            <>
              <div style={{ fontWeight: 600 }}>
                שלב {rec.stage.order}: {rec.stage.name}
              </div>
              <div style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-sm)" }}>
                {rec.reason}
              </div>
              <ConfidenceBar value={null} label="רמת ביטחון" />
              <div style={{ color: "var(--os-muted)", fontSize: "var(--os-text-2xs)" }}>
                המלצה דטרמיניסטית מסדר המסלול — ללא מודל AI וללא מדדים מומצאים.
              </div>
            </>
          ) : (
            <div style={{ color: "var(--os-success)" }}>המסלול הושלם — אין שלב הבא. 🎓</div>
          )}
        </Panel>
      </div>
    </div>
  );
}

// ── approvals queue ────────────────────────────────────────────────────────
function ApprovalsQueue({
  approvals,
  courses,
  paths,
  onOpenStudent,
}: {
  approvals: ReturnType<typeof approvalQueue>;
  courses: readonly Course[];
  paths: readonly LearningPath[];
  onOpenStudent: (enrollmentId: string) => void;
}): ReactElement {
  const columns: DataTableColumn<(typeof approvals)[number]>[] = [
    { key: "student", header: "לומד", render: (r) => r.enrollment.studentName },
    {
      key: "course",
      header: "קורס",
      render: (r) =>
        courses.find((c) => c.id === r.enrollment.courseId)?.name ?? r.enrollment.courseId,
    },
    {
      key: "stage",
      header: "שלב",
      render: (r) => {
        const p = paths.find((x) => x.courseId === r.enrollment.courseId);
        const meta = p?.stages.find((s) => s.id === r.stage.stageId);
        return meta ? `${meta.order}. ${meta.name}` : r.stage.stageId;
      },
    },
    { key: "status", header: "סטטוס", render: (r) => statusToChip(r.stage.status) },
    {
      key: "updated",
      header: "הוגש",
      numeric: true,
      render: (r) => <span className="os-table__num">{formatDateHe(r.stage.updated)}</span>,
    },
    {
      key: "open",
      header: "",
      render: (r) => (
        <OsButton size="sm" variant="ghost" onClick={() => onOpenStudent(r.enrollment.id)}>
          לבדיקה ←
        </OsButton>
      ),
    },
  ];
  return (
    <DataTable
      columns={columns}
      rows={approvals}
      rowKey={(r) => `${r.enrollment.id}-${r.stage.stageId}`}
      emptyText="אין מטלות שממתינות לאישור"
      emptyReason="כאשר לומד יגיש שלב לבדיקה הוא יופיע כאן."
    />
  );
}

// ── catalogue ──────────────────────────────────────────────────────────────
function CourseCatalog({
  courses,
  enrollments,
  users,
}: {
  courses: readonly Course[];
  enrollments: readonly Enrollment[];
  users: readonly User[];
}): ReactElement {
  const [statusFilter, setStatusFilter] = useState("all");
  const rows = courses.filter((c) => statusFilter === "all" || c.status === statusFilter);
  const columns: DataTableColumn<Course>[] = [
    { key: "name", header: "קורס" },
    {
      key: "instructor",
      header: "מדריך",
      render: (c) => users.find((u) => u.id === c.instructorId)?.name ?? c.instructorId,
    },
    {
      key: "dates",
      header: "תקופה",
      render: (c) => (
        <span className="os-table__num">
          {formatDateHe(c.start)} — {formatDateHe(c.end)}
        </span>
      ),
    },
    {
      key: "price",
      header: "מחיר",
      numeric: true,
      render: (c) => <span className="os-table__num">₪{c.price.toLocaleString("he-IL")}</span>,
    },
    {
      key: "students",
      header: "תלמידים",
      numeric: true,
      render: (c) => <span className="os-table__num">{studentCount(enrollments, c.id)}</span>,
    },
    {
      key: "status",
      header: "סטטוס",
      render: (c) => (
        <StatusChip
          status={
            c.status === "פעיל"
              ? "פעיל"
              : c.status === "הסתיים"
                ? "הושלם"
                : c.status === "מלא"
                  ? "אזהרה"
                  : "ממתין"
          }
          label={c.status}
        />
      ),
    },
    {
      key: "ai",
      header: "AI",
      render: (c) => (c.isAI ? <StatusChip status="דורש אישור" label="קורס AI" /> : null),
    },
  ];
  return (
    <div style={{ display: "grid", gap: "var(--os-space-4)" }}>
      <div style={{ display: "flex", gap: "var(--os-space-4)", alignItems: "center" }}>
        <label className="os-qc-label" htmlFor="catalog-status">
          סטטוס
        </label>
        <select
          id="catalog-status"
          className="os-qc-input"
          style={{ maxInlineSize: 220 }}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">הכול</option>
          <option value="פעיל">פעיל</option>
          <option value="פתוח להרשמה">פתוח להרשמה</option>
          <option value="מלא">מלא</option>
          <option value="הסתיים">הסתיים</option>
        </select>
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey="id"
        emptyText="אין קורסים"
        emptyReason="לא נמצאו קורסים בסינון הנוכחי."
      />
    </div>
  );
}

// ── learning paths ─────────────────────────────────────────────────────────
function PathsView({
  paths,
  courses,
}: {
  paths: readonly LearningPath[];
  courses: readonly Course[];
}): ReactElement {
  if (paths.length === 0) {
    return (
      <EmptyState title="אין מסלולי למידה" reason="טרם הוגדרו מסלולים — צרו מסלול דרך המדריך." />
    );
  }
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
        gap: "var(--os-space-6)",
      }}
    >
      {paths.map((p) => (
        <Panel key={p.id} style={{ padding: "var(--os-space-5)" }}>
          <SectionTitle
            icon="book"
            title={p.name}
            subtitle={courses.find((c) => c.id === p.courseId)?.name ?? p.courseId}
          />
          <ol style={{ margin: 0, paddingInlineStart: "1.2rem", display: "grid", gap: 6 }}>
            {p.stages.map((s) => (
              <li key={s.id} style={{ fontSize: "var(--os-text-sm)", color: "var(--os-text-2)" }}>
                <span style={{ color: "var(--os-text)" }}>{s.name}</span>
                {s.requiresApproval && (
                  <span style={{ marginInlineStart: 6 }}>
                    <StatusChip status="דורש אישור" label="אישור מדריך" />
                  </span>
                )}
              </li>
            ))}
          </ol>
        </Panel>
      ))}
    </div>
  );
}

// ── sessions & attendance ──────────────────────────────────────────────────
function SessionsView({
  sessions,
  courses,
  enrollments,
}: {
  sessions: readonly CourseSession[];
  courses: readonly Course[];
  enrollments: readonly Enrollment[];
}): ReactElement {
  const [attendanceFor, setAttendanceFor] = useState<CourseSession | null>(null);
  const sorted = [...sessions].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const columns: DataTableColumn<CourseSession>[] = [
    { key: "title", header: "מפגש" },
    {
      key: "course",
      header: "קורס",
      render: (s) => courses.find((c) => c.id === s.courseId)?.name ?? s.courseId,
    },
    {
      key: "when",
      header: "מועד",
      render: (s) => (
        <span className="os-table__num">
          {new Date(s.scheduledAt).toLocaleString("he-IL", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      ),
    },
    {
      key: "duration",
      header: "משך",
      numeric: true,
      render: (s) => <span className="os-table__num">{s.durationMinutes} דק'</span>,
    },
    {
      key: "attendance",
      header: "נוכחות",
      render: (s) =>
        s.notes.startsWith("נוכחות") ? (
          <span style={{ color: "var(--os-success)", fontSize: "var(--os-text-xs)" }}>
            {s.notes}
          </span>
        ) : (
          <span style={{ color: "var(--os-muted)", fontSize: "var(--os-text-xs)" }}>טרם נרשמה</span>
        ),
    },
    {
      key: "mark",
      header: "",
      render: (s) => (
        <OsButton size="sm" variant="ghost" onClick={() => setAttendanceFor(s)}>
          רישום נוכחות
        </OsButton>
      ),
    },
  ];
  return (
    <>
      <DataTable
        columns={columns}
        rows={sorted}
        rowKey="id"
        emptyText="אין מפגשים"
        emptyReason="טרם תוזמנו מפגשים לקורסים."
      />
      {attendanceFor && (
        <AttendanceModal
          session={attendanceFor}
          enrollments={enrollments.filter((e) => e.courseId === attendanceFor.courseId)}
          onClose={() => setAttendanceFor(null)}
        />
      )}
    </>
  );
}

function AttendanceModal({
  session,
  enrollments,
  onClose,
}: {
  session: CourseSession;
  enrollments: readonly Enrollment[];
  onClose: () => void;
}): ReactElement {
  const { toast } = useToast();
  const invalidate = useInvalidateCollections();
  const [checked, setChecked] = useState<ReadonlySet<string>>(() => {
    // parse a previous "נוכחות (k/n): a, b" note back into names
    const m = /^נוכחות \(\d+\/\d+\): (.+)$/.exec(session.notes);
    return new Set(m?.[1] ? m[1].split(", ") : []);
  });
  const [busy, setBusy] = useState(false);

  const names = enrollments.map((e) => e.studentName);
  const toggle = (name: string): void => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`רישום נוכחות — ${session.title}`}
      footer={
        <div style={{ display: "flex", gap: "var(--os-space-3)" }}>
          {names.length > 0 ? (
            <OsButton
              icon="check"
              {...busyDisabled(busy)}
              onClick={() => {
                setBusy(true);
                const present = names.filter((n) => checked.has(n));
                const notes = `נוכחות (${present.length}/${names.length}): ${present.join(", ")}`;
                const repo = getRepository<CourseSession>("courseSessions");
                void repo
                  .update(session.id, { notes, updatedAt: new Date().toISOString() })
                  .then(() =>
                    logCourseActivity(
                      `נרשמה נוכחות במפגש «${session.title}» — ${present.length}/${names.length} נוכחים`,
                      `courseSession:${session.id}`,
                    ),
                  )
                  .then(() => invalidate(["courseSessions", "activities"]))
                  .then(() => {
                    toast("הנוכחות נשמרה", "success");
                    onClose();
                  })
                  .finally(() => setBusy(false));
              }}
            >
              שמירת נוכחות
            </OsButton>
          ) : (
            <OsButton icon="check" disabled disabledReason="אין תלמידים רשומים לקורס של המפגש">
              שמירת נוכחות
            </OsButton>
          )}
          <OsButton variant="ghost" onClick={onClose}>
            ביטול
          </OsButton>
        </div>
      }
    >
      {names.length === 0 ? (
        <EmptyState title="אין תלמידים" reason="אין רישומים לקורס של המפגש הזה." />
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {names.map((n) => (
            <label
              key={n}
              style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}
            >
              <input type="checkbox" checked={checked.has(n)} onChange={() => toggle(n)} />
              <span>{n}</span>
            </label>
          ))}
        </div>
      )}
    </Modal>
  );
}

// ── certificates ───────────────────────────────────────────────────────────
function CertificatesView({
  enrollments,
  courses,
}: {
  enrollments: readonly Enrollment[];
  courses: readonly Course[];
}): ReactElement {
  const rows = enrollments.map((e) => ({ enr: e, eligible: certificateEligible(e) }));
  const columns: DataTableColumn<(typeof rows)[number]>[] = [
    { key: "student", header: "לומד", render: (r) => r.enr.studentName },
    {
      key: "course",
      header: "קורס",
      render: (r) => courses.find((c) => c.id === r.enr.courseId)?.name ?? r.enr.courseId,
    },
    {
      key: "progress",
      header: "התקדמות",
      render: (r) => {
        const pct = progressPercent(r.enr);
        return pct === null ? (
          <span style={{ color: "var(--os-muted)" }}>ללא מסלול מדיד</span>
        ) : (
          <span className="os-table__num">{pct}%</span>
        );
      },
    },
    {
      key: "state",
      header: "זכאות לתעודה",
      render: (r) =>
        r.eligible ? (
          <StatusChip status="הושלם" label="זכאי/ת לתעודה" />
        ) : (
          <StatusChip status="ממתין" label="בתהליך" />
        ),
    },
    {
      key: "export",
      header: "",
      render: (r) => (
        <OsButton
          size="sm"
          variant="ghost"
          icon="doc"
          disabled
          disabledReason={
            r.eligible
              ? "ייצוא תעודת PDF טרם מומש בגרסת ההדגמה"
              : "התעודה תהיה זמינה רק לאחר אישור כל שלבי המסלול"
          }
        >
          ייצוא תעודה
        </OsButton>
      ),
    },
  ];
  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.enr.id}
      emptyText="אין רישומים"
      emptyReason="תעודות נגזרות מרישומי תלמידים — אין רישומים במערכת."
    />
  );
}

// ── new course modal ───────────────────────────────────────────────────────
function NewCourseModal({
  open,
  onClose,
  users,
}: {
  open: boolean;
  onClose: () => void;
  users: readonly User[];
}): ReactElement | null {
  const { toast } = useToast();
  const invalidate = useInvalidateCollections();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [instructorId, setInstructorId] = useState("u-oren");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!open) return null;

  const instructors = users.filter((u) => u.role === "מדריך" || u.role === "תמיכה");

  const submit = (): void => {
    const priceNum = Number(price);
    if (name.trim().length < 2) {
      setErrorMsg("שם הקורס חייב להכיל לפחות 2 תווים");
      return;
    }
    if (!start || !end || end < start) {
      setErrorMsg("נדרש טווח תאריכים תקין (סיום אחרי התחלה)");
      return;
    }
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      setErrorMsg("מחיר חייב להיות מספר חיובי");
      return;
    }
    setBusy(true);
    const repo = getRepository<Course>("courses");
    void repo
      .list()
      .then((all) => {
        const now = new Date().toISOString();
        return repo.create({
          id: nextId(
            "c",
            all.map((c) => c.id),
          ),
          name: name.trim(),
          type: name.trim(),
          start,
          end,
          price: priceNum,
          status: "פתוח להרשמה",
          zoom: "",
          instructorId,
          isAI: false,
          blurb: "",
          createdAt: now,
          updatedAt: now,
        });
      })
      .then((created) =>
        logCourseActivity(`נוצר קורס חדש: ${created.name}`, `course:${created.id}`),
      )
      .then(() => invalidate(["courses", "activities"]))
      .then(() => {
        toast("הקורס נוצר בהצלחה", "success");
        setName("");
        setPrice("");
        setStart("");
        setEnd("");
        setErrorMsg(null);
        onClose();
      })
      .finally(() => setBusy(false));
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="קורס חדש"
      footer={
        <div style={{ display: "flex", gap: "var(--os-space-3)" }}>
          <OsButton icon="plus" {...busyDisabled(busy)} onClick={submit}>
            יצירת קורס
          </OsButton>
          <OsButton variant="ghost" onClick={onClose}>
            ביטול
          </OsButton>
        </div>
      }
    >
      <div className="os-qc-form">
        <div className="os-qc-field">
          <label className="os-qc-label" htmlFor="nc-name">
            שם הקורס
          </label>
          <input
            id="nc-name"
            className="os-qc-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="os-qc-field">
          <label className="os-qc-label" htmlFor="nc-start">
            תאריך התחלה
          </label>
          <input
            id="nc-start"
            type="date"
            className="os-qc-input"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </div>
        <div className="os-qc-field">
          <label className="os-qc-label" htmlFor="nc-end">
            תאריך סיום
          </label>
          <input
            id="nc-end"
            type="date"
            className="os-qc-input"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </div>
        <div className="os-qc-field">
          <label className="os-qc-label" htmlFor="nc-price">
            מחיר (₪)
          </label>
          <input
            id="nc-price"
            type="number"
            className="os-qc-input"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </div>
        <div className="os-qc-field">
          <label className="os-qc-label" htmlFor="nc-instructor">
            מדריך
          </label>
          <select
            id="nc-instructor"
            className="os-qc-input"
            value={instructorId}
            onChange={(e) => setInstructorId(e.target.value)}
          >
            {instructors.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        {errorMsg && <div className="os-qc-error">{errorMsg}</div>}
      </div>
    </Modal>
  );
}
