// vNext Phase C — Student Home. Primary question: "מה עליי לעשות עכשיו?"
// Composed from real learning data (enrollments/courses/tasks) — NOT the
// Command Center with hidden cards. Calm, action-first, first-timer friendly.
import type { ReactElement } from "react";
import { Link } from "react-router-dom";
import { EmptyState, OsButton, Panel, SectionTitle, StatusChip } from "@/design-system";
import { useCollection } from "@/app/data/hooks";
import type { Course, Enrollment } from "@/domain/types";
import { scopeRecords } from "@/authorization/recordScope";
import { useScopeContext } from "@/authorization/useScope";
import { PortalOnboarding } from "./PortalOnboarding";

function stageProgress(en: Enrollment): { done: number; total: number; pct: number } {
  const total = en.stages.length || 0;
  const done = en.stages.filter((s) => s.status === "אושר").length;
  return { done, total, pct: total === 0 ? 0 : Math.round((done / total) * 100) };
}

export default function StudentHome(): ReactElement {
  const { portal, scope } = useScopeContext();
  // RECORD SCOPE: a student sees ONLY their OWN enrollment (studentId). Enforced
  // centrally — a student can never read another student's progress. Courses are
  // shared reference content; the student has no operational tasks of their own,
  // so "my tasks" is derived from THIS enrollment's pending stages (also scoped).
  const enrollments = scopeRecords(
    "enrollments",
    portal,
    scope,
    useCollection<Enrollment>("enrollments").data ?? [],
  );
  const courses = useCollection<Course>("courses").data ?? [];

  // the learner's current enrollment + its course + next stage.
  const enrollment = enrollments[0] ?? null;
  const course = enrollment ? courses.find((c) => c.id === enrollment.courseId) ?? null : null;
  const prog = enrollment ? stageProgress(enrollment) : null;
  const nextIdx = enrollment ? enrollment.stages.findIndex((s) => s.status !== "אושר") : -1;
  const nextStage = nextIdx >= 0 ? enrollment!.stages[nextIdx] : null;
  // pending stages of the student's OWN enrollment — their real "tasks".
  const openStages = enrollment
    ? enrollment.stages
        .map((s, i) => ({ i, status: s.status }))
        .filter((s) => s.status !== "אושר")
        .slice(0, 3)
    : [];

  return (
    <div className="portal-home portal-home--student" dir="rtl">
      <PortalOnboarding portal="student" />

      {/* PRIMARY — continue learning */}
      <Panel variant="raised" className="portal-hero" data-testid="student-continue">
        <div className="portal-hero__eyebrow">להמשיך ללמוד</div>
        {course ? (
          <>
            <h1 className="portal-hero__title">{course.name}</h1>
            <p className="portal-hero__sub">
              {nextStage ? `השלב הבא: שלב ${nextIdx + 1}` : "כל השלבים הושלמו — כל הכבוד!"}
            </p>
            {prog && (
              <div className="portal-progress" aria-label={`התקדמות ${prog.pct}%`}>
                <div className="portal-progress__bar">
                  <span style={{ inlineSize: `${prog.pct}%` }} />
                </div>
                <span className="portal-progress__label os-num">
                  {prog.done}/{prog.total} · {prog.pct}%
                </span>
              </div>
            )}
            <div className="portal-hero__actions">
              <Link to="/learning">
                <OsButton variant="primary" data-testid="student-continue-cta">
                  {nextStage ? "המשך ללמידה" : "פתח את הקורס"}
                </OsButton>
              </Link>
              <Link to="/knowledge">
                <OsButton variant="ghost">חיפוש במאגר הידע</OsButton>
              </Link>
            </div>
          </>
        ) : (
          <EmptyState
            title="אין לך כרגע קורס פעיל"
            reason="כשתשובץ לקורס הוא יופיע כאן."
            action={
              <Link to="/knowledge">
                <OsButton variant="primary">עיון במאגר הידע</OsButton>
              </Link>
            }
          />
        )}
      </Panel>

      <div className="portal-grid">
        {/* my tasks */}
        <Panel className="portal-card" data-testid="student-tasks">
          <SectionTitle title="המשימות שלי" subtitle="השלבים שלפניך בקורס" icon="clock" />
          {openStages.length === 0 ? (
            <EmptyState title="אין לך משימה פעילה כרגע" reason="חזרו ללמידה או עיינו בידע." />
          ) : (
            <ul className="portal-list">
              {openStages.map((s) => (
                <li key={s.i}>
                  <span className="portal-list__title">שלב {s.i + 1}</span>
                  <StatusChip status="פעיל" label={s.status} />
                </li>
              ))}
            </ul>
          )}
          <Link to="/learning" className="portal-card__more">
            כל השלבים ←
          </Link>
        </Panel>

        {/* mentor + knowledge */}
        <Panel className="portal-card" data-testid="student-mentor">
          <SectionTitle title="המנטור שלך" subtitle="עזרה ולמידה מותאמת" icon="sparkle" />
          <p className="portal-card__hint">
            שאל את המנטור שאלה על החומר, או חפש תשובה במאגר הידע.
          </p>
          <div className="portal-hero__actions">
            <Link to="/ai-workspace">
              <OsButton variant="primary" size="sm">שיחה עם המנטור</OsButton>
            </Link>
            <Link to="/knowledge">
              <OsButton variant="ghost" size="sm">מאגר ידע</OsButton>
            </Link>
          </div>
        </Panel>
      </div>
    </div>
  );
}
