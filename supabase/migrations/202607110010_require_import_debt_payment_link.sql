-- Migration: Require debt_id for imported debt_payment rows
--
-- See docs/SLIP_DEBT_FINAL_SECURITY_AUDIT.md F-001. The Phase 1 invariant
-- "every confirmed debt_payment transaction must carry an explicit debt_id"
-- is already enforced for manual transactions and document review
-- (assertDebtPaymentLinked in src/lib/finance/debt-guards.ts, called from
-- createTransaction/updateTransaction). The import review/commit path was
-- missed: `public.import_commit_row` (202607110007_debt_cycle_fields.sql)
-- happily inserted a confirmed `debt_payment` transaction with a null
-- `p_debt_id` -- it only skipped the `debt_payments` link/recalculation
-- step, it never rejected the row. That produced a confirmed cashflow
-- transaction which could never affect any debt's paid-this-cycle total,
-- exactly the state the invariant exists to prevent.
--
-- This migration replaces `import_commit_row` with the same body as
-- 202607110007, adding one guard: a `debt_payment` row with a null
-- `p_debt_id` is rejected before any row is locked for update or written.
-- Every other behavior is unchanged:
--   - `security invoker` / `set search_path = public` preserved.
--   - The row-not-found and already-resolved (idempotent replay) checks
--     are unchanged and still run first.
--   - Debt ownership validation for a *non-null* `p_debt_id` is unchanged.
--   - Source/destination account ownership validation is unchanged.
--   - `revoke all ... from public` / `grant execute ... to authenticated`
--     are reapplied identically -- this migration does not widen or narrow
--     who may call this function.
--   - Rollback (`public.import_rollback_batch`, defined in 202607110007) is
--     untouched by this migration and continues to work: it deletes
--     transactions/debt_payments by `import_batch_id` and recalculates
--     affected debts, none of which depends on how a row was validated at
--     commit time.
--   - Idempotency is untouched: the already-resolved short-circuit
--     (`v_row.review_status in ('imported', 'skipped')`) still runs before
--     the new guard, so replaying a commit for an already-imported row
--     (including one that predates this migration) still returns the
--     existing transaction id rather than re-validating or re-inserting.
--
-- Existing historical rows: this migration does not read, update, or
-- delete any row in `public.transactions`, `public.debt_payments`, or
-- `public.import_rows`. Any unlinked `debt_payment` transaction confirmed
-- before this migration is left exactly as it was -- it continues to
-- affect overview/cashflow totals under existing semantics, it does not
-- count toward any debt's paid-this-cycle total (that has always required
-- a matching `debt_id`), and no automatic linking is performed. A user may
-- edit/link such a row later only through whatever explicit edit UI
-- already exists for transactions; this migration does not add one.
--
-- Preflight (informational only -- this migration does not act on the
-- result):
--   select id, occurred_at, amount_satang
--   from public.transactions
--   where type = 'debt_payment' and debt_id is null;
--
-- Rollback: re-run the `create or replace function public.import_commit_row`
-- body from 202607110007_debt_cycle_fields.sql to remove the new guard.
-- Purely additive/behavioral -- no table row is ever rewritten by replacing
-- this function.
--
-- This migration is additive only. No historical migration (including 007,
-- 008, or 009) is modified, and no existing row is rewritten.

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
  select * into v_row
  from public.import_rows
  where id = p_row_id and user_id = p_user_id and import_batch_id = p_batch_id
  for update;

  if not found then
    raise exception 'import row not found or not owned by user' using errcode = 'P0002';
  end if;

  if v_row.review_status in ('imported', 'skipped') then
    return query select v_row.created_transaction_id, true;
    return;
  end if;

  -- Locked Phase 1 rule: a debt_payment row must carry an explicit,
  -- caller-owned debt_id. Checked before the row is written -- never
  -- silently downgraded to another type, never auto-linked from account
  -- number or description text, never used to auto-create a debt.
  if p_type = 'debt_payment' and p_debt_id is null then
    raise exception 'debt payment must be linked to a debt' using errcode = 'P0001';
  end if;

  if p_debt_id is not null then
    if not exists (select 1 from public.debts where id = p_debt_id and user_id = p_user_id) then
      raise exception 'debt not found or not owned by user' using errcode = 'P0002';
    end if;
  end if;

  if p_source_account_id is not null then
    if not exists (select 1 from public.accounts where id = p_source_account_id and user_id = p_user_id) then
      raise exception 'source account not found or not owned by user' using errcode = 'P0002';
    end if;
  end if;

  if p_destination_account_id is not null then
    if not exists (select 1 from public.accounts where id = p_destination_account_id and user_id = p_user_id) then
      raise exception 'destination account not found or not owned by user' using errcode = 'P0002';
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

    perform public.recalculate_debt_paid_this_cycle(p_debt_id);
  end if;

  update public.import_rows
  set created_transaction_id = v_tx_id,
      review_status = 'imported',
      import_decision = 'import'
  where id = p_row_id;

  return query select v_tx_id, false;
end;
$$;

revoke all on function public.import_commit_row(
  uuid, uuid, uuid, public.transaction_type, bigint, timestamptz, text, text,
  text, text, uuid, uuid, uuid
) from public;

grant execute on function public.import_commit_row(
  uuid, uuid, uuid, public.transaction_type, bigint, timestamptz, text, text,
  text, text, uuid, uuid, uuid
) to authenticated;
