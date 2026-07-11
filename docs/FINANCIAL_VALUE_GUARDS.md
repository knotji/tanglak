# Financial Value Guards

Production note for the `fix/financial-value-guards` change. Covers why
negative monetary values were reachable, what was classified where, the
database migration's safety strategy, and how to deploy it.

## Problem

Negative amounts (e.g. `-100`) for fields that are semantically "money owed"
or "money paid" were not rejected consistently:

- `src/lib/finance/money.ts`'s `bahtToSatang()` intentionally **preserves**
  the sign of its input (`"-100"` → `-10000` satang) — this is correct for
  callers that need signed conversion, but it means sign-checking must
  happen explicitly wherever a value is meant to be non-negative. It was not
  happening in most write paths.
- `src/app/actions/finance.ts` (manual debt/transaction/payment forms) and
  `src/app/actions/documents.ts` (`confirmDocumentAction`, the document
  review commit path) called `bahtToSatang()` directly and persisted the
  result with no sign check at all.
- Only `transactions.amount_satang` had a database `CHECK` constraint
  (`>= 0`, from the initial schema). Every debt, debt-payment, budget,
  recurring-expense, transaction-item, and import-row monetary column had
  none.
- Client forms (`ManualDebtForm`, `DebtPaymentForm`, `ManualTransactionForm`,
  the debt payment edit form in `DebtPaymentHistoryClient`) used plain
  `inputMode="decimal"` text inputs with no numeric/sign validation — only a
  "field required" check.

The AI extraction path (`src/lib/ai/schemas.ts`) was already correct: every
monetary field uses Zod's `.nonnegative()`, so a Gemini response with a
negative amount already fails schema validation and surfaces as an
extraction failure requiring manual review. No change was needed there.

## Field classification

Central validation lives in `src/lib/finance/money-guards.ts` as two
severities: `"nonnegative"` (may be zero, never negative) and `"positive"`
(must be strictly greater than zero). No third "auto-repair" mode exists —
invalid input is always rejected with a Thai message, never rewritten
(no `Math.abs`, no clamping to zero, no dropping the sign).

### A. Strictly greater than zero (`"positive"`)

- **Debt payment amount** — `debt_payments.amount_satang`, and any
  `transactions` row with `type = 'debt_payment'` (`transactions.amount_satang`
  when that type is set or being set). A recorded payment of ฿0 is not a
  real payment. Enforced in `addDebtPayment`, `createTransaction`,
  `updateTransaction` (type-aware), and client-side in `DebtPaymentForm` and
  the debt payment edit form.

### B. May be zero, never negative (`"nonnegative"`)

- `debts.original_amount_satang`, `outstanding_balance_satang`,
  `statement_balance_satang`, `amount_due_satang`, `minimum_payment_satang`,
  `amount_paid_this_cycle_satang`
- `debt_schedules.amount_due_satang`, `amount_paid_satang`
- `transactions.amount_satang` for every type other than `debt_payment`
  (matches the existing DB check — unchanged)
- `transaction_items.amount_satang` (nullable — null stays null)
- `budget_categories.amount_satang`, `monthly_budgets.income_satang`,
  `recurring_expenses.amount_satang`
- `import_rows.amount_satang`
- All AI-extracted monetary sub-fields (`salary.*`, `receipt.*`,
  `debt.outstandingBalance/statementBalance/amountDue/minimumPayment`) —
  already `.nonnegative()` in `src/lib/ai/schemas.ts`, unchanged.

Note on `amountDue`/`minimumPayment` "when present": the task brief listed
these as candidates for strict positivity in some conditional cases (e.g. an
active debt that genuinely has a balance due). This migration does **not**
add that conditional business rule — it is a cross-field/state-dependent
constraint, not a sign-validity constraint, and doing it well would require
deciding what "requires a balance" means per `debt_status`/`payment_mode`,
which is out of scope for a value-integrity fix. `amountDue`/
`minimumPayment` are treated as Category B (zero allowed — e.g. a paid-off
cycle) here.

