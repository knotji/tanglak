-- Migration: Debt active-cycle planning fields and recalculation semantics
--
-- Additive only. Historical migrations are left untouched; existing rows keep
-- NULL cycle fields and therefore fall back to the current Bangkok month for
-- paid-this-cycle calculations.

alter table public.debts
add column if not exists cycle_start_date date,
add column if not exists cycle_end_date date,
add column if not exists statement_date date,
add column if not exists credit_limit_satang bigint;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'debts_cycle_date_order'
      and conrelid = 'public.debts'::regclass
  ) then
    alter table public.debts
      add constraint debts_cycle_date_order
      check (cycle_start_date is null or cycle_end_date is null or cycle_start_date <= cycle_end_date)
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'debts_credit_limit_nonnegative'
      and conrelid = 'public.debts'::regclass
  ) then
    alter table public.debts
      add constraint debts_credit_limit_nonnegative
      check (credit_limit_satang is null or credit_limit_satang >= 0)
      not valid;
  end if;
end $$;

create index if not exists transactions_user_debt_type_status_occurred_idx
  on public.transactions (user_id, debt_id, type, status, occurred_at)
  where debt_id is not null;

create or replace function public.recalculate_debt_paid_this_cycle(target_debt_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_start_date date;
  v_end_date date;
begin
  select
    d.user_id,
    coalesce(d.cycle_start_date, date_trunc('month', now() at time zone 'Asia/Bangkok')::date),
    coalesce(
      d.cycle_end_date,
      (date_trunc('month', now() at time zone 'Asia/Bangkok') + interval '1 month - 1 day')::date
    )
  into v_user_id, v_start_date, v_end_date
  from public.debts d
  where d.id = target_debt_id;

  if not found then
    return;
  end if;

  update public.debts d
  set amount_paid_this_cycle_satang = coalesce((
    select sum(t.amount_satang)
    from public.transactions t
    where t.user_id = v_user_id
      and t.debt_id = target_debt_id
      and t.type = 'debt_payment'
      and t.status = 'confirmed'
      and t.occurred_at >= (v_start_date::timestamp at time zone 'Asia/Bangkok')
      and t.occurred_at < ((v_end_date + 1)::timestamp at time zone 'Asia/Bangkok')
  ), 0)
  where d.id = target_debt_id and d.user_id = v_user_id;
end;
$$;

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
  v_debt_id uuid;
begin
  select status into v_status
  from public.import_batches
  where id = p_batch_id and user_id = p_user_id
  for update;

  if not found then
    raise exception 'import batch not found or not owned by user' using errcode = 'P0002';
  end if;

  if v_status = 'rolled_back' then
    return;
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
    foreach v_debt_id in array v_affected_debt_ids loop
      perform public.recalculate_debt_paid_this_cycle(v_debt_id);
    end loop;
  end if;

  update public.import_batches
  set status = 'rolled_back', imported_rows = 0, skipped_rows = 0, rolled_back_at = now()
  where id = p_batch_id and user_id = p_user_id;
end;
$$;

revoke all on function public.import_rollback_batch(uuid, uuid) from public;
grant execute on function public.import_rollback_batch(uuid, uuid) to authenticated;
