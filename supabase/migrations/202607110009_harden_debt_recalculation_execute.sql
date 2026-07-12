-- Migration: Harden public.recalculate_debt_paid_this_cycle execution
--
-- See docs/SLIP_DEBT_IMPLEMENTATION_FINDINGS.md F-008. `recalculate_debt_paid_
-- this_cycle(uuid)` (defined in 202607110007_debt_cycle_fields.sql) is
-- `security definer` with no explicit grant/revoke statements. Postgres
-- grants EXECUTE on newly created functions to PUBLIC by default, so this
-- function was directly callable by any authenticated (and, since Supabase
-- exposes every public-schema function over PostgREST, even anonymous)
-- caller supplying an arbitrary debt UUID -- a cross-user RLS-bypass write
-- surface, even though the recomputed value itself is never
-- attacker-controlled.
--
-- Two things this function's existing callers need preserved:
--   1. public.import_commit_row(...) and public.import_rollback_batch(...)
--      (both 202607110007, both `security invoker`) call this function with
--      `perform public.recalculate_debt_paid_this_cycle(...)` from inside
--      their own bodies. Because they are `security invoker`, that nested
--      call's EXECUTE privilege is checked against the original calling
--      role (`authenticated`), not a switched-to owner role. Revoking
--      EXECUTE from `authenticated` would break both import commit and
--      rollback.
--   2. The application layer's `recalculateDebtPaidThisCycle` TypeScript
--      helper (src/lib/data/finance-repository.ts) does NOT call this RPC at
--      all -- it recomputes and writes directly through the Supabase client,
--      scoped by an explicit `.eq("user_id", userId)` filter plus table RLS.
--      This SQL function is therefore only meant to be reached from the two
--      trusted import RPCs above, never directly by app code.
--
-- Because `authenticated` must keep EXECUTE for (1) to keep working, this
-- migration takes the task's documented alternative to a blanket revoke:
-- keep the grant to `authenticated`, explicitly revoke from PUBLIC (closing
-- the anonymous/any-other-role gap that existed before), and add an
-- in-function ownership check so a direct call by an authenticated user
-- supplying someone else's debt UUID is rejected. When
-- import_commit_row/import_rollback_batch call this function, they have
-- already validated the debt belongs to p_user_id, and p_user_id is the
-- same authenticated caller (requireUser().id passed straight through from
-- the app layer) -- so auth.uid() equals the debt owner in that trusted
-- path and the new check is a no-op for it. `search_path` is already
-- pinned to `public` in the existing definition; unchanged here.
--
-- If `auth.uid()` is null (a service-role/administrative context that
-- doesn't carry a JWT), the ownership check is skipped -- this mirrors how
-- RLS policies elsewhere in this schema already treat the service role as
-- trusted, and no migration in this repo grants this function to `anon` or
-- any broader role.
--
-- Preflight: not applicable -- this migration only replaces a function body
-- and adjusts grants; it reads and writes no table rows.
--
-- Rollback: re-run the original `create or replace function
-- public.recalculate_debt_paid_this_cycle` body from
-- 202607110007_debt_cycle_fields.sql (drops the ownership check) and
-- `grant execute on function public.recalculate_debt_paid_this_cycle(uuid)
-- to public;` to restore the previous (unhardened) grant. Not recommended --
-- documented here only for completeness.
--
-- This migration is additive only. 202607110007 and 202607110008 are not
-- modified, and no table row is read or rewritten.

create or replace function public.recalculate_debt_paid_this_cycle(target_debt_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_start_date date;
  v_end_date date;
begin
  select
    d.user_id,
    coalesce(d.cycle_start_date, date_trunc('month', now() at time zone 'Asia/Bangkok')::date),
    coalesce(
      d.cycle_end_date,
      (date_trunc('month', now() at time zone 'Asia/Bangkok') + interval '1 month - 1 day')::date
    )
  into v_user_id, v_start_date, v_end_date
  from public.debts d
  where d.id = target_debt_id;

  if not found then
    return;
  end if;

  -- Reject any caller (direct or nested) whose JWT identity does not own
  -- this debt. auth.uid() is null for service-role/administrative
  -- contexts that carry no JWT -- those are left unrestricted, matching
  -- how this schema's RLS policies already treat the service role.
  if auth.uid() is not null and auth.uid() <> v_user_id then
    raise exception 'debt not found or not owned by user' using errcode = 'P0002';
  end if;

  update public.debts d
  set amount_paid_this_cycle_satang = coalesce((
    select sum(t.amount_satang)
    from public.transactions t
    where t.user_id = v_user_id
      and t.debt_id = target_debt_id
      and t.type = 'debt_payment'
      and t.status = 'confirmed'
      and t.occurred_at >= (v_start_date::timestamp at time zone 'Asia/Bangkok')
      and t.occurred_at < ((v_end_date + 1)::timestamp at time zone 'Asia/Bangkok')
  ), 0)
  where d.id = target_debt_id and d.user_id = v_user_id;
end;
$$;

revoke all on function public.recalculate_debt_paid_this_cycle(uuid) from public;
grant execute on function public.recalculate_debt_paid_this_cycle(uuid) to authenticated;