No `creditLimit` field currently exists in the schema, Zod types, or any
form. If one is added later it should default to Category B unless product
requirements say otherwise.

### C. Signed by design

None currently. `transactions.amount_satang` is an unsigned magnitude with
its `type` enum (`income` / `expense` / `debt_payment` / `transfer` /
`refund`) carrying the direction — this is existing, correct design and was
**not** changed. If a genuinely signed column (e.g. a running balance delta)
is added in the future, it must be explicitly exempted from these guards.

## Root causes fixed

1. **`confirmDocumentAction`** (`src/app/actions/documents.ts`) parsed every
   monetary form field with `bahtToSatang()` directly and persisted the
   result — a user editing the review form to `-500` would silently persist
   as `-500`. Now every field goes through `parseRequiredMoney`/
   `parseOptionalMoney` (severity per field) before any write, returning a
   safe Thai `{ ok: false, message }` instead.
2. **`saveTransactionAction`/`saveDebtAction`** in
   `src/app/actions/finance.ts` had the same gap, and additionally called
   `bahtToSatang()` *outside* the `try/catch` for two of the five actions —
   a malformed string (not just a negative one) would throw an uncaught
   exception instead of returning a clean validation error. Both issues are
   fixed by validating with the money-guards result type before entering the
   try block.
3. **No repository-level backstop.** Every create/update path is now also
   guarded inside `src/lib/data/finance-repository.ts` itself
   (`createTransaction`, `updateTransaction`, `createDebt`, `updateDebt`,
   `addDebtPayment`), so any future caller gets the same protection without
   having to remember to validate.
4. **Partial-update blind spot.** `updateTransaction` only received whatever
   fields were in a given patch. If a patch changed `type` to
   `'debt_payment'` without also touching `amountSatang` (or vice versa),
   the old amount could be left in place unchecked against the new type.
   `updateTransaction` now fetches the previous `type`/`amount_satang`,
   computes the **final merged state**, and validates that.
   `updateDebt`'s monetary columns are independent per-field (no cross-field
   rule), so validating only the patched fields is equivalent to validating
   the merged row for those columns.
5. **Cross-user `debtId` foreign key.** `createTransaction`/
   `updateTransaction` accepted a caller-supplied `debtId` with no check
   that the referenced debt belongs to the same user. A transaction could be
   pointed at another user's debt row. Both functions now call
   `assertDebtBelongsToUser` first; the debts table itself was already safe
   (every debt query/update was already scoped by `user_id`), so this closes
   a foreign-key consistency gap, not a data leak.

## Client-side validation

`src/lib/finance/money-guards.ts` is imported directly by client components
(pure functions, no server-only imports) so the same parsing/severity logic
runs on both sides. Added to:

- `ManualDebtForm.tsx`, `ManualTransactionForm.tsx`, `DebtPaymentForm.tsx`,
  `DebtPaymentHistoryClient.tsx`'s payment edit form — an `onSubmit` handler
  reads the submitted `FormData`, validates before the `action` prop (a
  Server Action) is allowed to fire, and calls `event.preventDefault()` +
  shows the Thai error inline if invalid. The entered value is never reset
  or altered — only a successful submit clears the form.
- `ReviewForm.tsx` (`validateReviewMoneyFields`) — checks the monetary
  fields relevant to whichever document-type section is visible, plus
  per-item amounts for receipts, before calling `confirmDocumentAction`.

These forms use `inputMode="decimal"` text inputs (not `type="number"`)
specifically to keep supporting comma-formatted amounts like `1,234.50`
(`bahtToSatang` strips commas before parsing) — so HTML `min` is not
applicable there. `ReviewForm.tsx`'s fields are `type="number"`, but a `min`
attribute is intentionally not relied on as the enforcement point (browser
number-input validation UX is inconsistent); the JS-level check above is the
real client-side gate, backed independently by the server.

Thai copy (from `money-guards.ts`, reused everywhere):

- `จำนวนเงินต้องไม่ติดลบ` — nonnegative violation
- `จำนวนเงินต้องมากกว่า 0 บาท` — positive violation
- `รูปแบบจำนวนเงินไม่ถูกต้อง` — malformed/non-finite input (blank, `NaN`,
  `Infinity`, garbage text)

