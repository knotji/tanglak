-- Migration: Support deterministic PDF statement parsing (Phase 2)
-- This migration is additive and safe when some columns already exist.

-- 1. Parser provenance and page/line traceability on staging rows
alter table public.import_rows
  add column if not exists page_number int,
  add column if not exists source_line_start int,
  add column if not exists source_line_end int,
  add column if not exists parser_source text,
  add column if not exists parser_confidence numeric(4,3),
  add column if not exists row_fingerprint text;

-- Ensure parser_source has the expected default and no null values.
alter table public.import_rows
  alter column parser_source set default 'deterministic';

update public.import_rows
set parser_source = 'deterministic'
where parser_source is null;

alter table public.import_rows
  alter column parser_source set not null;

-- Add named constraints only when they do not already exist.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'import_rows_parser_source_check'
      and conrelid = 'public.import_rows'::regclass
  ) then
    alter table public.import_rows
      add constraint import_rows_parser_source_check
      check (
        parser_source in ('deterministic', 'gemini_assisted')
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'import_rows_parser_confidence_check'
      and conrelid = 'public.import_rows'::regclass
  ) then
    alter table public.import_rows
      add constraint import_rows_parser_confidence_check
      check (
        parser_confidence is null
        or parser_confidence between 0 and 1
      );
  end if;
end
$$;

-- 2. Statement-level metadata surfaced from PDF parsing
alter table public.import_batches
  add column if not exists statement_metadata jsonb,
  add column if not exists detected_layout jsonb,
  add column if not exists page_count int;

-- Optional page count validation.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'import_batches_page_count_check'
      and conrelid = 'public.import_batches'::regclass
  ) then
    alter table public.import_batches
      add constraint import_batches_page_count_check
      check (
        page_count is null
        or page_count > 0
      );
  end if;
end
$$;

-- 3. Row fingerprint idempotency guard:
-- same batch cannot stage the same logical row twice.
create unique index if not exists uq_import_rows_batch_fingerprint
  on public.import_rows (import_batch_id, row_fingerprint)
  where row_fingerprint is not null;

-- 4. Review UI filter: rows with parsing warnings.
create index if not exists idx_import_rows_has_warnings
  on public.import_rows (import_batch_id)
  where cardinality(validation_warnings) > 0;

-- 5. Page-scoped lookups for the "ดูจากหน้า N" indicator.
create index if not exists idx_import_rows_page_number
  on public.import_rows (import_batch_id, page_number)
  where page_number is not null;