# TangLak Production Navigation Performance

## Timing Logs

Development timing logs are enabled automatically in `NODE_ENV=development`.
For production-like debugging, set:

```bash
TANGLAK_DEBUG_TIMING=1
```

Logs include labels only, never financial record contents:

- `auth.user`
- `profile.onboarding`
- `query.transactions.month`
- `query.transactions.all`
- `query.debts`
- `query.accounts`
- `query.import_batches`
- `page.load route=/today`
- `page.load route=/transactions`
- `page.load route=/debts`
- `page.load route=/overview`
- `page.load route=/settings`

Budget timing is currently not emitted because dashboard routes do not query `monthly_budgets` yet.

## Region Alignment

Vercel recommends running Functions close to the data source to reduce latency. Vercel Function regions can be configured in Project Settings or file-based config such as `vercel.json`; the official docs describe the `regions` setting as the list of regions where Vercel Functions execute.

Do not hardcode a Vercel region until the Supabase project region is confirmed.

Procedure:

1. Confirm the Supabase project region from the Supabase dashboard project settings or Supabase management API.
2. Pick the nearest Vercel Function region to that Supabase region.
3. Configure the Vercel project Function region in the dashboard, or add `regions` in `vercel.json`.
4. Redeploy and compare `auth.user`, `profile.onboarding`, and repository timing logs before/after.
5. Keep static assets global; the region choice is for server/function data work.

References:

- Vercel Functions region configuration: https://vercel.com/docs/functions/configuring-functions/region
- Vercel `vercel.json` regions property: https://vercel.com/docs/project-configuration/vercel-json
