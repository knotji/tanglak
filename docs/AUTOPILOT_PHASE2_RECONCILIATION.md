# AI Financial Autopilot Phase 2 -- Smart Review & Reconciliation (PR A)

## Problem statement

Phase 1 (see `docs/AUTOPILOT_FOUNDATION.md`) handles one document at a
time: extract, validate, decide, execute, explain, undo. It never looks
*across* records. In practice a user's financial picture accumulates
relationships Phase 1 has no way to see:

- Two slips for the same movement of money recorded as an `expense` and
  an `income` instead of one transfer.
- The same purchase entered twice -- once from a slip, once manually,
  once from a CSV import.
- An expense that was actually a debt payment, but was never linked to
  the debt.
- A refund that reverses an earlier expense.

Phase 2's end goal (all three PRs) is a Review Inbox that surfaces these
relationships safely. **This document covers PR A only**: the
deterministic foundation -- domain model, matching engines, policy,
schema, persistence, and tests. There is no UI in PR A.

## PR A scope

Ships:

- Deterministic candidate-generation engines for all four candidate
  types (`own_account_transfer`, `possible_duplicate`,
  `likely_debt_payment`, `possible_refund`).
- A pure, deterministic policy engine (`reconciliation-policy.ts`).
- An additive Supabase migration (`reconciliation_candidates` table).
- A repository layer with idempotent, concurrency-safe persistence.
- Thai deterministic explanations, keyed by reason code.
- A source-change invalidation mechanism (not yet wired into any write
  path -- see Known limitations).
- A minimal internal integration seam (`reconciliation-scan.ts`) that
  wires the above together, callable from a test or a future server
  action -- but nothing calls it automatically yet.
- Unit tests for every engine, the policy, the repository, idempotency,
  and data-integrity invariants.

## Non-goals / explicitly out of scope for PR A

- **No Review Inbox UI.** No new page, no new navigation item, no
  bulk-action UI, no dashboard change.
- **No automatic execution of any reconciliation decision.** Every
  candidate this PR creates sits in `proposed`/`needs_review` status.
  Nothing reads a candidate row and acts on it.
- **No debt balance mutation, ever.** `likely_debt_payment` candidates
  are read-only suggestions; nothing creates a `debt_payment`
  transaction, links a `debt_id`, or calls
  `recalculateDebtPaidThisCycle`.
- **No change to existing financial totals.** Nothing in this PR touches
  `calculateMonthlyTotals`, `calculateCategorySpend`,
  `getMonthlyFinanceSnapshot`, or the debt payment simulator
  (`src/lib/debt/*`).
- **No automatic invalidation wiring.** The invalidation mechanism
  (`reconciliation-invalidation.ts`) exists and is tested, but nothing
  calls it from `updateTransaction`/`deleteTransaction` yet.
- **No cron, no scheduled scan.** `scanForReconciliationCandidates` has
  no caller in this PR besides its own tests.

## Trust boundary

Identical to Phase 1: Gemini/AI is never involved in this PR at all.
Every matching engine is pure TypeScript operating only on
already-persisted, already-validated `Transaction`/`Debt` rows read via
the existing repository layer (`src/lib/data/finance-repository.ts`).
There is no AI-provided confidence, evidence, or decision anywhere in
this feature.

```
Confirmed transactions + active debts (already-validated, persisted data)
  -> deterministic candidate generation (own-account-transfer.ts,
     possible-duplicate.ts, likely-debt-payment.ts, possible-refund.ts)
  -> deterministic policy (reconciliation-policy.ts: pure function, no I/O)
  -> persistence (reconciliation-candidates-repository.ts: idempotent,
     RLS-scoped, never auto-executed)
  -> deterministic Thai explanation (reconciliation-explanations.ts)
  -> (PR B) Review Inbox UI
  -> (PR C) debt-payment linking / refund execution / audit hardening
```

## Architecture / file map

