# Reusable Release Handoff Prompt

This document contains a self-contained, copy-pasteable handoff prompt that can be used to instruct any future coding agent with terminal access to execute the database upgrade and code merge.

---

## Handoff Prompt Content

Copy and paste the markdown block below into the next agent's prompt input to initiate deployment execution:

```markdown
You are a database deployment and release execution agent working on TangLak.

### Goal
Deploy the five pending database migrations, perform schema verification, and merge the feature branch into master.

---

### Phase 1 — Environment Verification
1. Open the repository at `C:\Project\tanglak`.
2. Inspect the active worktree `C:\Project\tanglak-slip-debt-pivot`.
3. Verify that the branch is `feat/slip-first-debt-planning` and the HEAD commit is exactly `b6e4ab76f1c57832f2cde9d528b73ba79d00f6bb`.
4. Run `git status` in `C:\Project\tanglak-slip-debt-pivot` and confirm the worktree is completely clean.
5. If any condition differs, **STOP** and report.

---

### Phase 2 — Migration Preflight Checks
Run the following SQL queries against the live database before applying migrations. Report the results to the user.

```sql
-- 1. Baseline Row Counts
select 
  (select count(*) from public.debts) as total_debts,
  (select count(*) from public.transactions) as total_transactions,
  (select count(*) from public.import_rows) as total_import_rows;

-- 2. Check for violating interest rates
select id, interest_rate_annual from public.debts
where interest_rate_annual is not null and (interest_rate_annual < 0 or interest_rate_annual > 100);

-- 3. Check for cycle order violations
select id, cycle_start_date, cycle_end_date from public.debts
where cycle_start_date is not null and cycle_end_date is not null and cycle_start_date > cycle_end_date;

-- 4. Check for negative credit limits
select id, credit_limit_satang from public.debts
where credit_limit_satang is not null and credit_limit_satang < 0;

-- 5. Check minimum payment vs outstanding balance
select id, name, minimum_payment_satang, outstanding_balance_satang
from public.debts
where minimum_payment_satang is not null and outstanding_balance_satang is not null
  and minimum_payment_satang > outstanding_balance_satang;

-- 6. Count unlinked historical payments (allowed to remain, just report count)
select count(*) as unlinked_debt_payments
from public.transactions
where type = 'debt_payment' and debt_id is null;
```

#### Preflight Stop Rules:
*   If check **(2)** returns any rows, **STOP** and report.
*   If check **(3)** returns any rows, **STOP** and report.
*   If check **(4)** returns any rows, **STOP** and report.
*   If check **(5)** returns any rows, **STOP**. Do not apply migrations. Remediate these rows manually before proceeding. Do not delete or auto-clamp.

---

### Phase 3 — Dry-Run and Approval Gate
1. Execute a database migration dry-run (e.g. `supabase db push --dry-run` or matching push script).
2. Verify that the output proposes exactly these five migrations in this order:
   - `006_debt_interest_rate_guard.sql`
   - `007_debt_cycle_fields.sql`
   - `008_debt_minimum_not_above_outstanding.sql`
   - `009_harden_debt_recalculation_execute.sql`
   - `010_require_import_debt_payment_link.sql`
3. If any other migration is proposed, or if any of the five is missing, **STOP** and report.
4. Stop and ask the user for explicit confirmation: `"Confirming database execution of migrations 006 through 010. Do you approve?"`.
5. **DO NOT** use force flags, DB reset command, or manual DDL drop/truncate commands.

---

### Phase 4 — Apply Migrations
1. Once approved, apply migrations (`supabase db push` or raw SQL execution).
2. Report success status.

---

### Phase 5 — Post-Apply Schema Verification
Run the following checks on the upgraded database to assert correct schema and privilege states.

```sql
-- 1. Check constraints existence and validation state
select conname, convalidated 
from pg_constraint 
where conrelid = 'public.debts'::regclass 
  and conname in ('debts_interest_rate_annual_range', 'debts_cycle_date_order', 'debts_credit_limit_nonnegative', 'debts_minimum_not_above_outstanding');

-- 2. Check function execute privileges
select 
  has_function_privilege('anon', 'public.recalculate_debt_paid_this_cycle(uuid)', 'execute') as anon_recalc_execute,
  has_function_privilege('authenticated', 'public.recalculate_debt_paid_this_cycle(uuid)', 'execute') as auth_recalc_execute,
  has_function_privilege('anon', 'public.import_commit_row(uuid, uuid, uuid, public.transaction_type, bigint, timestamptz, text, text, text, text, uuid, uuid, uuid)', 'execute') as anon_import_execute,
  has_function_privilege('authenticated', 'public.import_commit_row(uuid, uuid, uuid, public.transaction_type, bigint, timestamptz, text, text, text, text, uuid, uuid, uuid)', 'execute') as auth_import_execute;
```
*   Expected constraints validation status: All four exist (`convalidated` = `false` for NOT VALID constraints).
*   Expected function privileges: `anon_recalc_execute = false`, `auth_recalc_execute = true`, `anon_import_execute = false`, `auth_import_execute = true`.

---

### Phase 6 — Master Branch Code Integration
1. Switch to a clean master worktree (e.g. `C:\Project\tanglak-release` or similar production-readiness worktree).
2. Confirm the worktree is clean.
3. Merge branch `feat/slip-first-debt-planning` into `master` locally.
4. Execute `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run test` to verify the codebase remains completely green.
5. If all validations pass, push the updated `master` branch. Do not push the database credentials or schemas to production yet.
```
