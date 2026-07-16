-- Migration: Fix record_debt_payment race, payable statuses, and post-commit reads
--
-- This replaces `public.record_debt_payment` (introduced in
-- 202607140003_atomic_debt_payment_rpc.sql, already applied to production)
-- with a corrected version. Three real defects in the original function,
-- confirmed against a live report of debt-payment confirmation failing in
-- production:
--
-- 1. Idempotency-check-before-lock race. The original function checked
--    `debt_payments` for an existing row with the same
--    (user_id, idempotency_key) BEFORE acquiring `select ... for update` on
--    the target debt. Two concurrent calls carrying the same idempotency
--    key (e.g. a slow network causing the client or a retry to resubmit the
--    same slip confirmation, which always reuses a document-id-derived key)
--    could both pass the "not recorded yet" check before either committed,
--    then both attempt to insert into `debt_payments` -- the loser hit the
--    partial unique index's `unique_violation`, an error this function
--    never mapped, which the TypeScript layer's `mapRecordDebtPaymentError`
--    then reported as a generic "payment failed" message even though the
--    winner's payment had, in fact, been recorded.
--    Fix: lock the debt row FIRST, then check for a replay. Every call site
--    generates its idempotency key per specific (debt, attempt) pair, so
--    two calls sharing a key always target the same debt and are therefore
--    always serialized by this lock -- the second caller blocks until the
--    first commits, then sees the first call's committed row on its own
--    replay check and returns it cleanly instead of racing.
--
-- 2. Overly strict payable-status check. The original function rejected
--    any debt whose status was not exactly `active`, including `overdue`.
--    But `overdue` is a real, reachable persisted status the rest of the
--    product already treats as still payable (see
--    `ACTIVE_DEBT_STATUSES = ["active", "overdue"]` in
--    src/lib/reconciliation/likely-debt-payment.ts) -- an overdue debt is
--    still open, just past its due date, not closed. `paid_off` and
--    `paused` remain rejected (a payment must never reopen a closed debt),
--    and `deleted` keeps its own distinct error.
--
-- 3. Fallible post-commit reads reported as payment failure. After this
--    function committed, the TypeScript wrapper (`addDebtPayment`) issued
--    two separate follow-up SELECTs (`getTransactionById`,
--    `getDebtRecordForUser`) to build the object it returns to the caller.
--    If either of those reads failed for any reason (a transient
--    network/DB blip, unrelated to the payment itself), the caller was
--    told the payment failed even though it had already committed --
--    exactly the "financial write succeeded but user is told otherwise"
--    class of bug docs/agent/FINANCIAL_INVARIANTS.md rule 14 exists to
--    prevent.
--    Fix: this function now returns the fully committed transaction and
--    debt rows (as `jsonb`, via `to_jsonb`) directly in its result, so the
--    TypeScript layer maps them straight from the RPC response and no
--    longer needs any follow-up read for the primary payment write.
--
-- Everything else about the function is unchanged from 202607140003:
-- `security invoker` + `set search_path = public`, ownership re-validated
-- against `p_user_id`, `debt_id` always present on the inserted
-- `debt_payment`, `outstanding_balance_satang` is never touched,
-- `amount_paid_this_cycle_satang` is always a full recompute over the
-- debt's cycle window, and `occurred_at` is always the caller-supplied,
-- already-validated instant.
--
-- Return-shape change: this function's `returns table (...)` column list
-- changed (two columns added), which Postgres does not allow via
-- `create or replace function` -- the function must be dropped and
-- recreated. This does not affect any other object: nothing else in the
-- schema references `record_debt_payment`'s return columns, and no
-- historical migration is modified.
--
-- Existing historical rows: this migration does not read, update, or
-- delete any row in any table. It only replaces a function body.
--
-- Preflight: not applicable -- no table row is read or written by applying
-- this migration.
--
-- Rollback: re-run the `create or replace function public.record_debt_payment`
-- body from 202607140003_atomic_debt_payment_rpc.sql after first running
-- `drop function if exists public.record_debt_payment(uuid, uuid, bigint, timestamptz, text);`
-- (the return-shape change means the old 2-column version cannot be restored
-- via `create or replace` either). Not recommended -- this would reintroduce
-- the race and post-commit-read defects described above.

