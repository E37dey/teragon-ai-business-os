// CoursesHeader — one clean header row: title + subtitle on the inline-start
// (right in RTL), and the action cluster on the inline-end (left): new course,
// the learner list drawer, and the insights drawer. No KPI cards live here.
import type { ReactElement } from "react";
import { OsButton, SectionTitle } from "@/design-system";

export function CoursesHeader({
  subtitle,
  onNewCourse,
  onOpenLearner,
  onOpenInsights,
}: {
  subtitle: string;
  onNewCourse: () => void;
  onOpenLearner: () => void;
  onOpenInsights: () => void;
}): ReactElement {
  return (
    <SectionTitle
      icon="graduation"
      title="קורסים והכשרות"
      subtitle={subtitle}
      action={
        <div className="courses-header__actions">
          <OsButton icon="plus" onClick={onNewCourse}>
            קורס חדש
          </OsButton>
          <OsButton variant="ghost" icon="users" onClick={onOpenLearner}>
            רשימת הלומדים
          </OsButton>
          <OsButton variant="ghost" icon="sparkle" onClick={onOpenInsights}>
            תובנות והמשך
          </OsButton>
        </div>
      }
    />
  );
}
