# AI Financial Autopilot Foundation (Phase 1)

## Problem

Before this change, Gemini's role in Slip Import ended at extraction: every
slip -- no matter how confidently read -- forced the user through the same
manual review form. There was no reusable, testable boundary between "what
the AI read" and "what gets written to the database," no audit trail for
AI-influenced writes, and no way to undo a mistake without manually editing
or deleting a transaction.

## Trust boundary

Gemini produces a plain data value (`ExtractedFinancialDocument`) and
nothing else. It never touches Supabase and never decides the final
outcome. Everything downstream is deterministic TypeScript:

```
Gemini extraction (untrusted)
  -> normalization (autopilot-slip-integration.ts)
  -> schema validation (autopilot-action-schema.ts, Zod, no `as` casts)
  -> business validation (autopilot-validator.ts: duplicates, transfer risk)
  -> policy engine (autopilot-policy.ts: pure function, no I/O)
  -> controlled executor (autopilot-executor.ts: the only writer)
  -> audit record (autopilot_actions table, RLS-scoped)
  -> deterministic explanation (autopilot-explanations.ts)
  -> undo (autopilot-undo.ts)
```

The policy engine is the only place an `AutopilotDecision` is produced.
Gemini's confidence numbers are converted to coarse tiers
(`high`/`medium`/`low`/`unknown`) by `autopilot-confidence.ts` before the
policy ever sees them -- raw model scores never reach the decision logic.

## Action lifecycle

`autopilot_actions` rows move through `proposed -> validated|rejected ->
executed|failed -> undone`, written only by `autopilot-audit.ts`. Every
outcome -- including a schema rejection or a "needs confirmation" deferral
-- gets a row, so the log is a complete history of what the system
considered, not just what it did.

## Decision policy

`decideAutopilotAction` (autopilot-policy.ts) checks, in order: hard
rejects (schema/business validation failure, would-override-manual-data,
exact duplicate) before confirmation-required ambiguity (possible internal
transfer, ambiguous duplicate, irreversible action, low/unknown core
confidence) before the two "safe to act" tiers:

- **auto_execute**: core fields and category both high confidence.
- **execute_with_notice**: core fields high confidence, category
  medium/low (or vice versa) -- transaction is saved, category is a
  visible best-effort guess the user can still edit.

Anything that doesn't cleanly clear one of those tiers defaults to
`require_confirmation`, never to silent auto-execution.

## Controlled executor

`executeAutopilotAction` (autopilot-executor.ts) is Phase 1's only writer.
It re-checks the action-type allowlist defensively, computes a SHA-256
idempotency key (user + source + document/slip reference + amount +
occurredAt), and is idempotent: a retried identical proposal returns the
prior result instead of writing a second transaction. Failures are
recorded in the audit log and rethrown -- never swallowed.

Phase 1 executes `create_transaction` end-to-end. `update_transaction_category`,
`mark_internal_transfer`, and `ignore_duplicate_candidate` have validated
schemas and a reserved allowlist slot but no executor implementation yet
(see Known limitations).

## Database migration

`supabase/migrations/202607130001_autopilot_action_audit_log.sql` adds:

- `public.autopilot_actions` -- append-only audit trail (RLS: select/insert/update
  own rows only, deliberately no delete policy). Stores structured payloads,
  reason-code evidence, and before/after snapshots -- never raw slip
  images/base64, tokens, or credentials.
- `transactions.category_source` / `transactions.category_confidence` --
  nullable, additive columns recording category provenance
  (`manual`/`user_correction`/`learned_rule`/`merchant_rule`/`ai`/`default`).

No existing table's semantics changed; both additions are backward compatible.

## Undo behavior

Undo only ever applies to `create_transaction` actions in status
`executed`. Before deleting, it compares the transaction's *current* state
against the `AutopilotTransactionSnapshot` taken at execution time
(type/amount/occurredAt/merchant/category); any mismatch means the user
edited it since, and undo is refused (`transaction_modified`) rather than
silently discarding their edit. There is no existing soft-delete pattern
for transactions in this codebase, so undo reuses the same hard-delete
path the manual "delete transaction" UI already uses.

## Manual correction priority

A user who explicitly picks a category in the manual transaction form
(`saveTransactionAction`) gets `category_source: "manual"` recorded via
`setTransactionCategoryProvenance`. That function refuses to overwrite a
`manual`/`user_correction` source with anything else, so future autopilot
reprocessing can never clobber a manual choice.

## Slip Import vertical slice

`autopilot-slip-integration.ts` wires the pipeline into `uploadAndExtractAction`
(src/app/actions/documents.ts), scoped to `receipt` and `delivery_receipt`
document types only -- `salary_slip`, `transfer_slip`, and `debt_statement`
are unchanged and still use the existing manual ReviewForm/confirm flow.

- **auto_execute / execute_with_notice**: the transaction is created, the
  client redirects to `/upload/result/[documentId]` (a small new screen,
  not a new review flow) showing the deterministic Thai explanation and an
  undo button.
- **require_confirmation / reject / not applicable**: falls through
  unchanged to the existing `/upload/review/[documentId]` ReviewForm.

An autopilot pipeline failure never blocks the extraction/review flow --
it's caught, logged safely, and the user still lands on the manual review
form.

## Autopilot activity UI

`/settings/autopilot-activity` lists recent autopilot actions (action
type, amount/merchant, deterministic explanation, status, undo button for
still-undoable `create_transaction` rows). It is a plain settings sub-page,
not a dashboard or a forced review inbox.

## Interaction with the Debt Payment Simulator (PR #4)

The Debt Payment Simulator merge (`src/lib/debt/*`, `/debts/[debtId]/simulate`)
shares no files with this foundation. Its calculations remain fully
deterministic; Gemini does not calculate repayment projections; Autopilot
Phase 1 does not read, write, or otherwise touch debt payment plans. Both
features read from the same canonical `getMonthlyFinanceSnapshot` --
Autopilot introduces no second aggregation layer.

## Security / privacy

- Every repository/audit function checks `user_id` ownership; RLS backs
  every new table.
- No raw slip image/base64, tokens, or credentials are persisted in the
  audit log.
- Explanations are built only from structured reason codes/deterministic
  templates (`autopilot-explanations.ts`) -- no chain-of-thought, no raw
  confidence numbers, no invented reasons; the UI has a safe fallback even
  if AI-generated copy is never involved at all.

## Known limitations / Phase 2 candidates

- `update_transaction_category`, `mark_internal_transfer`, and
  `ignore_duplicate_candidate` have schemas but no executor wiring or UI
  entry point yet.
- The Slip Import slice only covers `receipt`/`delivery_receipt`; salary
  slips, transfer slips, and debt statements remain fully manual.
- No cross-account transfer-matching, recurring-bill prediction, or
  budget/debt autonomy -- explicitly out of scope for this phase.
