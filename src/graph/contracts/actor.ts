// TERAGON Business Graph — actor contract (Phase 2.1).
// A discriminated actor reference. Actor TYPE is carried explicitly by `kind`,
// never sniffed from an id prefix (`ag-*`) — id-shape detection is fragile and
// spoofable, so an approver's humanity is a typed fact, not a string pattern.
// See SECURITY_MODEL §4 ("AI proposes, only a NAMED human approves").
import { z } from "zod";

/**
 * Who is acting. `HUMAN` carries a canonical user id, `AGENT` an agent id, and
 * `SYSTEM` no id at all. The kind is authoritative — nothing infers it from the
 * id string.
 */
export type ActorRef =
  | { kind: "HUMAN"; userId: string }
  | { kind: "AGENT"; agentId: string }
  | { kind: "SYSTEM" };

export const actorRefSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("HUMAN"), userId: z.string().min(1) }),
  z.object({ kind: z.literal("AGENT"), agentId: z.string().min(1) }),
  z.object({ kind: z.literal("SYSTEM") }),
]) satisfies z.ZodType<ActorRef>;
