// W5-D — the injected ExternalExecutionHandler seam of the approval engine.
// HONESTY: no real external send exists in Mode A. An approved "external"
// execution therefore creates REAL local records (Task + Activity) that
// document the approved action and hand it to a human — explicitly labeled.
// Actions without a handler stay unhandled ⇒ the engine fails honestly.
import type { Activity, Task } from "@/domain/types";
import type { ApprovalRequiredAction, ExecutionPayload } from "@/domain/agents";
import { APPROVAL_ACTION_LABELS_HE } from "@/domain/agents";
import type { ExternalExecutionHandler } from "@/agents";
import type { AgentStores } from "@/repositories/agentStores";
import { CEO_USER_ID } from "@/repositories/seed";

export const EXECUTION_LABEL_HE = "ביצוע מקומי מתועד — שליחה חיצונית אמיתית אינה נתמכת במצב הדגמה";

type ExternalPayload = Extract<ExecutionPayload, { kind: "external" }>;

function todayIsoLocal(): string {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${m}-${d}`;
}

async function nextId(stores: AgentStores, collection: "tasks" | "activities", prefix: string) {
  const existing = await stores.collection(collection).list();
  let max = 0;
  const re = new RegExp(`^${prefix}-(\\d+)$`);
  for (const r of existing) {
    const m = re.exec(r.id);
    if (m?.[1]) {
      const n = Number.parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return `${prefix}-${max + 1}`;
}

/**
 * Create the Task + Activity records that ARE the honest "execution" of an
 * approved external action. Returns the created task ref as resultRef.
 */
function makeRecordingHandler(
  stores: AgentStores,
  action: ApprovalRequiredAction,
): ExternalExecutionHandler {
  return async (payload: ExternalPayload) => {
    const ts = new Date().toISOString();
    const actionLabel = APPROVAL_ACTION_LABELS_HE[action];
    const taskId = await nextId(stores, "tasks", "exec-task");
    const task: Task = {
      id: taskId,
      createdAt: ts,
      updatedAt: ts,
      title: `ביצוע ידני: ${actionLabel}`,
      description: `${payload.descriptionHe} · ${EXECUTION_LABEL_HE}`,
      status: "פתוחה",
      priority: "גבוהה",
      due: todayIsoLocal(),
      ownerId: CEO_USER_ID,
      relatedRef:
        typeof payload.data["subjectRef"] === "string" ? payload.data["subjectRef"] : null,
    };
    await stores.collection<Task>("tasks").create(task);
    const activityId = await nextId(stores, "activities", "exec-act");
    const activity: Activity = {
      id: activityId,
      createdAt: ts,
      updatedAt: ts,
      kind: "סוכן",
      text: `אושר ובוצע מקומית: ${actionLabel} — ${payload.descriptionHe} (${EXECUTION_LABEL_HE})`,
      actorId: CEO_USER_ID,
      entityRef: `task:${taskId}`,
      at: ts,
    };
    await stores.collection<Activity>("activities").create(activity);
    return {
      resultRef: `tasks:${taskId}`,
      detailHe: `נוצרו משימת ביצוע ${taskId} ורשומת פעילות ${activityId} — ${EXECUTION_LABEL_HE}`,
    };
  };
}

/** The handlers W5-D injects. Unlisted actions ⇒ honest engine failure. */
export function makeExternalHandlers(
  stores: AgentStores,
): Partial<Record<ApprovalRequiredAction, ExternalExecutionHandler>> {
  return {
    "customer-message": makeRecordingHandler(stores, "customer-message"),
    "external-notification": makeRecordingHandler(stores, "external-notification"),
    "external-automation": makeRecordingHandler(stores, "external-automation"),
  };
}
