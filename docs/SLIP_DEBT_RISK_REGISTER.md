# Slip-First Debt Risk Register

Audit date: 2026-07-12

Scope: risks found while auditing the current implementation before slip-first/debt-first integration. No implementation changes were made in this branch.

| ID | Severity | Area | Risk | Evidence | Recommendation |
| --- | --- | --- | --- | --- | --- |
| SD-001 | Blocker | Debt cycle semantics | `amount_paid_this_cycle_satang` is not cycle-scoped. It sums every confirmed linked `debt_payment` for a debt. Old payments can make future cycles appear paid. | `recalculateDebtPaidThisCycle` filters by user/debt/type/status only, with no date window. | Define cycle start/end semantics, add cycle fields if needed, and recalculate by current Bangkok billing cycle. |
| SD-002 | Blocker | Debt statement persistence | Debt statement review collects `debtType`, `statementBalance`, `interestRateAnnual`, and `remainingInstallments`, but create/update debt paths do not persist them as columns. | `confirmDocumentAction` reads these fields; repository `DebtInput` lacks them and `createDebt` hardcodes `debt_type: "other"`. | Extend `DebtInput`, actions, validation, repository mappings, and tests before relying on debt statements. |
| SD-003 | High | Payment linkage | Manual transaction form allows `type = debt_payment` without selecting a debt, so the payment affects cashflow/budget but not any debt progress. | `ManualTransactionForm` includes `debt_payment`; `saveTransactionAction` has no debt id field or debt requirement. | Require `debtId` for `debt_payment`, or hide debt payment from generic manual transaction entry and route users through debt payment form. |
| SD-004 | High | Outstanding balance | Linked payments do not reduce `outstanding_balance_satang`; outstanding remains whatever was manually entered or statement-updated. | `addDebtPayment` creates transaction/payment and recalculates paid amount only. | Choose explicit semantics: statement-authoritative balance, payment-adjusted balance, or both. Label UI accordingly. |
| SD-005 | High | Account ownership | Caller-supplied account IDs are not consistently ownership-checked before being stored on transactions/import batches. | Import upload accepts `accountId`; manual transactions accept `sourceAccountId`; repository validates debt ownership but not account ownership. | Add `assertAccountBelongsToUser` for all account FK inputs and cover with tests. |
| SD-006 | High | Missing credit limit | No `credit_limit_satang` exists in DB, TypeScript type, forms, mappings, or UI. | No code references found for credit limit. | Add nullable `credit_limit_satang` with nonnegative constraint and display only after product copy is ready. |
| SD-007 | Medium | Interest validation | `interest_rate_annual` exists but has no DB range constraint and no server action range validation. | Initial schema has `numeric(6,3)` only; AI schema is nonnegative only. | Add `0..100` or agreed APR range check, action validation, and tests. |
| SD-008 | Medium | Date boundaries | Due today/due soon/overdue uses UTC calendar parts from `new Date()` rather than Bangkok-local today. | `daysUntilDue` uses `today.getUTCFullYear/getUTCMonth/getUTCDate`. | Base debt due calculations on `getBangkokTodayString` or pass Bangkok-local date keys. |
| SD-009 | Medium | Month filtering | Some in-memory monthly filtering uses `occurredAt.startsWith(month)`, which can mismatch UTC `Z` timestamps from imports near Bangkok month boundaries. | Overview filters loaded rows by string prefix after `listAllTransactions`; history CSV/PDF parsers can produce `Z`. | Normalize imported transaction timestamps to Bangkok-local storage convention or use range comparisons. |
| SD-010 | Medium | Legacy route deprecation | Hiding statement-import UI links will not disable direct access to `/history-import` routes. | Routes remain first-class pages with server actions. | Decide deprecation policy: hidden only, read-only/resume-only, redirect new uploads, or feature flag. |
| SD-011 | Medium | Cycle field ambiguity | `recurring_due_day` exists but is not a billing cycle date and is not used for current-cycle windows. | Form accepts recurring due day; calculations ignore it. | Add explicit cycle start/end or statement date fields if planning depends on cycles. |
| SD-012 | Medium | Debt statement auto-create risk | Current review form offers create/update and creates a debt after confirmation. The pivot requirement "no automatic debt creation" needs tests to preserve explicit confirmation. | Document confirmation creates/updates debt based on `debtActionType`. | Keep explicit user choice and add E2E proving upload/extract alone creates no debt. |
| SD-013 | Low | Copy ambiguity | `/upload` has a "Statement" shortcut that maps to `debt_statement`, while `/history-import` handles multi-row statement imports. | `UploadClient` document types include visible "Statement" with value `debt_statement`. | Rename or hide copy in slip-first UX to avoid sending users to the wrong parser. |
| SD-014 | Low | UTC client defaults | Some form defaults use `new Date().toISOString().slice(0, 10)`, which can be wrong near Bangkok midnight. | Manual debt and transaction form defaults use `toISOString().slice(0, 10)`. | Use `getBangkokTodayString` on client defaults or pass server-derived defaults. |
| SD-015 | Low | Budget/overview explanation | Debt payments count as budget spend and overview debt payment outflow but not living expense. This is coherent but easy to misread. | `calculateCategorySpend` includes `debt_payment`; `calculateMonthlyTotals` separates living expense and debt payment. | Keep explanatory copy where totals are adjacent; avoid summing budget spend and living expense as if identical. |

## Blockers

1. Current-cycle paid amount is not cycle-scoped.
2. Debt statement fields needed for planning are not fully persisted.

## Migration Recommendation

Do not create a migration on this audit branch. Recommended future additive migration:

- Add `credit_limit_satang bigint null`.
- Add `statement_cycle_start_date date null` and `statement_cycle_end_date date null` if cycle-window planning is required.
- Keep existing `interest_rate_annual numeric(6,3)` but add a `NOT VALID` range check after choosing the accepted APR range.
- Add nonnegative checks for `credit_limit_satang`; add `statement_cycle_start_date <= statement_cycle_end_date` when both dates are present.
- Add `transactions(user_id, debt_id, type, status, occurred_at)` if cycle-scoped recalculation will query payments by debt and date.
- Keep all new fields nullable and do not backfill automatically.

## Semantic Risks

- Paid-this-cycle is currently all-time paid.
- Outstanding balance is statement/manual authoritative, not payment-derived.
- Minimum remaining uses the cached paid amount, so it inherits the all-time cycle bug.
- Manual unlinked `debt_payment` creates cashflow without debt progress.
- Statement import debt-payment rows require an explicit debt link to update debt progress.

## Security Findings

- Document ownership checks are strong: document lookup, extraction lookup, storage signed URL, update, and delete are user-scoped.
- Debt link isolation is strong for transaction/import paths that supply `debtId`.
- RLS exists for core tables and storage.
- Account FK ownership validation is the main gap.

## Test Gaps

- Interest range validation.
- Persisting debt statement fields.
- Minimum payment defaults and edge cases.
- Concurrent debt payment update/delete.
- Duplicate slips.
- Linked debt ownership in document review and history import.
- No automatic debt creation on upload/extract before user confirmation.
- Bangkok due and month boundaries.
- Partial payments by cycle.
- Legacy route hiding/deprecation for `/history-import`.

