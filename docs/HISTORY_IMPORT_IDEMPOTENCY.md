# History Import Commit Idempotency

Production note for the `fix/history-import-idempotency` change. Covers why
duplicate transactions were reachable from the History Import commit step,
the idempotency-key design, transaction boundaries, partial-failure
behavior, and deployment/rollback procedure.

## Problem

`202607100006_history_import_hardening.sql` already documented the intent:

> `created_transaction_id` is the authoritative idempotency field: if
> non-null, the row has already been imported and must not create another
> transaction.

but never enforced it. The only place this was checked was in
`importReviewedRows` (`src/lib/data/finance-repository.ts`), and the check
was gated behind `isMockAuthEnabled()` — on the real Supabase path, calling
the commit action a second time for the same batch re-created a transaction
for every row with `decision: "import"`, regardless of whether it had
already been committed. Nothing in the schema prevented this either: there
was no unique constraint on `transactions.import_row_id`.

This was reachable from:
- **Double submission** — the submit button disables itself once React
  processes a click, but a genuinely rapid double-click, or two separate
  browser tabs, could both reach the server action before either completed.
- **Client retry after a timeout** — a Next.js Server Action is just a POST;
  if the client gives up waiting and retries, the original request keeps
  running server-side to completion. Both requests then race.
- **Refresh and resubmit** — the review page does not distinguish an
  already-committed batch from an uncommitted one, so navigating back to it
  and clicking confirm again resubmitted decisions for already-imported
  rows.
- **Partial failure with no per-row isolation** — the per-row loop had no
  try/catch, so a single row throwing (e.g. an invalid `debtId`) aborted the
  entire loop, including the batch-counter update at the end. This left
  already-committed rows with correct data but the batch's own `status`
  never updated, and no accounting of what actually happened per row.
- **Non-atomic multi-step writes** — creating a transaction, optionally
  inserting a `debt_payments` row and recalculating the debt's cached total,
  and linking `import_row_id`/`import_batch_id` back onto the transaction
  were four to five separate Supabase calls with no surrounding database
  transaction. A crash between any two of them left inconsistent state.
  Rollback had the same problem: delete `debt_payments`, delete
  `transactions`, unlink merged transactions, reset staging rows, and mark
  the batch `rolled_back` were five sequential calls with no atomicity.

Duplicate *detection* (`src/lib/finance/duplicates.ts`) is a different,
already-correct feature: it flags a newly-parsed row as a possible match
against a pre-existing, unrelated transaction (e.g. the user already entered
the same expense manually). It has nothing to do with — and does not
protect against — re-running the same import commit.

## Idempotency key design

The idempotency key is **`import_rows.id`** (the staging row's own primary
key) — not a client-generated nonce. It is already:
- Stable across retries (the client always resubmits the same `rowId` for
  the same logical row; it never changes).
- Unique per row within a batch (`import_rows.id` is a UUID primary key).
- Already present in every commit request the client sends.

No new "idempotency key" column or client-supplied request ID was needed —
inventing one would have duplicated a key that already existed. Instead,
three things were added to make that existing key an *enforced* guarantee
rather than a documented intention:

1. **A database-backed uniqueness constraint.**
   `create unique index uq_transactions_import_row_id on public.transactions(import_row_id) where import_row_id is not null;`
   No two transactions can ever be linked to the same staging row, full
   stop, regardless of any application-level bug.
2. **An atomic, row-locking commit function**, `public.import_commit_row`
   (see below), which re-checks the row's resolved state *under a row lock*
   immediately before writing, closing the check-then-act race a plain
   "check in JS, then insert" sequence cannot close on its own.
3. **A frozen-row invariant in the application layer**: once a staging
   row's `review_status` is `imported` or `skipped`, `importReviewedRows`
   treats it as permanently resolved and never reprocesses it — regardless
   of what decision a later request sends for it. This is what makes
   "excluded rows remain excluded" and "duplicate rows remain skipped" hold
   even across a full resubmit.

## Schema/migration changes

New migration: `supabase/migrations/202607110002_history_import_idempotency.sql`
(no historical migration file modified). Adds:

- `uq_transactions_import_row_id` — partial unique index on
  `transactions(import_row_id) where import_row_id is not null`.
