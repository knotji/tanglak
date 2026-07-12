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

Locked invariant: `minimum_payment_satang` must never exceed
`outstanding_balance_satang` for the same debt row. Enforced in every layer
that can write these fields: `ManualDebtForm.tsx` (client, fast feedback
only), `saveDebtAction` (server action), `validateDebtInput` in
`finance-repository.ts` (checked against the final merged state — a patch
that only changes one of the two fields is still validated against the
other's current stored value), and the document-review debt-statement
confirm path in `actions/documents.ts`. The database also enforces this via
the `debts_minimum_not_above_outstanding` `NOT VALID` check constraint added
in `202607110008_debt_minimum_not_above_outstanding.sql`. The check is a
no-op whenever either value is unset — an unset outstanding balance never
constrains the minimum. Violations are rejected with
`ยอดขั้นต่ำต้องไม่มากกว่ายอดหนี้ทั้งหมด`; no layer silently clamps either
value.

## Payment Semantics

Only confirmed transactions with `type = debt_payment` and a matching `debt_id` affect a debt's `amount_paid_this_cycle_satang`. Old-cycle and future-cycle payments are excluded from the cached current-cycle total.

Locked invariant: a transaction of type `debt_payment` must always carry an
explicit, same-user `debt_id` — an unlinked `debt_payment` can no longer be
created or persisted at all (never silently downgraded to `expense`, never
auto-linked, never leaves a debt auto-created). This is enforced in
`createTransaction`/`updateTransaction` (`assertDebtPaymentLinked` in
`src/lib/finance/debt-guards.ts`, checked against the final merged state),
in `saveTransactionAction` and `ManualTransactionForm.tsx` (which now
requires picking a debt whenever "ชำระหนี้" is selected), and in every
document-review confirmation path that can create a `debt_payment`
transaction. A transaction that isn't a debt payment is unaffected — expense/
income/transfer/refund never require a `debt_id`.

**Import review follows the same invariant.** `commitImportRow` in
`src/lib/data/finance-repository.ts` now calls `assertDebtPaymentLinked`
before delegating to the mock store or the `import_commit_row` RPC, so a
review decision that sets `transactionType: "debt_payment"` with no
`debtId` is rejected with `กรุณาเลือกหนี้ที่เกี่ยวข้องกับรายการชำระนี้` and
the row is left unresolved (retryable, values preserved) rather than
silently confirmed. `ReviewBoardClient.tsx` blocks the "confirm" submit
client-side the same way, expanding the offending row instead of sending
the batch. The `public.import_commit_row` Postgres function
(`202607110010_require_import_debt_payment_link.sql`) enforces the same
rule as the ultimate boundary: `p_type = 'debt_payment' and p_debt_id is
null` raises before any row is written, in addition to its existing
same-user debt-ownership check for a non-null `p_debt_id`. **No path may
silently create a debt to satisfy this invariant** — a row that fails this
check must be corrected by the user (pick an existing debt or change the
transaction type), never auto-resolved.

**Legacy unlinked rows.** This invariant is enforced going forward only; no
migration deletes, updates, or relinks a pre-existing `debt_payment`
transaction with a null `debt_id`. Such rows may continue to affect
overview/cash-flow totals under existing semantics (they still count as
`debtPaymentSatang` cash flow), but — consistent with the recalculation
rule above — they have never counted and still do not count toward any
debt's `amount_paid_this_cycle_satang`, since that has always required a
matching `debt_id`. A user may edit/link such a row later only through
whatever explicit transaction-edit UI already exists; nothing links it
automatically.

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

The Today dashboard's single highest-priority action
(`src/lib/finance/next-action.ts`, `determineNextAction`) ranks debt urgency
as: overdue minimum > due today > due within 3 days > minimum not met (any
other due date, including none) > monthly-budget prompts. Due today
(`ครบกำหนดชำระวันนี้`) is a distinct tier from due soon
(`ใกล้ครบกำหนดชำระ`) — it is never rendered as "due in 0 days" merged into
the due-soon bucket. Only one card is ever returned; when more than one debt
shares a tier, any additional urgent debts are summarized in the card's body
text (`และมีหนี้ใกล้ครบกำหนดอีก N รายการ`) rather than rendered as competing
cards.

**Reopening a closed debt is deferred to Phase 2.** The
`reopenDebt` repository primitive still exists (kept for a future reviewed
Phase 2 flow) but `reopenDebtAction` — the only path any Phase 1 UI can
reach it through — always rejects with
`การเปิดหนี้ที่ปิดแล้วยังไม่รองรับในเวอร์ชันนี้` instead of calling it. The
debts list shows closed debts as `ปิดหนี้แล้ว` /
`ข้อมูลและประวัติการชำระยังคงเก็บไว้` with no reopen control; a closed
debt's payment history remains fully visible via its detail/history page.

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

`paidWithinCycle` (the per-debt helper behind `totalPaidThisMonthSatang`)
compares transaction timestamps as instants (`new Date(...).getTime()`),
never as raw ISO strings. Two different-but-equivalent representations of
the same instant (a `Z`-suffixed UTC timestamp versus an explicit
`+07:00`-offset one) can sort differently under lexical string comparison
even when the underlying instant is on the correct side of a cycle
boundary; instant comparison avoids that class of bug. Cycle/month windows
are half-open: the start instant is inclusive, the end instant
(`endExclusiveInstant`, the next Bangkok midnight) is exclusive.

**Scope, in UI terms:** `DebtsClient.tsx` renders two separate sections so
the two scopes can never be read as the same number — `ยอดหนี้ทั้งหมด`
(lifetime `totalOutstandingSatang`, independent of due month) and
`สรุปเดือนนี้` (target-month `totalDueThisMonthSatang` /
`totalMinimumThisMonthSatang` / `totalPaidThisMonthSatang` — labeled
"จ่ายแล้วในรอบที่เกี่ยวข้อง" — /
`totalRemainingMinimumSatang`), with footer copy explicitly calling out that
the this-month box does not represent the lifetime total and may not match
the budget page's or overview page's own debt-related totals, since each
page scopes its numbers differently.

## Security

Repository writes validate caller-supplied debt IDs and account IDs against the current user before inserting or updating transactions/import batches. The import commit RPC also validates source and destination account ownership before writing transaction links, so direct RPC calls cannot attach another user's account.

RLS remains the primary database boundary. `import_commit_row` and
`import_rollback_batch` use `security invoker`, so table RLS still applies,
and the functions include explicit `user_id` checks for clearer failures and
defense in depth.

`public.recalculate_debt_paid_this_cycle(uuid)` is `security definer` (it
recomputes a cached total across a debt's own transactions, which needs to
run regardless of the caller's own RLS visibility). As originally shipped in
`202607110007`, it had no explicit grants, so Postgres's default
PUBLIC-executable grant applied — meaning it was directly callable, with any
debt UUID, by any authenticated (and, since Supabase exposes every
public-schema function over PostgREST, even anonymous) caller.
`202607110009_harden_debt_recalculation_execute.sql` closes this: EXECUTE is
explicitly revoked from PUBLIC and re-granted only to `authenticated`
(preserving the existing call chain — `import_commit_row`/
`import_rollback_batch` are `security invoker`, so their nested
`perform public.recalculate_debt_paid_this_cycle(...)` calls are checked
against the `authenticated` role and still work), and the function body now
rejects any caller whose `auth.uid()` doesn't own the target debt
(`auth.uid()` is null and therefore unrestricted only in service-role/
administrative contexts that carry no JWT). The application layer's own
`recalculateDebtPaidThisCycle` TypeScript helper does not call this RPC at
all — it recomputes and writes directly through the Supabase client, scoped
by RLS and an explicit `user_id` filter — so this RPC is reachable only from
the two trusted import functions and, now, from a direct call that owns the
target debt.

## Migration Notes

`202607110007_debt_cycle_fields.sql` is additive:

- Adds nullable `cycle_start_date`, `cycle_end_date`, `statement_date`, and `credit_limit_satang`.
- Adds `NOT VALID` checks for cycle date ordering and non-negative credit limits.
- Adds an index for cycle recalculation over user/debt/type/status/occurred timestamp.
- Replaces `recalculate_debt_paid_this_cycle`, `import_commit_row`, and `import_rollback_batch` so imports use the same cycle-scoped Bangkok semantics.
- This migration's preflight/rollback documentation is lighter than
  `202607110006`'s; that gap is intentionally left as-is rather than rewritten
  after the fact (see F-010 in `docs/SLIP_DEBT_IMPLEMENTATION_FINDINGS.md`) —
  historical migrations are never edited, only followed by additive ones.

`202607110008_debt_minimum_not_above_outstanding.sql` is additive: adds a
`NOT VALID` check constraint enforcing the minimum-not-above-outstanding
invariant described above. No existing row is scanned, rewritten, or
validated by this migration.

`202607110009_harden_debt_recalculation_execute.sql` is additive: replaces
`recalculate_debt_paid_this_cycle`'s body to add the ownership check
described above, and adds explicit `revoke`/`grant` statements for it. No
table row is read or written by this migration.

`202607110010_require_import_debt_payment_link.sql` is additive: replaces
`import_commit_row`'s body to reject `p_type = 'debt_payment' and
p_debt_id is null` before locking or writing any row, closing the F-001 gap
in `docs/SLIP_DEBT_FINAL_SECURITY_AUDIT.md` where import review could
confirm an unlinked debt payment. It reapplies the same `security invoker`,
`search_path`, `revoke all ... from public`, and `grant execute ... to
authenticated` statements as 007, unchanged — this migration does not widen
or narrow who may call the function, only what it accepts. `debt_id`
ownership validation for a non-null value, source/destination account
ownership validation, and the idempotent already-resolved short-circuit are
all unchanged. `import_rollback_batch` is not touched by this migration and
continues to work unmodified. No table row is read, updated, or deleted by
this migration — existing unlinked `debt_payment` rows from before this
migration are left exactly as they are (see "Payment Semantics" above).

Deployment order is unchanged in shape, now extended by one step: 006 → 007
→ 008 → 009 → 010. A database already current through 009 should propose
only 010. **Live verification required after applying 010**: confirm a
review decision with `type = debt_payment` and no `debt_id` is rejected
end-to-end (not just accepted and silently unlinked), and confirm existing
import/rollback behavior for linked debt payments and non-debt-payment rows
is unchanged.

No historical migration is edited and no existing row is rewritten. Existing rows with no cycle dates fall back to the current Bangkok month.

## Test Coverage

Current focused unit coverage includes:

- Active-cycle scoping, fallback month behavior, and rejection of unlinked debt-payment transactions at the repository layer.
- Minimum-not-above-outstanding rejection, including the final-merged-state case where a patch only touches one of the two fields.
- Minimum-paid versus full-cycle-paid status.
- Bangkok due-today/overdue boundaries, plus instant-based (not lexical) cycle-window boundary tests: cycle start inclusive, cycle end exclusive, a UTC `Z` timestamp mapping into the Bangkok cycle, first/last instant of a month.
- Today-dashboard priority ordering: overdue > due-today > due-soon > unmet-minimum, with the required due-today/due-soon copy.
- Debt-statement field persistence, and rejection of an unconfirmed create/update choice during document review.
- Cross-user debt and account ID rejection.
- Migration coverage for columns, constraints, Bangkok boundaries, and RPC ownership/grant checks (008, 009, 010).
- Import review rejects an unlinked `debt_payment` decision (missing `debtId`), accepts one linked to an owned debt, rejects one linked to another user's debt, leaves non-debt-payment rows unaffected, never auto-creates a debt, stays idempotent on retry, and rollback remains safe even when the only row in a batch was rejected.
- A legacy (pre-invariant) unlinked `debt_payment` transaction is left untouched by an unrelated import commit in the same test run.
- Migration assertions are line-ending agnostic (LF and CRLF both normalize to the same asserted content).

Remaining higher-level coverage to add before release:

- E2E review confirmation for a debt statement, proving no debt is created until confirm.
- E2E duplicate slip/import behavior with linked debt payments.
- Concurrent import/debt-payment updates against a real database.
- A live-database (not migration-text-assertion) check that
  `recalculate_debt_paid_this_cycle` actually rejects a cross-user call at
  runtime, once a database-backed test harness is available.
