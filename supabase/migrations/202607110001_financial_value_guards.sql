-- Migration: Financial value integrity guards (non-negative / positive CHECK constraints)
--
-- See docs/FINANCIAL_VALUE_GUARDS.md for the full field classification and
-- the required deployment/preflight procedure.
--
-- Safety strategy: every constraint below is added `not valid`. This means
-- Postgres does NOT scan or rewrite any existing row when this migration
-- runs — it only enforces the rule against new inserts/updates from this
-- point forward. This migration never assumes production data is already
-- clean, and it never rewrites or deletes an existing row.
--
-- Before running `alter table ... validate constraint ...` to fully
-- backfill-verify these constraints (a separate, deliberate follow-up
-- migration), an operator must run the preflight query for each table
-- documented in docs/FINANCIAL_VALUE_GUARDS.md and remediate any existing
-- violating rows by hand (never with an automatic Math.abs/clamp rewrite).
-- If a table has no violating rows, `validate constraint` is a cheap,
-- non-blocking metadata-only scan.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'debts_original_amount_satang_nonnegative'
      and conrelid = 'public.debts'::regclass
  ) then
    alter table public.debts
      add constraint debts_original_amount_satang_nonnegative
      check (original_amount_satang is null or original_amount_satang >= 0)
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'debts_outstanding_balance_satang_nonnegative'
      and conrelid = 'public.debts'::regclass
  ) then
    alter table public.debts
      add constraint debts_outstanding_balance_satang_nonnegative
      check (outstanding_balance_satang is null or outstanding_balance_satang >= 0)
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'debts_statement_balance_satang_nonnegative'
      and conrelid = 'public.debts'::regclass
  ) then
    alter table public.debts
      add constraint debts_statement_balance_satang_nonnegative
      check (statement_balance_satang is null or statement_balance_satang >= 0)
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'debts_amount_due_satang_nonnegative'
      and conrelid = 'public.debts'::regclass
  ) then
    alter table public.debts
      add constraint debts_amount_due_satang_nonnegative
      check (amount_due_satang is null or amount_due_satang >= 0)
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'debts_minimum_payment_satang_nonnegative'
      and conrelid = 'public.debts'::regclass
  ) then
    alter table public.debts
      add constraint debts_minimum_payment_satang_nonnegative
      check (minimum_payment_satang is null or minimum_payment_satang >= 0)
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'debts_amount_paid_this_cycle_satang_nonnegative'
      and conrelid = 'public.debts'::regclass
  ) then
    alter table public.debts
      add constraint debts_amount_paid_this_cycle_satang_nonnegative
      check (amount_paid_this_cycle_satang >= 0)
      not valid;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'debt_schedules_amount_due_satang_nonnegative'
      and conrelid = 'public.debt_schedules'::regclass
  ) then
    alter table public.debt_schedules
      add constraint debt_schedules_amount_due_satang_nonnegative
      check (amount_due_satang >= 0)
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'debt_schedules_amount_paid_satang_nonnegative'
      and conrelid = 'public.debt_schedules'::regclass
  ) then
    alter table public.debt_schedules
      add constraint debt_schedules_amount_paid_satang_nonnegative
      check (amount_paid_satang >= 0)
      not valid;
  end if;
end
$$;

do $$
begin
  -- A recorded debt payment must be a real, positive payment (Category A) —
  -- unlike the nonnegative-only columns above, zero is not a valid payment.
  if not exists (
    select 1 from pg_constraint
    where conname = 'debt_payments_amount_satang_positive'
      and conrelid = 'public.debt_payments'::regclass
  ) then
    alter table public.debt_payments
      add constraint debt_payments_amount_satang_positive
      check (amount_satang > 0)
      not valid;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'budget_categories_amount_satang_nonnegative'
      and conrelid = 'public.budget_categories'::regclass
  ) then
    alter table public.budget_categories
      add constraint budget_categories_amount_satang_nonnegative
      check (amount_satang >= 0)
      not valid;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'monthly_budgets_income_satang_nonnegative'
      and conrelid = 'public.monthly_budgets'::regclass
  ) then
    alter table public.monthly_budgets
      add constraint monthly_budgets_income_satang_nonnegative
      check (income_satang >= 0)
      not valid;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'recurring_expenses_amount_satang_nonnegative'
      and conrelid = 'public.recurring_expenses'::regclass
  ) then
    alter table public.recurring_expenses
      add constraint recurring_expenses_amount_satang_nonnegative
      check (amount_satang >= 0)
      not valid;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'transaction_items_amount_satang_nonnegative'
      and conrelid = 'public.transaction_items'::regclass
  ) then
    alter table public.transaction_items
      add constraint transaction_items_amount_satang_nonnegative
      check (amount_satang is null or amount_satang >= 0)
      not valid;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'import_rows_amount_satang_nonnegative'
      and conrelid = 'public.import_rows'::regclass
  ) then
    alter table public.import_rows
      add constraint import_rows_amount_satang_nonnegative
      check (amount_satang >= 0)
      not valid;
  end if;
end
$$;

-- transactions.amount_satang already has `check (amount_satang >= 0)` from
-- the initial schema (202607100001) and is intentionally left untouched
-- here. Its signed/unsigned representation (the `type` enum determines
-- debit/credit direction, not the sign of amount_satang) is existing,
-- correct design and out of scope for this migration.
