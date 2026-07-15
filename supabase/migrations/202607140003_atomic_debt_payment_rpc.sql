-- Migration: Atomic debt payment recording via public.record_debt_payment
--
-- Problem: `addDebtPayment` (src/lib/data/finance-repository.ts) previously
-- performed a debt payment as three independent, non-transactional
-- round-trips against Supabase/PostgREST:
--   1. insert into public.transactions (via createTransaction), which also
--      triggers a client-side recalculation of amount_paid_this_cycle_satang
--   2. insert into public.debt_payments
--   3. a second, separate recalculation of amount_paid_this_cycle_satang
-- If step 2 or step 3 failed for any reason (transient network/DB error),
-- step 1 had already committed -- a confirmed debt_payment transaction
-- (already counted into the debt's paid-this-cycle total) would exist even
-- though the caller was told the payment failed. This is exactly the
-- "partial financial write" docs/agent/FINANCIAL_INVARIANTS.md rule 14
-- prohibits.
--
-- Fix: collapse the whole operation into a single `plpgsql` function so
-- Postgres's own transaction semantics guarantee all-or-nothing behavior --
-- an exception raised anywhere in the function body aborts every write it
-- made, exactly like `public.import_commit_row`
-- (202607110002_history_import_idempotency.sql /
-- 202607110010_require_import_debt_payment_link.sql), which this function
-- deliberately mirrors in structure and hardening:
--   - `security invoker` + `set search_path = public`, so RLS applies using
--     the caller's own JWT (auth.uid()), never a switched-to owner role.
--   - `select ... for update` locks the target debt row for the duration of
--     the transaction, so two concurrent payments against the same debt
--     serialize instead of racing on the paid-this-cycle recalculation.
--   - Ownership is re-validated against `p_user_id` (never trusts the
--     caller's claim without a WHERE ... and user_id = p_user_id lock).
--   - Locked Phase 1 rule (assertDebtActiveForPayment, debt-guards.ts):
--     only a debt in `active` status may receive a new payment. `deleted`
--     gets its own distinct error (matching assertDebtBelongsToUser's
--     existing "deleted debt cannot be changed" wording); `paid_off`,
--     `paused`, `overdue`, or any other non-`active` value is rejected with
--     a generic "debt is not active" error. This is enforced here even
--     though no current application code path can set status to `overdue`
--     -- the invariant is "only active", not "only active and not
--     deliberately excluded".
--   - Locked Phase 1 rule (assertDebtPaymentLinked): every debt_payment
--     transaction inserted by this function always carries the validated
--     p_debt_id -- there is no code path in this function that can insert
--     an unlinked debt_payment.
--   - Never touches outstanding_balance_satang. Only
--     amount_paid_this_cycle_satang is recalculated, and it is always a
--     full recompute from confirmed debt_payment transactions inside the
--     debt's own cycle window (falling back to the current Bangkok calendar
--     month when cycle_start_date/cycle_end_date are unset) -- never an
--     increment, never a lifetime total.
--   - occurred_at is always the caller-supplied, already-validated instant
--     -- this function never substitutes now()/clock_timestamp() or any
--     other fallback for it.
--
-- Idempotency: adds a nullable `debt_payments.idempotency_key` column with
-- a partial unique index on (user_id, idempotency_key) where the key is not
-- null. A caller that supplies a stable key (e.g. the source document id
-- for a slip confirmation, or a client-generated UUID kept stable across a
-- single form submission attempt for the manual "quick pay" flow) gets an
-- idempotent replay: calling this function twice with the same
-- (user_id, idempotency_key) returns the original transaction_id
-- (`already_recorded = true`) instead of validating or inserting again --
-- the same replay pattern `import_commit_row` already uses for its
-- (batch_id, row_id) key. The key is intentionally never derived from an
-- unstable value like paid_at/occurred_at or a server-generated timestamp.
--
-- Existing historical rows: this migration does not read, update, or delete
-- any existing row in `public.debt_payments` or `public.transactions`. The
-- new column is nullable and unconstrained for rows that predate it, so no
-- backfill is required; the partial unique index only ever applies to rows
-- that explicitly set a non-null key going forward.
--
-- Preflight (informational only -- this migration does not act on the
-- result): there is no pre-existing idempotency_key column, so there is
-- nothing to check for collisions before adding the partial unique index.
--
-- Rollback:
--   drop function if exists public.record_debt_payment(uuid, uuid, bigint, timestamptz, text);
--   drop index if exists public.debt_payments_user_idempotency_key_idx;
--   alter table public.debt_payments drop column if exists idempotency_key;
-- Purely additive -- no historical migration is modified and no existing
-- row is rewritten by this rollback.

alter table public.debt_payments
  add column if not exists idempotency_key text;

create unique index if not exists debt_payments_user_idempotency_key_idx
  on public.debt_payments (user_id, idempotency_key)
  where idempotency_key is not null;

create or replace function public.record_debt_payment(
  p_user_id uuid,
  p_debt_id uuid,
  p_amount_satang bigint,
  p_occurred_at timestamptz,
  p_idempotency_key text default null
)
returns table (transaction_id uuid, already_recorded boolean)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_debt public.debts%rowtype;
  v_existing public.debt_payments%rowtype;
  v_tx_id uuid;
  v_cycle_start date;
  v_cycle_end date;
begin
  if p_amount_satang is null or p_amount_satang <= 0 then
    raise exception 'debt payment amount must be positive' using errcode = 'P0001';
  end if;

  if p_occurred_at is null then
    raise exception 'debt payment occurred_at is required' using errcode = 'P0001';
  end if;

  -- Idempotent replay: a payment already recorded under this exact
  -- (user, idempotency_key) is returned as-is, never re-validated or
  -- re-inserted. Checked before the debt row is locked so a replay of an
  -- already-succeeded call never blocks on (or is blocked by) unrelated
  -- concurrent payments against the same debt.
  if p_idempotency_key is not null then
    select * into v_existing
    from public.debt_payments
    where user_id = p_user_id and idempotency_key = p_idempotency_key;

    if found then
      return query select v_existing.transaction_id, true;
      return;
    end if;
  end if;

  select * into v_debt
  from public.debts
  where id = p_debt_id and user_id = p_user_id
  for update;

  if not found then
    raise exception 'debt not found or not owned by user' using errcode = 'P0002';
  end if;

  if v_debt.status = 'deleted' then
    raise exception 'deleted debt cannot be changed' using errcode = 'P0001';
  end if;

  if v_debt.status <> 'active' then
    raise exception 'debt is not active' using errcode = 'P0001';
  end if;

  insert into public.transactions (
    user_id, type, status, amount_satang, currency, occurred_at, merchant,
    debt_id, source
  ) values (
    p_user_id, 'debt_payment', 'confirmed', p_amount_satang, 'THB',
    p_occurred_at, 'ชำระ ' || v_debt.name, p_debt_id, 'manual'
  )
  returning id into v_tx_id;

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

  update public.debts d
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
  where d.id = p_debt_id and d.user_id = p_user_id;

  return query select v_tx_id, false;
end;
$$;

revoke all on function public.record_debt_payment(uuid, uuid, bigint, timestamptz, text) from public;
grant execute on function public.record_debt_payment(uuid, uuid, bigint, timestamptz, text) to authenticated;
