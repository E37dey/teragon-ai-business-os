// Shared stage-status → StatusChip mapping (moved verbatim from CoursesPage so
// the learner list, header card and workflow all render identical chips). Pure
// presentational; strings unchanged.
import type { ReactElement } from "react";
import { StatusChip } from "@/design-system";
import type { StageProgressStatus } from "@/domain/types";

export function statusToChip(status: StageProgressStatus): ReactElement {
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
