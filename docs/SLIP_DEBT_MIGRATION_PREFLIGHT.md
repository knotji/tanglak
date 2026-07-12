# TangLak: Migration Preflight & Dependency Map

This document details the dependency mappings, dry-run parsing, and preflight SQL checks for migrations `006` through `010`.

---

## Part B — Migration Dependency Map

| Migration ID & File | Purpose | Affected DB Objects | Dependencies | Schema Additions | Lock / Rewrite Risk | Rollback Steps & Limitations |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **006** <br>`...debt_interest_rate_guard.sql` | Enforce interest rate bounds (0..100 APR). | `public.debts` table. | `001_initial_schema` | `debts_interest_rate_annual_range` check constraint (`NOT VALID`). | **Low**. Nullable check constraint with `not valid` scans no rows and locks no tables. | Drop constraint:<br>`alter table public.debts drop constraint if exists debts_interest_rate_annual_range;` |
| **007** <br>`...debt_cycle_fields.sql` | Add cycle planning columns, index, and recalculation/import functions. | `public.debts`, `public.transactions`. Functions: `recalculate_debt_paid_this_cycle`, `import_commit_row`, `import_rollback_batch`. | `005_history_import_support` | Columns: `cycle_start_date`, `cycle_end_date`, `statement_date`, `credit_limit_satang`. Constraint: `debts_cycle_date_order` (`not valid`), `debts_credit_limit_nonnegative` (`not valid`). Index: `transactions_user_debt_type_status_occurred_idx`. | **Low**. Column additions are nullable and constraints are `not valid`. Recalculation function is security definer. | Drop columns, constraints, index, functions. Revert function code. |
| **008** <br>`...debt_minimum_not_above_outstanding.sql` | Prevent monthly minimum payment exceeding total outstanding balance. | `public.debts` table. | `007` (depends on amount column types) | `debts_minimum_not_above_outstanding` check constraint (`not valid`). | **Low**. Constraint is `not valid`. | Drop constraint:<br>`alter table public.debts drop constraint if exists debts_minimum_not_above_outstanding;` |
| **009** <br>`...harden_debt_recalculation_execute.sql` | Hardens execution privileges of the recalculation security definer function. | `public.recalculate_debt_paid_this_cycle(uuid)` function. | `007` (depends on function existence) | Replaces function body. Revokes execute from public, grants to authenticated. | **None**. Modifies function definition and grants only. | Recreate function body from `007` and grant execute to public. |
| **010** <br>`...require_import_debt_payment_link.sql` | Rejects imported `debt_payment` rows that do not carry a `debt_id`. | `public.import_commit_row` function. | `007` (replaces previous definition) | Replaces function body, adding explicit check for `debt_payment` linkage. | **None**. Replaces function definition. | Recreate function body from `007` and re-apply grants. |

---

## Part C — Preflight Checklist

Run these SQL queries against the live database before applying migrations to detect any data anomalies or security configurations that could impact the deployment.

### 1. General Row and Transaction Counts (Informational)
Used to establish a baseline snapshot of the database prior to schema adjustments.

```sql
-- Count total active debts, transactions, and historical import rows
select 
  (select count(*) from public.debts) as total_debts,
  (select count(*) from public.transactions) as total_transactions,
  (select count(*) from public.import_rows) as total_import_rows;
```

### 2. Check for Invalid Interest Rates (Stop Condition)
Checks for interest rates outside the 0 to 100% APR boundary.

```sql
-- Find rows violating the 0..100 interest rate range
select id, user_id, name, interest_rate_annual
from public.debts
where interest_rate_annual is not null
  and (interest_rate_annual < 0 or interest_rate_annual > 100);
```
*   **Result Policy**: Must return **0 rows**. If any row is returned, stop deployment. Informational only for the check constraint itself, but a blocker for later constraint validation.

### 3. Check for Cycle Date Order Violations (Stop Condition)
Checks for cycles where start date is after end date.

```sql
-- Find rows where cycle start date is after cycle end date
select id, user_id, name, cycle_start_date, cycle_end_date
from public.debts
where cycle_start_date is not null 
  and cycle_end_date is not null 
  and cycle_start_date > cycle_end_date;
```
*   **Result Policy**: Must return **0 rows**. Stop if rows exist.

### 4. Check for Negative Credit Limits (Stop Condition)
Checks for negative values in the credit limit column.

```sql
-- Find debts with negative credit limits
select id, user_id, name, credit_limit_satang
from public.debts
where credit_limit_satang is not null 
  and credit_limit_satang < 0;
```
*   **Result Policy**: Must return **0 rows**. Stop if rows exist.

### 5. Check for Minimum Exceeding Outstanding (Stop Condition)
Checks for debts where minimum payment is greater than total outstanding balance.

```sql
-- Find debts where minimum payment exceeds total outstanding
select id, user_id, name, minimum_payment_satang, outstanding_balance_satang
from public.debts
where minimum_payment_satang is not null
  and outstanding_balance_satang is not null
  and minimum_payment_satang > outstanding_balance_satang;
```
*   **Result Policy**: Must return **0 rows**. If rows exist, **STOP**. Remediate values by hand (consulting the user/creditor records) before applying. Do not auto-clamp or delete rows.

### 6. Count Unlinked Historical Payments (Informational)
Counts the number of historical unlinked debt payments.

```sql
-- Count confirmed debt payments lacking a debt_id
select count(*) as unlinked_debt_payments
from public.transactions
where type = 'debt_payment' and debt_id is null;
```
*   **Result Policy**: **Informational**. Historical unlinked rows are allowed to remain in the database. They must be counted and reported, but **never deleted automatically**.

### 7. Check Database Function Search Paths (Security Check)
Ensures pg_catalog functions are secure from namespace hijacking.

```sql
-- Verify search path is public on existing public functions
select proname, prosearchpath
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('recalculate_debt_paid_this_cycle', 'import_commit_row', 'import_rollback_batch');
```
*   **Result Policy**: Expected `prosearchpath` contains `public` (or matches expected schema resolution).

---

## Part D — Dry-run Expectations

Execute a migration dry-run (e.g. `supabase db push --dry-run` or matching platform deploy dry-run).

### Expected Pending Migration List
The dry-run must return exactly these five migrations in this exact order:
1.  `202607110006_debt_interest_rate_guard.sql`
2.  `202607110007_debt_cycle_fields.sql`
3.  `202607110008_debt_minimum_not_above_outstanding.sql`
4.  `202607110009_harden_debt_recalculation_execute.sql`
5.  `202607110010_require_import_debt_payment_link.sql`

### Error Actions
*   **Missing Migration**: If any of the five migrations is missing from the list, **STOP** the deployment and report the discrepancy.
*   **Extra/Unexpected Migration**: If any migration outside this list appears in the dry-run output, **STOP** immediately. Do not push or apply.