```
src/lib/reconciliation/
  reconciliation-types.ts                 domain model (candidate/evidence/policy types)
  reconciliation-confidence.ts            score -> confidence tier (shared by all engines)
  reconciliation-idempotency.ts           canonicalized idempotency-key computation
  reconciliation-snapshot.ts              shared bounded transaction snapshot builder
  own-account-transfer.ts                 candidate engine
  possible-duplicate.ts                   candidate engine (reuses src/lib/finance/duplicates.ts)
  likely-debt-payment.ts                  candidate engine
  possible-refund.ts                      candidate engine
  reconciliation-policy.ts                pure policy engine
  reconciliation-explanations.ts          Thai deterministic copy
  reconciliation-candidates-repository.ts persistence (mock/Supabase, mirrors autopilot-audit.ts)
  reconciliation-invalidation.ts          source-change invalidation (not yet wired in)
  reconciliation-scan.ts                  minimal integration seam (generate + persist)

supabase/migrations/202607130002_reconciliation_candidates.sql
docs/AUTOPILOT_PHASE2_RECONCILIATION.md   this document
tests/unit/reconciliation/*.test.ts
tests/unit/reconciliation-rls.test.ts
```

### Canonical helpers reused, not duplicated

- Money: `src/lib/finance/money.ts` (amounts are always integer satang;
  no second money model).
- Bangkok dates: `src/lib/finance/date.ts`'s `getBangkokDateOf` (used for
  the Bangkok-safe same-day duplicate check -- never a naive
  `.slice(0, 10)`).
- Duplicate scoring: `src/lib/finance/duplicates.ts`'s
  `scoreDuplicateCandidate` is the base signal `possible-duplicate.ts`
  builds on, unmodified.
- Transaction/debt reads: `src/lib/data/finance-repository.ts`'s
  `listAllTransactions`/`listDebts` (no new query path, no new
  aggregation).
- Confidence abstraction: candidate confidence reuses
  `AutopilotConfidence` (`high`/`medium`/`low`/`unknown`) from Phase 1,
  and the DB column reuses the existing
  `public.autopilot_confidence_level` enum -- no second confidence
  scale.

## Candidate lifecycle

```
proposed -> needs_review -> confirmed | rejected
                          -> invalidated (from any non-terminal state)
```

- `proposed` / `needs_review`: the only statuses PR A ever writes. Every
  candidate is inserted as `needs_review` unless the policy outcome is
  `auto_match_safe`, in which case it is inserted as `proposed` (a
  purely informational distinction in this PR -- see Known
  limitations).
- `confirmed` / `rejected`: reserved for PR B's Review Inbox actions.
  No code in PR A ever writes these.
- `invalidated`: written only by
  `invalidateReconciliationCandidate`/`invalidateStaleReconciliationCandidates`
  when a source transaction was edited or deleted after generation.
  Terminal, but not a delete -- the row (and its evidence) stays for
  audit purposes.

Rows are never hard-deleted (no delete RLS policy at all -- see
Schema/RLS below), mirroring the `autopilot_actions` append-only
convention.

## Candidate types

| Type | What it flags | PR A action |
|---|---|---|
| `own_account_transfer` | An `expense` + `income` pair that likely represents one transfer between the user's own accounts | review candidate only |
| `possible_duplicate` | Two transactions that likely represent the same real-world purchase, across slip/manual/CSV/history-import sources | review candidate only |
| `likely_debt_payment` | An `expense` that looks like an unlinked payment toward an active debt | review candidate only |
| `possible_refund` | An `income`/`refund` that likely reverses an earlier `expense` | review candidate only |

## Evidence model

Every candidate carries:

- `sourceTransactionIds`: canonicalized (sorted), distinct transaction
  ids -- one for `likely_debt_payment`, two for the pair-based types.
- `relatedDebtIds`: only present for `likely_debt_payment` (debts are
  not transactions, so they never appear in `sourceTransactionIds`).
- `evidence`: an ordered list of `{ reasonCode, detail? }` -- see reason
  codes below.
- `evidenceSnapshots`: a bounded per-transaction snapshot
  (`type`, `amountSatang`, `occurredAt`, `merchant?`, `category?`,
  `updatedAt?`) captured at generation time, used both for explanations
  and for source-change invalidation. Never a full row dump, never raw
  extraction output, never an image/base64/credential -- see Privacy
  constraints.

Reason codes actually emitted (every one is covered by a stability test
in `reconciliation-explanations.test.ts`):
`amount_exact_match`, `reference_match`, `merchant_similar`,
`merchant_exact_match`, `same_document_id`, `distinct_source_records`,
`timestamp_within_window`, `insufficient_evidence`,
`multiple_possible_matches`, `opposite_direction`,
`self_match_rejected`, `cross_user_rejected`, `account_hint_match`,
`transfer_like_source`, `same_import_source`, `different_import_source`,
`same_bangkok_day`, `explicit_debt_destination`, `due_date_proximity`,
`multiple_debt_matches`, `partial_refund_amount`,
`multiple_earlier_expenses`.

