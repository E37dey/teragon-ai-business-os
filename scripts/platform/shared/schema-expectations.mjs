// TERAGON AI BUSINESS OS — remote schema expectations (Gate S7.1).
// =============================================================================
// The locally-validated CI schema baseline the remote staging DB is verified
// against after the 14 migrations are applied. Derived from supabase/migrations
// (Gate S2-S5): 47 public tables, all with RLS enabled; 9 functions incl.
// bootstrap_admin; 2 private storage buckets; organizations/roles exempt from
// the tenant non-null organization_id rule (by design). NAMES/counts only — no
// values, no secrets.

export const EXPECTED_TABLE_COUNT = 47;
export const EXPECTED_MIGRATION_COUNT = 14;
export const EXPECTED_NAMESPACES = ["public", "storage", "auth"];

/** Every protected table has RLS enabled — so ZERO public tables may lack it. */
export const EXPECTED_RLS_DISABLED = 0;

/** Required functions / RPCs (public schema). bootstrap_admin is mandatory. */
export const REQUIRED_FUNCTIONS = [
  "auth_org_id",
  "auth_role_id",
  "bootstrap_admin",
  "close_service_ticket",
  "current_profile",
  "has_capability",
  "is_active",
  "is_org_member",
  "is_service_role",
];

/** Private storage buckets created in 013. */
export const EXPECTED_STORAGE_BUCKETS = ["documents", "evidence"];

/** Tenant non-null organization_id exemptions (by design). */
export const ORG_ID_EXEMPT_TABLES = ["organizations", "roles"];

/**
 * The single read-only introspection SQL used to gather all safe totals in one
 * round-trip. Returns exactly one row of counts/arrays. Contains no secrets and
 * mutates nothing. `format('%L', ...)`-free — the function list is inlined from
 * REQUIRED_FUNCTIONS at call time.
 */
export function buildIntrospectionSql() {
  const fnList = REQUIRED_FUNCTIONS.map((f) => `'${f}'`).join(",");
  const bucketList = EXPECTED_STORAGE_BUCKETS.map((b) => `'${b}'`).join(",");
  const exemptList = ORG_ID_EXEMPT_TABLES.map((t) => `'${t}'`).join(",");
  return `
    select
      (select count(*)::int from pg_tables where schemaname='public') as public_tables,
      (select count(*)::int from information_schema.schemata
         where schema_name in ('public','storage','auth')) as namespaces,
      (select count(*)::int from supabase_migrations.schema_migrations) as migrations,
      (select coalesce(array_agg(p.proname order by p.proname),'{}') from pg_proc p
         join pg_namespace n on n.oid=p.pronamespace
         where n.nspname='public' and p.proname in (${fnList})) as functions_present,
      (select count(*)::int from pg_indexes where schemaname='public') as indexes,
      (select count(*)::int from information_schema.table_constraints
         where constraint_schema='public' and constraint_type='FOREIGN KEY') as fk_constraints,
      (select count(*)::int from information_schema.table_constraints
         where constraint_schema='public' and constraint_type='CHECK') as check_constraints,
      (select coalesce(array_agg(t.tablename order by t.tablename),'{}') from pg_tables t
         join pg_class c on c.relname=t.tablename
         join pg_namespace nn on nn.oid=c.relnamespace and nn.nspname='public'
         where t.schemaname='public' and c.relrowsecurity=false) as rls_disabled_tables,
      (select coalesce(array_agg(c.table_name order by c.table_name),'{}')
         from information_schema.columns c
         where c.table_schema='public' and c.column_name='organization_id'
           and c.is_nullable='YES' and c.table_name not in (${exemptList})) as nullable_orgid_tenant_tables,
      (select count(*)::int from storage.buckets where id in (${bucketList})) as storage_buckets,
      (select count(*)::int from pg_policies where schemaname='public') as rls_policies
  `;
}
