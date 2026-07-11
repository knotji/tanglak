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
  two concurrent browser tabs (same session) submitting the same batch
  produce no duplicate; another authenticated user gets a 404 opening
  someone else's batch review page.

## SQL-level atomicity

No live Postgres instance was available to literally execute these SQL
scenarios (see "Database verification performed for this review" below).
What follows is a rigorous *static* trace of each required scenario against
documented, unambiguous PostgreSQL language semantics — clearly
distinguished from the mock-path scenarios that the automated test suite
actually executes.

- **Same row committed twice** / **retry does not recreate committed
  transactions**: on the second call, `select ... for update` returns the
  row with `review_status = 'imported'` (set by the first call), so
  execution hits `if v_row.review_status in ('imported', 'skipped') then
  return query select v_row.created_transaction_id, true; return; end if;`
  before reaching the `insert into transactions` statement at all — no
  second insert is even attempted. **Executed**, via the mock path, in
  `history-import-idempotency.test.ts` ("does not create a duplicate
  transaction when the identical commit request is sent twice",
  "refresh-and-resubmit ... does not recreate").
- **Concurrent calls for the same row**: `select ... for update` takes a
  row-level lock; this is standard, documented PostgreSQL MVCC behavior —
  a second concurrent transaction's `select ... for update` on the same
  row blocks until the first transaction commits or rolls back, then
  proceeds against the now-committed state (sees `review_status =
  'imported'` and takes the idempotent-return branch above). This is not
  something that needs live execution to establish; it is PostgreSQL's
  documented row-locking contract for `SELECT ... FOR UPDATE`. **Executed**
  via the mock path's equivalent guarantee (no `await` between check and
  write) in "does not create duplicates under concurrent commit requests"
  and "two concurrent tabs" (e2e).
- **Transaction insert succeeds but the row-state update is forced to
  fail**: cannot happen as a *partial* commit. `import_commit_row` is
  declared `language plpgsql` as a **function**, not a **procedure** —
  PL/pgSQL functions cannot contain `COMMIT`/`ROLLBACK` at all (only
  procedures, called via `CALL`, can). This means the entire function body
  executes as a single, indivisible unit of the caller's transaction (or
  its own top-level implicit transaction when invoked via `.rpc()`): if
  *any* statement after the `insert into transactions` — including the
  final `update import_rows` — were to fail for any reason, PostgreSQL
  rolls back everything the function did, including the earlier insert.
  There is no PL/pgSQL construct available here that could commit the
  insert and then fail the row update as two separate, independently
  durable operations; that would require explicit transaction control,
  which the function's language forbids. This is a language-level
  guarantee, not a runtime behavior that needs to be observed to be
  trusted.
- **Debt-payment side effects roll back atomically**: same reasoning — the
  `debt_payments` insert and the `debts` recalculation `update` are
  ordinary statements inside the same function body as the `transactions`
  insert and the `import_rows` update; a failure in any of them (e.g. a
  constraint violation) rolls back all of them together, including the
  transaction that was "already" inserted earlier in the same call. There
  is no scenario where a transaction row exists without its corresponding
  debt_payment row (when one was supposed to be created), or vice versa.
