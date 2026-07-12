# Slip/Debt Implementation Audit

Audit target: `feat/slip-first-debt-planning` at `0b8eadfd14633bb5feeb7380454d7e818cca564e`.

Audit worktree: `C:\Project\tanglak-slip-debt-audit-review`

Audit branch: `audit/slip-debt-implementation-review`

Reference implementation range: `adda92de85d1f4f1b8dfa88d88ccd784707e4150..0b8eadfd14633bb5feeb7380454d7e818cca564e`

## Verdict

The implementation is safe enough to continue Phase 1 hardening, but not ready to treat as fully aligned with the locked slip-first/debt-cycle decisions. No blocker was found. High-priority fixes should land before release: disable Phase 1 debt reopening, enforce `minimumPayment <= outstandingBalance`, and prevent unlinked manual `debt_payment` transactions.

Verification performed:

- `npm.cmd run typecheck`: passed after `npm.cmd ci`
- `npm.cmd run test`: passed after `npm.cmd ci`; 41 test files, 519 tests
- No migration was applied. No Supabase push was run.

Initial verification failed before dependency install because the fresh worktree had no `node_modules`; `tsc` and `vitest` were not found. `npm.cmd ci` was run in the audit worktree only from the existing lockfile.

## Implementation Delta

Reviewed commits:

- `2a1f113 feat: deprecate statement import from primary UX`
- `61d9e79 feat: make upload flow slip-first`
- `6cf9c94 feat: expose debt planning summary in UI`
- `0b8eadf test: cover slip-first product pivot UX`

Primary changed surfaces:

- Slip-first upload: `src/app/upload/page.tsx`, `src/app/upload/UploadClient.tsx`
- Legacy import demotion: `src/app/history-import/page.tsx`, `src/app/settings/page.tsx`, `src/app/settings/data/page.tsx`
- Debt planning UI: `src/app/debts/page.tsx`, `src/features/debts/DebtsClient.tsx`, `src/features/debts/ManualDebtForm.tsx`
- Debt planning semantics: `src/lib/finance/debt-summary.ts`, `src/lib/finance/debt-status.ts`, `src/lib/finance/date.ts`, `src/lib/finance/debt-guards.ts`, `src/lib/finance/debt-interest.ts`
- Persistence/security: `src/lib/data/finance-repository.ts`, `src/app/actions/finance.ts`, `src/app/actions/documents.ts`
- Migrations/RPC: `supabase/migrations/202607110006_debt_interest_rate_guard.sql`, `supabase/migrations/202607110007_debt_cycle_fields.sql`
- Tests: `tests/unit/debt-interest.test.ts`, `tests/unit/debt-status.test.ts`, `tests/unit/debt-summary.test.ts`, `tests/e2e/slip-first-debt-planning.spec.ts`

## Slip-First Upload

The primary upload route now leads with slip upload:

- `src/app/upload/UploadClient.tsx:25` offers quick selects for transfer slips, received transfer slips, receipts/food, and debt/card payment slips.
- `src/app/upload/UploadClient.tsx:129` accepts `image/jpeg`, `image/png`, `image/webp`, and `application/pdf`.
- `src/app/upload/UploadClient.tsx:253` exposes manual entry as a secondary fallback to `/transactions`.
- Statement and schedule document types are intentionally absent from the primary quick-select list.

Residual note: the upload progress/copy still uses "AI" in several places. The latest UX spec allowed reviewed extraction, but if production copy should avoid technical AI language, this needs a copy pass.

## Legacy Statement Import

Existing statement-import entry points:

| Route | Component | Copy/origin | Can hide safely? | Audit result |
| --- | --- | --- | --- | --- |
| `/upload` | `UploadClient` | Slip-first upload with manual entry | Already hidden | Pass |
| `/history-import` | `HistoryImportUploadPage` + `LegacyImportNotice` + `HistoryImportClient` | Deprecation notice, then full import client | No, bookmarked/history users still need access | Pass with intentional legacy access |
| `/settings` | `SettingsPage` advanced section | "legacy import" link | Can demote further, but not delete | Low risk |
| `/settings/data` | `HistoryImportSettingsPage` | "+ Statement" link and import history | Can relabel/demote safely | Low risk finding F-011 |
| `/history-import/[batchId]/review` | `ReviewBoardClient` | Existing row review | No, needed for in-progress batches | Keep |
| `/history-import/[batchId]/summary` | Summary page | Existing imported-batch summary | No, needed for history/rollback | Keep |

The implementation follows "demote, do not delete." However, `/settings/data` still presents a new Statement import CTA, so the route remains discoverable outside direct bookmarks.

## Slip/Receipt Support

Accepted file types are unchanged at the upload action level:

