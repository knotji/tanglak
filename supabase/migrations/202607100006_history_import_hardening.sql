-- Migration: Harden import_rows idempotency and add performance indexes
-- This is an ADDITIVE migration and does not alter any previously applied migrations.

-- 1. Unique constraint: prevent same source row from being inserted twice into a batch
--    This is the primary idempotency guard at the database level.
alter table public.import_rows
  add constraint uq_import_rows_batch_source_row
  unique (import_batch_id, source_row_index);

-- 2. Index for fast duplicate lookup by reference number within a batch
create index if not exists idx_import_rows_reference
  on public.import_rows(import_batch_id, reference_number)
  where reference_number is not null;

-- 3. Index to efficiently list unresolved rows for batch resume
create index if not exists idx_import_rows_decision
  on public.import_rows(import_batch_id, import_decision);

-- 4. Index for created_transaction_id idempotency checks
create index if not exists idx_import_rows_created_tx
  on public.import_rows(created_transaction_id)
  where created_transaction_id is not null;

-- 5. Partial index on transactions for fast rollback: find all historical transactions by batch
create index if not exists idx_transactions_historical_batch
  on public.transactions(import_batch_id, user_id)
  where is_historical = true and import_batch_id is not null;

-- Notes:
-- RLS policies are already in place from migration 202607100005.
-- Both import_batches and import_rows use: auth.uid() = user_id
-- for all operations (SELECT, INSERT, UPDATE, DELETE).
-- The unique constraint (import_batch_id, source_row_index) ensures that
-- re-uploading the same file cannot create duplicate staging rows.
-- created_transaction_id is the authoritative idempotency field:
-- if non-null, the row has already been imported and must not create another transaction.
