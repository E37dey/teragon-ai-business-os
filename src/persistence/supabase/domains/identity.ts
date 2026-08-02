// Gate S4 — identity & organization domain mappings.
//
// Organization ↔ organizations (GLOBAL tenant root: no organization_id column).
//
// NOTE on User/Role: the `profiles` table uses a uuid PK bound to auth.users and
// stores role_id (a roles FK), NOT the domain User.role KEY — so User↔profiles
// is a lossy, auth-owned mapping that belongs to the auth wiring (a later gate),
// not this generic value-object adapter. Roles are a GLOBAL catalog seeded in
// Gate S3. Both are intentionally deferred here; the boundary is unaffected.
import type { Organization } from "@/domain/types";
import { organizationSchema } from "@/domain/schemas";
import { defineMapping, fields, type AnyMapping } from "../mapping";

export const identityMappings: AnyMapping[] = [
  defineMapping<Organization>({
    collection: "organizations",
    table: "organizations",
    idPrefix: "org",
    schema: organizationSchema,
    tenant: false, // the tenant root — has no organization_id by design
    fields: fields({
      name: "name",
      type: "type",
      phone: "phone",
      email: "email",
      city: "city",
      notes: "notes",
      status: "status",
    }),
  }),
];