`self_match_rejected`/`cross_user_rejected` are policy-layer-only codes
(defense in depth -- see Policy below); the generators make both
structurally impossible, so in practice these only appear if a future
caller bypasses a generator and calls the policy directly with bad
input.

## Confidence tiers

Reused, not reinvented: `ReconciliationConfidence` is a type alias for
`AutopilotConfidence` (`high`/`medium`/`low`/`unknown`).
`reconciliation-confidence.ts` maps a deterministic 0-100 evidence score
(computed per-engine, documented at each call site) to a tier with one
shared, tested boundary:

- `high`: score >= 80
- `medium`: score >= 55
- `low`: score >= 25
- `unknown`: below 25, or a non-finite score

Each engine only calls this after computing its own domain-specific
score; a same-amount-only own-account-transfer pair, for example, scores
50 (below the medium boundary) and is capped at `low` -- "a same-amount
pair alone must not automatically become an own-account transfer" is a
direct consequence of this scoring, not a special case.

## Matching rules (summary; see each module's header comment for the full rule)

- **own_account_transfer**: only `expense`/`income` pairs, opposite
  direction, exact amount (0 tolerance by default, configurable),
  within a configurable time window (default 24h). Reference-number
  match, matching account-last-four hints, and a `transfer_slip` source
  each add corroborating evidence. A transaction that plausibly matches
  more than one counterpart is flagged `multiple_possible_matches` and
  capped at `low` confidence, never picking one arbitrarily.
- **possible_duplicate**: reuses `scoreDuplicateCandidate` as the base
  signal, adds `same_document_id` (dominant signal, same weight class as
  an exact reference match), a Bangkok-safe same-day check, and
  same/different-import-source evidence. A legitimate repeated purchase
  (same amount, close time, different merchant) still produces a
  candidate -- it is never deleted or merged automatically, so nothing
  is lost.
- **likely_debt_payment**: only `expense` transactions against
  `active`/`overdue` debts. Requires either an explicit merchant/note
  match against the debt's name/creditor, or an amount match *and*
  due-date proximity together -- amount or due-date alone is too weak
  and produces no candidate. A transaction matching more than one debt
  produces one candidate per debt, all capped at `low` and flagged
  `multiple_debt_matches`.
- **possible_refund**: only `income`/`refund` transactions, amount never
  exceeding the original expense, within a configurable window (default
  90 days), and *requires* merchant or reference-number evidence -- an
  unrelated incoming transfer with no such evidence is never classified
  as a refund, no matter how well amount/timing line up.

## Policy outcomes

`decideReconciliationPolicy` (`reconciliation-policy.ts`) is the only
place a `ReconciliationPolicyOutcome` is produced: `auto_match_safe`,
`suggest_with_notice`, `require_confirmation`, `reject_candidate`. Pure,
no I/O, no Gemini. Order of evaluation:

1. **Reject**: structurally invalid (duplicate/empty source ids,
   cross-user source ids) -- defense in depth, independent of what the
   generator already guaranteed.
2. **Require confirmation**: any ambiguity evidence
   (`multiple_possible_matches`/`multiple_debt_matches`/`multiple_earlier_expenses`)
   always wins over a high score.
3. **Require confirmation**: `unknown` confidence (no real signal).
4. **Require confirmation, always**: `likely_debt_payment` and
   `possible_refund` never exceed this outcome in PR A, regardless of
   evidence strength -- both carry follow-on financial consequences
   (which debt's cycle a payment affects; reversing a categorized
   expense) that this phase intentionally leaves to a human.
5. **Auto match safe** (label only): `high` confidence with strong
   corroboration (`reference_match`/`same_document_id`/`account_hint_match`)
   on `own_account_transfer`/`possible_duplicate`.
6. **Suggest with notice**: `high` or `medium` confidence otherwise.
7. **Default**: `require_confirmation`.

**`auto_match_safe` is never executed in PR A.** `reconciliation-scan.ts`
persists every non-rejected candidate identically regardless of
`policyOutcome` -- the label exists purely so PR B/C have an
already-tested signal to build execution on top of.

## Schema

`supabase/migrations/202607130002_reconciliation_candidates.sql` adds:

- Three new enums: `reconciliation_candidate_type`,
  `reconciliation_candidate_status`, `reconciliation_policy_outcome`.
