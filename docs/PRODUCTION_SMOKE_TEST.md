# TangLak Production Smoke Test

Run this against a Supabase project configured with only the public URL and anon or publishable key in the app environment.

## Setup

- `NEXT_PUBLIC_SUPABASE_URL` is set.
- One of `NEXT_PUBLIC_SUPABASE_ANON_KEY` or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is set.
- No service-role key is present in browser/client environment variables.
- Apply migrations through `202607100008_account_management_support.sql`.
- Create two real test users, for example `user-a+smoke@example.com` and `user-b+smoke@example.com`.

## Core Flow

- Sign up as user A.
- Complete onboarding with `Asia/Bangkok`, optional reminders unchecked, and salary day between 1 and 31.
- Add a bank account with only the last four digits.
- Set it as default, deactivate it, reactivate it, then edit its name.
- Add one expense transaction and refresh; verify it persists.
- Add one debt, one partial payment, then refresh; verify payment history persists.
- Edit the payment amount and verify current-cycle progress recalculates.
- Delete the payment after confirming the warning; verify current-cycle progress recalculates.
- Mark the debt paid off, confirm the dialog, then reopen it.
- Open Today with no budget configured; verify it says `ยังไม่ได้ตั้งงบวันนี้` and does not show fake progress.
- Open Overview; verify there is no `-฿0` or zero-value category row.
- Sign out and sign in again; verify data persists.

## RLS Verification Without Service Role

Use two Supabase clients initialized with anon or publishable key only. Do not use service-role keys.

1. Sign in client A as user A and client B as user B.
2. User A creates one transaction and one debt.
3. User B attempts to select user A's transaction by id:
   `from("transactions").select("*").eq("id", userATransactionId)`.
   Expected: zero rows.
4. User B attempts to update user A's debt:
   `from("debts").update({ name: "blocked" }).eq("id", userADebtId)`.
   Expected: zero rows updated or an RLS error.
5. User A uploads a private storage object under a user-scoped path.
6. User B attempts to download the object path.
   Expected: storage returns unauthorized/not found.
7. Repeat for accounts:
   User B attempts to select, update, deactivate, or delete user A's account id.
   Expected: zero rows or RLS error.

## Failure Checks

- Missing Supabase env vars in development show a Thai configuration warning with variable names only.
- Production missing-env message is generic and shows no values.
- Offline mode shows a retry-friendly notice and unsaved forms remain in localStorage drafts.
- Destructive actions require confirmation and do not use optimistic UI.
