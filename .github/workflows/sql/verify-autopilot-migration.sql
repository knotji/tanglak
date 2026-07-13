\set ON_ERROR_STOP on

select 'transactions.category_source exists' as check_name
where exists (
  select 1 from information_schema.columns
  where table_schema = 'public'
    and table_name = 'transactions'
    and column_name = 'category_source'
);

select 'transactions.category_confidence exists' as check_name
where exists (
  select 1 from information_schema.columns
  where table_schema = 'public'
    and table_name = 'transactions'
    and column_name = 'category_confidence'
);

select 'autopilot_actions table exists' as check_name
where to_regclass('public.autopilot_actions') is not null;

select 'autopilot_actions RLS enabled' as check_name
where exists (
  select 1 from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'autopilot_actions'
    and c.relrowsecurity
);

select 'autopilot_actions user/created_at index exists' as check_name
where to_regclass('public.autopilot_actions_user_created_at_idx') is not null;

select 'autopilot_actions user/entity index exists' as check_name
where to_regclass('public.autopilot_actions_user_entity_idx') is not null;

select 'autopilot_actions idempotency unique index exists' as check_name
where to_regclass('public.autopilot_actions_user_idempotency_key_idx') is not null;

select 'autopilot_actions select policy exists' as check_name
where exists (
  select 1 from pg_policies
  where schemaname = 'public'
    and tablename = 'autopilot_actions'
    and cmd = 'SELECT'
);

select 'autopilot_actions insert policy exists' as check_name
where exists (
  select 1 from pg_policies
  where schemaname = 'public'
    and tablename = 'autopilot_actions'
    and cmd = 'INSERT'
);

select 'autopilot_actions update policy exists' as check_name
where exists (
  select 1 from pg_policies
  where schemaname = 'public'
    and tablename = 'autopilot_actions'
    and cmd = 'UPDATE'
);

select 'autopilot_actions has no delete/all policy' as check_name
where not exists (
  select 1 from pg_policies
  where schemaname = 'public'
    and tablename = 'autopilot_actions'
    and cmd in ('DELETE', 'ALL')
);
