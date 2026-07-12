# Slip/Debt Implementation Findings

Audit target: `feat/slip-first-debt-planning` at `0b8eadfd14633bb5feeb7380454d7e818cca564e`.

Scope reviewed: implementation commits `adda92de85d1f4f1b8dfa88d88ccd784707e4150..0b8eadfd14633bb5feeb7380454d7e818cca564e`, with reference to the prior technical audit and Phase 1 UX/debt-cycle specifications.

## Summary

No blocker was found. The implementation lands the core slip-first direction, debt field persistence, Bangkok-aware cycle calculations, account/debt ownership checks, and idempotent import/debt-payment linkage. The main remaining risks are product/semantic mismatches: closed debt reopening is still exposed, generic manual transactions can create unlinked `debt_payment` records, minimum payment is not bounded by outstanding balance, and debt overview cards mix cycle-scoped totals with all-debt totals.

## Findings

### F-001 High: Closed-debt reopen remains exposed in Phase 1

- Location: `src/features/debts/DebtsClient.tsx:6`, `src/features/debts/DebtsClient.tsx:50`, `src/features/debts/DebtsClient.tsx:132`, `src/app/actions/finance.ts:236`, `src/lib/data/finance-repository.ts:531`
- Observed behavior: The debts UI imports `reopenDebtAction`, renders an "open again" button for `paid_off` or `paused` debts, and calls `reopenDebt`, which sets status back to `active`.
- Expected behavior: Locked Phase 1 decision says reopen is deferred/disabled. Closed debts may remain visible for history, but should not expose a reopen affordance until Phase 2.
- Risk: Users can re-activate old debts without the planned Phase 2 review/cycle setup. This can confuse current-cycle totals, Today priority, and closure semantics.
- Recommended fix: Remove or hide the reopen control and action from Phase 1 UI. If the action remains for backward compatibility, guard it behind a feature flag or server-side disabled response until Phase 2.
- Required test: E2E test with a paid-off debt asserting no reopen button is visible/clickable and direct action calls are rejected or feature-flagged.

### F-002 High: Minimum payment can exceed outstanding balance

- Location: `src/features/debts/ManualDebtForm.tsx:80`, `src/app/actions/finance.ts:129`, `src/app/actions/documents.ts:402`, `src/lib/data/finance-repository.ts:116`, `supabase/migrations/202607110007_debt_cycle_fields.sql:13`
- Observed behavior: Client, server actions, repository validation, and DB constraints validate non-negative money and interest range, but no layer enforces `minimumPaymentSatang <= outstandingBalanceSatang`.
- Expected behavior: Phase 1 locked decision requires minimum payment not exceed outstanding balance.
- Risk: Invalid debt plans can show remaining minimum greater than total balance, distort Today prompts, and make "paid minimum" impossible to reason about.
- Recommended fix: Add merged-state repository validation and server-action/client copy for `minimum <= outstanding` after defaults are applied. Add a non-destructive DB `NOT VALID` check once historical data is preflighted.
- Required test: Unit and E2E tests for manual debt creation, debt-statement confirmation, and update paths rejecting minimum greater than outstanding while preserving form values.

### F-003 High: Manual transaction flow can create unlinked `debt_payment` records

- Location: `src/features/transactions/ManualTransactionForm.tsx:13`, `src/features/transactions/ManualTransactionForm.tsx:84`, `src/app/actions/finance.ts:32`, `src/app/actions/finance.ts:87`, `src/lib/data/finance-repository.ts:227`
- Observed behavior: Generic manual transactions include `debt_payment` in the type selector, but the form/action schema has no `debtId`. Saving this path creates a confirmed `transactions.type = 'debt_payment'` row with no linked debt.
- Expected behavior: Debt payments that should affect planning must require an explicit same-user debt link; unlinked payments should either be impossible from primary UI or explicitly demoted to a non-planning cashflow type.
- Risk: Overview cash remaining and monthly totals count the payment as `debtPaymentSatang`, while debt pages and Today ignore it for `paidThisCycle`, minimum remaining, and outstanding planning. This is a user-visible mismatch.
- Recommended fix: Remove `debt_payment` from generic manual transaction type, or add a required debt selector and call the dedicated debt-payment path. Keep a separate "transfer/expense" option for non-linked cash movement.
- Required test: E2E/manual-action test proving a generic manual `debt_payment` without `debtId` cannot be saved, and a linked debt payment updates the target debt only.

### F-004 Medium: Debts page summary mixes all-debt totals with due-this-month/cycle totals

