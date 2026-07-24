// LearnerHeaderCard — one horizontal, readable card summarizing the selected
// learner: initials avatar · name · learning path · instructor · current status
// · last activity · progress %. Every value is derived from props already on the
// page (enrollment / course / path / instructor) — no repository access, no new
// copy (the path summary reuses the existing subtitle template verbatim).
import type { ReactElement } from "react";
import { Panel } from "@/design-system";
import type { Course, Enrollment, LearningPath } from "@/domain/types";
import { currentStage, formatDateHe, progressPercent } from "./lib";
import { statusToChip } from "./statusChip";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0] ?? "").join("");
}

export function LearnerHeaderCard({
  enrollment,
  course,
  path,
  instructorName,
}: {
  enrollment: Enrollment;
  course: Course | undefined;
  path: LearningPath | undefined;
  instructorName: string | null;
}): ReactElement {
  const totalStages = path?.stages.length ?? 0;
  const completedStages = enrollment.stages.filter((s) => s.status === "אושר").length;
  const pct = progressPercent(enrollment);
  const cur = currentStage(enrollment);
  const lastUpdated = enrollment.stages.reduce<string>(
    (acc, s) => (s.updated > acc ? s.updated : acc),
    "",
  );

  return (
    <Panel className="courses-learner-header">
      <span className="courses-learner-header__avatar os-num" aria-hidden="true">
        {initials(enrollment.studentName)}
      </span>
      <div className="courses-learner-header__main">
        <div className="courses-learner-header__name">{enrollment.studentName}</div>
        <div className="courses-learner-header__meta">
          <span>{`מסלול: ${course?.name ?? path?.name ?? enrollment.courseId} · ${completedStages} מתוך ${totalStages} שלבים הושלמו`}</span>
          {instructorName && (
            <span>
              <span className="os-muted">מדריך</span> {instructorName}
            </span>
          )}
          {cur && statusToChip(cur.status)}
          {lastUpdated && (
            <span>
              <span className="os-muted"> · עודכן: </span>
              <span className="os-num">{formatDateHe(lastUpdated)}</span>
            </span>
          )}
        </div>
      </div>
      {pct !== null && (
        <div className="courses-learner-header__pct">
          <span className="courses-learner-header__pct-num">{pct}%</span>
        </div>
      )}
    </Panel>
  );
}