## Server-side validation

Two layers, both independent of the client:

1. **Action layer** (`src/app/actions/finance.ts`,
   `src/app/actions/documents.ts`) — validates immediately after parsing
   `FormData`, before calling any repository function, returning the same
   safe Thai messages as a typed `{ ok: false, message }` result (never a
   raw Zod/Postgres/provider error).
2. **Repository layer** (`src/lib/data/finance-repository.ts`) — the last
   line of defense. `assertMoneySatang()` throws `FinancialValueError`,
   whose `.message` is always one of the three safe Thai strings above, so
   every existing `catch (error) { ... error.message ... }` call site
   already surfaces it safely without any further changes to error
   handling.

No partial persistence: validation always happens before the first write in
a given action branch (e.g. `confirmDocumentAction` validates all fields for
a branch before calling `createTransaction`/`createDebt`/`updateDebt`), and
repository guards throw before constructing the insert/update payload.

## Database constraints and migration strategy

New migration: `supabase/migrations/202607110001_financial_value_guards.sql`
(historical migration files were not touched). It adds named `CHECK`
constraints, matching the classification above, to: `debts` (five nullable
+ one not-null column), `debt_schedules`, `debt_payments` (`> 0`),
`budget_categories`, `monthly_budgets`, `recurring_expenses`,
`transaction_items` (nullable-aware), and `import_rows`.
`transactions.amount_satang` already had its constraint from the initial
schema and was left alone.

**Why `not valid`, not a direct constraint**: the task states production
data cannot be assumed clean. `alter table ... add constraint ... check (...)`
without `not valid` forces Postgres to scan and validate every existing row
as part of the same transaction — if even one legacy row already has a
negative debt balance (entirely possible, since these columns were
previously unconstrained), the migration fails outright and the whole
deploy is blocked. `not valid` skips that scan: the constraint is registered
and enforced against all **new** inserts/updates immediately, but existing
rows are left untouched (not rewritten, not deleted, not silently coerced).
This is the two-step migration the task asks for; step two
(`validate constraint`) is a deliberate, separate, future migration — not
bundled into this one — because it should only run after an operator has
confirmed (or fixed) the data.

### Preflight query (run before step two)

Run for each table before ever issuing `validate constraint`:

```sql
-- Debts
select id, user_id, original_amount_satang, outstanding_balance_satang,
       statement_balance_satang, amount_due_satang, minimum_payment_satang,
       amount_paid_this_cycle_satang
from public.debts
where original_amount_satang < 0
   or outstanding_balance_satang < 0
   or statement_balance_satang < 0
   or amount_due_satang < 0
   or minimum_payment_satang < 0
   or amount_paid_this_cycle_satang < 0;

select id, user_id, amount_due_satang, amount_paid_satang
from public.debt_schedules
where amount_due_satang < 0 or amount_paid_satang < 0;

select id, user_id, amount_satang from public.debt_payments where amount_satang <= 0;
select id, user_id, amount_satang from public.budget_categories where amount_satang < 0;
select id, user_id, income_satang from public.monthly_budgets where income_satang < 0;
select id, user_id, amount_satang from public.recurring_expenses where amount_satang < 0;
select id, user_id, amount_satang from public.transaction_items where amount_satang < 0;
select id, user_id, amount_satang from public.import_rows where amount_satang < 0;
```

### If invalid rows are found

Do **not** auto-remediate by clamping/absolute-valuing them in a migration
— that would silently rewrite a user's financial history, which this task
explicitly forbids. Instead:

1. Export the offending rows (the query above) for manual, case-by-case
   review — a negative `amount_due_satang` most likely means the value was
   entered/imported backwards and should be corrected via the normal
   application update path (which now itself rejects negative writes) after
   determining the true intended value, not guessed.
