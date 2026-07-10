alter table public.accounts
  add column if not exists institution_name text,
  add column if not exists last_four text check (last_four is null or last_four ~ '^[0-9]{1,4}$'),
  add column if not exists currency text not null default 'THB',
  add column if not exists is_default boolean not null default false,
  add column if not exists is_active boolean not null default true,
  add column if not exists notes text;

alter table public.accounts
  add constraint accounts_account_type_check
  check (
    account_type is null or account_type in (
      'bank_account',
      'cash',
      'credit_card',
      'e_wallet',
      'loan_account',
      'other'
    )
  ) not valid;

do $$
begin
  begin
    alter table public.accounts validate constraint accounts_account_type_check;
  exception
    when check_violation then
      raise notice 'accounts_account_type_check is not valid for existing data yet';
  end;
end $$;

update public.accounts
set last_four = account_last_four
where last_four is null
  and account_last_four is not null;

create unique index if not exists accounts_one_default_active_idx
  on public.accounts(user_id)
  where is_default and is_active;

create index if not exists accounts_user_active_idx
  on public.accounts(user_id, is_active, created_at desc);
