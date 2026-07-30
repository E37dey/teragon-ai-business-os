-- ============================================================================
-- 03_cross_org_write_denial.sql — RLS proof: WITH CHECK blocks writing another org.
-- Proves: user A can write into their OWN org (positive control) but CANNOT
-- insert a row stamped with org B''s id (WITH CHECK violation), and CANNOT
-- update an org B row (invisible => 0 rows affected). A client-supplied
-- organization_id can never place a row outside the caller''s tenant.
-- Depends on 014 seed.
-- ============================================================================
begin;

-- Sign in as Sales A (org-staging-demo; holds customer.create + customer.update).
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  v_affected int;
begin
  -- Positive control: insert into OWN org succeeds.
  insert into public.customers (id, organization_id, name, type)
  values ('cust-a-new', 'org-staging-demo', 'לקוח חדש', 'עסק');

  -- Cross-org INSERT is refused by WITH CHECK (organization_id must equal auth_org_id()).
  begin
    insert into public.customers (id, organization_id, name, type)
    values ('cust-a-evil', 'org-staging-beta', 'פריצה', 'עסק');
    raise exception 'FAIL: cross-org INSERT into org B should have been denied';
  exception when insufficient_privilege or check_violation then
    null; -- expected WITH CHECK denial
  end;

  -- Cross-org UPDATE: org B row is invisible => 0 rows affected (no leak, no change).
  update public.customers set name = 'hijacked' where id = 'cust-b1';
  get diagnostics v_affected = row_count;
  if v_affected <> 0 then
    raise exception 'FAIL: cross-org UPDATE affected % rows (expected 0)', v_affected;
  end if;

  -- Cross-org DELETE: likewise 0 rows.
  delete from public.customers where id = 'cust-b1';
  get diagnostics v_affected = row_count;
  if v_affected <> 0 then
    raise exception 'FAIL: cross-org DELETE affected % rows (expected 0)', v_affected;
  end if;

  raise notice 'PASS 03_cross_org_write_denial';
end $$;

rollback;
