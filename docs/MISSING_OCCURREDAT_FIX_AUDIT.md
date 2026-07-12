# Missing occurredAt Review-Flow Fix Audit

Audit date: 2026-07-12

Source worktree: `C:\Project\tanglak-missing-occurredat-fix`

Audit worktree: `C:\Project\tanglak-missing-occurredat-audit`

Source branch audited: `fix/missing-occurredat-review-flow`

Audit branch: `audit/missing-occurredat-review-flow`

Base HEAD: `a754a9aaabde46eb82f094bcd19fff898513787e`

Source HEAD audited: `52d01efc252a38cb935fd262db331033dc596292`

Range audited: `a754a9aaabde46eb82f094bcd19fff898513787e..52d01efc252a38cb935fd262db331033dc596292`

## Executive Assessment

The draft extraction and processing changes are mostly scoped correctly: missing or invalid `transaction.occurredAt` can become a review-required draft without weakening amount/type/debt required fields, valid document timestamps are normalized deterministically, and retry reuses the existing document row and storage object.

However, the implementation is not deployment-ready. A transfer-slip confirmation classified as `debt_payment` still bypasses the new `occurredAt` validation and delegates to `addDebtPayment`, which stamps both `transactions.occurred_at` and `debt_payments.paid_at` with `new Date().toISOString()`. The requested E2E verification also failed in the new missing-date review scenario: after submitting with a blank date, the required Thai error copy did not become visible, causing the serial document-flow group to stop at 70/80 E2E tests.

## Verification Commands

Preflight checks passed before audit work:

- Source branch matched `fix/missing-occurredat-review-flow`.
- Source HEAD matched `52d01efc252a38cb935fd262db331033dc596292`.
- Source worktree was clean.
- Target worktree was created at `C:\Project\tanglak-missing-occurredat-audit` on `audit/missing-occurredat-review-flow`.
- No migration was applied.

Command results from the audit worktree:

| Command | Result |
| --- | --- |
| `npm ci` | Passed. Installed 468 packages. `npm audit` summary reported 2 moderate vulnerabilities. |
| `npm run lint` | Passed with 0 errors and 9 warnings. |
| `npm run typecheck` | Passed. |
| `npm run test` | Passed: 46 files, 575 tests. |
| `npm run build` | Passed. |
| `npm run test:e2e -- --workers=6` | Failed: 70 passed, 1 failed, 9 did not run. Minimum E2E floor of 80 was not met. |

E2E failure:

- Failing test: `tests/e2e/document-flow.spec.ts:119`
- Scenario: missing-date upload should open review, reject blank confirmation, then accept manually entered date.
- Failure: `getByText("กรุณาระบุวันที่และเวลาของรายการ")` was not visible after clicking the confirm button with a blank date.
- Artifact: `test-results\document-flow-Gemini-Docum-0fe65-ually-entered-date-succeeds-mobile-chrome\error-context.md`

## Schema Assessment

Pass with one expected narrowing:

- `src/lib/ai/schemas.ts:34-40` makes only `transaction.occurredAt` optional at draft extraction level.
- `src/lib/ai/schemas.ts:103-115` documents that `occurredAt` is intentionally not enforced in draft validation and must be enforced at final confirmation.
- Required financial fields remain enforced:
  - Salary requires `salary.netIncome` or `transaction.amount`: `src/lib/ai/schemas.ts:116-126`.
  - Receipt, delivery receipt, and other require `transaction.type` and `receipt.totalPaid` or `transaction.amount`: `src/lib/ai/schemas.ts:128-147`.
  - Transfer slip requires `transaction.type` and `transaction.amount`: `src/lib/ai/schemas.ts:149-168`.
  - Debt statement and loan schedule require `debt.dueDate` and `debt.amountDue` or `debt.minimumPayment`: `src/lib/ai/schemas.ts:170-188`.
- `src/lib/ai/extraction-errors.ts:26-41` removes `transaction.occurredAt` from incomplete-financial-field classification while keeping all other financial paths.

Assessment: no broad schema weakening was found in the audited range.

## Normalization Assessment

Mostly pass:

- `src/lib/ai/gemini.ts:33-52` strips missing or unparseable `transaction.occurredAt`, records `transaction.occurredAt` in `unclearFields`, and preserves valid parsed timestamps from `parseDocumentTimestamp`.
- `src/lib/finance/date.ts:178-191` validates `datetime-local` wall-clock components without `Date` rollover.
- `src/lib/finance/date.ts:235-242` converts a validated Bangkok local date/time to a fixed `+07:00` instant by formatting the entered digits, avoiding local-server timezone shifts.
- `Date.now()` in `src/lib/ai/gemini.ts:81` and `src/lib/ai/gemini.ts:136` is provider-duration logging only, not a transaction timestamp fallback.

