alter table public.profiles
add column if not exists onboarding_completed boolean not null default false;

alter table public.debts
add column if not exists paid_off_at timestamptz,
add column if not exists reopened_at timestamptz;

create or replace function public.recalculate_debt_paid_this_cycle(target_debt_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.debts d
  set amount_paid_this_cycle_satang = coalesce((
    select sum(t.amount_satang)
    from public.transactions t
    where t.debt_id = target_debt_id
      and t.type = 'debt_payment'
      and t.status = 'confirmed'
  ), 0)
  where d.id = target_debt_id;
end;
$$;
