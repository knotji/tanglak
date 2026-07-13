# Production Supabase Autopilot Migration

This runbook documents the guarded manual workflow for applying the TangLak Autopilot audit-log migration to production Supabase.

## Workflow

Use **Production Supabase Autopilot Migration** (`.github/workflows/production-supabase-autopilot-migration.yml`). It is intentionally `workflow_dispatch` only and is protected by the GitHub Environment named `production`.

The workflow is pinned to one migration only:

- `supabase/migrations/202607130001_autopilot_action_audit_log.sql`

It must not be used for any other production change.

## Required GitHub secret

Configure this secret on the repository or the `production` environment before running the workflow:

- `SUPABASE_DB_URL` — the production Supabase PostgreSQL connection string.

Do not paste this value into issues, comments, logs, commits, or pull-request descriptions.

## Dry-run / preflight

Run the workflow with:

- `mode`: `dry-run`
- `confirm_migration_id`: leave blank

Dry-run mode validates the secret, checks whether migration `202607130001` is already recorded in `supabase_migrations.schema_migrations`, and runs schema verification when applicable. It does not apply migration SQL.

## Approved apply

Only after reviewing the dry-run output and receiving the required production environment approval, run with:

- `mode`: `apply`
- `confirm_migration_id`: `202607130001`

Apply mode exits unless the confirmation exactly matches the pinned migration id. If the migration is already recorded, the workflow skips execution. Otherwise, it applies only the pinned migration file, records the migration version, and runs post-apply verification.

## Verification coverage

The workflow verifies:

- `transactions.category_source`
- `transactions.category_confidence`
- `public.autopilot_actions`
- expected `autopilot_actions` indexes
- RLS enabled on `autopilot_actions`
- required SELECT, INSERT, and UPDATE RLS policies
- no DELETE or ALL policy on `autopilot_actions`

## Safety rules

- Do not run this workflow from pull requests or unreviewed branches.
- Do not merge, deploy, or apply production SQL automatically.
- Do not modify production data outside the pinned migration.
- Keep GitHub Actions permissions least-privilege; this workflow uses `contents: read`.
