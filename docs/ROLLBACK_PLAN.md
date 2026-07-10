# TangLak Rollback Plan

This plan covers application rollback and data rollback for release incidents.

## Rollback Triggers

Rollback immediately if any of the following occur:

- Authenticated users can view another user's data.
- RLS or storage policies are missing in production.
- Production logs contain raw financial document content or Gemini raw output.
- Import confirmation creates duplicate transactions at scale.
- Month/day totals are materially wrong for Thai timezone users.
- Upload or import failures prevent normal app use.
- A deployment causes build/runtime errors on protected primary routes.

## Application Rollback

1. Identify the last known good deployment in Vercel.
2. Promote the last known good deployment.
3. Confirm environment variables did not change unexpectedly.
4. Run the smoke test auth and dashboard sections.
5. Watch logs for 30 minutes.

## Database Rollback

Do not manually edit financial rows unless the incident has a clearly identified scope and an approved query plan.

Recommended order:

1. Snapshot affected tables before corrective work.
2. Identify affected `user_id`, `import_batch_id`, and transaction IDs.
3. Prefer built-in history-import rollback for import-created transactions.
4. For non-import data corruption, prepare explicit SQL with `user_id` filters on every statement.
5. Run in staging or a restored snapshot first.
6. Run in production inside a transaction when possible.
7. Reconcile totals after correction.

Tables commonly involved:

- `transactions`
- `debts`
- `debt_payments`
- `import_batches`
- `import_rows`
- `documents`
- `document_extractions`

## History Import Rollback Drill

1. Create a test import batch.
2. Confirm at least one row.
3. Roll back the batch from the UI.
4. Verify imported transactions are deleted.
5. Verify merged transactions are unlinked, not deleted.
6. Verify staging rows return to unresolved/reviewable state.
7. Verify the batch is marked rolled back.

Known risk:

The current rollback implementation uses multiple statements, not one database transaction. If a failure happens mid-rollback, use the affected batch ID to resume or manually reconcile after snapshotting.

## Communication

For production incidents:

- State whether user data confidentiality, integrity, or availability is affected.
- Record exact deployment ID, commit hash, Supabase project, and time window.
- Record whether logs contain personal or financial data.
- Record whether customer notification is required.

## Post-Rollback Verification

- [ ] Auth redirects work.
- [ ] RLS/storage verification passes.
- [ ] Today totals match known test data.
- [ ] Transaction list matches known test data.
- [ ] Debt payment totals recalculate.
- [ ] Import resume and rollback work for a test batch.
- [ ] Logs are free of raw financial data.
