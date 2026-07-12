# TangLak: Slip-First & Debt-Planning Release Plan

This document serves as the release master plan for deploying the slip-first upload and debt-planning features.

> [!WARNING]
> This release package is **not production-ready** until the live preflight checks, migration dry-runs, post-apply verifications, and manual smoke tests have successfully passed.

---

## Part A — Release Overview

### 1. Feature Scope
The release pivots TangLak's cashflow and debt tracking to a **slip-first entry** and **manual active-cycle debt planner** model. 
*   **Slip-First Uploads**: The primary entry routes now prioritize single bank slips and receipts, hiding historical imports from main pages.
*   **Active-Cycle planning**: Debts support cycle start/end dates, statement balances, credit limits, interest rates, and payment tracking isolated by billing periods.
*   **Hardened Invariants**: Every confirmed `debt_payment` transaction must be linked to a user-owned debt. A debt's monthly minimum payment must not exceed its total outstanding balance.

### 2. Source Branch and HEAD
*   **Branch**: `feat/slip-first-debt-planning`
*   **Expected HEAD**: `b6e4ab76f1c57832f2cde9d528b73ba79d00f6bb`

### 3. Pending Database Migrations
This release deploys five additive database migrations:
1.  `202607110006_debt_interest_rate_guard.sql`
2.  `202607110007_debt_cycle_fields.sql`
3.  `202607110008_debt_minimum_not_above_outstanding.sql`
4.  `202607110009_harden_debt_recalculation_execute.sql`
5.  `202607110010_require_import_debt_payment_link.sql`

### 4. Automated Verification Summary (Completed Pre-Merge)
*   **Unit Tests**: `559 passed`
*   **E2E Tests**: `78 passed`
*   **Static Code Analysis (Lint)**: `0 errors`
*   **TypeScript Compilation (Typecheck)**: Clean compilation
*   **Production Build**: Clean compilation
*   **Source Worktree Status**: Clean, no uncommitted files

### 5. Intentionally Deferred Items (Phase 2 & Future)
The following items are out of scope for Phase 1 and will not be deployed:
*   **Closed Debt Reopening**: Tapping reopen on a paid-off debt is disabled.
*   **Full Debt-Cycle History UI**: A multi-cycle history summary tab is deferred.
*   **Pending Close Review Lifecycle**: Automations for auto-closing zero-balance debts are deferred.
*   **Interest Accrual Math**: Exact daily calculations or bank fee accruals are out of scope.
*   **Unlinked Historical Payment UI**: An interface to retroactively link pre-existing unlinked payments is deferred.
*   **Automated Agent Orchestration**: Automated background reconciliation actions.

---

## Part E — Approval Gate

The release coordinator must obtain explicit sign-off on the exact migrations listed below.

### Approved Migration List
Approved to apply **exactly** these five files in order:
*   `202607110006_debt_interest_rate_guard.sql`
*   `202607110007_debt_cycle_fields.sql`
*   `202607110008_debt_minimum_not_above_outstanding.sql`
*   `202607110009_harden_debt_recalculation_execute.sql`
*   `202607110010_require_import_debt_payment_link.sql`

> [!CAUTION]
> **Prohibited DB Commands**:
> *   Do **NOT** run database reset (`supabase db reset` or equivalent).
> *   Do **NOT** use force flags (`--force`) that bypass check constraints.
> *   Do **NOT** run any manual `DROP`, `TRUNCATE`, `DELETE`, `UPDATE`, or `VALIDATE CONSTRAINT` statements on live tables during this deployment.
> *   No other database migrations are approved for execution.

---

## Part I — Integration Sequence

To ensure zero downtime and prevent schema/code mismatches, the deployment must execute in this specific sequence.

### Recommended Integration Sequence (Database-First)
1.  **Migration Preflight**: Run pre-deployment queries to audit live data for potential constraint violations.
2.  **Human Approval**: Review preflight logs and sign off on the approval gate.
3.  **Migration Apply**: Run the five pending migrations (`db push` or raw SQL execution).
4.  **Post-Apply Verification**: Verify check constraints, functions, RLS, indexes, and execute grants in the live DB.
5.  **Live Smoke Test (Staging/Preview)**: Run manual sanity checks on a staging build connected to the upgraded DB.
6.  **Code Merge**: Merge `feat/slip-first-debt-planning` into `master` branch.
7.  **Final Automated Check**: Re-run the full unit and E2E suites on `master`.
8.  **Push Master**: Promote code to production.
9.  **Production Smoke Test**: Run the final manual smoke test checklist on the live deployment.

### Why Database-First is Safer than Code-First
*   **Backward Compatibility**: All five migrations are additive and nullable. The existing production code (running on `master` prior to merge) does not read or write the new cycle fields, and will continue to run without error.
*   **Preventing App Crashes**: If code is deployed before the database schema updates, the new application queries will search for columns (`cycle_start_date`, `credit_limit_satang`, etc.) and database functions (`import_commit_row` with 13 arguments) that do not yet exist, resulting in immediate application crashes.
*   **Immediate Guarding**: Applying database constraints first ensures that as soon as the new code goes live, it is immediately protected by the database invariants against invalid inputs.
