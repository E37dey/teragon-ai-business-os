-- ============================================================================
-- 06_inactive_user_denial.sql — RLS proof: an inactive profile is denied everywhere.
-- Proves: Viewer C has a real profile in org A but active=false / status='לא פעיל'.
-- Their org resolves (auth_org_id) yet is_active() is false, so reads return 0
-- rows and writes are refused. Depends on 014 seed.
-- ============================================================================
begin;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  -- Their profile exists (org resolves) ...
  if public.auth_org_id() <> 'org-staging-demo' then
    raise exception 'FAIL: inactive user org should still resolve to org-staging-demo';
  end if;
  -- ... but they are not active.
  if public.is_active() is not false then
    raise exception 'FAIL: is_active() must be FALSE for the inactive user';
  end if;

  -- Reads return 0 rows (is_active() gate in every SELECT policy).
  if (select count(*) from public.customers) <> 0 then
    raise exception 'FAIL: inactive user should see 0 customers';
  end if;

  -- Writes are refused.
  begin
    insert into public.customers (id, organization_id, name, type)
    values ('cust-inactive', 'org-staging-demo', 'x', 'עסק');
    raise exception 'FAIL: inactive user INSERT should have been denied';
  exception when insufficient_privilege or check_violation then null; end;

  raise notice 'PASS 06_inactive_user_denial';
end $$;

rollback;