- `public.import_commit_row(...)` — a `security invoker` Postgres function
  that performs the entire "commit one staging row" sequence atomically:
  1. `select ... for update` locks the staging row.
  2. If already resolved (`review_status in ('imported', 'skipped')`),
     returns the existing `created_transaction_id` with `already_imported =
     true` — a safe no-op, not an error.
  3. Otherwise verifies `debt_id` (if any) belongs to the same user, inserts
     the transaction (with `import_batch_id`/`import_row_id`/`is_historical`
     set directly, no separate follow-up update needed), optionally inserts
     the linked `debt_payments` row and recalculates that debt's
     `amount_paid_this_cycle_satang`, and updates the staging row's
     `created_transaction_id`/`review_status`/`import_decision`.
  All in one Postgres transaction (the function body) — it either fully
  commits or fully rolls back; there is no state where a transaction exists
  but the staging row wasn't updated to point at it, or vice versa.
- `public.import_rollback_batch(...)` — a `security invoker` function that
  performs the full rollback sequence (delete `debt_payments`, delete
  historical `transactions`, unlink merged transactions, reset staging
  rows, recalculate affected debts, mark the batch `rolled_back`)
  atomically, and is idempotent on re-entry (`status = 'rolled_back'`
  returns immediately).
- `grant execute ... to authenticated` for both functions.

**Why `security invoker`, not `security definer`**: the app's server-side
Supabase client (`src/lib/supabase/server.ts`) authenticates with the
user's own session (anon key + cookies), not a service-role key. A
`security invoker` function runs under that same session, so the existing
RLS policies (`auth.uid() = user_id`) still apply in addition to the
function's own explicit `user_id` parameter checks. A caller cannot use
`p_user_id` to touch another user's rows — RLS independently blocks it
regardless of what the argument says. This is defense in depth, not the
only protection.

**Why money validation still happens in TypeScript, not SQL**: the
financial value guards (severity classification, safe Thai error copy,
`FinancialValueError`) added in `fix/financial-value-guards` are reused
as-is — `assertMoneySatang` and `assertDebtBelongsToUser` are called before
either the RPC or the mock-path commit function runs. The RPC only performs
the mechanical writes with an already-validated amount. This keeps a single
source of truth for money validation and avoids reimplementing it in
PL/pgSQL. The database `CHECK` constraints from that same prior migration
still apply as a backstop regardless of which code path performs the
insert.

## Transaction boundary

- **One staging row's commit** = one call to `import_commit_row` = one
  Postgres transaction (the function body). This is the smallest atomic
  unit. It covers: transaction insert, optional debt_payment insert +
  debt-total recalculation, and the staging row's terminal-state update.
- **One `importReviewedRows` call** (i.e. one `confirmBatchAction`
  invocation, or one Playwright "click confirm") is **not** one big
  transaction — it is a loop of independent per-row atomic commits, each
  wrapped in its own try/catch. This is intentional: requirement 5 (partial
  failure) explicitly asks that row 101 of 220 failing must not undo rows
  1–100. Wrapping the entire batch in one transaction would satisfy
  atomicity at the cost of turning every partial failure into a full
  rollback of everything, which is the opposite of what's required here.
- **Rollback** (`import_rollback_batch`) *is* one single transaction across
  the whole batch, because rollback has the opposite requirement: an
  operator explicitly asked to undo the entire batch, and a half-rolled-back
  batch is strictly worse than either fully-imported or fully-rolled-back.

## Retry behavior

A retry (double click, client timeout retry, refresh-and-resubmit, or a
second concurrent request) is **always safe to send exactly the same
decisions array again**:

- Already-resolved rows (`review_status in ('imported', 'skipped')`) are
  detected up front in `importReviewedRows` from a fresh `listImportRows`
  read, and are never reprocessed — counted into the result, but no write
  happens.
- If two requests race for the same *unresolved* row, `import_commit_row`'s
  row lock (mock path: the synchronous, `await`-free check-and-write) makes
  exactly one of them perform the insert; the other sees the row already
  resolved once it acquires the lock and returns the first one's
  transaction id.
- The client does not need to track "which rows did I already submit" —
  resending the full current decisions array is always correct.

## Partial failure behavior

Each row's commit is wrapped in its own `try`/`catch` inside
`importReviewedRows`. A failure:

- Does not abort processing of the remaining rows in the same call.
- Is recorded in a `failures: { rowId, message }[]` array, with the row
  itself left in whatever state it was in before the attempt (so a retry
  will naturally re-attempt exactly that row).
