// /courses — קורסים והכשרות (Layout v3). Instructor workbench: catalogue,
// learning paths, student progress + approval flow, sessions & attendance,
// certificates. The page owns the full-width canvas (HideShellRail removes the
// shell rail) and drives ALL responsive decisions through a single named
// container (`courses`) via @container queries — never viewport media queries.
// Data only through repositories (TanStack Query); every derived number comes
// from src/modules/courses/lib.ts.
import { useMemo, useState } from "react";
import type { ReactElement } from "react";
import { HideShellRail } from "@/app/rail";
import {
  DataTable,
  Drawer,
  EmptyState,
  Modal,
  OsButton,
  Panel,
  SectionTitle,
  StatusChip,
  useToast,
  type DataTableColumn,
} from "@/design-system";
import "../../styles/courses.css";
import type { Course, CourseSession, Enrollment, LearningPath, User } from "@/domain/types";
import { getRepository, nextId } from "@/repositories";
import { DEMO_DATA_LABEL } from "@/repositories/seed";
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
  studentCount,
  todayISO,
  upcomingSessions,
} from "./lib";
import { logCourseActivity } from "./activity";
import { busyDisabled } from "./controls";
import { statusToChip } from "./statusChip";
import { useOpenDrawer } from "./useCoursesLayout";
import { CoursesHeader } from "./CoursesHeader";
import { CoursesKpiStrip } from "./CoursesKpiStrip";
import { CoursesSubnav } from "./CoursesSubnav";
import { MainWorkflow } from "./MainWorkflow";
import { CoursesInsights } from "./InsightsDrawer";
import { LearnerListPanel } from "./LearnerListDrawer";
import { NextStageDrawerBody } from "./NextStageMiniCard";

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
  const [courseFilter, setCourseFilter] = useState("all");
  const [learnerSearch, setLearnerSearch] = useState("");
  const drawer = useOpenDrawer();

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
  const overallProgress = useMemo(() => {
    const measured = stats.map((s) => s.avgProgress).filter((p): p is number => p !== null);
    return measured.length === 0
      ? null
      : Math.round(measured.reduce((a, b) => a + b, 0) / measured.length);
  }, [stats]);

  // learner roster filtered by course + free-text search on the learner name
  const search = learnerSearch.trim();
  const filtered = useMemo(
    () =>
      enrollments
        .filter((e) => courseFilter === "all" || e.courseId === courseFilter)
        .filter((e) => search === "" || e.studentName.includes(search)),
    [enrollments, courseFilter, search],
  );
  const selected = enrollments.find((e) => e.id === selectedEnrollmentId) ?? filtered[0] ?? null;
  const courseOf = (id: string): Course | undefined => courses.find((c) => c.id === id);
  const selectedCourse = selected ? courseOf(selected.courseId) : undefined;
  const selectedPath = selected ? paths.find((p) => p.courseId === selected.courseId) : undefined;
  const instructorName = selectedCourse
    ? (users.find((u) => u.id === selectedCourse.instructorId)?.name ?? null)
    : null;
  const rec = selected ? nextExercise(selected, selectedPath) : null;
  const courseUpcoming = selected ? upcoming.filter((s) => s.courseId === selected.courseId) : [];
  const statusOf = (enr: Enrollment): ReactElement | null => {
    const cur = currentStage(enr);
    return cur ? statusToChip(cur.status) : null;
  };

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
    <div className="courses-page">
      <HideShellRail />

      <CoursesHeader
        subtitle={DEMO_DATA_LABEL}
        onNewCourse={() => setNewCourseOpen(true)}
        onOpenLearner={() => drawer.open("learner")}
        onOpenInsights={() => drawer.open("insights")}
      />

      <CoursesKpiStrip
        activeCourses={activeCourses}
        learners={enrollments.length}
        approvals={approvals.length}
        delayed={delayed.length}
        upcoming={upcoming.length}
        overallProgress={overallProgress}
      />

      <CoursesSubnav
        activeId={tab}
        onChange={setTab}
        counts={{
          students: enrollments.length,
          paths: paths.length,
          approvals: approvals.length,
          sessions: sessions.length,
          catalog: courses.length,
        }}
      />

      {tab === "students" && (
        <div className="courses-workspace">
          <div className="courses-insights-col">
            <Panel className="courses-side-panel">
              <CoursesInsights
                courses={courses}
                stats={stats}
                delayed={delayed}
                upcoming={upcoming.slice(0, 3)}
              />
            </Panel>
          </div>

          <div className="courses-center-col">
            {selected ? (
              <MainWorkflow
                key={selected.id}
                enrollment={selected}
                course={selectedCourse}
                path={selectedPath}
                upcoming={upcoming}
                instructorName={instructorName}
                drawer={drawer}
              />
            ) : (
              <EmptyState title="בחרו תלמיד" reason="בחרו רישום מהרשימה כדי לצפות בהתקדמות." />
            )}
          </div>

          <div className="courses-learner-col">
            <Panel className="courses-side-panel">
              <LearnerListPanel
                idPrefix="col"
                courses={courses}
                enrollments={filtered}
                courseFilter={courseFilter}
                onCourseFilter={setCourseFilter}
                search={learnerSearch}
                onSearch={setLearnerSearch}
                selectedId={selected?.id ?? null}
                onSelect={setSelectedEnrollmentId}
                courseOf={courseOf}
                statusOf={statusOf}
              />
            </Panel>
          </div>
        </div>
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

      {/* page-level drawers — exactly one open at a time (single controller) */}
      <Drawer open={drawer.isOpen("learner")} onClose={drawer.close} title="רשימת הלומדים">
        <LearnerListPanel
          idPrefix="drawer"
          showSearch
          courses={courses}
          enrollments={filtered}
          courseFilter={courseFilter}
          onCourseFilter={setCourseFilter}
          search={learnerSearch}
          onSearch={setLearnerSearch}
          selectedId={selected?.id ?? null}
          onSelect={(id) => {
            setSelectedEnrollmentId(id);
            drawer.close();
          }}
          courseOf={courseOf}
          statusOf={statusOf}
        />
      </Drawer>

      <Drawer open={drawer.isOpen("insights")} onClose={drawer.close} title="תובנות והמשך">
        <CoursesInsights
          courses={courses}
          stats={stats}
          delayed={delayed}
          upcoming={upcoming.slice(0, 3)}
        />
      </Drawer>

      <Drawer open={drawer.isOpen("nextStage")} onClose={drawer.close} title="השלב הבא">
        <NextStageDrawerBody rec={rec} courseUpcoming={courseUpcoming} />
      </Drawer>

      <NewCourseModal open={newCourseOpen} onClose={() => setNewCourseOpen(false)} users={users} />
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
          <span style={{ color: "var(--success-text)", fontSize: "var(--os-text-xs)" }}>
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
