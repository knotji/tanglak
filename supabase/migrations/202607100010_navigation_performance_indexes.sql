create index if not exists transactions_user_type_occurred_at_idx
  on public.transactions(user_id, type, occurred_at desc);

create index if not exists debts_user_status_due_date_idx
  on public.debts(user_id, status, due_date);

create index if not exists monthly_budgets_user_month_idx
  on public.monthly_budgets(user_id, month);

create index if not exists import_batches_user_created_at_idx
  on public.import_batches(user_id, created_at desc);
