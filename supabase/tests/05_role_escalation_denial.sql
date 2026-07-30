-- ============================================================================
-- 05_role_escalation_denial.sql — RLS proof: a user can''t elevate their own role.
-- Proves the column-guarded profiles self-update policy: Sales A may edit their
-- own name (positive control) but CANNOT change their own role_id,
-- organization_id, or active flag (each is a WITH CHECK violation, because the
-- new value must equal the currently-stored value). Depends on 014 seed.
-- ============================================================================
begin;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  -- Positive control: editing an ordinary column on my own row is allowed.
  update public.profiles set name = 'Sales A (edited)'
  where id = '00000000-0000-0000-0000-0000000000a1';
  if (select name from public.profiles where id = '00000000-0000-0000-0000-0000000000a1')
       <> 'Sales A (edited)' then
    raise exception 'FAIL: self name edit should have succeeded';
  end if;

  -- role_id escalation => WITH CHECK denial.
  begin
    update public.profiles set role_id = 'crole-sysadmin'
    where id = '00000000-0000-0000-0000-0000000000a1';
    raise exception 'FAIL: self role_id escalation should have been denied';
  exception when insufficient_privilege or check_violation then null; end;

  -- organization_id move => WITH CHECK denial.
  begin
    update public.profiles set organization_id = 'org-staging-beta'
    where id = '00000000-0000-0000-0000-0000000000a1';
    raise exception 'FAIL: self organization_id change should have been denied';
  exception when insufficient_privilege or check_violation then null; end;

  -- active self-flip => WITH CHECK denial.
  begin
    update public.profiles set active = false
    where id = '00000000-0000-0000-0000-0000000000a1';
    raise exception 'FAIL: self active change should have been denied';
  exception when insufficient_privilege or check_violation then null; end;

  -- Confirm the sensitive columns are unchanged.
  if (select role_id from public.profiles where id = '00000000-0000-0000-0000-0000000000a1')
       <> 'crole-sales' then
    raise exception 'FAIL: role_id changed despite denial';
  end if;

  raise notice 'PASS 05_role_escalation_denial';
end $$;

rollback;
