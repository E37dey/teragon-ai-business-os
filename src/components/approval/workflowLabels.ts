// W5-D — derived approval-workflow-state → Hebrew labels (pure, shared).
import type { ApprovalWorkflowState } from "@/agents";

export const WORKFLOW_STATE_LABELS_HE: Record<ApprovalWorkflowState, string> = {
  pending: "ממתין להחלטה",
  approved: "אושר",
  edited: "אושר עם עריכה",
  rejected: "נדחה",
  expired: "פג תוקף",
  cancelled: "בוטל",
  executed: "בוצע",
  "execution-failed": "ביצוע נכשל",
  "rolled-back": "בוצע rollback",
};