- Location: `src/features/debts/DebtsClient.tsx:30`, `src/features/debts/DebtsClient.tsx:31`, `src/features/debts/DebtsClient.tsx:32`, `src/features/debts/DebtsClient.tsx:34`, `src/features/debts/DebtsClient.tsx:79`, `src/features/debts/DebtsClient.tsx:83`, `src/features/debts/DebtsClient.tsx:87`
- Observed behavior: `totalDueThisMonth` and remaining minimum come from `buildMonthlyDebtSummary`, but the displayed "minimum this month" uses `totalMinimum` across all listed debts, and "paid this cycle" uses cached `amountPaidThisCycleSatang` across all listed debts.
- Expected behavior: The monthly summary card should present one coherent scope: debts due in the target Bangkok month and payments inside those debts' active cycles, or clearly label all-debt lifetime/current-cycle totals.
- Risk: A debt due next month, paused debt, or closed debt can inflate "minimum this month" and progress while not contributing to "due this month" or remaining minimum. Users may think this month is more underfunded or more paid than it is.
- Recommended fix: Render `monthlySummary.totalMinimumThisMonthSatang` and `monthlySummary.totalPaidThisMonthSatang`, or rename the all-debt fields and split them visually.
- Required test: Unit/component test with one July debt and one August debt asserting all four summary values use the same month scope.

### F-005 Medium: Today action has no separate due-today priority/copy

- Location: `src/lib/finance/next-action.ts:21`, `src/lib/finance/next-action.ts:40`, `src/lib/finance/next-action.ts:48`
- Observed behavior: Today chooses overdue first, then a combined due-soon bucket where `days >= 0 && days <= 3`; a due-today debt renders as "due in 0 days".
- Expected behavior: Locked priority is `overdue > due today > due soon > minimum unmet`, with distinct due-today copy.
- Risk: The highest-priority card can sound less urgent or awkward on the due date. It also makes the implementation diverge from the UX copy/test matrix.
- Recommended fix: Add a separate `dueTodayDebt` branch before due-soon and update tests to assert exact priority and copy.
- Required test: Unit tests for overdue vs due today vs due soon vs unmet minimum, including due-today Thai copy.

### F-006 Medium: Overview debt-payment totals and debt-cycle totals intentionally diverge but remain easy to misread

- Location: `src/lib/finance/calculations.ts:18`, `src/lib/finance/calculations.ts:32`, `src/lib/finance/calculations.ts:42`, `src/lib/finance/debt-summary.ts:29`, `src/app/overview/page.tsx:53`
- Observed behavior: Monthly overview totals count every confirmed transaction with `type = 'debt_payment'` in the calendar month. Debt planning counts only confirmed linked `debt_payment` rows with matching `debtId` inside that debt's active cycle. Outstanding balance is not automatically reduced.
- Expected behavior: This semantic split is acceptable only when clearly labeled and consistently tested.
- Risk: Unlinked, old-cycle, or future-cycle debt-payment transactions reduce cash remaining and appear in overview debt-payment totals but do not reduce minimum remaining or outstanding balance. Users may perceive double-count or missing-payment behavior.
- Recommended fix: Keep the no-auto-reduction rule, but add a UI label/tooling distinction between "cash paid to debt this month" and "credited to this debt cycle"; block unlinked debt payments from primary UI as in F-003.
- Required test: Unit tests for overview vs debt summary with linked, unlinked, old-cycle, future-cycle, and partial payments.

### F-007 Medium: Debt-summary timestamp filtering uses lexical string comparison

- Location: `src/lib/finance/debt-summary.ts:38`, `src/lib/finance/debt-summary.ts:40`
- Observed behavior: `paidWithinCycle` compares `transaction.occurredAt` and cycle boundaries as strings. Repository recalculation uses DB timestamptz comparisons and mock recalculation uses `Date.getTime()`, so this issue is limited to the read-only summary helper.
- Expected behavior: Cycle inclusion should be instant-based and timezone-normalized, regardless of whether stored timestamps use `Z`, `+07:00`, or another offset.
- Risk: A valid UTC timestamp around Bangkok midnight can sort lexically outside the expected Bangkok cycle even though the instant is inside it.
- Recommended fix: Compare `new Date(...).getTime()` values or normalize timestamps to a common instant before filtering.
- Required test: Unit test where a `Z` timestamp at a Bangkok boundary is included/excluded correctly.

### F-008 Medium: Security-definer recalculation helper can be executed directly by default

