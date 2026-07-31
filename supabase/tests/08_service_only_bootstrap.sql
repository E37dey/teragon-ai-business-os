-- ============================================================================
-- 08_service_only_bootstrap.sql — RLS/authorization proof: bootstrap is service-only.
-- Proves three things about public.bootstrap_admin():
--   (1) a normal authenticated caller cannot even EXECUTE it (grant is service_role only);
--   (2) its internal is_service_role() guard raises when invoked without the
--       service-role JWT claim (belt-and-suspenders, exercised by temporarily
--       granting execute inside the rolled-back transaction);
--   (3) with the service role it succeeds AND is idempotent (second call =
--       same profile, no duplicate).
-- Everything runs in a transaction that is rolled back. Depends on 014 seed.
-- ============================================================================
begin;

-- A target auth user to promote (rolled back with the transaction).
insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000e1',
        'authenticated', 'authenticated', 'boot.e@staging.local', now(), now())
on conflict (id) do nothing;

-- (1) authenticated cannot execute the function at all.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  begin
    perform public.bootstrap_admin('00000000-0000-0000-0000-0000000000e1', 'org-boot-test');
    raise exception 'FAIL: authenticated caller must not be able to execute bootstrap_admin';
  exception when insufficient_privilege then
    null; -- expected: permission denied for function
  end;
end $$;

-- (2) internal guard: grant execute to authenticated (local), call without the
--     service-role claim => guard raises.
reset role;
grant execute on function public.bootstrap_admin(uuid, text, text, text, text) to authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  begin
    perform public.bootstrap_admin('00000000-0000-0000-0000-0000000000e1', 'org-boot-test');
    raise exception 'FAIL: bootstrap_admin guard should refuse a non-service caller';
  exception when insufficient_privilege then
    null; -- expected: 42501 from the is_service_role() guard
  end;
end $$;

-- (3) service role: succeeds and is idempotent.
reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
declare
  v1 uuid;
  v2 uuid;
begin
  select (public.bootstrap_admin('00000000-0000-0000-0000-0000000000e1', 'org-boot-test',
            'Boot Org', 'Boot Admin', 'boot.e@staging.local')).id into v1;
  if v1 <> '00000000-0000-0000-0000-0000000000e1' then
    raise exception 'FAIL: bootstrap should return the promoted profile id';
  end if;
  if (select role_id from public.profiles where id = '00000000-0000-0000-0000-0000000000e1')
       <> 'crole-sysadmin' then
    raise exception 'FAIL: bootstrapped profile should be crole-sysadmin';
  end if;
  if not exists (select 1 from public.organizations where id = 'org-boot-test') then
    raise exception 'FAIL: bootstrap should have created the org';
  end if;
  -- Regression: a bare-org insert (no explicit type) must satisfy the NOT NULL
  -- customer_type domain via the organizations.type default.
  if (select type from public.organizations where id = 'org-boot-test') is null then
    raise exception 'FAIL: bootstrapped org must have a non-null type (default)';
  end if;

  -- Idempotent second call: no error, same profile, single membership row.
  select (public.bootstrap_admin('00000000-0000-0000-0000-0000000000e1', 'org-boot-test')).id into v2;
  if v2 <> v1 then
    raise exception 'FAIL: idempotent bootstrap should return the same profile';
  end if;
  if (select count(*) from public.memberships
        where profile_id = '00000000-0000-0000-0000-0000000000e1'
          and organization_id = 'org-boot-test') <> 1 then
    raise exception 'FAIL: bootstrap must not create duplicate memberships';
  end if;

  raise notice 'PASS 08_service_only_bootstrap';
end $$;

rollback;
