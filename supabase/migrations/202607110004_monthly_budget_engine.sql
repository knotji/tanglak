-- Migration: Monthly budget engine integrity guards
--
-- See docs/MONTHLY_BUDGET_ENGINE.md for the full data model and rationale.
--
-- Context: `monthly_budgets` and `budget_categories` were created by the
-- initial schema (202607100001_initial_tanglak_schema.sql) and already have
-- RLS (auth.uid() = user_id, from the generic ownership loop),
-- non-negative CHECK constraints on amount_satang/income_satang (added by
-- 202607110001_financial_value_guards.sql), and RLS/grants -- but no
-- application code has ever used them (confirmed by audit: zero references
-- anywhere in src/). Because the table is empty in every known environment,
-- this migration is safe to apply directly (no preflight query, no `not
-- valid` deferral needed -- there is no existing data that could violate
-- the new constraint).
--
-- This migration adds exactly one thing: a uniqueness guarantee so a user
-- cannot end up with two budget rows for the same category label within
-- the same month's budget -- required both for rejecting an explicit
-- duplicate category create, and for making "copy previous month" safe to
-- retry without ever producing duplicate categories.
--
-- This migration is additive only. No historical migration file is
-- modified, and no existing row is rewritten.

create unique index if not exists uq_budget_categories_user_month_label
  on public.budget_categories(user_id, monthly_budget_id, label);