- One new table, `public.reconciliation_candidates` (see the migration
  file's header comment for the full column list and rationale).
- Confidence reuses the existing `public.autopilot_confidence_level`
  enum -- no second confidence scale at the DB level either.

**Design decision: a new table, not an extension of `autopilot_actions`.**
`autopilot_actions` models one autopilot-authored write to one entity
(`entity_id uuid`, singular) through a
proposed->validated->executed->undone lifecycle. A reconciliation
candidate is fundamentally plural (it names *multiple* source
transaction ids, or a transaction plus one or more debts) and, in PR A,
is never executed. Overloading `autopilot_actions` with a nullable
array column and a second, unrelated status/outcome vocabulary would
make both tables harder to reason about for no real benefit -- a
dedicated table keeps each audit trail's semantics unambiguous.

### Indexes

- Unique `(user_id, idempotency_key)` -- the DB-enforced half of
  idempotency.
- `(user_id, status)`, `(user_id, candidate_type)`,
  `(user_id, created_at desc)` -- the query shapes a Review Inbox
  (PR B) will need.
- GIN index on `source_transaction_ids` -- supports "invalidate every
  candidate referencing this transaction id" without a full scan.

### RLS

Same convention as `autopilot_actions`: `select`/`insert`/`update` own
rows only (`auth.uid() = user_id`), **no delete policy at all** -- with
RLS enabled and no matching policy, Postgres denies deletes by default,
so a candidate can only ever be soft-retired via `status = 'invalidated'`,
never hard-deleted. No `using (true)`/`with check (true)`, no `for all`
policy. Verified by both a live regex test
(`tests/unit/reconciliation-rls.test.ts`) reading the migration file and
manual review.

## Idempotency

Two layers, mirroring the history-import/autopilot conventions already
in this codebase:

1. **Application-level**: `computeReconciliationIdempotencyKey`
   (`reconciliation-idempotency.ts`) sorts `sourceTransactionIds` (and
   `relatedDebtIds`) before hashing, so a pair generated as `[A, B]` on
   one scan and `[B, A]` on another (e.g. a different query row order)
   produces the exact same key. `createReconciliationCandidate`
   pre-checks for an existing row with that key before inserting.
2. **Database-level**: a unique index on `(user_id, idempotency_key)`.
   On a `23505` unique-violation (a genuine concurrent-insert race), the
   repository re-reads and returns the row that won, rather than
   erroring the whole scan out -- exactly mirroring
   `createAutopilotActionRecord`'s pattern.

## Concurrency

- Two overlapping/concurrent calls to `scanForReconciliationCandidates`
  for the same user can both compute the same candidate and race to
  insert it; the DB unique index guarantees only one row is ever
  created, and the loser's repository call transparently returns the
  winner's row (see `reconciliation-scan.test.ts`'s concurrent-scan
  test).
- **Documented limitation**: the mock-auth path's "pre-check, then
  insert" is not atomic the way a real Postgres unique index is -- two
  mock-mode calls racing between the pre-check and the write could, in
  principle, both pass the check. In practice this is not exploitable in
  the test suite (single-threaded JS, no `await` between the check and
  the array push), and the real Supabase path has genuine DB-level
  protection regardless. A future phase could add an explicit
  compare-and-swap if the mock path ever needs true multi-worker
  concurrency.

## Source-change invalidation

`reconciliation-invalidation.ts`'s `hasSnapshotDrifted` compares a
transaction's *current* `type`/`amountSatang`/`occurredAt`/`merchant`/
`category` against the bounded snapshot captured at generation time --
deliberately the same narrow field set `reconciliation-snapshot.ts`
captures, so an edit to an unrelated field (note, payment method, ...)
never triggers a spurious invalidation, and it never overwrites the
transaction itself (only the candidate row's `status`/
`invalidation_reason` change). A manual category correction is detected
automatically (via the `category` field) without this module needing to
know anything about `category_source`/manual-priority -- the correction
itself is untouched and unaffected, only the (now-stale) candidate is
marked invalidated.

`invalidateStaleReconciliationCandidates(userId, transactionId, current)`
is fully tested (deletion, edit, and no-op-when-unchanged cases) but
**nothing calls it automatically in PR A** -- there is no wiring into
`updateTransaction`/`deleteTransaction` yet. See Known limitations.

## Explanations

