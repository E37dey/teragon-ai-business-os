// TERAGON AI BUSINESS OS — typed accessors over the collections the
// Administration workspace reads/writes (Wave 8, W8-C; new file — existing
// repository files untouched). One seam for the AdministrationService and the
// /administration page. Wraps the canonical factory only.
//
// NOTE: the Wave-8 collection registry is frozen, so administration records
// (role assignments, change requests, emergency records) are hosted in the
// accessChangeRequests collection behind a recordKind discriminator — see
// docs/ADMINISTRATION_MODEL.md + docs/integration-requests-w8c.md.
import type { Activity, Agent, AuditEvent, Organization, User } from "@/domain/types";
import type { AccessReviewRecord, AdministrationRecord } from "@/domain/administration";
import type { Repository } from "./Repository";
import { getRepository } from "./factory";

export interface UserStores {
  users: Repository<User>;
  organizations: Repository<Organization>;
  activities: Repository<Activity>;
  agents: Repository<Agent>;
  /** accessChangeRequests collection — hosts the AdministrationRecord union */
  adminRecords: Repository<AdministrationRecord>;
  accessReviews: Repository<AccessReviewRecord>;
  audit: Repository<AuditEvent>;
}

/** Production wiring over the canonical repository factory. */
export function userStores(): UserStores {
  return {
    users: getRepository<User>("users"),
    organizations: getRepository<Organization>("organizations"),
    activities: getRepository<Activity>("activities"),
    agents: getRepository<Agent>("agents"),
    adminRecords: getRepository<AdministrationRecord>("accessChangeRequests"),
    accessReviews: getRepository<AccessReviewRecord>("accessReviews"),
    audit: getRepository<AuditEvent>("auditEvents"),
  };
}

/** Injectable clock (ISO datetime) — determinism in tests. */
export type AdministrationClock = () => string;
