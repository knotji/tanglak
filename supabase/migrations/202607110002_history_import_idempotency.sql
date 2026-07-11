-- Migration: History import commit idempotency
--
-- See docs/HISTORY_IMPORT_IDEMPOTENCY.md for the full design rationale.
--
-- Problem: 202607100006_history_import_hardening.sql already documented
-- "created_transaction_id is the authoritative idempotency field" but never
-- enforced it at the database level, and the application-level check that
-- existed was gated behind a mock-only code path. Calling the commit action
-- twice (double submit, client retry after timeout, two concurrent tabs)
-- could create a second transaction for the same staging row.
--
-- This migration adds:
--   1. A database-backed uniqueness guarantee: a partial unique index on
--      transactions.import_row_id, so even if every other guard failed, two
--      transactions can never be linked to the same staging row.
--   2. A narrow Postgres function, import_commit_row, that performs the
--      full "commit one staging row" sequence (lock row, check idempotency,
--      insert transaction, optional debt_payment + debt recalculation,
--      update the staging row) as a single atomic operation -- something a
--      sequence of separate Supabase client calls cannot guarantee. Row
--      locking (`select ... for update`) inside the function is what makes
--      concurrent commit requests for the same row safe, without any
--      in-memory/application-level mutex.
--   3. A narrow Postgres function, import_rollback_batch, that performs the
--      full rollback sequence (delete debt_payments, delete transactions,
--      unlink merged transactions, reset staging rows, recalculate affected
--      debts, mark the batch rolled_back) atomically, fixing the same
--      partial-failure risk that existed when this was five separate calls.
--
-- Both functions are `security invoker`: they run under the calling user's
-- own Postgres role, so the existing RLS policies (`auth.uid() = user_id`)
-- still apply in addition to the explicit `user_id` checks inside the
-- function bodies -- a caller cannot use these functions to touch another
-- user's rows by passing a different p_user_id, because RLS independently
-- blocks it regardless of what the function argument says.
--
-- This migration is additive only. No historical migration file is
-- modified, and no existing row is rewritten.

-- 1. Database-backed uniqueness: a staging row can never be linked to more
--    than one transaction, regardless of how many times a commit is retried
--    or how many concurrent requests race for the same row.
create unique index if not exists uq_transactions_import_row_id
  on public.transactions(import_row_id)
  where import_row_id is not null;

-- 2. Atomic single-row commit.
create or replace function public.import_commit_row(
  p_user_id uuid,
  p_batch_id uuid,
  p_row_id uuid,
  p_type public.transaction_type,
  p_amount_satang bigint,
  p_occurred_at timestamptz,
  p_merchant text,
  p_category text,
  p_payment_method text,
  p_note text,
  p_source_account_id uuid,
  p_destination_account_id uuid,
  p_debt_id uuid
)
returns table (transaction_id uuid, already_imported boolean)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_row public.import_rows%rowtype;
  v_tx_id uuid;
begin
  -- Lock the staging row for the duration of this function. A second,
  -- concurrent call for the same row_id blocks here until the first call
  -- commits (or rolls back), then re-reads the now-updated row below --
  -- this is the database-backed locking that replaces an application mutex.
  select * into v_row
  from public.import_rows
  where id = p_row_id and user_id = p_user_id and import_batch_id = p_batch_id
  for update;

  if not found then
    raise exception 'import row not found or not owned by user' using errcode = 'P0002';
  end if;

  -- Idempotency: a row already resolved (imported or skipped) is frozen.
  -- Re-running the same commit (or losing a concurrency race to another
  -- call that got here first) is a safe no-op, not an error.
  if v_row.review_status in ('imported', 'skipped') then
    return query select v_row.created_transaction_id, true;
    return;
  end if;

  if p_debt_id is not null then
    if not exists (select 1 from public.debts where id = p_debt_id and user_id = p_user_id) then
      raise exception 'debt not found or not owned by user' using errcode = 'P0002';
    end if;
  end if;

  insert into public.transactions (
    user_id, type, status, amount_satang, currency, occurred_at, merchant,
    category_label, payment_method, note, source_account_id,
    destination_account_id, debt_id, source, import_batch_id, import_row_id,
    is_historical
  ) values (
    p_user_id, p_type, 'confirmed', p_amount_satang, 'THB', p_occurred_at,
    p_merchant, p_category, p_payment_method, p_note, p_source_account_id,
    p_destination_account_id, p_debt_id, 'history_import', p_batch_id,
    p_row_id, true
  )
  returning id into v_tx_id;

  if p_debt_id is not null and p_type = 'debt_payment' then
    insert into public.debt_payments (user_id, debt_id, transaction_id, amount_satang, paid_at)
    values (p_user_id, p_debt_id, v_tx_id, p_amount_satang, p_occurred_at);

    update public.debts d
    set amount_paid_this_cycle_satang = coalesce((
      select sum(t.amount_satang)
      from public.transactions t
      where t.debt_id = p_debt_id and t.type = 'debt_payment' and t.status = 'confirmed'
    ), 0)
    where d.id = p_debt_id and d.user_id = p_user_id;
  end if;

  update public.import_rows
  set created_transaction_id = v_tx_id,
      review_status = 'imported',
      import_decision = 'import'
  where id = p_row_id;

  return query select v_tx_id, false;