- **Rollback called twice**: `import_rollback_batch` locks the batch row
  (`select status ... for update`) and returns immediately, as a no-op,
  when `v_status = 'rolled_back'`. A second call — sequential or
  concurrent — either observes `rolled_back` directly (sequential) or
  blocks on the row lock until the first call's transaction commits, then
  observes it (concurrent). **Executed** via the mock path in
  `history-import-idempotency.test.ts` ("rollback is idempotent on
  repeated calls").
- **Foreign user invocation rejected**: both functions filter every
  `select`/`insert`/`update`/`delete` by `user_id = p_user_id`, and (per
  the security review above) RLS independently re-checks `auth.uid() =
  user_id` regardless of what `p_user_id` claims — a foreign user's call
  either matches zero rows (`if not found then raise exception ...`) or is
  rejected outright by RLS before the application-level check even runs.
  **Executed** via the mock path (which replicates the same ownership
  filtering) in both test files ("another user cannot commit rows
  belonging to someone else's batch", "rollback stays ownership-scoped",
  "another authenticated user cannot commit/roll back someone else's
  batch").
- **Unresolved counters recompute correctly after one row fails**: this is
  an *application-layer* (TypeScript) behavior, not a property of either
  SQL function individually — `importReviewedRows` always re-reads
  `listImportRows` after the per-row loop and recomputes
  `importedTotal`/`skippedTotal`/`unresolvedCount` from that fresh read,
  regardless of how many rows failed. This **is** directly executed by the
  test suite: `history-import-idempotency.test.ts`'s "a failed row does
  not abort the rest of the batch ... does not mark the batch as fully
  completed" and "retrying after a partial failure completes only the
  remaining row" assert on `result.failedCount`, `result.remainingCount`,
  and the batch's recomputed `status` directly.

## Database verification performed for this review

**SQL execution environment**: none was available. This worktree has no
`supabase/config.toml`, and the sandbox has no `supabase` CLI, no `docker`,
and no `psql` installed (all verified absent before writing this section).
`supabase db reset` and any live migration run were therefore **not
possible** here, and nothing below claims otherwise. What was done instead:

1. **Full manual schema cross-check.** Every table, column, type, enum, and
   constraint referenced by `202607110002_history_import_idempotency.sql`
   was traced back to the exact migration that defines it and read in full:
   - `transactions`: `202607100001_initial_tanglak_schema.sql` (base
     columns, `amount_satang bigint not null check (amount_satang >= 0)`),
     `202607100002_auth_crud_support.sql` (`category_label text` — the
     function's INSERT column list uses `category_label`, not
     `category_id`; verified this column exists and matches what
     `finance-repository.ts` already writes), `202607100004_...` (last-four/
     bank columns, unused here), `202607100005_history_import_support.sql`
     (`import_batch_id`, `import_row_id`, `is_historical` — all present and
     used), `202607110001_financial_value_guards.sql`
     (`transactions_debt_payment_amount_satang_positive`, `not valid`,
     applies to new inserts — the function's debt_payment insert path
     already only receives pre-validated positive amounts).
   - `import_batches`: `202607100005_...` — `status public.import_batch_status`,
     `imported_rows`, `skipped_rows`, `rolled_back_at` all confirmed present
     and correctly typed against `import_rollback_batch`'s usage.
   - `import_rows`: `202607100005_...` — `review_status
     public.import_row_status`, `import_decision public.import_row_decision`,
     `created_transaction_id uuid references public.transactions(id)`,
     `user_id`, `import_batch_id` all confirmed against
     `import_commit_row`'s `v_row public.import_rows%rowtype` usage and
     field access.
   - `debt_payments`: `202607100001_...` (`user_id`, `debt_id`,
     `transaction_id`, `amount_satang`, `paid_at`), plus
     `debt_payments_amount_satang_positive` (`not valid`,
     `202607110001_...`) confirmed compatible with the pre-validated amount
     the function inserts.
   - `debts.amount_paid_this_cycle_satang`: `202607100001_...`, plus
     `debts_amount_paid_this_cycle_satang_nonnegative` (`not valid`,
     `202607110001_...`) — the recalculation always computes
     `coalesce(sum(...), 0)`, which is always `>= 0`, so it can never
     violate that constraint.
   - `transaction_status`, `transaction_type`, `import_batch_status`,
     `import_row_status`, `import_row_decision` enum definitions (all in
     `202607100001_...`/`202607100005_...`) confirmed to include every
     literal used in the function bodies (`'confirmed'`, `'debt_payment'`,
     `'imported'`, `'skipped'`, `'import'`, `'rolled_back'`, `'completed'`,
     `'partially_imported'`).
   - RLS: confirmed `transactions`, `debts`, `debt_payments` all get
     `enable row level security` plus `for select/insert/update/delete
     using/with check (auth.uid() = user_id)` policies from the loop in
     `202607100001_initial_tanglak_schema.sql` (lines 250–264); confirmed
     `import_batches`/`import_rows` get equivalent `for all using (auth.uid()
     = user_id) with check (auth.uid() = user_id)` policies in
     `202607100005_history_import_support.sql`.

   This is a rigorous read-through, not a compiler — it cannot catch every
   possible issue (e.g. a subtle plpgsql syntax error) the way actually
   running `CREATE FUNCTION` against a real server would. No such syntax
   error was found on inspection, and the SQL uses only well-established
   plpgsql constructs already present elsewhere in this migration set
   (`select ... for update`, `%rowtype`, `return query select ...`,
   `array_agg`/`= any(...)`), but this is a static review, not a compile
   confirmation.

2. **Static assertions** in `tests/unit/history-import-idempotency-migration.test.ts`
   (extended by this change) — executed and passing; verifies the exact SQL
   text for the security/locking/idempotency properties described below.

3. **Executable, if indirect, atomicity/concurrency coverage** via the mock
   auth path, which the whole existing test suite (unit, action, and e2e)
   runs against — see "SQL-level atomicity" below for exactly what this
   does and does not prove about the real Postgres functions.

## Security review

- **`security invoker` retained** on both functions (verified: no
  `security definer` appears anywhere in the migration; grep-checked in the
  static test).
- **`set search_path = public`** is set explicitly on both functions,
  closing the classic "mutable search_path" function-hijacking vector
  (Supabase's own security linter flags functions without this). Every
  table reference inside both functions is additionally fully qualified
  with `public.`, so even this setting is largely redundant defense in
  depth rather than the only protection.
- **PUBLIC execute revoked.** This review caught a real gap: PostgreSQL
  grants `EXECUTE` on a newly created function to the `PUBLIC` pseudo-role
  by default — unlike tables, which grant nothing until explicitly
  granted. The original migration only added `grant execute ... to
  authenticated` without first revoking the default PUBLIC grant, which is
  inconsistent with this repository's existing least-privilege convention
  for table grants (`202607100007_data_api_grants.sql` grants only to
  `authenticated`, never `anon`/`public`). Fixed by adding
  `revoke all on function ... from public;` before each `grant ... to
  authenticated;`.
- **Execute granted only to `authenticated`** — confirmed, `anon` is never
  granted execute on either function.
- **RLS remains effective inside the functions.** Because both functions
  are `security invoker` (not `security definer`), they execute under the
  Postgres role of the actual calling session — which, for this app, is
  always the authenticated user's own session (the server-side Supabase
  client authenticates with the anon key plus the user's session cookies,
  never a service-role key; see `src/lib/supabase/server.ts`). RLS
  policies read `auth.uid()`, a function of the *session's* JWT claims, not
  of any argument passed to `import_commit_row`/`import_rollback_batch`.
- **Caller-supplied `p_user_id` cannot broaden access, even bypassing the
  Next.js server action entirely.** Consider the worst case: an
  authenticated attacker calls `import_commit_row` directly via
  PostgREST's `/rest/v1/rpc/import_commit_row` endpoint (bypassing
  `confirmBatchAction`'s own ownership check) with `p_user_id` set to a
  victim's UUID. The function would attempt
  `insert into transactions (user_id, ...) values (p_user_id, ...)` — i.e.
  a row with `user_id = victim`. The table's RLS `insert` policy is `with
  check (auth.uid() = user_id)`; `auth.uid()` resolves to the *attacker's*
  own id (their real authenticated session), which does not equal
  `victim`, so the insert is rejected by RLS regardless of the `p_user_id`
  argument. The same reasoning applies to every `select ... for update`,
  `update`, and `delete` in both functions — each targets rows filtered by
  `user_id = p_user_id`, and RLS independently re-checks `auth.uid() =
  user_id` on top of that filter. The explicit `user_id` checks inside the
  function bodies and RLS are two independent layers; either alone would
  already block this attack.

## Unique-index deployment review

**Preflight query** — run this against production *before* applying
`202607110002_history_import_idempotency.sql`:

```sql
select import_row_id, count(*) as duplicate_count, array_agg(id) as transaction_ids
from public.transactions
where import_row_id is not null
group by import_row_id
having count(*) > 1;
```

- **Can existing duplicates make the migration fail?** Yes. If this query
  returns any rows, `create unique index uq_transactions_import_row_id`
  will fail outright with a Postgres unique-violation error (a loud,
  atomic failure — the whole migration transaction aborts, nothing is
  partially applied). This is only possible if two transactions were
  already created from the same staging row under the exact pre-fix bug
  this migration closes (the mock-only idempotency guard described in
  "Problem" above) — i.e. it can only have happened in a production
  environment that ran the buggy commit path before this fix was deployed.
- **Is a preflight query required before this release?** Yes for any
  environment where the buggy code may already have run against real
  data — run the query above and confirm it returns zero rows before
  applying the migration. If it returns rows, do **not** silently
  delete/merge the extras as part of the migration (that would rewrite
  financial history without human review, the same principle already
  applied in `financial-value-guards-migration.test.ts`'s remediation
  guidance) — instead, for each duplicate group, manually decide (based on
  which transaction is the "real" one, e.g. by `created_at` or by checking
  which one is still linked from `import_rows.created_transaction_id`)
  which duplicate transaction(s) to delete or re-point, then re-run the
  preflight query until it returns zero rows, then apply the migration.
- **Expected table size and locking impact.** This repository has no
  production data available to inspect from this environment, so table
  size cannot be measured here. What's known in general: a plain (non-
  `concurrently`) `create unique index` takes an `ACCESS EXCLUSIVE` lock on
  `transactions` for the duration of the index build — this blocks *all*
  reads and writes to that table (not just other writers; even `SELECT`s
  queue behind it) until the build completes. Build time scales
  approximately linearly with the number of non-null `import_row_id` rows
  to index (in practice, the number of historical-import-created
  transactions specifically, since the index is partial) — for a table
  with at most thousands to low tens-of-thousands of such rows this is
  typically sub-second to a few seconds; it becomes a real concern only at
  large scale (hundreds of thousands+ rows) or on a table under constant
  write load where even a few seconds of full unavailability is
  unacceptable.
- **Is plain `CREATE UNIQUE INDEX` acceptable for the current release?**
  Yes, for this project at its current stage (a pre-launch/early-stage app
  per the `release/production-readiness` branch naming and the fact this
  entire history-import feature and its idempotency fix were developed
  together, never having been live with the buggy commit path) — the
  `transactions` table is not expected to be large enough for the brief
  `ACCESS EXCLUSIVE` lock during `CREATE UNIQUE INDEX` to be a practical
  concern. This migration keeps the plain (non-concurrent) form.
- **Does production ever need a staged/concurrent deployment instead?**
  Yes, once the `transactions` table is large and/or under continuous
  write traffic in a live production environment — but **not** by editing
  this migration to use `create unique index concurrently` in place. Two
  hard constraints make that unsafe to do carelessly:
  1. `CREATE INDEX CONCURRENTLY` **cannot run inside a transaction
     block** — this is a hard PostgreSQL restriction (it internally uses
     multiple transactions with a wait for old snapshots to finish, which
     is incompatible with being nested in an outer transaction). Standard
     Supabase/most migration tooling applies each migration file as a
     single transaction; embedding `concurrently` directly in a normal
     migration file risks the whole apply failing outright, or (with
     tooling that doesn't wrap files in a transaction) leaving an invalid,
     unfinished index behind if the connection drops mid-build.
  2. It must be verified, not assumed, whether the specific deployment
     pipeline in use wraps `.sql` migration files in an implicit
     transaction — this was not verifiable in this environment (no
     `supabase` CLI available to inspect its actual apply behavior).
  
  **Correct procedure when the table is large enough to matter**: do *not*
  modify this migration. Instead, as a separate, manually-run,
  non-migration step against the target database (e.g. via the Supabase
  SQL Editor, or a `psql` session with autocommit on, outside any
  transaction block):

  ```sql
  create unique index concurrently if not exists uq_transactions_import_row_id
    on public.transactions(import_row_id)
    where import_row_id is not null;
  ```

  then confirm the index is valid (`select indisvalid from pg_index where
  indexrelid = 'public.uq_transactions_import_row_id'::regclass;` should
  return `true`; a `CONCURRENTLY` build that failed partway leaves an
  `INVALID` index that must be dropped and retried, never silently used).
  Once that concurrently-built index exists, applying
  `202607110002_history_import_idempotency.sql` normally is safe — its
  `create unique index if not exists` will see the index already exists
  (by name) and skip creating it again.

## Deployment order

1. Deploy application code (this branch). The mock/E2E-Playwright code path
   and the client-side behavior work regardless of whether the migration
   has been applied yet, but the **real Supabase path is not idempotent
   until the migration runs** (it needs `import_commit_row`/
   `import_rollback_batch` to exist) — do not leave a long gap between
   deploying the code and running the migration in a real environment.
2. Run the preflight query above against production. If it returns any
   rows, resolve them manually (see "Unique-index deployment review")
   before proceeding — do not run the migration against unresolved
   duplicates.
3. If `transactions` is large/high-traffic in production, build the unique
   index `concurrently` as a separate manual step first (see above); this
   release's assessment is that a plain synchronous build is acceptable,
   but re-evaluate this once real production data volume exists.
4. Run `supabase/migrations/202607110002_history_import_idempotency.sql`.
   With the index already present (from step 3) or acceptably small (step
   not needed), this applies the two functions and their grants; the
   `create unique index if not exists` is then a fast no-op if the index
   was already built concurrently, or a brief `ACCESS EXCLUSIVE`-locked
   build otherwise.

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
  locks the `transactions` table; see "Unique-index deployment review"
  above for the preflight query, size/locking assessment, and the correct
  manual `concurrently` procedure for when this project's data volume
  outgrows a plain build.
- This code has been exercised against the mock-auth path (used throughout
  the existing test suite), cross-checked field-by-field against every
  migration that defines the schema it touches, and reasoned through
  against documented PostgreSQL language semantics (see "SQL-level
  atomicity" above) — but has not been executed against a live
  Supabase/Postgres instance in this environment, because none was
  available (no `supabase` CLI, `docker`, or `psql` present). This is the
  same limitation noted for the prior `fix/financial-value-guards`
  migration, and applies equally here.
