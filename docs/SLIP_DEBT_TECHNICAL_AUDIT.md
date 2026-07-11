# Slip-First Debt Technical Audit

Audit date: 2026-07-12

Branch: `audit/slip-first-debt-architecture`

Scope: pre-integration audit for TangLak's slip-first/debt-first pivot. This document is based on source inspection only. No production code, migrations, tests, package files, or configuration were changed.

## Executive Summary

TangLak already has a usable slip/document flow, a separate statement-history import flow, and a debt ledger with payment linkage. The main architecture risks for a slip-first/debt-first pivot are semantic rather than missing tables:

- `debt_payment` transactions affect cashflow and budget spend, but they do not reduce `debts.outstanding_balance_satang`.
- `amount_paid_this_cycle_satang` is named as a cycle value but currently sums every confirmed linked debt payment for the debt, across all time.
- Debt statement review collects more fields than the repository persists. `debt_type`, `statement_balance_satang`, `interest_rate_annual`, and `remaining_installments` are exposed or parsed but not saved through the current debt create/update paths.
- A manual transaction can be saved as `debt_payment` without a `debt_id`, creating a debt-payment cashflow/budget row that never updates a debt.
- `credit_limit` and an explicit cycle/billing date are absent.
- Statement import has multiple live UI entry points and can safely be hidden from primary navigation, but route-level access would still remain unless explicitly guarded.

## Source Map

Document upload and AI review:

- Route: `src/app/upload/page.tsx`
- Client: `src/app/upload/UploadClient.tsx`
- Review route: `src/app/upload/review/[documentId]/page.tsx`
- Review form: `src/app/upload/review/[documentId]/ReviewForm.tsx`
- Server actions: `src/app/actions/documents.ts`
- AI schema/prompt/timestamp normalization: `src/lib/ai/schemas.ts`, `src/lib/ai/prompts.ts`, `src/lib/ai/timestamp.ts`, `src/lib/ai/gemini.ts`, `src/lib/ai/extract-document.ts`

Statement import:

- Entry route: `src/app/history-import/page.tsx`
- Client: `src/app/history-import/HistoryImportClient.tsx`
- Review route: `src/app/history-import/[batchId]/review/page.tsx`
- Review board: `src/app/history-import/[batchId]/review/ReviewBoardClient.tsx`
- Summary route: `src/app/history-import/[batchId]/summary/page.tsx`
- Settings route: `src/app/settings/data/page.tsx`
- Server actions: `src/app/actions/history-import.ts`
- Parsers: `src/lib/import/parser-registry.ts`, `src/lib/import/adapters/*`, `src/lib/import/pdf/*`

Debt planning and transactions:

- Debt route: `src/app/debts/page.tsx`, `src/app/debts/[debtId]/page.tsx`
- Debt UI: `src/features/debts/*`, `src/components/DebtCard.tsx`
- Transaction UI: `src/features/transactions/ManualTransactionForm.tsx`
- Finance actions: `src/app/actions/finance.ts`
- Repository/mappers: `src/lib/data/finance-repository.ts`, `src/lib/data/mappers.ts`
- Calculations: `src/lib/finance/calculations.ts`, `src/lib/finance/budget-calculations.ts`, `src/lib/finance/next-action.ts`, `src/lib/finance/date.ts`
- Schema: `supabase/migrations/202607100001_initial_tanglak_schema.sql` plus later hardening migrations

## 1. Statement-Import UI Entry Points

| Entry point | Route | Component | Copy / visible intent | Origin | Can be hidden safely? |
| --- | --- | --- | --- | --- | --- |
| Upload page secondary link | `/upload` -> `/history-import` | `UploadPage` | Offers multi-row statement import for users with a statement rather than one slip. | Visible after opening slip/document upload. | Yes for slip-first primary UX. Remove/hide link only; `/history-import` remains directly reachable. |
| History import upload page | `/history-import` | `HistoryImportUploadPage`, `HistoryImportClient` | "Import historical transactions"; source selector includes bank statement PDF, credit card statement PDF, transaction history CSV, other history. File copy accepts PDF/CSV up to 10MB. | Direct route and links from upload/settings. | Yes from navigation, but route should be guarded or redirected if deprecating. |
| History import review | `/history-import/[batchId]/review` | `HistoryImportReviewPage`, `ReviewBoardClient` | Review rows extracted from Statement and choose import/merge/skip before real commit. | Redirect after successful statement upload; resume links. | Not safe to remove until unfinished batches are resolved or redirected. |
| History import summary | `/history-import/[batchId]/summary` | summary page | Shows import result, imported/merged/skipped/unresolved counts, totals, rollback. | Redirect after confirm; settings history. | Keep for existing completed batches and rollback until legacy data expires. |
| Settings data | `/settings/data` | `HistoryImportSettingsPage` | Import history, "+ new Statement import", resume review, summary, rollback, delete failed/unconfirmed. | Settings. | Hide "new import" safely; keep history/rollback for existing batches. |
| History import page backlink | `/history-import` -> `/upload` | `HistoryImportClient` | Offers normal single-slip upload instead. | Import page. | Yes, but harmless. |