`reconciliation-explanations.ts` mirrors
`src/lib/autopilot/autopilot-explanations.ts`: Thai copy is built only
from structured reason codes and the policy outcome, never from raw AI
prose, chain-of-thought, or an unexplained confidence number. Every
reason code has stable, tested copy
(`tests/unit/reconciliation/reconciliation-explanations.test.ts`).
`auto_match_safe` explanation copy is deliberately phrased as a review
prompt, never as a "done"/"saved" message, since PR A never executes it.

## Privacy constraints

- `evidence`/`evidenceSnapshots` only ever hold the bounded, structured
  shapes the engines produce -- verified by
  `reconciliation-data-integrity.test.ts` (no `data:image/`, no
  base64/credential-shaped substrings, payload size bounded).
- No raw slip image, base64 blob, database URL, or credential is ever
  read by, passed through, or persisted by this feature.
- No unbounded arbitrary metadata: the snapshot type is a fixed,
  documented shape, not `Record<string, unknown>`.

## Known limitations

- **`auto_match_safe` is a label only.** PR B/C must decide how (and
  whether) to ever act on it; PR A deliberately does nothing with it
  beyond storing it and setting `requires_review = false` for it (an
  informational field, not an executable gate in this PR).
- **No trigger wiring for invalidation.** `updateTransaction`/
  `deleteTransaction` do not currently call
  `invalidateStaleReconciliationCandidates`. The mechanism is tested in
  isolation; wiring it into the write path (and deciding whether that
  belongs in the repository layer or a caller) is deferred to PR B/C so
  as not to touch `finance-repository.ts`'s existing, already-tested
  write paths in this PR.
- **No DB-level referential integrity for `source_transaction_ids`/
  `related_debt_ids`.** Both are plain arrays; Postgres cannot enforce a
  foreign key against array elements. This is safe today because every
  element is written by application code that already scoped its read
  to one user's own transactions/debts, but a join-table refactor is a
  reasonable future hardening (candidate for PR C).
- **No scheduled/cron scan.** `scanForReconciliationCandidates` has no
  caller besides its own tests in this PR.
- **Mock-path concurrency** is check-then-insert, not atomic (see
  Concurrency above) -- acceptable for the current single-threaded test
  environment, documented as a gap for the real thing.

## PR B plan (not implemented here)

- Review Inbox UI: list `needs_review` candidates, grouped by type.
- Filtering (by type, confidence, status) and bulk selection.
- Bulk confirmation for `suggest_with_notice`/`auto_match_safe`
  candidates the user explicitly approves.
- Safe partial actions (confirm some, skip others in one batch).
- Focused Playwright e2e coverage for the new page.

## PR C plan (not implemented here)

- Debt-payment linking: turning a confirmed `likely_debt_payment`
  candidate into an actual `debt_id` link on the transaction (through
  the existing `updateTransaction`/`assertDebtPaymentLinked` path, never
  bypassing it).
- Refund handling: confirmed execution path for `possible_refund`
  (still never auto-confirmed without explicit user action).
- Audit and undo hardening for any PR B/C execution path.
- Concurrency/idempotency hardening beyond what PR A already covers
  (e.g. the join-table refactor noted above).
- Integration tests spanning generation -> review -> execution -> undo.
- Documentation and rollout notes for turning any of this on in
  production.

## Rollout considerations

- This PR ships infrastructure with no user-facing surface and no
  automatic execution -- it is safe to merge and deploy on its own with
  zero behavior change for any existing user, since nothing calls
  `scanForReconciliationCandidates` yet.
- The migration is additive-only and reversible (see the migration
  file's own rollback comment).

## Migration safety

- Additive only: one new table, three new enums, reuse of an existing
  enum. No existing table is altered, no existing row is rewritten, no
  historical migration file is modified.
- RLS enabled from creation, ownership enforced via `auth.uid() =
  user_id`, no delete policy.
- **No production migration was run as part of this PR.** The migration
  file exists in `supabase/migrations/` for review and for a human to
  apply through the repository's normal, guarded migration workflow.

## Explicit safety confirmations

- **PR A performs no automatic reconciliation writes.** Every candidate
  is generated and persisted in a non-executing, reviewable state
  (`proposed`/`needs_review`); nothing reads a candidate and acts on it.
- **PR A does not mutate debt balances.** `likely_debt_payment`
  candidate generation never imports or calls any debt-mutating
  repository function, and is covered by an explicit "never mutates"
  unit test.
- **No production migration was run.** The migration file is new,
  additive, and unapplied to any production database by this PR.
