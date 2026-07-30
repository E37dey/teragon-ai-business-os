-- ============================================================================
-- 02_cross_org_read_denial.sql — RLS proof: a caller reads ONLY their own org.
-- Proves: user A (org-staging-demo) sees org A rows and CANNOT see org B rows,
-- even by asking for them explicitly by id. Tenant isolation via authenticated
-- membership (auth_org_id()), never a client-supplied org. Depends on 014 seed.
-- ============================================================================
begin;

-- Sign in as Sales A (org-staging-demo, active, holds customer.read).
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  -- Positive control: own-org rows are visible.
  if public.auth_org_id() <> 'org-staging-demo' then
    raise exception 'FAIL: auth_org_id() should be org-staging-demo, got %', public.auth_org_id();
  end if;
  if (select count(*) from public.customers where organization_id = 'org-staging-demo') <> 2 then
    raise exception 'FAIL: user A should see 2 own-org customers';
  end if;

  -- Cross-org read denial: org B rows are invisible, even queried by id.
  if (select count(*) from public.customers where organization_id = 'org-staging-beta') <> 0 then
    raise exception 'FAIL: user A must NOT see org B customers by org filter';
  end if;
  if (select count(*) from public.customers where id = 'cust-b1') <> 0 then
    raise exception 'FAIL: user A must NOT see org B customer cust-b1 by id';
  end if;
  if (select count(*) from public.leads where id = 'lead-b1') <> 0 then
    raise exception 'FAIL: user A must NOT see org B lead lead-b1';
  end if;

  raise notice 'PASS 02_cross_org_read_denial';
end $$;

rollback;
