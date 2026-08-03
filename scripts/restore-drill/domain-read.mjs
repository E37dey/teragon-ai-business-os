// S10.1-B PHASE 4 — READ-ONLY Customers/Contacts verification on the drill
// target, exercised through the SAME RLS path the app uses (authenticated role
// + jwt claims), plus a fail-closed anonymous check. Counts only, no row data.
// Any fixture it creates is rolled back inside the same transaction.
import { token, drill, runSql } from "./drill-lib.mjs";

const tok = token();
const t = drill();
const q = async (label, sql) => {
  const r = await runSql(t.ref, sql, tok);
  if (!r.ok) { console.log(`${label} -> FAIL ${r.status} ${String(r.body).slice(0, 160)}`); return null; }
  return r.rows;
};

// A seeded ACTIVE member of org-staging-demo (see supabase/tests/02).
const AS_A = `select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true); set local role authenticated;`;

// 1. Customers read path — own org visible, other org invisible.
const cust = await q("customers", `begin; ${AS_A}
select
  (select count(*)::int from public.customers) as visible_total,
  (select count(*)::int from public.customers where organization_id='org-staging-demo') as own_org,
  (select count(*)::int from public.customers where organization_id='org-staging-beta') as other_org,
  public.auth_org_id() as resolved_org;
rollback;`);
console.log(`customersRead=${JSON.stringify(cust)}`);

// 2. Contacts read path — same tenant gate. A drill-only contact is inserted and
//    ROLLED BACK so the target ends with zero fixtures.
const cont = await q("contacts", `begin; ${AS_A}
insert into public.contacts (id, organization_id, customer_id, name, role, phone, email, is_primary)
  values ('drill-ct-1','org-staging-demo',(select id from public.customers where organization_id='org-staging-demo' limit 1),'drill contact','qa','0','d@drill.local',false);
select
  (select count(*)::int from public.contacts) as visible_total,
  (select count(*)::int from public.contacts where organization_id='org-staging-demo') as own_org,
  (select count(*)::int from public.contacts where organization_id='org-staging-beta') as other_org;
rollback;`);
console.log(`contactsRead=${JSON.stringify(cont)}`);

// 3. Fail-closed: anonymous sees nothing.
const anon = await q("anon", `begin;
select set_config('request.jwt.claims','', true); set local role anon;
select (select count(*)::int from public.customers) as customers, (select count(*)::int from public.contacts) as contacts;
rollback;`);
console.log(`anonymousRead=${JSON.stringify(anon)}`);

// 4. Post-verification fixture audit — target must hold ZERO drill rows.
const orphans = await q("orphans", `select
  (select count(*)::int from public.contacts where id like 'drill-%') as drill_contacts,
  (select count(*)::int from public.customers where id like 'drill-%') as drill_customers,
  (select count(*)::int from auth.users where email like '%drill%') as drill_users;`);
console.log(`drillFixtureOrphans=${JSON.stringify(orphans)}`);
