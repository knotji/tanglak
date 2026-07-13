-- Migration: AI Financial Autopilot foundation -- audit log + category provenance
--
-- See docs/AUTOPILOT_FOUNDATION.md for the full architecture. This
-- migration is purely additive: one new table (the audit trail every
-- autopilot action lifecycle event is recorded to) and two new nullable
-- columns on the existing `transactions` table (category provenance, so a
-- user-chosen category can never be silently overwritten by automation).
-- No existing table is altered destructively, no existing row is
-- rewritten, and no historical migration file is modified.
--
-- Rollback: `drop table if exists public.autopilot_actions cascade;` and
-- `alter table public.transactions drop column if exists category_source,
-- drop column if exists category_confidence;`, then drop the five new enum
-- types below. Safe at any point -- nothing else references these columns
-- with a NOT NULL/foreign-key requirement, since transactions.category_id
-- already has independent NULL-tolerant semantics per
-- docs/MONTHLY_BUDGET_ENGINE.md.

create type public.autopilot_action_type as enum (
  'create_transaction',
  'update_transaction_category',
  'mark_internal_transfer',
  'ignore_duplicate_candidate'
);

create type public.autopilot_action_source as enum (
  'slip_import',
  'csv_import',
  'manual_text',
  'system_rule',
  'user_correction'
);

create type public.autopilot_action_status as enum (
  'proposed',
  'validated',
  'executed',
  'rejected',
  'failed',
  'undone'
);

create type public.autopilot_decision as enum (
  'auto_execute',
  'execute_with_notice',
  'require_confirmation',
  'reject'
);

create type public.autopilot_confidence_level as enum ('high', 'medium', 'low', 'unknown');

create type public.autopilot_risk_level as enum ('low', 'medium', 'high', 'irreversible');

-- Append-only audit trail for every autopilot action, from proposal
-- through execution/rejection/undo. `proposal_payload` and
-- `normalized_payload` only ever hold the structured action shape
-- produced by src/lib/autopilot/autopilot-action-schema.ts (parsed
-- numbers/strings/ids) -- never a raw slip image, base64 blob, or the
-- unparsed Gemini response. `previous_state`/`resulting_state` are
-- similarly a small structured snapshot of the affected transaction's
-- fields (used both for the explanation UI and to detect whether a
-- transaction was edited after auto-creation, for safe undo), not a full
-- row dump.
create table public.autopilot_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action_type public.autopilot_action_type not null,
  source public.autopilot_action_source not null,
  status public.autopilot_action_status not null default 'proposed',
  decision public.autopilot_decision,
  confidence public.autopilot_confidence_level not null default 'unknown',
  risk public.autopilot_risk_level not null default 'low',
  entity_type text not null default 'transaction',
  entity_id uuid,
  -- Deterministic fingerprint (source + slip/document reference + amount +
  -- normalized occurredAt + user) computed by the executor, so a retried
  -- request (network retry, double form submit) for the exact same
  -- proposal cannot execute twice, independent of any in-memory check.
  -- Nullable: only actions that reached execution get one.
  idempotency_key text,
  proposal_payload jsonb not null,
  normalized_payload jsonb,
  explanation text,
  validation_errors jsonb,
  previous_state jsonb,
  resulting_state jsonb,
  undo_payload jsonb,
  executed_at timestamptz,
  undone_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index autopilot_actions_user_created_idx on public.autopilot_actions (user_id, created_at desc);
create index autopilot_actions_entity_idx on public.autopilot_actions (user_id, entity_type, entity_id);
create unique index autopilot_actions_user_idempotency_key_idx
  on public.autopilot_actions (user_id, idempotency_key)
  where idempotency_key is not null;

alter table public.autopilot_actions enable row level security;

create trigger set_autopilot_actions_updated_at
  before update on public.autopilot_actions
  for each row execute function public.set_updated_at();

-- Users may only ever see and create their own audit records. Deliberately
-- no delete policy at all -- with RLS enabled and no matching policy,
-- Postgres denies the operation by default, so audit rows cannot be
-- deleted by any authenticated user, preserving the audit trail's
-- append-only guarantee. Only a service-role key (never exposed to
-- Gemini or the client) could delete rows, and no application code does.
create policy "autopilot_actions_select_own"
  on public.autopilot_actions for select
  using (auth.uid() = user_id);

create policy "autopilot_actions_insert_own"
  on public.autopilot_actions for insert
  with check (auth.uid() = user_id);

create policy "autopilot_actions_update_own"
  on public.autopilot_actions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Category provenance on transactions -- both columns nullable so every
-- existing row remains valid with no backfill required. NULL means
-- "provenance unknown / predates this feature", which the application
-- treats as non-manual (safe to categorize/recategorize later), never as
-- an error.
alter table public.transactions
  add column if not exists category_source text
    check (category_source is null or category_source in ('manual', 'user_correction', 'learned_rule', 'merchant_rule', 'ai', 'default')),
  add column if not exists category_confidence numeric(4,3)
    check (category_confidence is null or category_confidence between 0 and 1);