Blocker exception:

- `src/app/actions/documents.ts:372-377` sends transfer-slip `debt_payment` confirmations to `addDebtPayment` before validating `occurredAt`.
- `src/lib/data/finance-repository.ts:586-609` assigns `const now = new Date().toISOString()` and writes it to both transaction `occurredAt` and debt payment `paid_at`.

Assessment: the primary receipt/delivery/other transfer paths do not fabricate timestamps, but the `debt_payment` transfer-slip branch still does.

## Lifecycle Assessment

Pass for the extraction lifecycle:

- `src/lib/ai/extract-document.ts:91-104` transitions otherwise usable missing-occurredAt extractions to `needs_review` instead of `review_ready`.
- Broader extraction errors still go through `failDocumentProcessing`: `src/lib/ai/extract-document.ts:124-140`.
- The retry claim flow reuses the existing row and storage path because retry calls processing for the same document id; `PROCESSABLE_DOCUMENT_STATUSES` includes `needs_review`, and `claimDocumentForProcessing` updates the existing row rather than inserting a new one.
- `completeDocumentProcessing` is guarded by `user_id`, `status = processing`, matching `processing_started_at`, and lease freshness before finalizing the claim.
- `src/lib/data/finance-repository.ts:985-1018` replaces the extraction for the same `documentId` and `userId` in mock mode; the non-mock path follows the same delete-then-insert replacement shape after this block.

Assessment: uploaded -> processing -> needs_review is intentional for missing occurredAt, and retry/idempotency semantics are directionally safe. No duplicate document row or duplicate storage object creation was found in the audited changes.

## Review UI Assessment

Mixed:

- Missing-date review copy is user-facing Thai copy, not the internal `transaction.occurredAt` field path: `src/app/upload/review/[documentId]/ReviewForm.tsx:107-109` and `src/app/upload/review/[documentId]/ReviewForm.tsx:559-566`.
- The missing-date field starts blank for `needs_review` instead of using current Bangkok time:
  - Salary date: `src/app/upload/review/[documentId]/ReviewForm.tsx:261-263`.
  - Receipt/delivery date-time: `src/app/upload/review/[documentId]/ReviewForm.tsx:267-269`.
  - Transfer date-time: `src/app/upload/review/[documentId]/ReviewForm.tsx:283-286`.
- Inputs are labelled and use `aria-describedby` helper text:
  - Receipt/delivery: `src/app/upload/review/[documentId]/ReviewForm.tsx:815-830`.
  - Transfer slip: `src/app/upload/review/[documentId]/ReviewForm.tsx:1007-1022`.
  - Generic/other: `src/app/upload/review/[documentId]/ReviewForm.tsx:1442-1457`.
- Client validation attempts to focus and scroll the date field: `src/app/upload/review/[documentId]/ReviewForm.tsx:399-407`.
- Retry remains available for `needs_review`: `src/app/upload/review/[documentId]/ReviewForm.tsx:214-217` and `src/app/upload/review/[documentId]/ReviewForm.tsx:466-475`.

Failing verification:

- The E2E snapshot showed the blank date field and the missing-field helper text, but the exact final-confirmation error copy did not appear after submit. This means the review UI behavior requested by the audit is not proven by the current implementation and failed the required E2E command.

## Final Confirmation Assessment

Partial pass with blocker:

- Salary rejects missing/invalid `paymentDate` server-side before create: `src/app/actions/documents.ts:253-260`.
- Receipt/delivery rejects missing/invalid `occurredAt` server-side before create: `src/app/actions/documents.ts:291-313`.
- Generic/other rejects missing/invalid `occurredAt` server-side before create: `src/app/actions/documents.ts:475-501`.
- Valid manually entered Bangkok `datetime-local` values are persisted through `bangkokDateTimeLocalToInstant`, which is deterministic and avoids server timezone interpretation.

Blocker:

- Transfer-slip `debt_payment` confirmations are not protected by the server-side date check. The `occurredAt` validation is inside the non-debt-payment `else` branch only: `src/app/actions/documents.ts:372-391`.
- This permits a document review confirmation to persist a transaction with server current time via `addDebtPayment`: `src/lib/data/finance-repository.ts:591-599`.
- This also means client validation is the only protection for that branch, and server-only calls can bypass it.

## Retry And Idempotency Assessment

Pass for document processing:

