# TangLak Production Smoke Test

Run this against staging first, then production immediately after deployment.

## Preconditions

- Use a test account with no real financial data.
- Confirm `E2E_MOCK_AUTH` is not set.
- Confirm the Supabase project is the intended production/staging project.
- Keep one small image receipt and one small CSV statement available.
- Do not use real customer documents for smoke testing.

## Authentication

1. Open `/auth`.
2. Sign up with a test email.
3. Complete onboarding.
4. Sign out.
5. Sign in again.
6. Open `/today`, `/transactions`, `/debts`, `/overview`, `/settings`.
7. In a private browser session, open `/today` and confirm it redirects to `/auth`.

Expected result: protected routes require auth, the signed-in account returns to the app, and no other user's data appears.

## Manual Finance Flow

1. Add an income transaction.
2. Add an expense transaction.
3. Edit the expense amount.
4. Delete the expense and confirm totals update.
5. Add a debt.
6. Add a debt payment.
7. Edit the debt payment.
8. Delete the debt payment.
9. Mark the debt paid off and reopen it.

Expected result: monthly totals, debt progress, and payment history update after each action.

## Document Upload Flow

1. Upload a supported small image receipt.
2. Confirm it enters processing/review.
3. If extraction fails, use retry once.
4. Confirm extracted or manually entered data into a transaction.
5. Delete the uploaded document from the review flow if available.

Expected result: private preview uses a signed URL, extraction failure is recoverable, and confirmed transactions are user-scoped.

## History Import Flow

1. Upload a supported CSV statement.
2. Confirm the import batch reaches review.
3. Mark one row as import.
4. Mark one row as skip if available.
5. Leave one row unresolved if available and confirm partial import.
6. Resume the batch and import remaining rows.
7. Roll back the completed batch.

Expected result: imported rows create transactions once, partial import can resume, and rollback removes imported transactions and resets staging rows.

## Resilience Checks

1. Turn the browser offline and verify the offline banner appears.
2. Start a manual transaction, navigate away, return, and verify draft restoration.
3. Try uploading an unsupported file extension.
4. Try uploading a file over the documented size limit.
5. Open a random UUID detail route for upload/import and confirm no sensitive UI renders.

Expected result: user-safe errors, no blank screens, no sensitive data leakage.

## Logging Spot Check

1. Inspect recent production logs for the test window.
2. Confirm no raw Gemini output, signed URLs, financial document text, uploaded file bytes, or full personal financial records appear.

Expected result: logs contain safe diagnostics only.