- Never marks the batch `completed` — batch status is always recomputed
  from a fresh `listImportRows` read after the loop
  (`unresolvedCount === 0 ? "completed" : "partially_imported"`), so a batch
  with even one unresolved/failed row is reported as `partially_imported`,
  never falsely `completed`.
- Surfaces to the client as a partial-success message
  (`confirmBatchAction` in `src/app/actions/history-import.ts`): "นำเข้าข้อมูลสำเร็จบางส่วน:
  สำเร็จ N รายการ, ไม่สำเร็จ M รายการ, เหลือค้าง K รายการ" — counts, not a
  blanket "success", and never a raw error message, stack trace, or
  Postgres/Zod detail (the `catch` block's message always comes from either
  the safe financial-guard error copy or the row-not-found copy).

The batch's `imported_rows`/`skipped_rows` counters are **always
recomputed from the actual current row state**, never accumulated as
deltas — this was itself a bug in the pre-existing code (`(batch.importedRows
|| 0) + importedCount`), which would have double-counted already-imported
rows on every retry once the idempotency guard actually worked. Recomputing
from scratch is naturally idempotent regardless of how many times, or how
partially, the commit has been attempted.

## Concurrency behavior

Two simultaneous commit requests for the same batch (same or different
rows) cannot create duplicates, and this is enforced at the database layer,
not with an in-memory mutex:

- **Real Postgres path**: `import_commit_row`'s `select ... for update`
  locks each staging row for the duration of the function call. A second,
  concurrent call for the *same* row blocks until the first completes, then
  observes the row already resolved. The partial unique index on
  `transactions.import_row_id` is a second, independent backstop — even a
  hypothetical bug in the row-locking logic could not produce two
  transactions for the same row without violating that constraint.
- **Mock path** (used by the whole existing test suite, since
  `E2E_MOCK_AUTH=1`): `commitImportRowMock` performs the resolved-state
  check and the mutation with **no `await` between them** — JS only yields
  to other concurrently-running async calls at `await` points, so a
  function body with none of them is atomic with respect to any other
  in-flight call into the same mock store, without needing an explicit
  lock object.
- Rollback has the equivalent guarantee via `import_rollback_batch`'s
  `select ... for update` on the batch row itself.

## Ownership

- `confirmBatchAction`/`rollbackBatchAction` get the user id from
  `requireUser()` (trusted server session) — never from a client-supplied
  value.
- `confirmBatchAction` now checks `getImportBatch(user.id, batchId)` up
  front and returns a clean "ไม่พบชุดนำเข้าข้อมูล" if the batch doesn't
  belong to the caller, before ever touching `importReviewedRows`.
- `importReviewedRows` independently re-checks batch ownership at its own
  entry point (defense in depth, in case it is ever called from anywhere
  else) and throws immediately if the batch isn't found for that user,
  rather than silently no-op-ing through every row and only surfacing an
  obscure error from the final counter update.
- Every row read/write inside `importReviewedRows`, `import_commit_row`, and
  `import_rollback_batch` is scoped by both `id` and `user_id` — never `id`
  alone.
- `import_commit_row` verifies `debt_id` belongs to the same user before
  writing (`assertDebtBelongsToUser` in TypeScript before the call, and a
  redundant `exists (... where user_id = p_user_id)` check inside the
  function itself).
- The review page (`src/app/history-import/[batchId]/review/page.tsx`)
  already called `getImportBatch(user.id, batchId)` and `notFound()`s if it
  returns null — a foreign batch id already 404s; this was correct before
  this change and is unaffected by it.

## Safe errors

