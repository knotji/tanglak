# Slip/Debt Final Security Audit

Source audited: `C:\Project\tanglak-slip-debt-pivot`

Source branch: `feat/slip-first-debt-planning`

Source HEAD: `c61aaeca07e52538e9145eb2ee805f2615d8b0c6`

Audit worktree: `C:\Project\tanglak-slip-debt-final-audit`

Audit branch: `audit/slip-debt-final-security`

No migration was applied. No Supabase db push was run. No production code or migration file was modified in this audit branch.

## Verdict

Not deployment-ready yet. Migration 008 and most of migration 009 are structurally sound, and the manual transaction/debt form invariants are mostly enforced. Two blockers remain:

- Import review can still create a confirmed `debt_payment` transaction without `debt_id`.
- The requested unit verification currently fails because a migration test is brittle to Windows CRLF line endings.

## Migration 008 Assessment

File: `supabase/migrations/202607110008_debt_minimum_not_above_outstanding.sql`

Assessment: sound.

- Additive only: yes; adds one `CHECK` constraint in a guarded `do $$` block.
- Historical migrations untouched: yes; 006/007 are not rewritten.
- Constraint name: `debts_minimum_not_above_outstanding`, unique in this migration set.
- `NOT VALID`: intentional and documented.
- Existing rows preserved: yes; no `update`, `delete`, or `validate constraint`.
- Null semantics: correct for nullable `minimum_payment_satang` and `outstanding_balance_satang`; the invariant applies only when both are known.
- Core rule: `minimum_payment_satang <= outstanding_balance_satang` is correct.
- Cast/clamp: none.
- Preflight: identifies existing rows where both values are present and minimum exceeds outstanding.
- Rollback notes: realistic; dropping the additive constraint is non-destructive.

## Migration 009 Assessment

File: `supabase/migrations/202607110009_harden_debt_recalculation_execute.sql`

Assessment: mostly sound, with one verification note.

- `PUBLIC` execute revoked: yes, `revoke all on function public.recalculate_debt_paid_this_cycle(uuid) from public;`.
- `anon` execute: no explicit `revoke ... from anon`, but no explicit `anon` grant exists in the migration set; revoking from `PUBLIC` should remove the default anonymous path. Deployment verification should still query effective privileges for `anon`.
- `authenticated` grant: intentional and documented so `security invoker` import RPCs can still call the helper.
- `SECURITY DEFINER` search path: pinned to `public`.
- Ownership check: `auth.uid() is not null and auth.uid() <> v_user_id` raises `P0002`.
- Unknown debt UUID: returns safely without update.
- Cross-user direct execution: blocked for authenticated callers carrying a JWT.
- Nested call escalation: import RPCs stay `security invoker`; migration 009 relies on prior ownership checks plus `auth.uid()` matching the target debt owner.
- Function owner assumptions: documented, including service-role/admin `auth.uid() is null` behavior.
- Grants: explicit and minimal for current trusted import call paths.

Recommended live privilege checks after dry-run/apply in a disposable environment:

```sql
select has_function_privilege('anon', 'public.recalculate_debt_paid_this_cycle(uuid)', 'execute') as anon_can_execute;
select has_function_privilege('authenticated', 'public.recalculate_debt_paid_this_cycle(uuid)', 'execute') as authenticated_can_execute;
```

Expected: `anon_can_execute = false`, `authenticated_can_execute = true`.

## Recalculation Semantics

SQL helper and TypeScript repository paths preserve the intended calculation:

- Only `transactions.type = 'debt_payment'` counts.
- Only `transactions.status = 'confirmed'` counts.
- Matching `debt_id` is required for recalculation.
- The window is cycle-scoped, with Bangkok-month fallback when cycle dates are missing.
- Rollback gathers affected debt IDs before deleting imported transactions and then recalculates those debts.
- Outstanding balance is not mutated by recalculation or payment insertion.

Security posture:

- Repository recalculation scopes by `userId` and debt ownership.
- Direct authenticated SQL execution is limited to caller-owned debt by migration 009.
- Service-role/admin contexts remain trusted by design when `auth.uid()` is null.

## Import Commit/Rollback Compatibility

Import commit/rollback still work with migration 009 because `authenticated` keeps execute on `recalculate_debt_paid_this_cycle`.

Compatibility is not complete for the debt-payment invariant:

- `import_commit_row` validates ownership if `p_debt_id` is present.
- `import_commit_row` creates a `debt_payments` row and recalculates only when `p_debt_id is not null and p_type = 'debt_payment'`.
- It does not reject `p_type = 'debt_payment' and p_debt_id is null`.
- `commitImportRow` in `src/lib/data/finance-repository.ts` also lacks `assertDebtPaymentLinked(type, debtId)` before delegating to mock or RPC.

This means an import/review decision can produce a confirmed unlinked `debt_payment` transaction, which affects cashflow totals but no debt-cycle total.

## Manual Debt-Payment Invariant

Manual transaction flow:

- `ManualTransactionForm` has a debt selector when `type === 'debt_payment'`.
- Client submit blocks missing `debtId`.
- `saveTransactionAction` blocks missing `debtId` for `debt_payment`.
- `createTransaction` and `updateTransaction` enforce `assertDebtPaymentLinked` against the final merged transaction state.
- `assertDebtBelongsToUser` rejects cross-user `debtId`.
- Expense/income/transfer/refund remain valid without `debtId`.

Document review:

- Transfer slip debt-payment confirmation requires `debtId` and calls `addDebtPayment`.
- Debt-statement review requires explicit create/update choice; it does not create a debt on upload/extract alone.
- Generic/other review paths that attempt `debt_payment` without `debtId` are rejected by repository `createTransaction`.