- `needs_review` is reprocessable intentionally.
- Retry operates on the existing document id and storage path, not a new upload.
- Extraction replacement semantics delete/replace the document extraction for the same document/user pair.
- Concurrent processing claims are guarded by status, user id, `processing_started_at`, and active lease. A stale or superseded processor cannot finalize the row.

Remaining test gap:

- No test directly proves two concurrent retries against the same `needs_review` document cannot both create/replace extraction inconsistently under a real database conflict window.

## Findings By Severity

### Blocker: Transfer-slip debt payments can persist server-time occurredAt

Evidence:

- `src/app/actions/documents.ts:372-377` branches to `addDebtPayment` before validating `occurredAt`.
- `src/lib/data/finance-repository.ts:591-599` uses `new Date().toISOString()` for the created `debt_payment` transaction.
- `src/lib/data/finance-repository.ts:601-609` uses the same `now` for `debt_payments.paid_at`.

Impact:

- Violates the required no-current-time/no-server-time fallback rule.
- Violates server-side missing/invalid occurredAt rejection for final confirmation.
- Can misclassify paid-this-cycle calculations because `recalculateDebtPaidThisCycle` uses transaction `occurredAt` cycle windows.

Recommended fix:

- Validate `occurredAt` before the `txType === "debt_payment"` branch.
- Add an explicit occurredAt-capable debt-payment write path, or extend `addDebtPayment` to accept a validated `occurredAt`/`paidAt` instant.
- Preserve ownership and debt-link checks by keeping `getDebtForUser(userId, debtId)` or equivalent user-scoped lookup.
- Add unit and E2E coverage for transfer-slip `debt_payment` with missing, invalid, and valid manually entered dates.

### Blocker: Required E2E suite failed below the minimum floor

Evidence:

- `npm run test:e2e -- --workers=6` failed with 70 passed, 1 failed, 9 did not run.
- The failed assertion at `tests/e2e/document-flow.spec.ts:166` expected the Thai final-confirmation error copy after blank-date submit.

Impact:

- The requested minimum E2E count of at least 80 was not met.
- The new missing-date review-flow scenario does not currently prove final confirmation UX behavior.

Recommended fix:

- Ensure blank-date submit reliably renders `TRANSACTION_OCCURRED_AT_REQUIRED_TH` in the form error area and focuses the date field.
- Keep server-side rejection as the authoritative protection; the UI should mirror it for immediate feedback.

### Medium: Missing direct coverage for debt-payment document confirmation date semantics

Evidence:

- Existing tests cover receipt missing-date review, normal date success, retry reuse, and timestamp normalization.
- No audited test covers transfer-slip `type=debt_payment` confirmation with missing/invalid/valid `occurredAt`.

Impact:

- The blocker above was not caught by the current suite.

Recommended fix:

- Add unit coverage for `confirmDocumentAction` transfer-slip debt-payment missing/invalid/valid date behavior.
- Add E2E coverage for a transfer slip identified as a possible debt payment and linked to an existing debt.

### Low: Lint warnings remain in changed files

Evidence:

- `npm run lint` reported 0 errors and 9 warnings.
- Warnings include unused imports/vars in `src/app/actions/documents.ts` and `src/app/upload/review/[documentId]/ReviewForm.tsx`.

Impact:

- Not a functional blocker, but the changed files carry avoidable cleanup noise.

## Test Coverage Assessment

Proven by tests:

- Missing draft `occurredAt` does not become incomplete financial extraction.
- Missing draft `occurredAt` routes to `needs_review`.
- Other extracted receipt fields are preserved.
- Valid extracted timestamps retain intended instants.
- Invalid/unparseable timestamps are stripped and marked as review-required.
- Unit coverage reaches 575 tests.

Not proven or failed:

- Final confirmation UX for blank date failed E2E.
- Transfer-slip `debt_payment` server-side date rejection is missing.
- Transfer-slip `debt_payment` valid manual date deterministic persistence is missing.
- Real concurrent retry safety is not directly exercised beyond row/id reuse behavior.

## Deployment Recommendation

Do not deploy this fix as-is.

Required before deployment:

1. Fix the transfer-slip `debt_payment` server-side timestamp bypass.
2. Fix the review UI final-confirmation error rendering/focus behavior so the required E2E passes.
3. Add focused tests for debt-payment document confirmation date semantics.
4. Re-run the full requested command suite, including `npm run test:e2e -- --workers=6`, and require at least 80 E2E passes.

## Migration Recommendation

No database migration is required for this missing-occurredAt review-flow fix. The required remediation is application-layer validation and explicit timestamp propagation for debt-payment confirmation.

No migration was applied during this audit.
