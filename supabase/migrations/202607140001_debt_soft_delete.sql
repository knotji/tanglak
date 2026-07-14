-- Migration: Add safe debt archival state for user-requested debt deletion
--
-- Product behavior:
-- - Deleting a debt archives the debt row with status = 'deleted'.
-- - Linked transactions and debt_payments rows are preserved.
-- - Active product lists hide deleted debts, so totals are recomputed without
--   the archived debt while historical payment rows keep their debt_id.
--
-- Rollback:
--   update public.debts set status = 'paused', deleted_at = null where status = 'deleted';
--   alter table public.debts drop column if exists deleted_at;
--   -- PostgreSQL enum values cannot be removed without rebuilding the enum.

alter type public.debt_status add value if not exists 'deleted';

alter table public.debts
  add column if not exists deleted_at timestamptz;

create index if not exists debts_user_active_idx
  on public.debts (user_id, due_date)
  where status <> 'deleted';
