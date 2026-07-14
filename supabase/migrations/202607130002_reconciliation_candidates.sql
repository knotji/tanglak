-- Migration: AI Financial Autopilot Phase 2 -- reconciliation candidates
-- foundation (PR A: Smart Review & Reconciliation)
--
-- See docs/AUTOPILOT_PHASE2_RECONCILIATION.md for the full design. This
-- migration is purely additive: one new table and three new enum types.
-- It reuses the existing `public.autopilot_confidence_level` enum (added
-- by 202607130001_autopilot_action_audit_log.sql) for candidate
-- confidence rather than introducing a second confidence scale. No
-- existing table is altered, no existing row is rewritten, and no
-- historical migration file is modified.
--
-- Design decision -- why a new table instead of extending
-- `autopilot_actions`: that table's shape is single-entity
-- (`entity_id uuid`) and its lifecycle
-- (proposed -> validated/rejected -> executed/failed -> undone) models
-- one autopilot-authored write to one transaction. A reconciliation
-- candidate is fundamentally plural -- it names *multiple* source
-- transaction ids (a transfer pair, a duplicate pair, an
-- expense+refund pair) or a transaction plus one or more related debts
-- -- and, in PR A, is never executed at all. Overloading
-- `autopilot_actions` with a nullable transaction-array column and a
-- second, unrelated status/outcome vocabulary would make both tables
-- harder to reason about for no real benefit. A dedicated table keeps
-- each audit trail's semantics unambiguous.
--
-- Known limitation (documented, not fixed here): `source_transaction_ids`
-- and `related_debt_ids` are plain uuid arrays, not join-table rows --
-- Postgres cannot enforce a foreign key against array elements. This is
-- an acceptable PR A trade-off because every array element is written by
-- application code that already scoped the read to a single owning user
-- (see src/lib/reconciliation/reconciliation-scan.ts), not because it is
-- unimportant; a join-table refactor is called out as a candidate
-- improvement for a later phase in the design doc.
--
-- Grants: no explicit `grant ... to authenticated` statement is added
-- here, matching the precedent set by `autopilot_actions`
-- (202607130001), the most recently added table -- new tables rely on
-- this Supabase project's default-privilege wiring for the `public`
-- schema rather than the one-time catch-up grant in
-- 202607100007_data_api_grants.sql (which only covers tables that
-- predate that wiring).
--
-- Rollback: `drop table if exists public.reconciliation_candidates cascade;`
-- then `drop type if exists public.reconciliation_candidate_type;`,
-- `drop type if exists public.reconciliation_candidate_status;`,
-- `drop type if exists public.reconciliation_policy_outcome;`. Safe at
-- any point -- nothing else references this table or these types, and
-- confidence reuses the pre-existing `autopilot_confidence_level` enum
-- rather than adding a new one that something else might come to depend
-- on.

create type public.reconciliation_candidate_type as enum (
  'own_account_transfer',
  'possible_duplicate',
  'likely_debt_payment',
  'possible_refund'
);

create type public.reconciliation_candidate_status as enum (
  'proposed',
  'needs_review',
  'confirmed',
  'rejected',
  'invalidated'
);

create type public.reconciliation_policy_outcome as enum (
  'auto_match_safe',
  'suggest_with_notice',
  'require_confirmation',
  'reject_candidate'
);

-- Deterministic, non-executing candidate log. `evidence` and
-- `evidence_snapshots` only ever hold the bounded, structured shapes
-- produced by src/lib/reconciliation/*.ts (reason codes, and a narrow
-- per-transaction snapshot: type/amountSatang/occurredAt/merchant/
-- category/updatedAt) -- never a raw slip image, base64 blob,
-- credential, or unparsed extraction output. PR A never writes
-- `status` past 'proposed'/'needs_review', never mutates a debt, and
-- never creates/edits a transaction because of a row in this table --
-- see reconciliation-scan.ts.
create table public.reconciliation_candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  candidate_type public.reconciliation_candidate_type not null,
  status public.reconciliation_candidate_status not null default 'proposed',
  confidence public.autopilot_confidence_level not null default 'unknown',
  policy_outcome public.reconciliation_policy_outcome,
  requires_review boolean not null default true,
  source_transaction_ids uuid[] not null,
  related_debt_ids uuid[],
  evidence jsonb not null default '[]'::jsonb,
  evidence_snapshots jsonb not null default '[]'::jsonb,
  idempotency_key text not null,
  schema_version smallint not null default 1,
  invalidated_at timestamptz,
  invalidation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reconciliation_candidates_source_ids_nonempty check (array_length(source_transaction_ids, 1) > 0)
);

-- Idempotency, DB-enforced (in addition to the application-level
-- pre-check in reconciliation-candidates-repository.ts): the same user
-- can never have two *active* (non-invalidated) rows with the same
-- idempotency key, so a retried or concurrently overlapping scan can
-- race to insert but can never succeed twice for the same logical
-- candidate.
--
-- Deliberately scoped to `where status <> 'invalidated'` rather than an
-- unconditional unique index: the idempotency key is a pure function of
-- (user_id, candidate_type, source_transaction_ids, related_debt_ids)
-- and never changes for the lifetime of those ids, but a candidate's
-- *evidence* can go stale (see reconciliation-invalidation.ts) and get
-- marked `invalidated` while the underlying transactions still exist.
-- An unconditional unique index would then permanently block ever
-- creating a fresh active candidate for that same id pair -- a rescan
-- after invalidation would keep returning the stale invalidated row
-- forever. Scoping the index to active statuses lets a new row reuse
-- the same idempotency key once every prior row for that key has been
-- invalidated, while still preventing two active rows (and therefore
-- two duplicate concurrent scans) for the same key. Historical
-- invalidated rows are never deleted and keep their original key, so
-- the full lineage for a given transaction pair stays auditable via
-- `idempotency_key`.
create unique index reconciliation_candidates_user_idempotency_key_active_idx
  on public.reconciliation_candidates (user_id, idempotency_key)
  where status <> 'invalidated';

create index reconciliation_candidates_user_status_idx
  on public.reconciliation_candidates (user_id, status);

create index reconciliation_candidates_user_type_idx
  on public.reconciliation_candidates (user_id, candidate_type);

create index reconciliation_candidates_user_created_idx
  on public.reconciliation_candidates (user_id, created_at desc);

-- Supports "invalidate every candidate that references this transaction
-- id" lookups (see reconciliation-invalidation.ts) without a full table
-- scan.
create index reconciliation_candidates_source_ids_gin_idx
  on public.reconciliation_candidates using gin (source_transaction_ids);

alter table public.reconciliation_candidates enable row level security;

create trigger set_reconciliation_candidates_updated_at
  before update on public.reconciliation_candidates
  for each row execute function public.set_updated_at();

-- Users may only ever see, create, and update their own candidates.
-- Deliberately no delete policy at all -- with RLS enabled and no
-- matching policy, Postgres denies the operation by default, so a
-- candidate can only ever be soft-retired via `status =
-- 'invalidated'/'rejected'`, never hard-deleted by any authenticated
-- role. Mirrors the `autopilot_actions` append-only convention. No
-- `using (true)`/`with check (true)` anywhere, and no `for all` policy.
create policy "reconciliation_candidates_select_own"
  on public.reconciliation_candidates
  for select
  using (auth.uid() = user_id);

create policy "reconciliation_candidates_insert_own"
  on public.reconciliation_candidates
  for insert
  with check (auth.uid() = user_id);

create policy "reconciliation_candidates_update_own"
  on public.reconciliation_candidates
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
