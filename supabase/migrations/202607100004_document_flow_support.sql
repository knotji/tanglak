alter table public.transactions
add column if not exists account_last_four text check (account_last_four ~ '^[0-9]{4}$'),
add column if not exists destination_account_last_four text check (destination_account_last_four ~ '^[0-9]{4}$'),
add column if not exists bank text;
