create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create type public.transaction_type as enum ('income', 'expense', 'debt_payment', 'transfer', 'refund');
create type public.transaction_status as enum ('draft', 'needs_review', 'confirmed', 'rejected');
create type public.transaction_source as enum ('manual', 'salary_slip', 'transfer_slip', 'receipt', 'delivery_screenshot', 'statement', 'ai_extraction');
create type public.document_status as enum ('uploaded', 'processing', 'needs_review', 'confirmed', 'failed');
create type public.debt_type as enum ('credit_card', 'personal_loan', 'installment', 'mortgage', 'auto_loan', 'buy_now_pay_later', 'informal_loan', 'other');
create type public.debt_status as enum ('active', 'paid_off', 'overdue', 'paused');
create type public.debt_payment_mode as enum ('fixed_monthly', 'variable_monthly', 'installment', 'one_time');
create type public.debt_schedule_status as enum ('upcoming', 'partial', 'paid', 'overdue');
create type public.reminder_status as enum ('scheduled', 'shown', 'dismissed', 'completed');

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text,
  preferred_currency text not null default 'THB',
  timezone text not null default 'Asia/Bangkok',
  salary_day int check (salary_day between 1 and 31),
  typical_monthly_income_satang bigint,
  preferred_reminder_days int[] not null default array[7,3,1],
  has_debts boolean not null default false,
  wants_budget_guidance boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  account_type text,
  is_owned_by_user boolean not null default true,
  account_last_four text check (account_last_four ~ '^[0-9]{4}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  kind transaction_type not null,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status document_status not null default 'uploaded',
  document_type text,
  storage_bucket text not null default 'financial-documents',
  storage_path text not null,
  original_filename text,
  mime_type text not null,
  file_size_bytes bigint not null check (file_size_bytes > 0 and file_size_bytes <= 15000000),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  creditor text,
  debt_type debt_type not null default 'other',
  payment_mode debt_payment_mode not null default 'variable_monthly',
  original_amount_satang bigint,
  outstanding_balance_satang bigint,
  statement_balance_satang bigint,
  amount_due_satang bigint,
  minimum_payment_satang bigint,
  amount_paid_this_cycle_satang bigint not null default 0,
  due_date date,
  recurring_due_day int check (recurring_due_day between 1 and 31),
  interest_rate_annual numeric(6,3),
  remaining_installments int,
  status debt_status not null default 'active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type transaction_type not null,
  status transaction_status not null default 'draft',
  amount_satang bigint not null check (amount_satang >= 0),
  currency text not null default 'THB',
  occurred_at timestamptz not null,
  merchant text,
  category_id uuid references public.categories(id) on delete set null,
  source_account_id uuid references public.accounts(id) on delete set null,
  destination_account_id uuid references public.accounts(id) on delete set null,
  debt_id uuid references public.debts(id) on delete set null,
  document_id uuid references public.documents(id) on delete set null,
  reference_number text,
  payment_method text,
  source transaction_source not null,
  confidence numeric(4,3) check (confidence between 0 and 1),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.transaction_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  name text not null,
  quantity numeric(12,3),
  amount_satang bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.document_extractions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  model text not null,
  raw_output jsonb not null,
  normalized_preview jsonb not null,
  confidence numeric(4,3) check (confidence between 0 and 1),
  warnings text[] not null default '{}',
  unclear_fields text[] not null default '{}',
  requires_review boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint extraction_requires_review check (requires_review = true)
);

create table public.debt_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  debt_id uuid not null references public.debts(id) on delete cascade,
  installment_number int,
  due_date date not null,
  amount_due_satang bigint not null,
  amount_paid_satang bigint not null default 0,
  status debt_schedule_status not null default 'upcoming',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.debt_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  debt_id uuid not null references public.debts(id) on delete cascade,
  transaction_id uuid references public.transactions(id) on delete set null,
  amount_satang bigint not null,
  paid_at timestamptz not null,
  document_id uuid references public.documents(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.monthly_budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month text not null,
  income_satang bigint not null default 0,
  strategy text not null default 'minimum_first',
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, month)
);

create table public.budget_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  monthly_budget_id uuid not null references public.monthly_budgets(id) on delete cascade,
  label text not null,
  amount_satang bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  amount_satang bigint not null,
  due_day int check (due_day between 1 and 31),
  category_id uuid references public.categories(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  debt_id uuid references public.debts(id) on delete cascade,
  reminder_date date not null,
  reason text not null,
  status reminder_status not null default 'scheduled',
  shown_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ai_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  insight_date date not null default current_date,
  metric_payload jsonb not null,
  message text not null,
  next_action text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.duplicate_candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  incoming_transaction_id uuid not null references public.transactions(id) on delete cascade,
  existing_transaction_id uuid not null references public.transactions(id) on delete cascade,
  score int not null check (score between 0 and 100),
  reasons text[] not null default '{}',
  resolved_at timestamptz,
  resolution text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index transactions_user_occurred_at_idx on public.transactions (user_id, occurred_at desc);
create index debts_user_due_date_idx on public.debts (user_id, due_date);
create index reminders_user_date_idx on public.reminders (user_id, reminder_date);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles','accounts','categories','transactions','transaction_items',
    'documents','document_extractions','debts','debt_schedules','debt_payments',
    'monthly_budgets','budget_categories','recurring_expenses','reminders',
    'ai_insights','duplicate_candidates'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('create trigger set_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()', table_name, table_name);
    execute format('create policy "%I_select_own" on public.%I for select using (auth.uid() = user_id)', table_name, table_name);
    execute format('create policy "%I_insert_own" on public.%I for insert with check (auth.uid() = user_id)', table_name, table_name);
    execute format('create policy "%I_update_own" on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', table_name, table_name);
    execute format('create policy "%I_delete_own" on public.%I for delete using (auth.uid() = user_id)', table_name, table_name);
  end loop;
end $$;

drop policy "categories_select_own" on public.categories;
create policy "categories_select_own_or_system"
on public.categories for select
using (auth.uid() = user_id or is_system = true);

insert into storage.buckets (id, name, public)
values ('financial-documents', 'financial-documents', false),
       ('profile-assets', 'profile-assets', false)
on conflict (id) do nothing;

create policy "financial_documents_read_own"
on storage.objects for select
using (
  bucket_id = 'financial-documents'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "financial_documents_insert_own"
on storage.objects for insert
with check (
  bucket_id = 'financial-documents'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "financial_documents_delete_own"
on storage.objects for delete
using (
  bucket_id = 'financial-documents'
  and auth.uid()::text = (storage.foldername(name))[1]
);

insert into public.categories (name, kind, is_system)
values
  ('อาหาร', 'expense', true),
  ('เดลิเวอรี', 'expense', true),
  ('เดินทาง', 'expense', true),
  ('ที่พัก', 'expense', true),
  ('ช้อปปิ้ง', 'expense', true),
  ('สุขภาพ', 'expense', true),
  ('Subscription', 'expense', true),
  ('ครอบครัว', 'expense', true),
  ('หนี้สิน', 'debt_payment', true),
  ('อื่น ๆ', 'expense', true);
