-- ============================================================================
-- 04_membership_change_denial.sql — RLS proof: normal users can''t alter memberships.
-- Proves: a non-admin (Sales A, no user.manage) cannot INSERT a membership
-- (self-granting a role / a second tenant) nor UPDATE an existing membership''s
-- role; and an admin (Sysadmin D, holds user.manage) CAN — confirming mutations
-- are admin/service only (role-escalation protection). Depends on 014 seed.
-- ============================================================================
begin;

-- --- Non-admin: Sales A ---
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  v_affected int;
begin
  -- INSERT a new membership (grant myself a role in org B) => WITH CHECK denial.
  begin
    insert into public.memberships (id, organization_id, profile_id, role_id, active)
    values ('mem-evil', 'org-staging-demo', '00000000-0000-0000-0000-0000000000a1', 'crole-sysadmin', true);
    raise exception 'FAIL: non-admin INSERT into memberships should have been denied';
  exception when insufficient_privilege or check_violation then
    null; -- expected
  end;

  -- UPDATE my own membership role => USING requires user.manage => 0 rows affected.
  update public.memberships set role_id = 'crole-sysadmin' where id = 'mem-staging-a1';
  get diagnostics v_affected = row_count;
  if v_affected <> 0 then
    raise exception 'FAIL: non-admin membership UPDATE affected % rows (expected 0)', v_affected;
  end if;
  if (select role_id from public.memberships where id = 'mem-staging-a1') <> 'crole-sales' then
    raise exception 'FAIL: membership role changed despite denial';
  end if;
end $$;

-- --- Admin: Sysadmin D (holds user.manage) ---
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);

do $$
declare
  v_affected int;
begin
  update public.memberships set active = true where id = 'mem-staging-a1';
  get diagnostics v_affected = row_count;
  if v_affected <> 1 then
    raise exception 'FAIL: admin membership UPDATE should affect 1 row, got %', v_affected;
  end if;
  raise notice 'PASS 04_membership_change_denial';
end $$;

rollback;
