// Recent-activity feed — pure sort/slice over the activities collection.
import type { Activity } from "../types";

/** newest-first activity feed, capped at `limit` */
export function recentActivity(activities: readonly Activity[], limit = 10): Activity[] {
  return [...activities].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, limit);
}

/** activities of a specific kind (e.g. "ליד"), newest first */
export function activityByKind(
  activities: readonly Activity[],
  kind: string,
  limit = 10,
): Activity[] {
  return recentActivity(activities.filter((a) => a.kind === kind), limit);
}