- Location: `supabase/migrations/202607110007_debt_cycle_fields.sql:42`, `supabase/migrations/202607110007_debt_cycle_fields.sql:45`, `supabase/migrations/202607110007_debt_cycle_fields.sql:68`
- Observed behavior: `public.recalculate_debt_paid_this_cycle(target_debt_id uuid)` is `SECURITY DEFINER` and no explicit `REVOKE EXECUTE` is present for that helper. In PostgreSQL, functions are executable by `PUBLIC` unless revoked.
- Expected behavior: Helper functions that bypass RLS should either be `SECURITY INVOKER` with ownership checks or have direct execution revoked and be callable only through ownership-checked RPCs.
- Risk: A caller who knows another debt UUID can trigger a write to another user's debt row. The written value is recomputed, not attacker-controlled, so this is not direct data corruption, but it is still a cross-user RLS-bypass write surface and timing/oracle risk.
- Recommended fix: Revoke execute on the helper from `PUBLIC` and `authenticated`, or replace it with an ownership-checked invoker function that takes `p_user_id` and validates the debt before update.
- Required test: Static migration test for `revoke all on function public.recalculate_debt_paid_this_cycle(uuid) from public`, plus RPC/security test that cross-user direct helper execution is denied.

### F-009 Medium: Debt-statement review defaults to creating a new debt

- Location: `src/app/upload/review/[documentId]/ReviewForm.tsx:1084`, `src/app/actions/documents.ts:391`, `src/app/actions/documents.ts:442`
- Observed behavior: Debt-statement confirmation supports create vs update and only persists after confirm, but the create path is the fallback unless `debtActionType === 'update'`.
- Expected behavior: "No automatic debt creation" is satisfied at backend timing level, but the UX decision should require an explicit create/update choice when a debt statement is reviewed.
- Risk: A user can confirm an extracted statement without consciously linking it to an existing debt, creating duplicates for the same card/loan.
- Recommended fix: Require an explicit radio/choice on debt statements with no default, or add duplicate/possible-existing-debt warning before confirm.
- Required test: E2E test asserting no debt is created on upload/extract, and confirmation requires an explicit create/update choice.

### F-010 Low: Migration 007 lacks the detailed preflight/rollback notes used by migration 006

- Location: `supabase/migrations/202607110006_debt_interest_rate_guard.sql:30`, `supabase/migrations/202607110006_debt_interest_rate_guard.sql:39`, `supabase/migrations/202607110007_debt_cycle_fields.sql:1`
- Observed behavior: Migration 006 documents range, safety strategy, preflight, and rollback. Migration 007 is additive and safe, but has only a short header and no explicit rollback/preflight notes for new fields, constraints, index, or replaced functions.
- Expected behavior: The migration recommendation asked for exact column/constraint/index/backward compatibility reasoning; production migrations should carry comparable operational notes.
- Risk: Future operators have less guidance validating `NOT VALID` constraints or rolling back function/index changes.
- Recommended fix: Add comments only in a future docs/migration-hardening pass; do not rewrite the migration in this audit branch.
- Required test: Static migration-doc test or checklist requiring preflight/rollback comments for new debt-planning migrations.

### F-011 Low: Legacy import is demoted but still promoted from settings/data

- Location: `src/app/history-import/page.tsx:64`, `src/app/history-import/page.tsx:66`, `src/app/settings/page.tsx:70`, `src/app/settings/page.tsx:71`, `src/app/settings/data/page.tsx:49`
- Observed behavior: `/upload` no longer links to statement import. `/history-import` leads with a deprecation notice but still renders `HistoryImportClient`. `/settings` has an advanced legacy entry, and `/settings/data` has a primary "+ Statement" link.
- Expected behavior: This is broadly consistent with "demoted, not deleted", but the settings/data CTA is still an active statement-import promotion.
- Risk: Users managing data may still start the legacy statement flow instead of the slip-first/manual path.
- Recommended fix: Rename or visually demote the settings/data CTA, or route it through the same deprecation notice with slip/manual actions first.
- Required test: E2E test that primary upload and primary settings do not present statement import as the recommended path, and that settings/data labels it as legacy.

### F-012 Informational: Core migration/ownership/payment semantics are substantially improved

- Location: `supabase/migrations/202607110006_debt_interest_rate_guard.sql:54`, `supabase/migrations/202607110007_debt_cycle_fields.sql:7`, `supabase/migrations/202607110007_debt_cycle_fields.sql:121`, `supabase/migrations/202607110007_debt_cycle_fields.sql:127`, `src/lib/data/finance-repository.ts:68`, `src/lib/data/finance-repository.ts:86`, `src/app/actions/documents.ts:360`
- Observed behavior: Interest range guard is additive. Cycle fields and credit limit are additive nullable columns. Import RPC validates debt and account ownership. Repository create/update validates account/debt ownership. Slip transfer debt-payment confirmation requires `debtId`.
- Expected behavior: These match the Phase 1 security and payment-linkage goals.
- Risk: Residual risks are in the findings above; the main ownership paths are present.
- Recommended fix: Keep these patterns and extend them to the generic manual transaction path and direct helper execution.
- Required test: Preserve and expand cross-user account/debt tests, including RPC and server-action coverage.

