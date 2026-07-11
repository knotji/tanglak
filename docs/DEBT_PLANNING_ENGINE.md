# Debt Planning Engine

TangLak treats debt planning as an explicit, reviewed flow. Upload/review can extract debt-statement fields, but debt rows are created or updated only after the user confirms the review form.

## Active Cycle Fields

`debts.amount_due_satang` is the full amount due for the active billing cycle. `debts.minimum_payment_satang` is the minimum required for that same cycle. `debts.amount_paid_this_cycle_satang` is a cached total of confirmed linked `debt_payment` transactions within the active cycle window.

Cycle boundaries are `cycle_start_date` and `cycle_end_date`. When both are missing, calculation falls back to the current Bangkok calendar month. Dates are interpreted as Bangkok local dates, with inclusive start and exclusive end at the next Bangkok midnight.

Statement metadata is stored separately:

- `statement_balance_satang`: balance from the reviewed statement.
- `statement_date`: statement issue date when available.
- `outstanding_balance_satang`: latest known outstanding balance.
- `interest_rate_annual`: optional percent, 0 through 100 inclusive.
- `remaining_installments`: optional non-negative integer.
- `credit_limit_satang`: optional non-negative credit limit.

## Payment Semantics

Only confirmed transactions with `type = debt_payment` and a matching `debt_id` affect a debt's `amount_paid_this_cycle_satang`. Unlinked `debt_payment` transactions remain cash-flow records, but they do not count toward any debt. Old-cycle and future-cycle payments are excluded from the cached current-cycle total.

Debt payments still count as `debtPaymentSatang` in monthly cash-flow totals. They are not living expenses and should not also be counted as category spend unless a feature intentionally models finance charges or fees as separate expense transactions.

Minimum remaining is `max(0, minimum_payment_satang - amount_paid_this_cycle_satang)`. Full-cycle remaining is `max(0, amount_due_satang - amount_paid_this_cycle_satang)`. Missing minimum or amount-due fields are not treated as paid.

## Due-date and payment-satisfaction status (display only)

`src/lib/finance/debt-status.ts` computes a single `DebtDueStatus` per debt
for UI display: `not_yet_due` (ยังไม่ถึงกำหนด), `due_soon` (ใกล้ครบกำหนด,
within 3 days), `due_today` (ครบกำหนดวันนี้), `overdue` (เกินกำหนด),
`minimum_paid` (จ่ายขั้นต่ำแล้ว), `cycle_paid_in_full` (จ่ายครบยอดรอบนี้แล้ว).
Payment satisfaction is checked first and wins over date urgency: a debt
whose `amount_paid_this_cycle_satang` already meets `amount_due_satang` or
`minimum_payment_satang` reports as paid even if its due date has passed.

This status is **never** persisted and **never** triggers a transition of
the stored `debts.status` column (`active`/`paid_off`/`overdue`/`paused`) —
closing a debt always requires the existing explicit
`markDebtPaidOff`/"ปิดหนี้" user action. `debtDueStatus` reaching
`cycle_paid_in_full` or the outstanding balance reaching zero must never be
read as "the debt is closed."

## Interest-rate display (approximation only)

`src/lib/finance/debt-interest.ts` formats `ดอกเบี้ย X% ต่อปี (ประมาณ Y%
ต่อเดือน)`, where the monthly figure is a simple `annualRate / 12` average —
not a compounding model — and is always labeled "ประมาณ" (approximate). The
disclaimer `ดอกเบี้ยโดยประมาณ อาจต่างจากยอดที่สถาบันการเงินเรียกเก็บจริง` is
exposed as `INTEREST_APPROXIMATION_DISCLAIMER_TH` for any surface that shows
an interest figure. Nothing in this codebase uses `interest_rate_annual` in
a payoff, amortization, or projected-interest-charge calculation — it is
display-only.

## Monthly debt obligation summary

`src/lib/finance/debt-summary.ts` (`buildMonthlyDebtSummary`) computes, for
a given Bangkok month:

- **หนี้ทั้งหมด** (`totalOutstandingSatang`) — sum of `outstandingBalanceSatang`
  across every debt passed in, independent of due date.
- **ต้องจ่ายเดือนนี้** (`totalDueThisMonthSatang`) — sum of `amountDueSatang`
  for debts whose `dueDate` falls within the target month.
- **ขั้นต่ำรวม** (`totalMinimumThisMonthSatang`) — sum of
  `minimumPaymentSatang` for the same due-this-month debts.
- **จ่ายแล้วเดือนนี้** (`totalPaidThisMonthSatang`) — sum, per debt, of
  confirmed `debt_payment` transactions whose `occurredAt` falls inside that
  debt's own cycle window (`cycleStartDate`/`cycleEndDate` via
  `getDebtCycleWindow`, falling back to the calendar month when cycle dates
  are unset). Computed per-`debtId`, so one payment can never be
  double-counted across two debts.
- **เหลือขั้นต่ำ** (`totalRemainingMinimumSatang`) — sum of
  `max(0, minimumPaymentSatang - paidThisCycle)` per due-this-month debt,
  floored at zero per debt before summing (an overpayment on one debt never
  offsets another debt's remaining minimum).

This function is pure and read-only: it never writes to the database, never
changes `debts.status`, and **never derives anything from
`outstandingBalanceSatang` minus a payment amount** — a recorded payment can
only ever change `totalPaidThisMonthSatang`/`totalRemainingMinimumSatang`,
consistent with the product rule that payments never auto-reduce total
outstanding balance.

## Security

Repository writes validate caller-supplied debt IDs and account IDs against the current user before inserting or updating transactions/import batches. The import commit RPC also validates source and destination account ownership before writing transaction links, so direct RPC calls cannot attach another user's account.

RLS remains the primary database boundary. The RPCs use `security invoker`, so table RLS still applies, and the functions include explicit `user_id` checks for clearer failures and defense in depth.

## Migration Notes

`202607110007_debt_cycle_fields.sql` is additive:

- Adds nullable `cycle_start_date`, `cycle_end_date`, `statement_date`, and `credit_limit_satang`.
- Adds `NOT VALID` checks for cycle date ordering and non-negative credit limits.
- Adds an index for cycle recalculation over user/debt/type/status/occurred timestamp.
- Replaces `recalculate_debt_paid_this_cycle`, `import_commit_row`, and `import_rollback_batch` so imports use the same cycle-scoped Bangkok semantics.

No historical migration is edited and no existing row is rewritten. Existing rows with no cycle dates fall back to the current Bangkok month.

## Test Coverage

Current focused unit coverage includes:

- Active-cycle scoping, fallback month behavior, and unlinked debt-payment exclusion.
- Minimum-paid versus full-cycle-paid status.
- Bangkok due-today/overdue boundaries.
- Debt-statement field persistence.
- Cross-user debt and account ID rejection.
- Migration coverage for columns, constraints, Bangkok boundaries, and RPC ownership checks.

Remaining higher-level coverage to add before release:

- E2E review confirmation for a debt statement, proving no debt is created until confirm.
- E2E duplicate slip/import behavior with linked debt payments.
- Concurrent import/debt-payment updates against a real database.
- Legacy statement-import route deprecation or hiding behavior.