- MIME: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`
- Extensions: `jpg`, `jpeg`, `png`, `webp`, `pdf`
- Size limit: 15 MB

Primary document intents now offered from `/upload`:

- `transfer_slip`
- `receipt`
- debt/card payment slip mapped to `transfer_slip`
- generic `other` if the user opens the main upload box without selecting a quick type

Parser/review behavior:

- Upload creates a private document row at `user.id/documentId/safeName`.
- Extraction is run synchronously by `uploadAndExtractAction`; failure leaves the document row and routes the user to review/retry state.
- Review forms normalize salary, receipt/delivery receipt, transfer slip, and debt statement fields.
- Transfer slip debt payment requires `debtId` before saving and calls `addDebtPayment`.
- Debt statement confirmation creates or updates a debt only after review confirmation.
- Duplicate support is present through `listDuplicateCandidates` and review hints; current implementation does not auto-merge duplicates without review.

Manual fallback:

- Upload page links to `/transactions`.
- Review forms remain editable, and validation failures return messages without automatic persistence.

## Debt Fields

Current debt-planning field coverage:

| Required field | Database column | TypeScript field | Form/review field | Validation | Repository mapping | Display |
| --- | --- | --- | --- | --- | --- | --- |
| Outstanding balance | `debts.outstanding_balance_satang` | `outstandingBalanceSatang?: number` | `ManualDebtForm.outstanding`, `ReviewForm.outstandingBalance` | Non-negative | create/update map it | Debts page/card, overview total |
| Amount due this cycle | `debts.amount_due_satang` | `amountDueSatang: number` | `ManualDebtForm.amount`, `ReviewForm.amountDue` | Non-negative/required in manual, optional debt statement default 0 | create/update map it | Monthly summary, card/status |
| Minimum payment | `debts.minimum_payment_satang` | `minimumPaymentSatang: number` | `ManualDebtForm.minimum`, `ReviewForm.minimumPayment` | Non-negative only | create/update map it | Minimum/remaining UI |
| Annual interest | `debts.interest_rate_annual numeric(6,3)` | `interestRateAnnual?: number` | `ManualDebtForm.interestRateAnnual`, `ReviewForm.interestRateAnnual` | 0..100 | create/update map it | Debt card summary |
| Due date | `debts.due_date` | `dueDate?: string` | `ManualDebtForm.dueDate`, `ReviewForm.dueDate` | Real `YYYY-MM-DD` date | create/update map it | Today/debt status |
| Cycle start | `debts.cycle_start_date` | `cycleStartDate?: string` | No manual field in Phase 1 | Date key; start <= end | create/update supports it | Used by calculators/RPC |
| Cycle end | `debts.cycle_end_date` | `cycleEndDate?: string` | No manual field in Phase 1 | Date key; start <= end | create/update supports it | Used by calculators/RPC |
| Paid this cycle | `debts.amount_paid_this_cycle_satang` | `amountPaidThisCycleSatang: number` | Payment forms mutate via linked payments | Recalculated, not directly entered | repository/RPC recalc | Debt card/summary |
| Credit limit | `debts.credit_limit_satang` | `creditLimitSatang?: number` | No manual field in Phase 1 | Non-negative | create/update supports it | Not materially displayed |
| Statement balance | `debts.statement_balance_satang` | `statementBalanceSatang?: number` | `ReviewForm.statementBalance` | Non-negative | create/update map it | Debt details/card where available |
| Statement date | `debts.statement_date` | `statementDate?: string` | Not exposed in reviewed snippet | Date key | create/update supports it | Not materially displayed |
| Remaining installments | `debts.remaining_installments` | `remainingInstallments?: number` | `ReviewForm.remainingInstallments` | Non-negative integer | create/update map it | Notes/display limited |

Missing/partial fields:

- Outstanding balance: exists.
- Amount due this cycle: exists.
- Minimum payment: exists, but missing cross-field upper bound.
- Annual interest: exists and validated.
- Due date: exists and validated.
- Cycle date: schema/repository exists; manual UI does not expose rollover/cycle maintenance.
- Paid this cycle: exists and is recalculated.
- Credit limit: schema/repository exists; manual UI/display incomplete.

## Payment Semantics

Linked debt payment behavior:

- `addDebtPayment` creates a confirmed transaction with `type = 'debt_payment'` and `debtId`.
- It also inserts a `debt_payments` row in real DB mode.
- It recalculates `debts.amount_paid_this_cycle_satang` for the target debt.
- It does not reduce `outstandingBalanceSatang`.
- It does not auto-close the debt.

Import behavior:

- `import_commit_row` validates import row ownership, debt ownership, and account ownership.
- If `p_type = 'debt_payment'` and `p_debt_id` is present, it inserts a linked `debt_payments` row and recalculates the debt.
- Rollback deletes imported transactions/debt payments and recalculates affected debts.

Overview behavior:

- `calculateMonthlyTotals` counts every confirmed `debt_payment` transaction in the target calendar month as cash outflow.
- Debt-cycle logic counts only linked confirmed `debt_payment` rows inside the debt cycle.
- Outstanding balance remains statement/user-maintained.

Double-count/mismatch risks:

- No double-count within debt-cycle totals was found; per-debt `debtId` scoping prevents one payment from counting toward multiple debts.
- Mismatch risk exists for unlinked `debt_payment` transactions and for the debts page summary mixing all-debt and month-scoped totals.

## Date Semantics

Strong points:

- `getBangkokTodayString` and `getBangkokMonthString` use `Intl.DateTimeFormat` with `Asia/Bangkok`.
- `daysUntilDue` compares Bangkok date keys, avoiding host timezone drift for due/overdue checks.
- Month/cycle ranges use Bangkok `T00:00:00+07:00` inclusive starts and exclusive next-day/month ends.
- DB recalculation uses `timestamptz` comparisons and Bangkok boundaries.

Risks:

- Today action combines due today with due soon and says "in 0 days".
- Debt summary helper uses lexical timestamp comparison instead of instant comparison.
- Summary due-soon/overdue lists call `debtDueStatus(debt)` with real `new Date()`, so tests cannot inject a target date through `buildMonthlyDebtSummary`.

## Security

Verified ownership checks:

- Repository checks `debtId` belongs to the user before transaction create/update when a debt is supplied.
- Repository checks source and destination account ownership before transaction create/update and import batch create/update.
- Import RPC validates row, debt, source account, and destination account ownership.
- Document CRUD and extraction lookups include `user_id` filters.
- Review/processing state update uses document ownership plus processing claim checks.

Residual risks:

- Security-definer recalculation helper has no direct execute revoke.
- Generic manual `debt_payment` avoids debt ownership because it supplies no debt.
- Direct legacy import access remains intentionally available, so its security tests remain critical.

## Migration Recommendation

No destructive migration is recommended from this audit branch.

Required future additive migration:

- Add a `NOT VALID` check enforcing `minimum_payment_satang <= outstanding_balance_satang` when both are non-null.
- Suggested expression:
  - `check (minimum_payment_satang is null or outstanding_balance_satang is null or minimum_payment_satang <= outstanding_balance_satang) not valid`
- Preflight:
  - `select id, minimum_payment_satang, outstanding_balance_satang from public.debts where minimum_payment_satang is not null and outstanding_balance_satang is not null and minimum_payment_satang > outstanding_balance_satang;`
- Backward compatibility:
  - Keep nullable fields nullable.
  - Do not rewrite or clamp historical values automatically.
  - Validate only after manual remediation of violating rows.
- Indexing:
  - No new index is needed for this check.
- Security hardening:
  - Revoke direct execute on `public.recalculate_debt_paid_this_cycle(uuid)` or replace with an ownership-checked invoker function.

Existing migration review:

- Interest: `numeric(6,3)`, application and DB range 0..100 inclusive, nullable, additive, good.
- Cycle fields: nullable `date`; order check present; Bangkok fallback preserved for historical rows.
- Credit limit: nullable `bigint`; non-negative check present.
- Index: `(user_id, debt_id, type, status, occurred_at)` supports recalculation lookups.

## Test Coverage

Existing coverage added/confirmed:

- Interest display and approximation labels.
- Due-status boundaries and "no auto close from zero outstanding."
- Monthly debt summary basics: due month, linked payment scoping, excluded unconfirmed payments, no cross-debt double count.
- E2E slip-first upload landing.
- E2E legacy route notice.
- E2E interest validation.
- E2E debts summary presence.
- E2E mobile overflow for upload/debts/history-import.

Missing tests needed:

- Minimum payment cannot exceed outstanding balance across manual form, debt statement confirm, repository, and DB constraint.
- Generic manual `debt_payment` without `debtId` is rejected.
- Direct cross-user execution of recalculation helper is denied.
- Today priority: overdue > due today > due soon > unmet minimum with exact copy.
- Bangkok boundary test for `Z` timestamps and cycle start/end inclusivity.
- Concurrent debt-payment updates/recalculation on the same debt.
- Import rollback recalculates linked debt payments in real RPC path.
- Duplicate slips do not create duplicate confirmed transactions.
- Late-linked payments count only if inside matching cycle.
- No automatic debt creation on upload/extract, and explicit debt-statement create/update choice.
- Closed/paid-off debt cannot be reopened in Phase 1.
- Legacy route/CTA deprecation across `/upload`, `/settings`, and `/settings/data`.
- Partial payments update minimum remaining without changing outstanding balance.
- Credit-limit and cycle-date validation/display once those fields are exposed in UI.

## Risk Register

| Severity | Count | Items |
| --- | ---: | --- |
| Blocker | 0 | None |
| High | 3 | F-001, F-002, F-003 |
| Medium | 6 | F-004 through F-009 |
| Low | 2 | F-010, F-011 |
| Informational | 1 | F-012 |

Detailed findings are in `docs/SLIP_DEBT_IMPLEMENTATION_FINDINGS.md`.

