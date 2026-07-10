-- Migration: Support history statements import batch staging flow

-- 1. Add enum value to transaction_source (cannot run add value inside a transaction block in some postgres versions, but works in migrations)
alter type public.transaction_source add value if not exists 'history_import';

-- 2. Create import batch statuses and types
create type public.import_batch_status as enum ('uploaded', 'processing', 'needs_review', 'partially_imported', 'completed', 'failed', 'rolled_back');
create type public.import_row_direction as enum ('credit', 'debit', 'unknown');
create type public.import_row_status as enum ('ready', 'needs_review', 'possible_duplicate', 'possible_transfer', 'possible_debt_payment', 'invalid', 'skipped', 'imported');
create type public.import_row_decision as enum ('import', 'merge_existing', 'skip', 'unresolved');

-- 3. Create public.import_batches table
create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null,
  source_name text,
  account_id uuid references public.accounts(id) on delete set null,
  original_filename text,
  storage_path text not null,
  mime_type text not null,
  file_size bigint not null check (file_size > 0),
  period_start date,
  period_end date,
  statement_date date,
  status public.import_batch_status not null default 'uploaded',
  total_rows int not null default 0,
  parsed_rows int not null default 0,
  ready_rows int not null default 0,
  duplicate_rows int not null default 0,
  review_rows int not null default 0,
  skipped_rows int not null default 0,
  imported_rows int not null default 0,
  failed_rows int not null default 0,
  parser_name text,
  parser_version text,
  model_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  rolled_back_at timestamptz
);

-- 4. Create public.import_rows staging table
create table public.import_rows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  import_batch_id uuid not null references public.import_batches(id) on delete cascade,
  source_row_index int not null,
  raw_text text,
  raw_data jsonb,
  occurred_at timestamptz not null,
  posted_at timestamptz,
  description text not null,
  merchant text,
  amount_satang bigint not null,
  direction public.import_row_direction not null default 'unknown',
  running_balance_satang bigint,
  currency text not null default 'THB',
  reference_number text,
  source_account_last_four text check (source_account_last_four ~ '^[0-9]{4}$' or source_account_last_four is null),
  destination_account_last_four text check (destination_account_last_four ~ '^[0-9]{4}$' or destination_account_last_four is null),
  suggested_transaction_type public.transaction_type,
  suggested_category text,
  suggested_debt_id uuid references public.debts(id) on delete set null,
  suggested_account_id uuid references public.accounts(id) on delete set null,
  confidence numeric(4,3) check (confidence between 0 and 1),
  duplicate_score int not null default 0,
  duplicate_transaction_id uuid references public.transactions(id) on delete set null,
  review_status public.import_row_status not null default 'needs_review',
  import_decision public.import_row_decision not null default 'unresolved',
  validation_warnings text[] not null default '{}',
  created_transaction_id uuid references public.transactions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 5. Modify public.transactions to support links to batch and row staging reference
alter table public.transactions
  add column import_batch_id uuid references public.import_batches(id) on delete set null,
  add column import_row_id uuid references public.import_rows(id) on delete set null,
  add column is_historical boolean not null default false;

-- 6. Enable Row Level Security (RLS)
alter table public.import_batches enable row level security;
alter table public.import_rows enable row level security;

-- 7. Define RLS Policies
create policy "Users can perform all actions on their own import batches"
  on public.import_batches
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can perform all actions on their own import rows"
  on public.import_rows
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 8. Triggers for updated_at
create trigger set_updated_at_import_batches
  before update on public.import_batches
  for each row execute function public.set_updated_at();

create trigger set_updated_at_import_rows
  before update on public.import_rows
  for each row execute function public.set_updated_at();

-- 9. Add indices for performant querying and duplicate check mapping
create index idx_import_rows_batch_id on public.import_rows(import_batch_id);
create index idx_import_rows_user_occurred on public.import_rows(user_id, occurred_at);
create index idx_transactions_import_batch_id on public.transactions(import_batch_id);
