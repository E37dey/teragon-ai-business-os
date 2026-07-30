-- ============================================================================
-- 01_anonymous_denial.sql — RLS proof: NO auth.uid() => no rows, no writes.
-- Proves: with no authenticated user (anon role, empty JWT claims), the identity
-- helpers deny by default and every tenant read returns 0 rows / every write is
-- refused. Depends on the 014 staging seed. Wraps in a transaction + rollback.
-- Run under local Postgres in Gate S5 (psql -v ON_ERROR_STOP=1 -f <file>).
-- ============================================================================
begin;

-- Simulate an anonymous request: no JWT subject, anon Postgres role.
select set_config('request.jwt.claims', '', true);
set local role anon;

do $$
begin
  -- Deny-by-default helpers.
  if auth.uid() is not null then
    raise exception 'FAIL: auth.uid() should be NULL for anon';
  end if;
  if public.auth_org_id() is not null then
    raise exception 'FAIL: auth_org_id() should be NULL for anon';
  end if;
  if public.is_active() is not false then
    raise exception 'FAIL: is_active() should be FALSE for anon';
  end if;
  if public.has_capability('customer.read') is not false then
    raise exception 'FAIL: has_capability should be FALSE for anon';
  end if;

  -- No rows visible on any tenant table.
  if (select count(*) from public.customers)   <> 0 then raise exception 'FAIL: anon saw customers';   end if;
  if (select count(*) from public.profiles)    <> 0 then raise exception 'FAIL: anon saw profiles';    end if;
  if (select count(*) from public.audit_events)<> 0 then raise exception 'FAIL: anon saw audit_events'; end if;

  -- Writes are refused (anon holds no write privilege AND no policy applies).
  begin
    insert into public.customers (id, organization_id, name, type)
    values ('anon-x', 'org-staging-demo', 'hax', 'עסק');
    raise exception 'FAIL: anon INSERT into customers should have been denied';
  exception when insufficient_privilege or check_violation then
    null; -- expected denial
  end;

  raise notice 'PASS 01_anonymous_denial';
end $$;

rollback;
