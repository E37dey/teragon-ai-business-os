// useNavBadges — live nav badges derived ONLY from repositories via the pure
// selectors in src/domain/selectors/badges.ts. No hardcoded numbers: writes
// through quick-create invalidate these queries and the badges update.
import type { AgentTask, ServiceTicket, StageGate, Task } from "@/domain/types";
import { navBadges } from "@/domain/selectors";
import { useCollection } from "@/app/data/hooks";

/** route path → badge count; zero-count routes are ABSENT (no badge rendered) */
export function useNavBadges(now: Date = new Date()): Record<string, number> {
  const tickets = useCollection<ServiceTicket>("serviceTickets");
  const tasks = useCollection<Task>("tasks");
  const stageGates = useCollection<StageGate>("stageGates");
  const agentTasks = useCollection<AgentTask>("agentTasks");

  return navBadges(
    {
      tickets: tickets.data ?? [],
      tasks: tasks.data ?? [],
      stageGates: stageGates.data ?? [],
      agentTasks: agentTasks.data ?? [],
    },
    now,
  );
}
