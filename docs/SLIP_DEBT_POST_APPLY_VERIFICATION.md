# TangLak: Post-Apply Schema & Privilege Verification

This document defines the post-apply validation queries and transaction scripts to verify that all constraints, functions, indexes, and privileges have been successfully deployed.

---

## Part F — Post-Apply Schema Verification Queries

Execute these verification queries against the target database after applying migrations `006` through `010`.

### 1. Verification of Migration 006 (Interest Range Constraint)
Verify that the interest rate guard constraint is present, marked `NOT VALID`, and works correctly.

```sql
-- Query constraint state
select conname, convalidated, pg_get_constraintdef(oid) as condef
from pg_constraint
where conrelid = 'public.debts'::regclass
  and conname = 'debts_interest_rate_annual_range';
```
*   **Expected Def**: `CHECK ((interest_rate_annual IS NULL) OR ((interest_rate_annual >= 0::numeric) AND (interest_rate_annual <= 100::numeric)))`
*   **Expected `convalidated`**: `false` (since it is marked `NOT VALID`).

#### Insertion Sanity Check (Test Transaction)
```sql
begin;
-- Should fail: Interest rate above 100
insert into public.debts (user_id, name, interest_rate_annual, amount_due_satang, minimum_payment_satang, due_date)
values ('00000000-0000-0000-0000-000000000000', 'Test Card', 101.5, 0, 0, '2026-07-30');
rollback;
```
*   **Expected Result**: Fails with check constraint violation `debts_interest_rate_annual_range`.

---

### 2. Verification of Migration 007 (Cycle Fields & Index)
Verify that cycle dates, credit limits, cycle constraints, and indices exist.

```sql
-- Check cycle column presence
select column_name, data_type
from information_schema.columns
where table_name = 'debts'
  and column_name in ('cycle_start_date', 'cycle_end_date', 'statement_date', 'credit_limit_satang');

-- Check cycle constraints
select conname, convalidated, pg_get_constraintdef(oid) as condef
from pg_constraint
where conrelid = 'public.debts'::regclass
  and conname in ('debts_cycle_date_order', 'debts_credit_limit_nonnegative');

-- Check index presence
select indexname, indexdef
from pg_indexes
where tablename = 'transactions'
  and indexname = 'transactions_user_debt_type_status_occurred_idx';
```
*   **Expected Results**:
    *   Columns: All four exist with types `date`, `date`, `date`, `bigint`.
    *   Constraints: `debts_cycle_date_order` checks `cycle_start_date <= cycle_end_date` (`convalidated = false`). `debts_credit_limit_nonnegative` checks `credit_limit_satang >= 0` (`convalidated = false`).
    *   Index: Index exists with matching partial where clause `WHERE (debt_id IS NOT NULL)`.

---

### 3. Verification of Migration 008 (Minimum vs Outstanding Constraint)
Verify that the monthly minimum vs outstanding constraint exists.

```sql
-- Query constraint state
select conname, convalidated, pg_get_constraintdef(oid) as condef
from pg_constraint
where conrelid = 'public.debts'::regclass
  and conname = 'debts_minimum_not_above_outstanding';
```
*   **Expected Def**: `CHECK ((minimum_payment_satang IS NULL) OR (outstanding_balance_satang IS NULL) OR (minimum_payment_satang <= outstanding_balance_satang))`
*   **Expected `convalidated`**: `false`.

#### Insertion Sanity Check (Test Transaction)
```sql
begin;
-- Should fail: Minimum payment greater than outstanding balance
insert into public.debts (user_id, name, outstanding_balance_satang, minimum_payment_satang, amount_due_satang, due_date)
values ('00000000-0000-0000-0000-000000000000', 'Fail Card', 50000, 60000, 0, '2026-07-30');
rollback;
```
*   **Expected Result**: Fails with check constraint violation `debts_minimum_not_above_outstanding`.

---

### 4. Verification of Migration 009 (Recalculation Privileges & RLS)
Verify that the `recalculate_debt_paid_this_cycle` function execute permission is revoked from `public` and `anon`, but remains granted to `authenticated`.

```sql
-- Verify execute privileges
select 
  has_function_privilege('anon', 'public.recalculate_debt_paid_this_cycle(uuid)', 'execute') as anon_can_execute,
  has_function_privilege('authenticated', 'public.recalculate_debt_paid_this_cycle(uuid)', 'execute') as authenticated_can_execute;
```
*   **Expected Result**:
    *   `anon_can_execute`: `false`
    *   `authenticated_can_execute`: `true`

#### Cross-User Execution Check
To be verified by logging in as an `authenticated` user A and attempting to call:
`select public.recalculate_debt_paid_this_cycle('UUID_OF_USER_B_DEBT');`
*   **Expected Result**: Throws exception `debt not found or not owned by user` (`errcode = P0002`).

---

### 5. Verification of Migration 010 (Import Linkage Requirement)
Verify that the import function rejects any `debt_payment` row without an explicit `debt_id`.

```sql
-- Verify execute privileges
select 
  has_function_privilege('anon', 'public.import_commit_row(uuid, uuid, uuid, public.transaction_type, bigint, timestamptz, text, text, text, text, uuid, uuid, uuid)', 'execute') as anon_can_execute,
  has_function_privilege('authenticated', 'public.import_commit_row(uuid, uuid, uuid, public.transaction_type, bigint, timestamptz, text, text, text, text, uuid, uuid, uuid)', 'execute') as authenticated_can_execute;
```
*   **Expected Result**:
    *   `anon_can_execute`: `false`
    *   `authenticated_can_execute`: `true`

#### Import Linkage Assertion (Test Transaction)
```sql
begin;
-- Insert mock import batch and row owned by user '00000000-0000-0000-0000-000000000001'
insert into public.import_batches (id, user_id, status) 
values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000001', 'pending');

insert into public.import_rows (id, user_id, import_batch_id, review_status, raw_data)
values ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'unresolved', '{}'::jsonb);

-- Should fail: debt_payment type but NULL debt_id
select public.import_commit_row(
  '00000000-0000-0000-0000-000000000001', -- user_id
  '11111111-1111-1111-1111-111111111111', -- batch_id
  '22222222-2222-2222-2222-222222222222', -- row_id
  'debt_payment'::public.transaction_type, -- type
  100000, -- amount (1000 THB)
  now(), -- occurred_at
  'Test Merchant', -- merchant
  'Debt Payment', -- category
  'Transfer', -- payment_method
  'Unlinked debt payment test', -- note
  null, -- source_account_id
  null, -- destination_account_id
  null -- debt_id (NULL is forbidden for debt_payment!)
);
rollback;
```
*   **Expected Result**: Throws exception `debt payment must be linked to a debt` (`errcode = P0001`).

---

## Part G — Data Integrity Verification Checks

Ensure that no existing user accounts, histories, or planning calculations were degraded or mutated during deployment:

```sql
-- 1. Verify no existing debt rows or transaction rows were lost
select 
  (select count(*) from public.debts) as post_apply_debts_count,
  (select count(*) from public.transactions) as post_apply_transactions_count;
-- Compare these values to the baseline recorded in Part C preflight.

-- 2. Verify no debt payments were unlinked
select count(*) as post_apply_unlinked_payments
from public.transactions
where type = 'debt_payment' and debt_id is null;
-- Compare this to the preflight unlinked count. The counts must be identical.

-- 3. Verify RLS remains active on critical tables
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('debts', 'transactions', 'import_batches', 'import_rows');
-- Expected: rowsecurity = true for all four tables.
```
