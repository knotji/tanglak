grant usage on schema public to authenticated;

grant select, insert, update, delete on table
  public.profiles,
  public.accounts,
  public.categories,
  public.transactions,
  public.transaction_items,
  public.documents,
  public.document_extractions,
  public.debts,
  public.debt_schedules,
  public.debt_payments,
  public.monthly_budgets,
  public.budget_categories,
  public.recurring_expenses,
  public.reminders,
  public.ai_insights,
  public.duplicate_candidates,
  public.import_batches,
  public.import_rows
to authenticated;