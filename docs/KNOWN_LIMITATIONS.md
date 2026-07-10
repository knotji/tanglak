# TangLak Known Limitations

These limitations are documented from the production-readiness audit. They should be reviewed before production release and converted into tracked tasks.

## Release-Blocking Limitations

1. Middleware Supabase config mismatch

   App config accepts either `NEXT_PUBLIC_SUPABASE_ANON_KEY` or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, but middleware only recognizes the anon key. Production should not launch with publishable-key-only configuration until middleware is fixed.

2. Raw Gemini output logging

   Gemini parse failures currently log raw model text. Because model text may contain financial document content, production launch should wait for redacted diagnostics.

3. History import production idempotency

   Import commit idempotency is only guarded in the mock path before transaction creation. Production needs a row-level created-transaction check or transactional RPC before launch.

4. Thai timezone consistency

   Some page and export entry points derive current date/month with UTC `toISOString()`. This can misclassify transactions near Bangkok midnight/month-end.

5. Negative debt values

   Debt amount fields are not consistently validated as non-negative in app schemas or database constraints.

## Non-Blocking Limitations

1. Rollback is not atomic

   History import rollback performs multiple database statements. It is idempotent in some states, but a mid-run failure can require manual reconciliation.

2. Account foreign-key ownership validation

   User-scoped reads and writes are common, but account IDs used in transactions/import batches should be explicitly validated before association.

3. Gemini timeout handling

   Gemini calls do not currently use an explicit timeout or abort controller.

4. Upload MIME validation

   Upload flows check size and MIME/extension, but MIME is client-provided. Additional content sniffing would improve assurance.

5. Dependency advisories

   `npm audit --json` reports two moderate advisories related to Next's bundled PostCSS. No high or critical vulnerabilities were reported.

6. Privacy disclosure

   Uploaded documents are sent to Gemini for extraction and normalized/raw extraction data is stored for review. Production needs a clear user-facing privacy/retention statement.

7. Local draft storage

   Manual transaction, debt, and onboarding drafts use browser local storage. This is useful for resilience but should be disclosed if shared devices are a supported use case.
