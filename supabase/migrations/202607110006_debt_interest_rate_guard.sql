-- Migration: Debt annual interest rate range guard
--
-- See docs/DEBT_PLANNING_ENGINE.md for the full field semantics and the
-- slip-first/debt-planning product pivot this supports. The other new
-- debt-planning columns (cycle_start_date, cycle_end_date, statement_date,
-- credit_limit_satang) are added by 202607110007_debt_cycle_fields.sql --
-- this migration only adds the interest-rate constraint, which that
-- migration does not cover, to avoid two migrations both claiming the same
-- column-adding responsibility.
--
-- Context: `debts.interest_rate_annual numeric(6,3)` has existed since the
-- initial schema (202607100001_initial_tanglak_schema.sql), but no
-- application code has ever written to it (confirmed by audit: the
-- create/update debt repository functions never included this column in
-- any insert/update statement, and no form ever exposed it) -- so in every
-- known environment this column is NULL on every existing row. This
-- migration is the first to enforce a value range on it, as part of
-- exposing it in the debt creation/edit UI.
--
-- Range: 0 through 100 (percent, annual), inclusive. `numeric(6,3)` already
-- allows up to 999.999, so this CHECK is the actual business boundary, not
-- a storage-format limit. NULL remains allowed (interest rate is optional
-- -- not every debt type has one, e.g. an interest-free installment plan).
--
-- Safety strategy: added `not valid`, matching the established convention
-- in 202607110001_financial_value_guards.sql. Postgres does not scan or
-- rewrite any existing row when this migration runs -- it only enforces
-- the rule against new inserts/updates from this point forward.
--
-- Preflight (run before any future `validate constraint` follow-up):
--   select id, interest_rate_annual
--   from public.debts
--   where interest_rate_annual is not null
--     and (interest_rate_annual < 0 or interest_rate_annual > 100);
-- Given the column has never been written to, this is expected to return
-- zero rows in every known environment; if it does not, remediate by hand
-- (never with an automatic clamp/rewrite) before validating the constraint.
--
-- Rollback: `alter table public.debts drop constraint if exists
-- debts_interest_rate_annual_range;` -- purely additive, safe to drop with
-- no data loss (no row is ever rewritten by adding or dropping this
-- constraint).
--
-- This migration is additive only. No historical migration file is
-- modified, and no existing row is rewritten.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'debts_interest_rate_annual_range'
      and conrelid = 'public.debts'::regclass
  ) then
    alter table public.debts
      add constraint debts_interest_rate_annual_range
      check (interest_rate_annual is null or (interest_rate_annual >= 0 and interest_rate_annual <= 100))
      not valid;
  end if;
end $$;
