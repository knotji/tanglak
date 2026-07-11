-- AI document processing durable claims.
--
-- Deployment notes:
-- 1. Deploy this migration before application code that writes the new
--    document_status values.
-- 2. Existing rows and legacy statuses are preserved. The new lease column is
--    nullable so old documents do not need a data rewrite.
-- 3. PostgreSQL enum additions are forward-only in ordinary Supabase deploys;
--    rollback should redeploy the previous application code while leaving these
--    enum values in place.
--
-- Operational recovery query for stuck documents:
-- select id, user_id, status, processing_started_at, updated_at
-- from public.documents
-- where status = 'processing'
--   and processing_started_at < now() - interval '2 minutes'
-- order by processing_started_at asc;

alter type public.document_status add value if not exists 'review_ready';
alter type public.document_status add value if not exists 'failed_retryable';
alter type public.document_status add value if not exists 'failed_permanent';

alter table public.documents
add column if not exists processing_started_at timestamptz;

create index if not exists documents_processing_claim_idx
on public.documents (status, processing_started_at)
where status = 'processing';
