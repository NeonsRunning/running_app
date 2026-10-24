-- ---------------------------------------------------------------------------
-- A third registration status: cancelled
--
-- On its own because Postgres cannot use an enum value in the transaction
-- that adds it; the functions that set and read 'cancelled' follow in
-- 20261118120100_registration_lifecycle.
-- ---------------------------------------------------------------------------

alter type public.registration_status add value if not exists 'cancelled';
