// TERAGON AI BUSINESS OS — canonical-role accessors over the `roles`
// collection (Wave 8, W8-C; new file). The collection also holds the 6 legacy
// seed Role records (role-1..role-6) which NO runtime module reads (verified,
// docs/WAVE_8_PERMISSION_INVENTORY.md §2) — the canonical crole-* records
// live alongside them; readers here filter by recordKind + zod-parse.
import type { BaseEntity, Role } from "@/domain/types";
import type { RoleDefinitionRecord } from "@/domain/administration";
import { roleDefinitionRecordSchema } from "@/domain/administration";
import type { Repository } from "./Repository";
import { getRepository } from "./factory";

export interface RoleStores {
  /** raw collection — mixed legacy Role + canonical RoleDefinitionRecord */
  raw: Repository<BaseEntity>;
}

export function roleStores(): RoleStores {
  return { raw: getRepository<BaseEntity>("roles") };
}

function isCanonicalRoleRecord(rec: BaseEntity): rec is RoleDefinitionRecord {
  return (rec as { recordKind?: unknown }).recordKind === "canonical-role";
}

/** All canonical role records, zod-validated (throws on a corrupt record). */
export async function listCanonicalRoles(stores: RoleStores): Promise<RoleDefinitionRecord[]> {
  const all = await stores.raw.list();
  return all
    .filter(isCanonicalRoleRecord)
    .map((r) => roleDefinitionRecordSchema.parse(r) as RoleDefinitionRecord)
    .sort((a, b) => a.roleId.localeCompare(b.roleId));
}

/** The legacy seed Role records (read-only; kept for honest display). */
export async function listLegacyRoles(stores: RoleStores): Promise<Role[]> {
  const all = await stores.raw.list();
  return all.filter((r): r is Role => !isCanonicalRoleRecord(r) && "permissions" in r);
}
