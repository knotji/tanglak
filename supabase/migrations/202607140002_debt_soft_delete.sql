-- Store soft-delete metadata and keep active debt lookups fast.
--
-- Depends on 202607140001_debt_soft_delete_status.sql, which adds the
-- 'deleted' enum label in a prior migration/transaction.
alter table public.debts
  add column if not exists deleted_at timestamptz;

create index if not exists debts_user_active_idx
  on public.debts (user_id, due_date)
  where status <> 'deleted';

comment on column public.debts.deleted_at is
  'Timestamp when a debt was archived via soft delete. Historical transactions and reconciliation rows remain linked.';

-- Rollback note:
-- Drop debts_user_active_idx and debts.deleted_at if this PR is reverted
-- before production use. The enum label cannot be removed directly; see the
-- rollback note in 202607140001_debt_soft_delete_status.sql.
