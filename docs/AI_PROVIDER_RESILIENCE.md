# AI Provider Resilience

This document covers the document AI processing guardrails for Gemini-backed
financial document extraction.

## Timeouts

- Provider request timeout: 20 seconds.
- Whole document processing action timeout: 45 seconds.
- Processing lease duration: 2 minutes.

The action timeout wraps storage download and provider work. If the provider
ignores aborts or completes late, persistence is guarded by the database claim
lease before any extraction row is written.

## Retry Matrix

| Error class | Retried | User-facing result |
| --- | --- | --- |
| Timeout | Yes | Retryable Thai timeout message |
| Rate limited / 429 | Yes | Retryable Thai busy-system message |
| Provider 5xx | Yes | Retryable Thai fallback message |
| Invalid provider response | No | Permanent Thai fallback message |
| Schema validation failure | No | Permanent Thai fallback message |
| Incomplete financial extraction | No | Permanent Thai fallback message |
| Unsupported document / 400-like response | No | Permanent Thai fallback message |

Retries are bounded to 3 attempts. Backoff is exponential with jitter and honors
`Retry-After` when present, capped by the provider backoff maximum.

## Processing Lease

`documents.processing_started_at` is the durable processing lease marker.

Valid processing flow:

1. `uploaded` or `failed_retryable` is claimed as `processing`.
2. The claim writes `processing_started_at`.
3. Completion succeeds only while the same `processing_started_at` value is
   still current and not stale.
4. Success moves the document to `review_ready` and clears the lease.
5. Retryable failure moves the document to `failed_retryable` and clears the
   lease.
6. Permanent failure moves the document to `failed_permanent` and clears the
   lease.

Legacy `failed` remains processable for compatibility with older rows. A
`failed_permanent` document is not automatically retried.

## Recovery Behavior

An active `processing` claim cannot be stolen. A stale `processing` claim can be
reclaimed after 2 minutes. This handles a process crash after claim but before
completion without relying on in-memory locks.

Late results from expired or replaced claims are rejected by compare-and-set
guards and cannot create extraction rows or overwrite newer state.

**There is no background sweeper.** A stale claim is not reclaimed by a
scheduled job or cron process — it is only reclaimed the next time a claim
attempt is made for that same document (e.g. the user retries, or the next
upload/processing action happens to target it). A document stuck in
`processing` with an expired lease simply sits there, unresolved from the
user's point of view, until something triggers another claim attempt. Use
the operational query below to find and manually intervene on documents
stuck this way if no natural retry occurs.

## Migration Order

Deploy `supabase/migrations/202607110003_ai_processing_claims.sql` before
application code that writes:

- `review_ready`
- `failed_retryable`
- `failed_permanent`

The migration preserves existing rows and statuses. PostgreSQL enum additions
are forward-only in normal Supabase deploys; rollback should redeploy the
previous application code while leaving the enum values in place.

## Operational Query

Use this query to inspect stale processing documents:

```sql
select id, user_id, status, processing_started_at, updated_at
from public.documents
where status = 'processing'
  and processing_started_at < now() - interval '2 minutes'
order by processing_started_at asc;
```

## Verification status

`202607110003_ai_processing_claims.sql` (the `alter type ... add value`
statements, the `processing_started_at` column, and the claim index) has
**not** been executed against a live Postgres or Supabase instance in the
environment(s) that produced or integrated this change — no `supabase` CLI,
`docker`, or `psql` was available. Verification consisted of a manual
schema cross-check against `document_status`'s existing definition and the
`documents` table, plus the mock-auth-path application test suite (unit,
action, and e2e). A production dry-run against a disposable/staging
Postgres instance is still required before this is considered
production-verified at the database level.
