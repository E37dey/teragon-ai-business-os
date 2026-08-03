// S10.1-B PHASE 4 — validate the DISPOSABLE target. Read-only introspection;
// reports counts/states only, never row contents.
import { token, drill, runSql, readStaging, STAGING_REF } from "./drill-lib.mjs";

const tok = token();
const t = drill();
const out = {};

console.log(`targetRef=${t.ref}`);
console.log(`targetIsNotStaging=${t.ref !== STAGING_REF}`);

const q = async (label, sql) => {
  const r = await runSql(t.ref, sql, tok);
  if (!r.ok) { console.log(`${label}: FAIL ${r.status} ${r.body}`); return null; }
  return r.rows;
};

// 1. table inventory
out.tables = (await q("tables", `select count(*)::int as n from information_schema.tables where table_schema='public' and table_type='BASE TABLE'`))?.[0]?.n;
console.log(`publicTables=${out.tables}`);

// 2. RLS coverage
const rls = await q("rls", `select count(*) filter (where rowsecurity) ::int as enabled, count(*)::int as total from pg_tables where schemaname='public'`);
out.rlsEnabled = rls?.[0]?.enabled; out.rlsTotal = rls?.[0]?.total;
console.log(`rlsEnabled=${out.rlsEnabled}/${out.rlsTotal}`);
const noRls = await q("norls", `select tablename from pg_tables where schemaname='public' and not rowsecurity order by 1`);
console.log(`tablesWithoutRls=${JSON.stringify((noRls ?? []).map((r) => r.tablename))}`);

// 3. policies / indexes / FKs / functions / triggers
out.policies = (await q("pol", `select count(*)::int as n from pg_policies where schemaname='public'`))?.[0]?.n;
out.indexes = (await q("idx", `select count(*)::int as n from pg_indexes where schemaname='public'`))?.[0]?.n;
out.fks = (await q("fk", `select count(*)::int as n from information_schema.table_constraints where constraint_schema='public' and constraint_type='FOREIGN KEY'`))?.[0]?.n;
out.functions = (await q("fn", `select count(*)::int as n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','auth_helpers')`))?.[0]?.n;
out.triggers = (await q("trg", `select count(*)::int as n from information_schema.triggers where trigger_schema='public'`))?.[0]?.n;
console.log(`policies=${out.policies} indexes=${out.indexes} foreignKeys=${out.fks} functions=${out.functions} triggers=${out.triggers}`);

// 4. storage + auth
out.buckets = (await q("buckets", `select count(*)::int as n from storage.buckets`))?.[0]?.n;
out.authUsers = (await q("authusers", `select count(*)::int as n from auth.users`))?.[0]?.n;
console.log(`storageBuckets=${out.buckets} authUsers=${out.authUsers}`);

// 5. seeded reference rows from migration 014 (counts only)
for (const tbl of ["organizations", "roles", "customers", "contacts", "profiles", "memberships"]) {
  const n = (await q(tbl, `select count(*)::int as n from public.${tbl}`))?.[0]?.n;
  console.log(`rows.${tbl}=${n}`);
  out[`rows_${tbl}`] = n;
}

// 6. tenant-isolation surface: the customers/contacts policies must exist
const pol = await q("crmpol", `select tablename, count(*)::int as n from pg_policies where schemaname='public' and tablename in ('customers','contacts') group by 1 order by 1`);
console.log(`crmPolicies=${JSON.stringify(pol)}`);

// 7. fail-closed proof: anon role must NOT be able to read a tenant table
const anonSel = await q("anon", `select has_table_privilege('anon','public.customers','SELECT') as anon_select, has_table_privilege('authenticated','public.customers','SELECT') as auth_select`);
console.log(`privileges=${JSON.stringify(anonSel)}`);

// 8. STAGING comparison — READ-ONLY, counts only
const sTables = await readStaging(`select count(*)::int as n from information_schema.tables where table_schema='public' and table_type='BASE TABLE'`, tok);
console.log(`stagingPublicTables=${sTables.ok ? sTables.rows?.[0]?.n : `unavailable(${sTables.status})`}`);
const sRls = await readStaging(`select count(*) filter (where rowsecurity)::int as enabled, count(*)::int as total from pg_tables where schemaname='public'`, tok);
console.log(`stagingRls=${sRls.ok ? `${sRls.rows?.[0]?.enabled}/${sRls.rows?.[0]?.total}` : `unavailable(${sRls.status})`}`);
const sPol = await readStaging(`select count(*)::int as n from pg_policies where schemaname='public'`, tok);
console.log(`stagingPolicies=${sPol.ok ? sPol.rows?.[0]?.n : `unavailable(${sPol.status})`}`);
