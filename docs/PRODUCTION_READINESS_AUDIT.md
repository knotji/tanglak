# TangLak Production Readiness Audit

Audit date: 2026-07-11

Branch: `audit/production-readiness`

Scope: security, financial data integrity, production resilience, and dependency posture. This document is evidence-based: every finding below is tied to code, migrations, or command output. No production application behavior was changed as part of this audit.

## Executive Summary

TangLak has a solid baseline for user isolation: core tables enable RLS, repositories generally scope reads and writes by `user_id`, storage buckets are private, signed previews are short-lived, and server actions mostly call `requireUser()`. The main release risks are concentrated in middleware configuration drift, privacy-safe logging, idempotency of import commits, and Thai timezone/month-boundary consistency.

Finding counts:

| Severity | Count |
| --- | ---: |
| Critical | 0 |
| High | 3 |
| Medium | 5 |
| Low | 3 |
| Informational | 7 |

Release blockers:

| ID | Severity | Blocker | Summary |
| --- | --- | --- | --- |
| SEC-001 | High | Yes | Middleware only recognizes `NEXT_PUBLIC_SUPABASE_ANON_KEY`, while app config also allows `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. |
| SEC-002 | High | Yes | Gemini parse failures log raw model output that may contain personal or financial data. |
| FIN-001 | High | Yes | Production history-import commit path lacks a production idempotency guard before creating transactions. |
| FIN-002 | Medium | Yes | Thai month/day calculations use UTC in UI/export entry points while repository windows use `+07:00`. |
| FIN-003 | Medium | Yes | Negative debt values can pass application parsing and are not blocked by debt table checks. |

## Security Findings

### SEC-001: Middleware can bypass protection when production uses publishable Supabase key

Severity: High

Evidence:

- `src/lib/supabase/config.ts:9-12` accepts either `NEXT_PUBLIC_SUPABASE_ANON_KEY` or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- `middleware.ts:18-19` requires `NEXT_PUBLIC_SUPABASE_ANON_KEY` specifically.
- `middleware.ts:51` returns `NextResponse.next()` when that narrower check fails.
- `middleware.ts:91-96` only redirects protected routes after the middleware Supabase client runs.

Impact:

If production is configured with `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` but not `NEXT_PUBLIC_SUPABASE_ANON_KEY`, middleware will skip route-level auth checks. Server pages and actions still call `requireUser()` and RLS still protects data, but this removes the intended perimeter redirect and may expose route rendering paths or inconsistent unauthenticated behavior.

Recommended action:

Make middleware use the same Supabase config validation path as `src/lib/supabase/config.ts`, or check both public key names consistently. Add a unit test covering publishable-key-only configuration.

Release blocker: Yes

### SEC-002: Gemini validation errors log raw model output

Severity: High

Evidence:

- `src/lib/ai/gemini.ts:18-40` sends document content to Gemini and asks for JSON.
- `src/lib/ai/gemini.ts:51-59` parses the model response.
- `src/lib/ai/gemini.ts:60-62` logs `text` on parse or validation failure.
- `src/lib/ai/extract-document.ts:41-50` converts the user's private document bytes to base64 and sends them for extraction.

Impact:

The raw Gemini response can contain salary, merchant, account, debt, or other financial details. Logging it in production could expose personal financial data in application logs, observability tools, or incident exports.

Recommended action:

Replace raw-output logging with a redacted diagnostic that includes only model name, parse failure class, document type if known, and a request correlation ID. Keep raw payload inspection behind an explicit local-only debug gate.

Release blocker: Yes

### SEC-003: User-controlled account foreign keys are not ownership-validated before association

Severity: Medium

Evidence:

- Manual transactions accept `sourceAccountId` from form data in `src/app/actions/finance.ts:24-32` and pass it to repository input at `src/app/actions/finance.ts:75-82`.
- `createTransaction` inserts `source_account_id` and `destination_account_id` directly in `src/lib/data/finance-repository.ts:128-153`.
- History import accepts `accountId` from form data in `src/app/actions/history-import.ts:102-105`.
- Import batches store `account_id` from input in `src/lib/data/finance-repository.ts:752-768`.
- Imported transactions use the batch `accountId` as `sourceAccountId` or `destinationAccountId` in `src/lib/data/finance-repository.ts:1044-1057`.

Impact:

An attacker who obtains another account UUID could associate their own transactions or import batches with that foreign account ID. RLS prevents reading the other account row, but cross-user references can pollute relational integrity and complicate analytics, deletion safety, and future joins.

Recommended action:

Before writing any account FK, verify `getAccount(user.id, accountId)` succeeds. Consider composite foreign-key patterns or database triggers/checks that enforce referenced rows have the same `user_id`.

Release blocker: No

### SEC-004: RLS coverage is strong for core user-owned tables

Severity: Informational

Evidence:

- `supabase/migrations/202607100001_initial_tanglak_schema.sql:246-264` enables RLS and creates select/insert/update/delete own-row policies across the main user-owned tables.
- `supabase/migrations/202607100005_history_import_support.sql:84-99` enables RLS and own-row policies for import batches and rows.
- `tests/unit/rls.test.ts:11-19` asserts policy and storage-folder coverage.

Impact:

This is a positive control. It materially reduces cross-user exposure even when app-layer checks are missed.

Recommended action:

Keep the RLS verification test and add live Supabase policy verification as part of release sign-off.

Release blocker: No

### SEC-005: Private storage bucket and user-folder policies are present

Severity: Informational

Evidence:

- `supabase/migrations/202607100001_initial_tanglak_schema.sql:271-274` creates `financial-documents` as non-public.
- `supabase/migrations/202607100001_initial_tanglak_schema.sql:276-295` permits storage read/insert/delete only when the first storage path folder matches `auth.uid()`.
- Document upload paths are prefixed with `user.id` in `src/app/actions/documents.ts:87-99`.
- History import paths are prefixed with `user.id` in `src/app/actions/history-import.ts:140-155`.

Impact:

Private storage and path scoping are aligned. Direct object access should be denied unless the request belongs to the path owner.

Recommended action:

Keep storage paths user-prefixed and verify the production bucket remains private after deployment.

Release blocker: No

### SEC-006: Signed preview URLs are short-lived

Severity: Informational

Evidence:

- `src/app/upload/review/[documentId]/page.tsx:23-36` requires a user, fetches the document through `getDocument(user.id, documentId)`, and creates a signed URL for 300 seconds.

Impact:

The preview URL lifetime is appropriately short. Exposure risk is limited to the five-minute token lifetime if a URL is copied or logged elsewhere.

Recommended action:

Keep the 300-second expiry. Do not log signed URLs. Consider Content Security Policy checks before launch.

Release blocker: No

### SEC-007: Service-role key is not used in application code

Severity: Informational

Evidence:

- Search for `SERVICE_ROLE`, `service_role`, and `SUPABASE_SERVICE` returned no application usage.
- Server and browser Supabase clients both use public config in `src/lib/supabase/server.ts:5-12` and `src/lib/supabase/client.ts:4-6`.

Impact:

This is a positive control. RLS remains effective because the app does not bypass it with service-role credentials.

Recommended action:

Keep service-role credentials out of runtime app code. If background jobs later need service role, isolate them from web request handlers.

Release blocker: No

### SEC-008: Upload validation exists but relies on client-provided MIME type

Severity: Low

Evidence:

- Document upload enforces size and MIME allowlist in `src/app/actions/documents.ts:71-78`.
- History import enforces 10 MB size, MIME allowlist, and extension allowlist in `src/app/actions/history-import.ts:120-137`.

Impact:

The size and extension/MIME checks are useful, but MIME type is user-controlled metadata. For images and CSV, content sniffing is limited. PDF import has deeper validation in the PDF pipeline, but this audit intentionally did not inspect or change PDF parser behavior.

Recommended action:

Add lightweight magic-byte/content validation for image/CSV uploads and keep parser-level PDF validation.

Release blocker: No

## Financial Data-Integrity Findings

### FIN-001: Production import commit lacks production idempotency guard

Severity: High

Evidence:

- Migration notes describe `created_transaction_id` as the authoritative idempotency field in `supabase/migrations/202607100006_history_import_hardening.sql:33-36`.
- The commit loop creates transactions in `src/lib/data/finance-repository.ts:1017-1077`.
- The only pre-create idempotency guard checks `getMockState()` and is gated to mock auth in `src/lib/data/finance-repository.ts:1022-1027`.
- Production code updates `created_transaction_id` only after transaction creation at `src/lib/data/finance-repository.ts:1071-1076`.

Impact:

A replayed server action, double submit, or retry after an uncertain network result can create duplicate production transactions for the same import row. This directly affects balances, debt payment totals, and rollback scope.

Recommended action:

Before creating any production transaction, fetch the import row by `rowId` and `user_id` and skip if `created_transaction_id` is already set. For stronger protection, perform row claim/update and transaction creation in a database RPC transaction.

Release blocker: Yes

### FIN-002: Month/day boundaries use UTC in entry points but Bangkok windows in repositories

Severity: Medium

Evidence:

- Today page uses UTC-derived date/month keys in `src/app/today/page.tsx:17-19`.
- Transactions page uses UTC-derived month in `src/app/transactions/page.tsx:10-15`.
- Overview page uses UTC-derived month in `src/app/overview/page.tsx:16-23`.
- CSV export uses UTC-derived month in `src/app/api/export/transactions/route.ts:7-10`.
- Repository month query uses Bangkok `+07:00` boundaries in `src/lib/data/finance-repository.ts:64-72` and `src/lib/data/finance-repository.ts:476-479`.

Impact:

Near Bangkok month/day boundaries, screens and exports can select the wrong month/day key while querying or filtering with mixed assumptions. This can misstate today's spend, monthly totals, and exported transactions.

Recommended action:

Introduce a shared Bangkok date/month helper and use it everywhere a current date, current day key, or current month key is derived.

Release blocker: Yes

### FIN-003: Negative debt amounts are not blocked consistently

Severity: Medium

Evidence:

- `bahtToSatang` accepts negative values by regex/sign handling in `src/lib/finance/money.ts:1-12`.
- Debt action schemas require strings but do not require positive amounts in `src/app/actions/finance.ts:34-45`.
- Debt creation maps parsed amount strings directly to satang fields in `src/app/actions/finance.ts:113-124`.
- Debt table amount columns in `supabase/migrations/202607100001_initial_tanglak_schema.sql:81-86` do not have non-negative checks.
- Transaction rows do have `amount_satang >= 0` at `supabase/migrations/202607100001_initial_tanglak_schema.sql:99-103`, showing the stricter pattern exists elsewhere.

Impact:

Negative debt due, minimum, or outstanding values can corrupt debt progress, minimum remaining, and overview calculations.

Recommended action:

Add positive amount validation in debt action schemas and add non-negative database checks for debt monetary fields in a follow-up migration.

Release blocker: Yes

### FIN-004: Import rollback is multi-step and non-transactional

Severity: Medium

Evidence:

- Production rollback validates batch state in `src/lib/data/finance-repository.ts:1183-1197`.
- It then deletes debt payments, deletes transactions, unlinks merged transactions, resets rows, and updates the batch across separate statements in `src/lib/data/finance-repository.ts:1199-1259`.

Impact:

If the process fails mid-rollback, production can be left in a partial state: deleted transactions but unresolved rows not reset, or rows reset but batch status unchanged.

Recommended action:

Move rollback into a Postgres RPC transaction or add compensating recovery tooling that can safely resume rollback by batch ID.

Release blocker: No

### FIN-005: Imported account association can be stale or foreign

Severity: Medium

Evidence:

- The import review client sends `batch.accountId` to `confirmBatchAction` in `src/app/history-import/[batchId]/review/ReviewBoardClient.tsx:181-197`.
- Normal imported transactions derive `sourceAccountId` and `destinationAccountId` from that account ID in `src/lib/data/finance-repository.ts:1044-1057`.
- `updateImportBatch` can also store `accountId` in `src/lib/data/finance-repository.ts:809-819`.

Impact:

If a batch was created with an account that is later deactivated/deleted, or if a crafted request supplies a foreign UUID, imported rows can attach to an invalid account reference.

Recommended action:

Validate the account belongs to the user and is active before batch creation, batch confirmation, and transaction creation.

Release blocker: No

### FIN-006: Debt payment totals are recalculated on create, update, and delete

Severity: Informational

Evidence:

- Transaction create recalculates debt payment totals when `debtId` exists in `src/lib/data/finance-repository.ts:157-159`.
- Transaction update recalculates both old and new debt IDs in `src/lib/data/finance-repository.ts:179-216`.
- Transaction delete recalculates the affected debt in `src/lib/data/finance-repository.ts:256-265`.
- `recalculateDebtPaidThisCycle` sums confirmed debt-payment transactions by `user_id` and `debt_id` in `src/lib/data/finance-repository.ts:443-458`.

Impact:

This is a positive control for debt balance consistency after edits and deletes.

Recommended action:

Keep existing unit/E2E coverage and add a production data reconciliation query before launch.

Release blocker: No

### FIN-007: Import staging has database-level duplicate-row protection

Severity: Informational

Evidence:

- `supabase/migrations/202607100006_history_import_hardening.sql:4-8` adds a unique constraint on `(import_batch_id, source_row_index)`.
- `supabase/migrations/202607100006_history_import_hardening.sql:15-22` adds indexes for resume and created-transaction lookups.

Impact:

This helps prevent duplicate staging rows inside a batch and supports resume queries. It does not by itself prevent repeated transaction creation from already-staged rows; see FIN-001.

Recommended action:

Keep the constraint and add production idempotent commit logic.

Release blocker: No

## Production Resilience Findings

### RES-001: No explicit timeout/abort around Gemini extraction

Severity: Medium

Evidence:

- `src/lib/ai/gemini.ts:15-41` calls `fetch` without an `AbortController` or timeout.
- Document extraction calls Gemini synchronously in `src/lib/ai/extract-document.ts:46-50`.

Impact:

Gemini slowness can hold a server action until platform timeout, producing poor user feedback and uncertain retry state.

Recommended action:

Add an explicit timeout and classify timeout errors into user-safe retry messages. Consider moving extraction to an async job for production.

Release blocker: No

### RES-002: Offline and draft recovery exist for core manual forms

Severity: Informational

Evidence:

- Offline banner listens for browser online/offline events in `src/components/OnlineStatus.tsx:8-24`.
- Transaction form restores and persists draft data in `src/features/transactions/ManualTransactionForm.tsx:45-64`.
- Debt form restores and persists draft data in `src/features/debts/ManualDebtForm.tsx:48-77`.

Impact:

Manual form data is resilient to navigation and offline interruptions. This is a positive launch-readiness signal.

Recommended action:

Add the same draft persistence pattern to long import review edits if users are expected to spend significant time resolving rows.

Release blocker: No

### RES-003: Missing records generally render 404/not-found instead of leaking data

Severity: Informational

Evidence:

- Upload review requires the current user and returns `notFound()` when `getDocument(user.id, documentId)` fails in `src/app/upload/review/[documentId]/page.tsx:21-28`.
- History import review and summary pages also use user-scoped repository lookups and `notFound()` according to search results for `src/app/history-import/[batchId]/review/page.tsx` and `src/app/history-import/[batchId]/summary/page.tsx`.

Impact:

Unauthorized or missing records do not mount the sensitive review UI.

Recommended action:

Keep this pattern for all future detail routes.

Release blocker: No

### RES-004: Empty-data states are present on primary dashboards

Severity: Informational

Evidence:

- Today page renders an empty state when there are no transactions in `src/app/today/page.tsx:61-65`.
- Overview page renders an empty state when category data is absent in `src/app/overview/page.tsx:84-85`.
- Transactions and debts clients import and use `EmptyState` according to search results.

Impact:

First-run users have reasonable empty states instead of blank screens.

Recommended action:

Keep empty-state smoke coverage in release testing.

Release blocker: No

### RES-005: Parser diagnostics are safer than generic error logs

Severity: Low

Evidence:

- `logSafeParserDiagnostic` records parser stage, batch ID, error name, and code in `src/app/actions/history-import.ts:44-65`.
- However, generic catch blocks still log full errors for batch confirmation, rollback, and delete in `src/app/actions/history-import.ts:275-329`.

Impact:

Parser failures are reasonably redacted, but generic errors may still include storage or database messages. The risk is lower than SEC-002 because raw financial document content is not intentionally logged here.

Recommended action:

Adopt the same structured safe diagnostic pattern for all production server-action catch blocks.

Release blocker: No

## Dependency Audit

Command run:

```bash
npm audit --json
```

Result: 2 moderate vulnerabilities, 0 high, 0 critical. `npm audit` exited non-zero because vulnerabilities were found.

### DEP-001: `next` moderate advisory via bundled `postcss`

Severity: Medium

Evidence:

- `package.json:21` pins `next` to `16.2.10`.
- `package-lock.json:6690-6700` resolves `next@16.2.10` and its bundled `postcss@8.4.31`.
- `npm audit --json` reported `next` severity `moderate`, via `postcss`, range `9.3.4-canary.0 - 16.3.0-canary.5`.

Vulnerable dependency path:

`tanglak -> next@16.2.10 -> postcss@8.4.31`

Reachable in production:

Possibly, through Next's build/runtime CSS processing path. The underlying advisory is PostCSS stringify XSS for crafted CSS content. TangLak does not appear to accept user-authored CSS, so direct exploitability is likely low, but the package is part of production dependencies.

Recommended non-breaking remediation:

Wait for a patched Next release that updates bundled PostCSS, then upgrade within the same Next major/minor if available. Do not use `npm audit fix --force`; the audit-suggested fix points to an unrelated semver-major downgrade.

Release blocker: No, but must be tracked before launch.

### DEP-002: `postcss` moderate advisory under Next

Severity: Medium

Evidence:

- `package-lock.json:6743-6745` resolves `node_modules/next/node_modules/postcss` to `8.4.31`.
- `package-lock.json:7434-7436` also includes top-level `postcss@8.5.16`, which is not the vulnerable copy reported by audit.
- `npm audit --json` reported `postcss` severity `moderate`, advisory `GHSA-qx2v-qp2m-jg93`, range `<8.5.10`, node `node_modules/next/node_modules/postcss`.

Vulnerable dependency path:

`tanglak -> next@16.2.10 -> postcss@8.4.31`

Reachable in production:

Likely only if untrusted CSS reaches PostCSS stringify. TangLak does not provide a user CSS feature, so practical exposure appears low.

Recommended non-breaking remediation:

Upgrade Next when it bundles PostCSS `>=8.5.10`, or use an official Next patch release that resolves the advisory. Keep top-level PostCSS as-is; it is already resolved to `8.5.16`.

Release blocker: No, but must be tracked.

## Security Review Notes With No Finding

- Server actions for finance, accounts, documents, profile, and history import generally call `requireUser()` before user data mutations.
- Repository read/write methods generally include `.eq("user_id", userId)` filters.
- Password reset uses Supabase recovery session checks in production and signs out after password update in `src/app/actions/auth.ts:171-183`.
- `/auth/reset` is dynamic and reads per-request recovery state in `src/app/auth/reset/page.tsx:5-20`.
- Mock auth is gated by `E2E_MOCK_AUTH` in `src/lib/auth/session.ts:23-24` and middleware `middleware.ts:22-49`; ensure this environment variable is never set in production.

## Recommended Task Order Before Production Release

1. Fix SEC-001 middleware Supabase key validation and add config tests.
2. Fix SEC-002 by redacting Gemini raw-output logging and server-action production logs.
3. Fix FIN-001 with production idempotency around import row commits.
4. Fix FIN-002 with a shared Bangkok date/month helper across pages, exports, forms, and repository queries.
5. Fix FIN-003 with positive amount validation and debt monetary DB checks.
6. Add account/debt FK ownership validation for manual and import flows.
7. Add explicit Gemini/upload timeouts and user-safe timeout messages.
8. Perform live Supabase RLS/storage verification against staging.
9. Track Next/PostCSS advisories and upgrade to a patched Next release when available.
10. Run full smoke test and rollback drill from `docs/SMOKE_TEST.md` and `docs/ROLLBACK_PLAN.md`.
