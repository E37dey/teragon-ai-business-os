// Shared activity-log helper (moved verbatim from CoursesPage) so the workflow
// component and the page can both append course activities. Behaviour unchanged.
import type { Activity } from "@/domain/types";
import { getRepository, nextId } from "@/repositories";
import { CEO_USER_ID } from "@/repositories/seed";

export async function logCourseActivity(text: string, entityRef: string | null): Promise<void> {
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
