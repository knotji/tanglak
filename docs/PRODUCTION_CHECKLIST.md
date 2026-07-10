# TangLak Production Checklist

Use this checklist after the code follow-up tasks from `docs/PRODUCTION_READINESS_AUDIT.md` are complete.

## Release Gates

- [ ] SEC-001 fixed: middleware accepts the same Supabase public key names as app config.
- [ ] SEC-002 fixed: Gemini raw output and personal financial data are not logged in production.
- [ ] FIN-001 fixed: history-import commits are idempotent in production.
- [ ] FIN-002 fixed: current day/month helpers use Bangkok timezone consistently.
- [ ] FIN-003 fixed: debt monetary values cannot be negative in app validation or database checks.
- [ ] Dependency advisories reviewed and tracked.
- [ ] No `E2E_MOCK_AUTH` in production environment.
- [ ] Supabase URL and public key are configured in production.
- [ ] Gemini API key and model are configured only in server-side environment variables.
- [ ] Storage bucket `financial-documents` is private.
- [ ] Storage object policies require first path segment to equal `auth.uid()`.
- [ ] Live RLS verification completed against staging.

## Build And Verification

- [ ] `npm ci`
- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm run test`
- [ ] `npm run build`
- [ ] `npm audit --json` reviewed; no untriaged high or critical vulnerabilities.
- [ ] Smoke test completed using `docs/SMOKE_TEST.md`.
- [ ] Rollback drill completed using `docs/ROLLBACK_PLAN.md`.

## Supabase Checks

- [ ] All user-owned tables have RLS enabled.
- [ ] Policies use `auth.uid() = user_id` for select, insert, update, and delete.
- [ ] Import batch and import row policies are present.
- [ ] Storage bucket is private.
- [ ] Storage read/insert/delete policies are scoped to user folder.
- [ ] No service-role key is exposed to the Next.js runtime.
- [ ] Production database has the import-row uniqueness constraint.

## Operational Checks

- [ ] Application logs redact financial document content, AI responses, signed URLs, and raw storage paths where possible.
- [ ] Error messages shown to users are Thai, actionable, and do not expose secrets.
- [ ] Monitoring is configured for auth failures, upload failures, Gemini failures, and import rollback failures.
- [ ] Data retention policy covers uploaded documents, extracted AI output, import staging rows, and logs.
- [ ] Privacy notice discloses Gemini processing of uploaded financial documents.

## Go/No-Go

Do not release if any release gate remains unchecked.