2. Once every violating row is corrected (or intentionally excluded — no
   such exclusion mechanism exists today, so in practice every row must be
   fixed), run the follow-up migration:
   ```sql
   alter table public.debts validate constraint debts_outstanding_balance_satang_nonnegative;
   -- ... repeat per constraint name added in 202607110001 ...
   ```
   `validate constraint` only scans, it does not lock writers for long (uses
   a lighter lock than the initial `add constraint`), and fails loudly
   (clear Postgres error) if any row still violates it — it will not skip
   or ignore bad rows.
3. If the preflight query returns zero rows for a table, `validate
   constraint` is safe to run immediately with no further action.

### Rollback approach

`not valid` constraints can be dropped cheaply and safely if needed:

```sql
alter table public.debts drop constraint if exists debts_outstanding_balance_satang_nonnegative;
-- ... one per constraint name ...
```

Since nothing was rewritten and no historical migration was edited, rollback
is purely additive-removal — no data migration is required to undo this
change.

## Ownership/authorization

Verified while auditing these write paths (not a general RLS redesign):

- Every debt/transaction update and delete already scoped queries by both
  `id` and `user_id` (`finance-repository.ts`), not RLS alone — this was
  already correct and is unchanged.
- **Fixed**: `createTransaction`/`updateTransaction` accepted a
  caller-supplied `debtId` with no check that it belongs to the same user.
  Added `assertDebtBelongsToUser()`, called whenever `debtId` is present in
  either function's input — covers both call sites that set it
  (`confirmDocumentAction`'s transfer/debt-payment branch and the history
  import commit path in `finance-repository.ts`).

## Tests

- `tests/unit/money-guards.test.ts` — parse/assert-level coverage: negative
  rejected (both severities), zero accepted/rejected per severity, positive
  decimals accepted, `NaN`/`Infinity`/malformed strings rejected, blank
  optional stays `undefined`, comma-formatted amounts still parse, no
  `Math.abs`/clamping (asserts the returned satang keeps the original
  negative value's magnitude untouched — i.e. that a negative input is
  rejected outright rather than transformed).
- `tests/unit/finance-actions.test.ts` — server action-level: negative
  `amountDue`/`minimum`/payment amount rejected without persisting, zero
  debt payment rejected (Category A), partial debt update validates the
  patched fields, malformed string returns a clean `{ ok: false }` instead
  of throwing.
- `tests/unit/repository-financial-guards.test.ts` — repository-level:
  create/update reject negative values, `updateTransaction` validates the
  final merged type+amount state, cross-user `debtId` is rejected.
- `tests/unit/financial-value-guards-migration.test.ts` — static assertion
  (same pattern as the existing `tests/unit/rls.test.ts`) that the new
  migration file exists, is additive/idempotent (`if not exists` guards),
  uses `not valid`, names every constraint, and that no historical
  migration file was modified.
- `tests/e2e/financial-value-guards.spec.ts` — manual debt creation with a
  negative value is rejected with the Thai message and the entered value is
  preserved; editing an existing debt to a negative value is rejected;
  document review with a negative field is rejected before submission
  reaches the server; a normal positive-value create/edit flow still
  succeeds.

## Deployment/preflight procedure summary

1. Deploy application code (this branch) — safe on its own; server/client
   guards work regardless of whether the DB migration has run yet.
2. Run `supabase/migrations/202607110001_financial_value_guards.sql` — safe,
   non-blocking (`not valid`, no row scan, no rewrite).
3. Run the preflight queries above against production.
4. If any rows are returned, remediate them manually through the
   application (not SQL rewrites) before proceeding.
5. Once every table's preflight query returns zero rows, run the follow-up
   `validate constraint` migration (not included in this branch — a
   deliberate separate change once preflight is clean).

## Remaining risks / out of scope

- Conditional business rules (e.g. "amountDue must be > 0 for an active
  debt that has a balance") were intentionally not implemented — see field
  classification note above.
- `debt_payments`/`debt_schedules` have no dedicated repository
  create/update functions found in this codebase beyond what
  `addDebtPayment` already covers; if one is added later it must reuse
  `money-guards.ts`, not reimplement parsing.
- Steps 4–5 of the deployment procedure are manual/operational — this
  branch does not (and should not) automate remediation of any existing bad
  production rows.