end;
$$;

-- PostgreSQL grants EXECUTE on a newly created function to PUBLIC by
-- default (unlike tables, which grant nothing by default) -- revoke that
-- before granting explicitly, matching this repository's existing
-- least-privilege convention for table grants (202607100007_data_api_grants.sql
-- grants only to `authenticated`, never to `anon`/`public`). RLS would still
-- block a PUBLIC/anon caller's writes (auth.uid() is null for anon, and
-- `null = user_id` never matches), so this is defense in depth rather than
-- the only protection -- but it keeps privilege grants explicit and
-- auditable instead of relying solely on RLS null-comparison behavior.
revoke all on function public.import_commit_row(
  uuid, uuid, uuid, public.transaction_type, bigint, timestamptz, text, text,
  text, text, uuid, uuid, uuid
) from public;

grant execute on function public.import_commit_row(
  uuid, uuid, uuid, public.transaction_type, bigint, timestamptz, text, text,
  text, text, uuid, uuid, uuid
) to authenticated;

-- 3. Atomic batch rollback.
create or replace function public.import_rollback_batch(
  p_user_id uuid,
  p_batch_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status public.import_batch_status;
  v_affected_debt_ids uuid[];
begin
  select status into v_status
  from public.import_batches
  where id = p_batch_id and user_id = p_user_id
  for update;

  if not found then
    raise exception 'import batch not found or not owned by user' using errcode = 'P0002';
  end if;

  if v_status = 'rolled_back' then
    return; -- idempotent re-entry: already rolled back, safe no-op
  end if;

  if v_status <> 'completed' and v_status <> 'partially_imported' then
    raise exception 'cannot roll back a batch that has not been imported' using errcode = 'P0001';
  end if;

  select array_agg(distinct debt_id) into v_affected_debt_ids
  from public.transactions
  where import_batch_id = p_batch_id
    and user_id = p_user_id
    and is_historical = true
    and debt_id is not null;

  delete from public.debt_payments
  where user_id = p_user_id
    and transaction_id in (
      select id from public.transactions
      where import_batch_id = p_batch_id and user_id = p_user_id and is_historical = true
    );

  delete from public.transactions
  where import_batch_id = p_batch_id and user_id = p_user_id and is_historical = true;

  update public.transactions
  set import_batch_id = null, import_row_id = null
  where import_batch_id = p_batch_id and user_id = p_user_id;

  update public.import_rows
  set review_status = 'ready', import_decision = 'unresolved', created_transaction_id = null
  where import_batch_id = p_batch_id and user_id = p_user_id;

  if v_affected_debt_ids is not null then
    update public.debts d
    set amount_paid_this_cycle_satang = coalesce((
      select sum(t.amount_satang)
      from public.transactions t
      where t.debt_id = d.id and t.type = 'debt_payment' and t.status = 'confirmed'
    ), 0)
    where d.user_id = p_user_id and d.id = any(v_affected_debt_ids);
  end if;

  update public.import_batches
  set status = 'rolled_back', imported_rows = 0, skipped_rows = 0, rolled_back_at = now()
  where id = p_batch_id and user_id = p_user_id;
end;
$$;

revoke all on function public.import_rollback_batch(uuid, uuid) from public;
grant execute on function public.import_rollback_batch(uuid, uuid) to authenticated;