- Row-level failures inside `importReviewedRows` catch the underlying error
  and store `error.message` — which, for every write path in this loop
  (`assertMoneySatang`, `assertDebtBelongsToUser`, the RPC's `raise
  exception`), is already a controlled, safe string (Thai financial-guard
  copy, or a short English "not found"/"not owned by user" message) rather
  than a raw Postgres/Zod error. No SQL text, stack trace, or internal
  UUID-bearing error is ever placed in a message shown to the user.
- `logSafeError` (existing convention, unchanged) records the *actual*
  error object for internal diagnostics, separately from the safe message
  returned to the client.

## Tests

- `tests/unit/history-import-idempotency.test.ts` — repository-level:
  identical commit twice, concurrent commits (`Promise.all`), refresh-and-
  resubmit, debt-payment retry doesn't double-count the debt's cached
  total, partial failure doesn't abort the batch or falsely mark it
  complete, retrying after a partial failure finishes cleanly without
  recreating the already-committed row, excluded/skipped rows stay
  excluded even if a retry sends a different decision, legitimate
  same-amount transactions from separate batches are both created (not
  cross-deduplicated), another user cannot commit someone else's batch,
  rollback stays ownership-scoped, rollback is idempotent.
- `tests/unit/history-import-actions.test.ts` — action-level
  (`confirmBatchAction`/`rollbackBatchAction`): double-click, `Promise.all`
  concurrent submissions, partial-success message content and later clean
  retry, cross-user commit/rollback rejection, safe-error-message
  assertions (no stack traces, no `relation "public....` Postgres text).
- `tests/unit/history-import-idempotency-migration.test.ts` — static
  assertions (same pattern as `tests/unit/rls.test.ts`) on the new
  migration: unique index present, both functions present and
  `security invoker` (not `definer`), idempotency/lock/ownership logic
  present in the SQL text, execute grants present, no historical migration
  touched, no bare `update`/`delete` outside the two function bodies,
  ASCII-only.
- `tests/e2e/history-import-idempotency.spec.ts` — refresh-and-resubmit via
  the real review page produces no duplicate rows in the transactions list;
  a rapid double-click on the confirm button produces no duplicate; another
  authenticated user gets a 404 opening someone else's batch review page.

## Deployment order

1. Deploy application code (this branch). The mock/E2E-Playwright code path
   and the client-side behavior work regardless of whether the migration
   has been applied yet, but the **real Supabase path is not idempotent
   until the migration runs** (it needs `import_commit_row`/
   `import_rollback_batch` to exist) — do not leave a long gap between
   deploying the code and running the migration in a real environment.
2. Run `supabase/migrations/202607110002_history_import_idempotency.sql`.
   Creating the partial unique index and the two functions does not lock
   out reads/writes on `transactions`/`import_rows`/`import_batches`
   beyond the brief `ACCESS EXCLUSIVE` a `CREATE INDEX` (non-concurrent)
   normally takes — on a very large `transactions` table in production,
   consider `create unique index concurrently` instead (not used here to
   keep the migration a single plain statement; switch to the
   `concurrently` form, which cannot run inside a transaction block, as a
   follow-up if the table is large enough for this to matter).
3. No preflight/backfill step is required for this migration (unlike the
   financial-value-guards migration) — the unique index is only violated if
   two transactions already reference the same `import_row_id`, which was
   only possible under the exact bug this migration fixes, and creating the
   index will fail loudly (not silently) if any such duplicate already
   exists in production, at which point the duplicate must be resolved
   manually (identify and delete/merge the extra transaction) before
   retrying the migration.

## Rollback procedure (undoing this migration)

```sql
drop index if exists public.uq_transactions_import_row_id;
drop function if exists public.import_commit_row(
  uuid, uuid, uuid, public.transaction_type, bigint, timestamptz, text, text,
  text, text, uuid, uuid, uuid
);
drop function if exists public.import_rollback_batch(uuid, uuid);
```

This is purely additive-removal — no data was rewritten by
`202607110002_history_import_idempotency.sql`, so dropping the index and
functions fully reverts the database to its prior state. Reverting the
application code alongside it is required too, since `finance-repository.ts`
now calls these functions on the real Supabase path — reverting only the
database migration while keeping the new application code would break
history import commits entirely.

## Remaining limitations

- `merge_existing` (linking to a pre-existing transaction) and `skip` are
  guarded by a conditional `UPDATE ... WHERE review_status NOT IN
  ('imported','skipped')`, which is safe under Postgres's own per-statement
  row locking, but is not wrapped in the same kind of dedicated RPC as the
  `import` path — there was no multi-table write to make atomic for these
  two decisions (a single `UPDATE` is already atomic on its own), so a
  narrow RPC would have added complexity without closing any real gap.
- The non-concurrent `create unique index` in the deployment step briefly
  locks the `transactions` table; see the deployment-order note above for
  when to switch to `create index concurrently` instead.
- This code has been exercised against the mock-auth path (used throughout
  the existing test suite) and reviewed carefully for correctness against
  real Postgres semantics, but has not been executed against a live
  Supabase/Postgres instance in this environment — consistent with the same
  limitation noted for the prior `fix/financial-value-guards` migration.
