-- ============================================================================
-- 07_aggregate_non_leakage.sql — RLS proof: aggregates don''t leak other orgs.
-- Proves: a count(*) run as user A counts ONLY org A rows (2 customers), and the
-- same query run as user B counts ONLY org B rows (1 customer). RLS filters
-- before aggregation, so totals can never reveal another tenant''s data.
-- Depends on 014 seed (org A = 2 customers, org B = 1 customer).
-- ============================================================================
begin;

set local role authenticated;

-- As user A (org-staging-demo).
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.customers) <> 2 then
    raise exception 'FAIL: user A count(*) customers should be 2, got %',
      (select count(*) from public.customers);
  end if;
end $$;

-- As user B (org-staging-beta).
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.customers) <> 1 then
    raise exception 'FAIL: user B count(*) customers should be 1, got %',
      (select count(*) from public.customers);
  end if;
  raise notice 'PASS 07_aggregate_non_leakage';
end $$;

rollback;