No bottom-navigation item points directly to `/history-import`. The bottom nav points to `/today`, `/transactions`, `/budget`, `/debts`, and `/overview`. The Today floating action button points to `/upload`, which then exposes the statement-import link.

## 2. Existing Slip Support

Accepted upload types:

- MIME: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`
- Extensions: `jpg`, `jpeg`, `png`, `webp`, `pdf`
- Size: 15MB for document upload
- Storage path: `<user_id>/<document_id>/<sanitized_filename>`
- Bucket: private `financial-documents`

Selectable document types in `/upload`:

- `salary_slip`
- `receipt`
- `delivery_receipt`
- `transfer_slip`
- `debt_statement`
- `other`
- The visible "Statement" shortcut uses `debt_statement`, not the multi-row history import parser.

AI parser output:

- Root: `documentType`, `confidence`, `warnings`, `unclearFields`, `requiresReview`
- `transaction`: `type`, `amount`, `currency`, `occurredAt`, `merchant`, `category`, `paymentMethod`, `referenceNumber`, account last-four fields, destination name, bank, `possibleDebtPayment`, `possibleOwnAccountTransfer`, `note`
- `salary`: employer, pay period, gross/net income, tax, social security, deductions
- `receipt`: subtotal, delivery fee, service fee, discount, total paid, items
- `debt`: creditor, debt name, debt type, outstanding balance, statement balance, amount due, minimum payment, due date, annual interest, remaining installments, account last four

Normalization:

- Money is parsed server-side into integer satang via `parseRequiredMoney` / `parseOptionalMoney`.
- Transaction timestamps from AI are normalized deterministically by `parseDocumentTimestamp`.
- Bare date values infer noon with `+07:00`; bare date-times get Bangkok `+07:00`; explicit offsets are preserved.
- Ambiguous numeric dates are rejected rather than guessed.

Retry behavior:

- `retryExtractionAction(documentId)` re-runs `processAndExtractDocument`.
- Processing uses a claim/lease and retryable/permanent statuses.
- Successful retry reuses the existing document and writes one extraction record per document.

Manual fallback:

- Review form always requires human confirmation before commit.
- Missing/unclear fields are surfaced in the review form.
- Users can edit extracted values and can use the `other` review path for a generic transaction.

Duplicate handling:

- Review page builds duplicate candidates from recent confirmed transactions using extracted transaction amount/time/merchant/reference.
- `resolveDuplicateAction` can link the new document to an existing user-owned transaction and mark the document confirmed.
- "Save separately" leaves the normal confirm path available.
- Statement import has a separate duplicate path: staging rows are scored, exact/likely duplicates default to skip or unresolved, and database idempotency prevents duplicate transactions for the same import row.

## 3. Existing Debt Fields

| Business field | Database column | TypeScript type | Manual form | Document review form | Validation | Repository mapping | Display |
| --- | --- | --- | --- | --- | --- | --- | --- |
| id | `debts.id` | `Debt.id` | hidden on edit | existing debt selector uses id | UUID/FK/RLS | mapped | routes/history |
| user owner | `debts.user_id` | `Debt.userId` | no direct field | no direct field | RLS + repository `userId` filters | mapped | not displayed |
| name | `debts.name` | `Debt.name` | `name`, required | `debtName`, defaults from creditor/account | zod min(1) manual; document action defaults if blank | create/update persist | card title, lists |
| creditor | `debts.creditor` | `Debt.creditor?` | `creditor` optional | `creditor` optional | no strict validation | create/update persist | option labels, detail/card context |
| debt type | `debts.debt_type` | `Debt.debtType` | absent | `debtType` select | AI schema enum; UI select | repository always writes `other`; update path does not persist | not meaningfully displayed |
| payment mode | `debts.payment_mode` | `Debt.paymentMode` | `paymentMode` select | create from statement hardcodes `variable_monthly` | zod enum manual | create/update persist | not prominent |
| original amount | `debts.original_amount_satang` | `Debt.originalAmountSatang?` | absent | absent | DB nonnegative constraint added later | mapped only | not displayed |
| outstanding balance | `debts.outstanding_balance_satang` | `Debt.outstandingBalanceSatang?` | `outstanding` optional | `outstandingBalance` optional | nonnegative client/server/DB | create/update persist | debt cards, debts summary, overview |
| statement balance | `debts.statement_balance_satang` | `Debt.statementBalanceSatang?` | absent | `statementBalance` optional | nonnegative client/server | mapped, but create/update never persists | only used as fallback in `remainingToFullAmount` |
| amount due this cycle | `debts.amount_due_satang` | `Debt.amountDueSatang?` | `amount`, required | `amountDue`, required in UI | nonnegative client/server/DB | create/update persist | not directly on card except fallback calculations |
| minimum payment | `debts.minimum_payment_satang` | `Debt.minimumPaymentSatang?` | `minimum` optional defaulting to amount due | `minimumPayment`, required in UI | nonnegative client/server/DB | create/update persist | cards, debts summary, overview remaining |
| paid this cycle | `debts.amount_paid_this_cycle_satang` | `Debt.amountPaidThisCycleSatang` | no direct edit | no direct edit | DB nonnegative; recalculated | recalculated from linked confirmed `debt_payment` transactions | cards, debts summary, next action |
| due date | `debts.due_date` | `Debt.dueDate?` | `dueDate`, required | `dueDate`, required | zod min(1) / document required | create/update persist | cards, Today next action |
| cycle date / recurring due day | `debts.recurring_due_day` | `Debt.recurringDueDay?` | `recurringDueDay` optional | absent | DB check 1-31, but action converts `Number(...)` without range validation | create/update persist | not used in current-cycle logic |
| annual interest | `debts.interest_rate_annual` | `Debt.interestRateAnnual?` | absent | `interestRateAnnual` optional | AI schema nonnegative only; no server range; no DB check found | mapped, but create/update never persists; document action stores only in notes | not displayed |
| remaining installments | `debts.remaining_installments` | `Debt.remainingInstallments?` | absent | `remainingInstallments` optional | AI schema int nonnegative; no action validation | mapped, but create/update never persists; document action stores only in notes | not displayed |
| status | `debts.status` | `Debt.status` | action buttons only | absent | enum | set by create, mark paid off, reopen | controls active/closed behavior |
| notes | `debts.notes` | `Debt.notes?` | `notes` textarea | generated notes include account, interest, installments | no strict validation | create/update persist | detail/history context |
| credit limit | absent | absent | absent | absent | absent | absent | absent |

## 4. Missing Debt Fields

| Required pivot field | Exists? | Finding |
| --- | --- | --- |
| outstanding balance | Yes | Persisted and displayed, but not automatically reduced by payments. |
| amount due this cycle | Yes | `amount_due_satang` exists and is persisted. |
| minimum payment | Yes | `minimum_payment_satang` exists and is persisted. |
| annual interest | Partially | DB/type/schema/review field exists, but create/update actions do not persist it and there is no range constraint. |
| due date | Yes | `due_date` exists and is used for due soon/overdue. |
| cycle date | Partial | `recurring_due_day` exists, but no explicit statement/cycle date and no cycle window calculation. |
| paid this cycle | Misleading | `amount_paid_this_cycle_satang` exists, but sums all confirmed linked payments across all time. |
| credit limit | No | No DB column, type, form field, validation, mapping, or display found. |

## 5. Payment Semantics

Debt payment creation paths:

- Debt page: `addDebtPaymentAction` -> `addDebtPayment`.
- Debt payment edit/delete: updates/deletes the underlying transaction and recalculates the debt.
- Transfer slip review: if user marks a `transfer_slip` as `debt_payment`, `confirmDocumentAction` calls `addDebtPayment`.
- History import: rows classified or selected as `debt_payment` call the atomic `import_commit_row` RPC; if a debt id is supplied it creates both `transactions` and `debt_payments`.
- Manual transaction form can save type `debt_payment` with no `debtId`.

Effects:

- Budget category spend: `debt_payment` counts as spend in `calculateCategorySpend`. It is budget-relevant like an expense.
- Overview monthly totals: `calculateMonthlyTotals` adds `debt_payment` to `debtPaymentSatang` and subtracts it from cash remaining.
- Overview debt totals: `totalOutstanding` uses `debts.outstandingBalanceSatang`; `totalMinimumDue` uses `remainingToMinimum(debt)`.
- Paid-this-cycle: recalculated from all confirmed linked `transactions` where `debt_id = debtId` and `type = debt_payment`.
- Outstanding balance: not reduced when a payment is recorded.
- Minimum remaining: `max(0, minimumPaymentSatang - amountPaidThisCycleSatang)`.

Double-count and mismatch risks:

- A linked debt payment appears both in monthly cashflow and in debt progress. That is correct if presented as two different views, but can look like double counting if UI totals are combined without explanation.
- Budget spend includes `debt_payment`; overview living expense does not. This is intentional but easy to misread because category spend and overview expense totals use different inclusion rules.
- Manual `debt_payment` without `debt_id` counts in budget and overview, but never in paid-this-cycle or minimum remaining.
- Since outstanding balance is not reduced by payments, "total outstanding" can remain stale after payments unless a new statement updates it.
- Since paid-this-cycle is all-time, old payments can make every future cycle appear paid.

## 6. Date Semantics

Timezone:

- User profile defaults to `Asia/Bangkok`.
- App date helpers derive today/month using `Intl.DateTimeFormat` with `timeZone: "Asia/Bangkok"`.
- Manual transaction/debt dates often use `new Date().toISOString().slice(0, 10)` in client defaults, which is UTC-derived and can drift near Bangkok midnight.
- Confirmed manual dates are stored as noon Bangkok (`T12:00:00+07:00`) in many actions.

Bangkok month boundaries:

- `getBangkokMonthString()` is used by Today, Overview, Transactions default month, and budget flows.
- `listTransactions(userId, month)` queries `occurred_at >= YYYY-MM-01T00:00:00+07:00` and `< nextMonthStart(month)`.
- `nextMonthStart(month)` returns the next month start in Bangkok offset.
- Some filtering still uses `occurredAt.startsWith(month)` after rows are loaded. This is safe only if stored timestamps are consistently Bangkok-local ISO strings; UTC `Z` rows from history import can be classified by UTC month string in in-memory filters.

Due today / due soon / overdue:

- `daysUntilDue(dueDate, today)` compares the due date to `today` using UTC calendar components from `today`.
- `isOverdue` is active debt + daysUntilDue < 0 + minimum remaining > 0.
- Today next action considers due soon when days are 0 through 3 and minimum remaining > 0.
- There is no Bangkok-specific conversion inside `daysUntilDue`; callers passing `new Date()` near Bangkok midnight can be off by one relative to Bangkok today.

Cycle start/end:

- No explicit cycle start/end is implemented.
- `recurring_due_day` is stored but not used for recalculation windows.
- Current-cycle paid amount has no date filter.

## 7. Security And Ownership

Strong points:

- Server pages/actions call `requireUser()`.
- Document reads, updates, deletes, extraction lookups, import batches, import rows, debts, and transactions are usually filtered by `user_id`.
- Review page uses `getDocument(user.id, documentId)` before creating a signed preview URL.
- Storage paths start with user id and storage policies require the first folder to match `auth.uid()`.
- Debt link isolation exists in `assertDebtBelongsToUser` for transaction create/update and import commit.
- Document duplicate resolution updates the target transaction with both `id` and `user_id`.
- History import commit and rollback use RLS-aware RPCs plus explicit `p_user_id` checks.
- Update transaction validates the merged final state for debt payment amount/type, not only patched fields.

Gaps:

- Account ownership is not consistently validated when a caller supplies `accountId`, `sourceAccountId`, or `destinationAccountId`. Import batch creation accepts an account id from form data, and manual transactions accept `sourceAccountId`; the FK alone does not prove same owner.
- Debt statement review collects `debtType`, `interestRateAnnual`, `remainingInstallments`, and `statementBalance`, but the server action does not persist those typed columns. It stores interest/installments only as free-text notes.
- `interest_rate_annual` lacks a DB check constraint and action-level accepted range.
- `recurringDueDay` has a DB check, but server action does not validate before write; invalid values fail at DB time rather than returning a friendly validation error.
- Manual `debt_payment` does not require `debtId`, creating unlinked debt payments.

## 8. Migration Recommendation

Do not create this migration in the audit branch. Recommended additive migration after product semantics are agreed:

Existing but needs validation/persistence:

- Keep `debts.interest_rate_annual numeric(6,3)`.
- Add a non-destructive check constraint, initially `NOT VALID`:
  - `interest_rate_annual is null or (interest_rate_annual >= 0 and interest_rate_annual <= 100)`
- If Thai credit products require rates above 100% APR for edge cases, widen accepted range deliberately before shipping.
- Add server/action validation for the same range.
- Add repository input fields and mappings for:
  - `debtType`
  - `statementBalanceSatang`
  - `interestRateAnnual`
  - `remainingInstallments`

Missing fields:

- Add `credit_limit_satang bigint null`.
  - Constraint: `credit_limit_satang is null or credit_limit_satang >= 0`.
  - Optional relational constraint after product decision: `outstanding_balance_satang is null or credit_limit_satang is null or outstanding_balance_satang <= credit_limit_satang` may be too strict because over-limit cards exist; prefer warning in app rather than hard DB block.
- Add explicit cycle fields if cycle math is required:
  - `statement_cycle_start_date date null`
  - `statement_cycle_end_date date null`
  - `payment_due_date date null` only if it must differ from current `due_date`; otherwise keep `due_date`.
  - Constraint: `statement_cycle_start_date is null or statement_cycle_end_date is null or statement_cycle_start_date <= statement_cycle_end_date`.
- Consider replacing cached `amount_paid_this_cycle_satang` with calculated query or make it explicitly tied to stored cycle window.

Indexing:

- Existing `debts_user_due_date_idx (user_id, due_date)` is useful for due-soon lists.
- Add `debts_user_status_due_date_idx on debts(user_id, status, due_date)` if active due queries grow.
- Add no index for `credit_limit_satang` unless filtering by utilization is introduced.
- Existing transaction indexes should support payment recalc only partially; consider `transactions(user_id, debt_id, type, status, occurred_at)` for cycle-window payment aggregation.

Backward compatibility:

- All new columns should be nullable.
- Backfill nothing automatically.
- Do not rewrite notes into structured fields without a manual/verified migration.
- Preserve existing debt rows with unknown interest, credit limit, and cycle dates.
- Keep old statement import routes readable until existing import batches can be reviewed, summarized, deleted, or rolled back.

## 9. Test Gaps

Needed unit tests:

- Interest validation accepts null/0/typical APR and rejects negative/out-of-range.
- Debt statement review persists `debtType`, `statementBalanceSatang`, `interestRateAnnual`, and `remainingInstallments` once implemented.
- Minimum payment defaults and validation for blank/minimum less than/greater than amount due.
- `amount_paid_this_cycle_satang` respects cycle window after cycle semantics are implemented.
- Partial payments reduce minimum remaining but do not over-credit below zero.
- Payments outside the current cycle do not count toward current-cycle paid.
- Manual `debt_payment` without `debtId` is rejected or reclassified.
- Account ownership validation for transaction and import account IDs.
- Bangkok due-today/due-soon/overdue behavior near UTC/Bangkok day boundary.
- Outstanding-balance behavior after payment, either explicitly unchanged until next statement or recalculated by design.

Needed E2E tests:

- Upload transfer slip as a debt payment and verify linked debt progress, overview, and budget behavior.
- Duplicate slip upload links to existing transaction without creating a second transaction.
- Debt statement review does not automatically create a debt unless the user explicitly confirms create/update.
- Debt statement update cannot update another user's debt.
- History import possible debt-payment row cannot link to another user's debt.
- Concurrent debt payment update/delete recalculates the final paid amount correctly.
- Partial payment flow shows remaining minimum correctly.
- Legacy `/history-import` deprecation path: hidden entry points, direct route behavior, existing batch resume/rollback still works.

## 10. Risk Severity Summary

Blockers:

- Paid-this-cycle currently sums all linked payments across all time; this blocks any debt-first planning that relies on real current-cycle status.
- Debt statement fields are collected but not persisted (`debtType`, `statementBalance`, `interestRateAnnual`, `remainingInstallments`), which blocks trustworthy statement-driven debt planning.

High:

- Manual `debt_payment` can be unlinked from a debt.
- Outstanding balance is not reduced by payment and can be stale unless statement update semantics are explicit.
- Account ownership checks are missing for account IDs supplied to transaction/import paths.
- `credit_limit` is absent.

Medium:

- Due soon/overdue calculations are not Bangkok-local in `daysUntilDue`.
- Statement import remains directly accessible even if primary UI links are hidden.
- Annual interest has no accepted range constraint.
- `recurring_due_day` exists but is not cycle logic.

Low:

- UI copy overload: `/upload` "Statement" means `debt_statement`, while `/history-import` means multi-row historical statement.
- Some client default dates use UTC-derived `toISOString().slice(0, 10)`.

