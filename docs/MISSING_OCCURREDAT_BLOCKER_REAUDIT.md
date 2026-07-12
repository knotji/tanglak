# Missing occurredAt Blocker Re-Audit

Audit date: 2026-07-12

Re-audit worktree: `C:\Project\tanglak-missing-occurredat-reaudit`

Branch: `audit/missing-occurredat-blocker-reaudit`

Initial HEAD: `58413b9d48be8face9e93b70cec3ceaaf8fca8e0`

Audited delta: `52d01efc252a38cb935fd262db331033dc596292..58413b9d48be8face9e93b70cec3ceaaf8fca8e0`

Previous audit commit: `659ed2e6734609dd6db878ba2f27b17f8d98c7b2`

## Recommendation

APPROVE WITH NON-BLOCKING NOTES

The two previous blockers are closed. The blocker-fix branch may proceed from the audited missing-occurredAt blocker scope: no unresolved BLOCKER or HIGH finding remains, and the required canonical suite passed.

## Blocker Closure

Original blocker 1: closed.

- Transfer-slip `debt_payment` confirmation now validates `occurredAt` before any transaction/debt-payment/cycle write.
- The validated Bangkok instant is passed explicitly into `addDebtPayment`.
- Missing, empty, malformed, and out-of-range timestamp cases return `TRANSACTION_OCCURRED_AT_REQUIRED_TH` and do not write a linked transaction.

Original blocker 2: closed.

- The E2E test still asserts the exact required Thai UI error text inside the retry block.
- The retry only repeats the blank-date confirm click plus the exact visible-error assertion.
- Focus behavior is preserved.
- Canonical six-worker E2E passed 81/81.

## Findings

No blocker, high, medium, or low findings.

### NOTE: Repeat-only `-g` execution is not a valid isolation harness for this serial scenario

File and line: `tests/e2e/document-flow.spec.ts:119`

Behavior: Running only the missing-date test with `-g "upload with unclear/missing date" --repeat-each=5` fails because this serial test logs into an account created/onboarded by the earlier salary-slip test in the same file. When the single test is selected alone, the account is not onboarded and the flow remains on `/onboarding` or cannot find the upload controls.

Impact: This is not a product blocker and does not invalidate the blocker fix. It does mean the meaningful five-run evidence must include the setup harness, so the whole `document-flow.spec.ts` was run five times single-worker.

Evidence: The repeat-only command failed before the missing-date validation assertion: first at `toHaveURL(/\/today/)`, then while waiting for the upload file chooser.

Recommendation: If future auditors need a true `-g --repeat-each` harness for this test, make the missing-date scenario call `loginAndCompleteOnboarding(page)` or create its own unique account setup instead of depending on earlier serial tests.

Fixed: not applicable in this docs-only re-audit.

## addDebtPayment Call Graph

Production callers:

- `src/app/actions/documents.ts:391`: `confirmDocumentAction` for reviewed transfer-slip `debt_payment`; supplies explicit `occurredAtInstant`.
- `src/app/actions/finance.ts:188`: manual quick-pay `addDebtPaymentAction`; omits `occurredAt` intentionally to preserve existing "pay now" behavior.

Test-only direct callers:

- Existing repository/action tests call `addDebtPayment` without `occurredAt` to exercise the manual quick-pay repository semantics.
- `tests/unit/transfer-slip-debt-payment-timestamp.test.ts` calls `confirmDocumentAction`, not `addDebtPayment` directly, to prove the reviewed-document path supplies the explicit timestamp.

No document-confirmation, extracted-slip, reviewed-slip, retry, or imported-data production path was found that can still omit `occurredAt` when creating a document-review debt payment. The optional `occurredAt` parameter is safe in the current call graph because only the manual quick-pay caller omits it; the documentation comment in `finance-repository.ts` also names that boundary.

## Behavior Matrix

| Item | Result | Evidence |
| --- | --- | --- |
| transfer debt payment with valid timestamp | PASS | `documents.ts:377-391`; unit test persists `2026-07-15T09:30:00+07:00`; E2E transfer-slip scenario passes |
| missing timestamp rejected | PASS | unit test deletes `occurredAt` and expects required Thai copy/no transaction |
| empty timestamp rejected | PASS | unit test sets `occurredAt: ""` and expects required Thai copy/no transaction |
| invalid timestamp rejected | PASS | unit tests cover malformed string and out-of-range calendar/time |
| correct Thai server error | PASS | server returns `TRANSACTION_OCCURRED_AT_REQUIRED_TH` from `documents.ts:377-379` |
| correct Thai UI error | PASS | E2E asserts `กรุณาระบุวันที่และเวลาของรายการ` inside `toPass` retry |
| no current-time fallback in document confirmation | PASS | document path passes `occurredAtInstant` to `addDebtPayment`; unit test uses 2020 value far from now |
| no partial transaction write | PASS | unit tests verify no linked transaction after rejected timestamp |
| no partial debt-payment write | PASS | no transaction exists before the real-DB-only `debt_payments` insert can run |
| no paid-this-cycle mutation | PASS | unit test verifies `amountPaidThisCycleSatang` remains 0 |
| Bangkok-local date/time preserved | PASS | unit test verifies `2026-07-15T00:30:00+07:00` without UTC day shift |
| receipt confirmation unaffected | PASS | existing receipt/delivery document-flow tests pass |
| salary-slip confirmation unaffected | PASS | existing salary document-flow test passes |
| generic confirmation unaffected | PASS | no generic branch change in delta; full unit/E2E suite passes |
| retry document row reuse unaffected | PASS | document-flow retry tests pass |
| retry storage object reuse unaffected | PASS | document-flow retry tests pass |
| manual quick-pay behavior isolated and intentional | PASS | only `addDebtPaymentAction` omits `occurredAt`; it is not document review/import/retry |
| E2E assertion remains meaningful | PASS | assertion for exact Thai text is inside the `toPass` block and uses the blank date field |
| six-worker hydration race handled deterministically | PASS | canonical `npm run test:e2e -- --workers=6` passed 81/81 |

## Test Results

Focused and supporting verification:

- `npm ci`: passed; 468 packages installed; audit summary reported 2 moderate vulnerabilities.
- `npx vitest run tests/unit/transfer-slip-debt-payment-timestamp.test.ts`: 1 file, 12 tests passed.
- First `npx playwright test tests/e2e/document-flow.spec.ts --workers=1`: failed before tests because fresh worktree had no `.next` production build.
- `npm run build`: passed; used to create the production build required by direct Playwright `next start`.
- Rerun `npx playwright test tests/e2e/document-flow.spec.ts --workers=1`: 13 passed.
- `npx playwright test tests/e2e/document-flow.spec.ts -g "upload with unclear/missing date" --repeat-each=5 --workers=1`: failed because the selected serial test depends on earlier onboarding setup in the same spec.
- Four additional full document-flow runs: each passed 13/13. Together with the earlier full document-flow pass, this gives five clean executions of the missing-date scenario with the proper setup harness.

Canonical suite:

- `npm run test`: 47 files, 587 tests passed.
- `npm run lint`: 0 errors, 9 warnings.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- `npm run test:e2e -- --workers=6`: 81 passed.

## Git State At Audit Time

This document is intentionally the only re-audit branch change. No production code, tests, migrations, package files, or configuration were modified during the re-audit.
