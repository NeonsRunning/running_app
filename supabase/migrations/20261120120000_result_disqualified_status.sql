-- ---------------------------------------------------------------------------
-- A fourth result status: disqualified
--
-- On its own because Postgres cannot use an enum value in the transaction
-- that adds it; the columns, checks and functions that compare against
-- 'disqualified' follow in 20261120120100_disqualify_results.
-- ---------------------------------------------------------------------------

alter type public.result_status add value if not exists 'disqualified';
