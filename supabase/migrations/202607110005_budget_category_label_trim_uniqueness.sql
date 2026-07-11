-- Migration: Make budget_categories label uniqueness whitespace-safe
--
-- See docs/MONTHLY_BUDGET_ENGINE.md for the full data model and rationale.
--
-- Integration audit finding: `createBudgetCategory`
-- (src/lib/data/finance-repository.ts) already trims leading/trailing
-- whitespace off a category label before both the duplicate pre-check and
-- the insert, and `calculateCategorySpend`
-- (src/lib/finance/budget-calculations.ts) already trims
-- `transaction.category` before matching it against a budget category's
-- label. So today, through the one and only application code path that
-- writes budget_categories, " อาหาร " and "อาหาร" can never both exist as
-- separate rows, and a transaction tagged " อาหาร " already matches a
-- budget category stored as "อาหาร".
--
-- What was missing: the uniqueness guarantee added by
-- 202607110004_monthly_budget_engine.sql
-- (uq_budget_categories_user_month_label) indexes the raw `label` column,
-- not a trimmed form of it. It happens to be sufficient today only because
-- every existing write path already trims before insert -- it provides no
-- independent protection if some future write path (a data migration, a
-- direct SQL edit, a new code path that forgets to trim) ever inserted an
-- untrimmed duplicate. This migration closes that gap at the database
-- layer by indexing `trim(label)` instead of the raw column, so uniqueness
-- is enforced against whitespace-insensitive duplicates regardless of what
-- inserted them -- not just against whatever the application layer
-- currently guarantees.
--
-- `trim()` on text is a standard immutable PostgreSQL function, safe to use
-- directly in an index expression.
--
-- Safe to apply directly: budget_categories has never been written to in
-- any known environment (confirmed by the original migration's own audit),
-- and even if it had been, every existing row's label is already trimmed
-- by the only code path that writes it, so switching to a trim-expression
-- index cannot conflict with any existing data.
--
-- This migration is additive/replacing only. No historical migration file
-- is modified, and no existing row is rewritten -- only the index
-- definition changes.

drop index if exists public.uq_budget_categories_user_month_label;

create unique index if not exists uq_budget_categories_user_month_label
  on public.budget_categories(user_id, monthly_budget_id, trim(label));