Import review:

- Fails the invariant; see F-001.

Existing unlinked legacy rows:

- No destructive cleanup is present or recommended in this branch.

## Minimum-Payment Invariant

Enforcement is present across the intended layers:

- Client: `ManualDebtForm` computes effective outstanding/minimum and rejects minimum above outstanding.
- Server action: `saveDebtAction` applies the same effective defaulting and rejects.
- Repository create: defaults missing outstanding to amount due before validation.
- Repository update: validates final merged state against existing row.
- Statement review persistence: builds `inputPayload` and flows through `createDebt`/`updateDebt`, so repository validation is the final guard.
- Database: migration 008 adds the matching `NOT VALID` check.

Negative and malformed values:

- Money parsers reject negative and malformed money values.
- Interest and due-date validation remain separate and intact.

## Deployment Readiness

Migration order:

- 006 adds interest rate range guard.
- 007 adds cycle fields and initial recalculation/import RPC semantics.
- 008 depends on existing debt amount columns and adds the minimum/outstanding invariant.
- 009 depends on the helper function from 007 and hardens its execution.

Order is correct. No historical migration must be rewritten. No automatic data cleanup is required before 008/009 because 008 is `NOT VALID` and 009 reads/writes no table rows during migration.

Dry-run expectation:

- A database already current through 007 should propose only 008 and 009.
- A database current through 005 should propose 006 through 009 in order.

Live verification queries:

```sql
select conname, convalidated
from pg_constraint
where conrelid = 'public.debts'::regclass
  and conname = 'debts_minimum_not_above_outstanding';

select id, minimum_payment_satang, outstanding_balance_satang
from public.debts
where minimum_payment_satang is not null
  and outstanding_balance_satang is not null
  and minimum_payment_satang > outstanding_balance_satang;

select has_function_privilege('anon', 'public.recalculate_debt_paid_this_cycle(uuid)', 'execute') as anon_can_execute,
       has_function_privilege('authenticated', 'public.recalculate_debt_paid_this_cycle(uuid)', 'execute') as authenticated_can_execute;
```

Rollback limitations:

- 008 rollback is a safe constraint drop.
- 009 rollback would restore the less secure function body/grants and is not recommended except to recover from a bad deployment.

## Findings

### F-001 Blocker: Import commit can create unlinked debt-payment transactions

- File/location: `src/lib/data/finance-repository.ts:1539`, `src/lib/data/finance-repository.ts:1561`, `supabase/migrations/202607110007_debt_cycle_fields.sql:139`, `supabase/migrations/202607110007_debt_cycle_fields.sql:152`
- Observed behavior: `commitImportRow` validates money and ownership when `debtId` exists, but does not call `assertDebtPaymentLinked(type, debtId)`. The SQL `import_commit_row` function also allows `p_type = 'debt_payment'` with `p_debt_id is null`, inserts a confirmed transaction, and skips `debt_payments`/recalculation because its linkage block requires `p_debt_id is not null`.
- Risk: A reviewed import can create a cashflow debt-payment transaction that never affects any debt's paid-this-cycle, minimum remaining, or payment history. This violates the focused invariant that `debt_payment` requires `debt_id` and reintroduces overview/debt-cycle mismatch.
- Exact recommended fix: Add `assertDebtPaymentLinked(type, debtId)` in `commitImportRow` before mock/RPC delegation. Add an SQL guard in the next additive migration replacing `import_commit_row`: `if p_type = 'debt_payment' and p_debt_id is null then raise exception 'debt payment must be linked to a debt' using errcode = 'P0001'; end if;`. Keep existing ownership checks for non-null debt IDs.
- Required test: Repository test for `importReviewedRows` rejecting a debt-payment import decision without `debtId`, plus a migration/static assertion that `import_commit_row` rejects `p_type = 'debt_payment' and p_debt_id is null`.

### F-002 Blocker: Unit suite fails on migration line-ending assertion

- File/location: `tests/unit/debt-minimum-not-above-outstanding-migration.test.ts:14`
- Observed behavior: `npm.cmd run test` fails because the test expects an LF-only multi-line substring, while the checked-out migration content is read with CRLF line endings on Windows.
- Risk: The requested deployment verification cannot pass in the current Windows audit environment even though the migration SQL itself is correct. This blocks the "green tests before deploy" criterion.
- Exact recommended fix: Normalize line endings in the test before asserting, or use a whitespace-tolerant regular expression for the constraint body.
- Required test: The fixed test itself should pass on Windows and LF-only environments; rerun `npm.cmd run test`.

## Critical Missing Tests

Only deployment-blocking gaps in the focused invariant set:

- Import/review cannot confirm `debt_payment` without `debtId` through `importReviewedRows`.
- SQL `import_commit_row` rejects `p_type = 'debt_payment' and p_debt_id is null`.
- Migration 009 effective privilege check for `anon` is not directly asserted; current static test checks no grant to anon/public, but a live post-apply query should confirm `anon` cannot execute.

## Verification

Commands run in `C:\Project\tanglak-slip-debt-final-audit`:

- First `npm.cmd run typecheck`: failed because fresh worktree had no `node_modules`; `tsc` not found.
- First `npm.cmd run test`: failed because fresh worktree had no `node_modules`; `vitest` not found.
- `npm.cmd ci`: passed; installed dependencies from the existing lockfile. NPM reported two moderate audit advisories. No package files were changed.
- Second `npm.cmd run typecheck`: passed.
- Second `npm.cmd run test`: failed; 42 files passed, 1 file failed, 535 tests passed, 1 test failed. Failure is F-002.

