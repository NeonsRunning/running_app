-- ---------------------------------------------------------------------------
-- A third event status: removed by a platform admin
--
-- On its own because Postgres cannot use an enum value in the transaction
-- that adds it; the policies and functions that compare against 'removed'
-- follow in 20261109120100_admin_remove_event.
-- ---------------------------------------------------------------------------

alter type public.event_status add value if not exists 'removed';
