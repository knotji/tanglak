-- Migration: Debt minimum payment must not exceed outstanding balance
--
-- See docs/DEBT_PLANNING_ENGINE.md for the full field semantics. This is a
-- locked Phase 1 product decision (see docs/SLIP_DEBT_IMPLEMENTATION_FINDINGS.md
-- F-002): `minimum_payment_satang` must never exceed `outstanding_balance_satang`
-- for the same debt row.
--
-- Both columns are nullable (`debts.minimum_payment_satang bigint`,
-- `debts.outstanding_balance_satang bigint`, both nullable since the initial
-- schema). The constraint only applies when BOTH values are known -- an
-- unset outstanding balance does not constrain the minimum, matching how
-- the application layer already treats "not provided" as "no constraint"
-- (see assertMinimumNotAboveOutstanding in src/lib/finance/debt-guards.ts).
--
-- Safety strategy: added `not valid`, matching the established convention
-- in 202607110001_financial_value_guards.sql and 202607110006. Postgres
-- does not scan or rewrite any existing row when this migration runs -- it
-- only enforces the rule against new inserts/updates from this point
-- forward.
--
-- Preflight (run before any future `validate constraint` follow-up):
--   select id, minimum_payment_satang, outstanding_balance_satang
--   from public.debts
--   where minimum_payment_satang is not null
--     and outstanding_balance_satang is not null
--     and minimum_payment_satang > outstanding_balance_satang;
-- If this returns any rows, remediate them by hand (never with an automatic
-- clamp/rewrite -- ask the account owner which figure is stale) before
-- running `alter table public.debts validate constraint
-- debts_minimum_not_above_outstanding;`. This migration does not run that
-- validation step itself, and does not delete or rewrite any row.
--
-- Rollback: `alter table public.debts drop constraint if exists
-- debts_minimum_not_above_outstanding;` -- purely additive, safe to drop
-- with no data loss (no row is ever rewritten by adding or dropping this
-- constraint).
--
-- This migration is additive only. No historical migration file
-- (including 202607110006 or 202607110007) is modified, and no existing
-- row is rewritten.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'debts_minimum_not_above_outstanding'
      and conrelid = 'public.debts'::regclass
  ) then
    alter table public.debts
      add constraint debts_minimum_not_above_outstanding
      check (
        minimum_payment_satang is null
        or outstanding_balance_satang is null
        or minimum_payment_satang <= outstanding_balance_satang
      )
      not valid;
  end if;
end $$;