drop function if exists public.record_debt_payment(uuid, uuid, bigint, timestamptz, text);

create function public.record_debt_payment(
  p_user_id uuid,
  p_debt_id uuid,
  p_amount_satang bigint,
  p_occurred_at timestamptz,
  p_idempotency_key text default null
)
returns table (
  transaction_id uuid,
  already_recorded boolean,
  transaction_row jsonb,
  debt_row jsonb
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_debt public.debts%rowtype;
  v_existing public.debt_payments%rowtype;
  v_tx_id uuid;
  v_tx_row jsonb;
  v_debt_row jsonb;
  v_cycle_start date;
  v_cycle_end date;
begin
  if p_amount_satang is null or p_amount_satang <= 0 then
    raise exception 'debt payment amount must be positive' using errcode = 'P0001';
  end if;

  if p_occurred_at is null then
    raise exception 'debt payment occurred_at is required' using errcode = 'P0001';
  end if;

  -- Lock the target debt row before doing anything else -- including the
  -- idempotency replay check. See defect (1) above for why this ordering
  -- matters.
  select * into v_debt
  from public.debts
  where id = p_debt_id and user_id = p_user_id
  for update;

  if not found then
    raise exception 'debt not found or not owned by user' using errcode = 'P0002';
  end if;

  if p_idempotency_key is not null then
    select * into v_existing
    from public.debt_payments
    where user_id = p_user_id and idempotency_key = p_idempotency_key;

    if found then
      select to_jsonb(t.*) into v_tx_row from public.transactions t where t.id = v_existing.transaction_id;
      select to_jsonb(d.*) into v_debt_row from public.debts d where d.id = p_debt_id;
      return query select v_existing.transaction_id, true, v_tx_row, v_debt_row;
      return;
    end if;
  end if;

  if v_debt.status = 'deleted' then
    raise exception 'deleted debt cannot be changed' using errcode = 'P0001';
  end if;

  -- Payable statuses: `active` and `overdue` (see defect (2) above).
  -- `paid_off` and `paused` are rejected -- a payment must never reopen a
  -- closed debt.
  if v_debt.status not in ('active', 'overdue') then
    raise exception 'debt is not active' using errcode = 'P0001';
  end if;

  insert into public.transactions as t (
    user_id, type, status, amount_satang, currency, occurred_at, merchant,
    debt_id, source
  ) values (
    p_user_id, 'debt_payment', 'confirmed', p_amount_satang, 'THB',
    p_occurred_at, 'ชำระ ' || v_debt.name, p_debt_id, 'manual'
  )
  returning t.id, to_jsonb(t.*) into v_tx_id, v_tx_row;

  insert into public.debt_payments (
    user_id, debt_id, transaction_id, amount_satang, paid_at, idempotency_key
  ) values (
    p_user_id, p_debt_id, v_tx_id, p_amount_satang, p_occurred_at, p_idempotency_key
  );

  v_cycle_start := coalesce(v_debt.cycle_start_date, date_trunc('month', now() at time zone 'Asia/Bangkok')::date);
  v_cycle_end := coalesce(
    v_debt.cycle_end_date,
    (date_trunc('month', now() at time zone 'Asia/Bangkok') + interval '1 month - 1 day')::date
  );

  update public.debts as d
  set amount_paid_this_cycle_satang = coalesce((
    select sum(t.amount_satang)
    from public.transactions t
    where t.user_id = p_user_id
      and t.debt_id = p_debt_id
      and t.type = 'debt_payment'
      and t.status = 'confirmed'
      and t.occurred_at >= (v_cycle_start::timestamp at time zone 'Asia/Bangkok')
      and t.occurred_at < ((v_cycle_end + 1)::timestamp at time zone 'Asia/Bangkok')
  ), 0)
  where d.id = p_debt_id and d.user_id = p_user_id
  returning to_jsonb(d.*) into v_debt_row;

  return query select v_tx_id, false, v_tx_row, v_debt_row;
end;
$$;

revoke all on function public.record_debt_payment(uuid, uuid, bigint, timestamptz, text) from public;
grant execute on function public.record_debt_payment(uuid, uuid, bigint, timestamptz, text) to authenticated;
