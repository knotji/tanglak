-- Add the terminal archived debt status.
--
-- This migration intentionally does not use the new enum label in an index,
-- predicate, check, or policy. PostgreSQL does not allow a newly added enum
-- value to be used safely until after the transaction that added it commits.
alter type public.debt_status add value if not exists 'deleted';

-- Rollback note:
-- PostgreSQL cannot remove enum labels directly. If rollback is ever needed,
-- create a replacement enum without 'deleted', cast dependent columns, then
-- drop the old type in a dedicated maintenance migration.
