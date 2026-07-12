# TangLak Financial Invariants

This document is the source of truth for locked product/financial rules.
Read it before any change that touches transactions, debts, payments,
document extraction, or review confirmation. If a task appears to require
violating one of these rules, stop and ask — do not implement it.

## 1. Current product state

1. Slip-first upload and debt planning are the active primary product
   direction (bank-statement/CSV import is a legacy, de-emphasized path,
   not the primary flow).
2. Supabase migrations `202607110006` through `202607110010` are the
   current migration set (interest-rate guard, debt cycle fields,
   minimum-not-above-outstanding constraint, debt-recalculation execute
   hardening, and the import debt-payment link requirement).
3. Bank statement import remains functional but is intentionally demoted
   in the UI — it is not the primary/recommended path on `/upload` or
   `/settings/data`.
4. `amount_paid_this_cycle_satang` is **cycle-scoped**: it reflects only
   confirmed `debt_payment` transactions within the debt's own cycle
   window (`cycle_start_date`/`cycle_end_date`, falling back to the
   current Bangkok calendar month when unset). It is never a lifetime
   total.
5. Recording a debt payment must **never** automatically decrease
   `outstanding_balance_satang`. Outstanding balance is only ever changed
   by an explicit debt edit/update, never derived from payment history.
6. Every transaction with `type = "debt_payment"` must carry an explicit,
   caller-owned `debt_id`. An unlinked `debt_payment` must be rejected,
   not silently downgraded to `expense` or auto-linked by guessing.
7. Reopening a closed (`paid_off`/`paused`) debt is disabled in Phase 1.
   The repository primitive may exist for a future phase, but no Phase 1
   UI or server action may reach it.
8. `minimum_payment_satang` must never exceed `outstanding_balance_satang`
   for the same debt row. This is enforced client-side, server-side, in
   the repository (against the final merged state), and at the database
   level via a `NOT VALID` check constraint.
9. Draft (AI) extraction may be genuinely incomplete — a missing or
   unparseable `transaction.occurredAt` is a valid draft state and routes
   the document to `needs_review` rather than failing extraction, as long
   as the document's other required fields (amount, type, etc.) parsed
   successfully. Broader missing-field problems still fail extraction.
10. Final confirmation (turning a draft/reviewed document into a real
    transaction or debt payment) must validate every required financial
    field **server-side** before any row is written. Client-side
    validation is a UX convenience only, never the authoritative check.
11. A missing or invalid transaction timestamp must **never** receive a
    fabricated fallback — not current time (`new Date()`/`Date.now()`),
    not upload time, not the document's `created_at`, not retry time, and
    not server time. If the timestamp is missing/invalid, confirmation
    must be rejected with a clear Thai error, not silently filled in.
12. Bangkok-local date/time entered or extracted must not shift
    unexpectedly across a timezone boundary. Conversions use fixed
    `+07:00`-offset, literal-digit construction — never a bare `new
    Date(dateTimeLocalString)` parse, which reinterprets an offset-less
    string using the server/runtime's own timezone.
13. Retrying a failed or needs-review document extraction must reuse the
    existing document row and the existing storage object — never create
    a duplicate document row or a duplicate storage upload for the same
    logical document.
14. A validation failure at final confirmation must not partially persist
    a transaction, a debt payment, or a cycle-progress update. Either
    every required write for that confirmation succeeds, or none of them
    do.
15. No new Supabase migration should be added without the triggering
    Issue explicitly authorizing "migration allowed: Yes" and stating
    what the migration is for. Never edit a historical (already-merged)
    migration file — additive migrations only.

## 2. Examples of prohibited behavior

These are concrete patterns that have caused real bugs in this codebase.
Do not reintroduce them.

- **Fabricating a timestamp on write.**
  ```ts
  // PROHIBITED
  await createTransaction(userId, {
    type: "debt_payment",
    amountSatang,
    occurredAt: new Date().toISOString(), // never do this for a
                                           // reviewed/user-confirmed write
    debtId,
  });
  ```
  Every write path that persists a *reviewed* or *user-confirmed*
  transaction must receive an explicit, validated `occurredAt` from the
  caller. (A distinct, intentional "pay now" quick-pay action is the only
  place a current-time default is acceptable, and it must be documented
  as such at the call site.)

- **Reducing outstanding balance from a payment.**
  ```ts
  // PROHIBITED
  await updateDebt(userId, debtId, {
    outstandingBalanceSatang: debt.outstandingBalanceSatang - amountSatang,
  });
  ```
  Payments update `amount_paid_this_cycle_satang` via recalculation, never
  `outstanding_balance_satang` directly.

- **Silently downgrading or auto-linking an unlinked debt payment.**
  ```ts
  // PROHIBITED
  const type = debtId ? "debt_payment" : "expense"; // silent downgrade
  // PROHIBITED
  const debtId = guessDebtFromMerchantName(merchant); // silent auto-link
  ```
  A `debt_payment` with no `debt_id` must be rejected with a clear error;
  it must never change type or invent a link.

- **Dynamic `process.env` access for `NEXT_PUBLIC_*` variables.**
  ```ts
  // PROHIBITED
  const value = process.env[keyName]; // breaks Next.js build-time client
                                       // inlining -- causes SSR/client
                                       // hydration divergence
  ```
  Always use a static, literal `process.env.NEXT_PUBLIC_X` expression.

- **Client-only validation for a financial write.**
  ```ts
  // PROHIBITED: server action trusts the client's own check
  export async function confirmDocumentAction(id: string, formData: FormData) {
    // ...no server-side re-validation of amount/occurredAt/debtId...
    await createTransaction(userId, { amountSatang, occurredAt, debtId });
  }
  ```
  Every server action that writes a financial record must independently
  re-validate required fields, exactly like the client did, before
  writing.

- **Weakening a test to make a suite pass.**
  ```ts
  // PROHIBITED
  expect(result.ok).toBe(true); // was `toBe(false)` before someone
                                 // "fixed" a real regression this way
  ```
  If a test fails, fix the underlying behavior or explain in the PR why
  the test's expectation was wrong — never invert/loosen an assertion
  just to get CI green.

## 3. Where to look

- `src/lib/finance/debt-guards.ts`, `src/lib/finance/money-guards.ts` —
  shared validation helpers and their Thai error copy.
- `src/lib/finance/date.ts` — Bangkok-safe date/time parsing and
  conversion helpers (`parseWallClockComponents`,
  `bangkokDateTimeLocalToInstant`, `getBangkokTodayString`, etc.).
- `src/lib/data/finance-repository.ts` — `createTransaction`,
  `updateTransaction`, `addDebtPayment`, `recalculateDebtPaidThisCycle`,
  and the final-merged-state validation pattern.
- `src/app/actions/documents.ts` — `confirmDocumentAction`, the
  server-side final-confirmation boundary for document review.
- `src/lib/ai/schemas.ts`, `src/lib/ai/extraction-errors.ts`,
  `src/lib/ai/gemini.ts` — draft extraction schema, missing/invalid-field
  classification, and timestamp normalization.
- `docs/DEBT_PLANNING_ENGINE.md` — the fuller design document for debt
  cycle semantics.
