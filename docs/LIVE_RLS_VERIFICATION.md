# Live Supabase RLS Verification

Use this only against a disposable Supabase project or disposable test users.

## Requirements

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Two test users created through normal email/password auth
- Applied migrations in `supabase/migrations`

Do not use `SUPABASE_SERVICE_ROLE_KEY` for this verification.

## Procedure

1. Sign in as user A with the anon key.
2. Create one transaction and one debt through the app.
3. Sign out.
4. Sign in as user B with the anon key.
5. Query `transactions` and `debts` through the anon Supabase client.
6. Confirm user B receives only user B rows.
7. Attempt to update user A's debt ID as user B.
8. Confirm the update affects zero rows or returns an RLS/permission error.
9. Attempt to read a storage object path under user A's folder in `financial-documents`.
10. Confirm user B cannot read or sign that private path.

## Example Checks

```ts
const clientA = createClient(url, anonKey);
const clientB = createClient(url, anonKey);

await clientA.auth.signInWithPassword({ email: userAEmail, password });
const { data: created } = await clientA
  .from("transactions")
  .insert({
    user_id: (await clientA.auth.getUser()).data.user!.id,
    type: "expense",
    status: "confirmed",
    amount_satang: 10000,
    currency: "THB",
    occurred_at: new Date().toISOString(),
    merchant: "RLS test",
    source: "manual",
  })
  .select()
  .single();

await clientB.auth.signInWithPassword({ email: userBEmail, password });
const { data: rows } = await clientB.from("transactions").select("*");
console.assert(!rows?.some((row) => row.id === created.id));

const { data: updated } = await clientB
  .from("debts")
  .update({ name: "should not work" })
  .eq("user_id", created.user_id)
  .select();
console.assert(updated?.length === 0);
```

Expected result: user B cannot read, update, or access user A financial records or storage paths.
