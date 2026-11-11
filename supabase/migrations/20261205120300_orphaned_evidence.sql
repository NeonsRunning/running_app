-- ---------------------------------------------------------------------------
-- Clearing evidence nothing points at
--
-- A finish-time screenshot is uploaded first and attached to a result second,
-- and a result's row can go while its file stays: the tab is closed between
-- the two steps, or the sign-up is removed or returned to pending. Those
-- files were never cleaned up. They are private pictures kept for no reason
-- — a tracking app's map can show where someone lives — and they count
-- against the runner's upload cap (20261127120000_audit_hardening.sql), so
-- two of them could stop a runner from ever sending evidence again.
--
-- Files cannot be deleted from SQL (Storage refuses a direct delete), so the
-- database only says which they are: `orphaned_evidence()` lists files in
-- `race-evidence` older than a day that no result names. The app's
-- `/api/cron/evidence-sweep` route deletes them through the Storage API, and
-- pg_cron calls it once a day, as it calls the other cron routes.
-- ---------------------------------------------------------------------------

create function public.orphaned_evidence(p_limit integer default 500)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select o.name
  from storage.objects o
  where o.bucket_id = 'race-evidence'
    -- A day's grace: a file is uploaded before the result that names it.
    and o.created_at < now() - interval '1 day'
    and not exists (
      select 1 from public.race_results r where r.evidence_path = o.name
    )
  order by o.created_at
  limit least(greatest(coalesce(p_limit, 500), 1), 1000);
$$;

comment on function public.orphaned_evidence(integer) is
  'Evidence files older than a day that no result points at, oldest first. For the sweep route.';

-- The server only: the list names other people's files.
revoke execute on function public.orphaned_evidence(integer)
  from public, anon, authenticated;
grant execute on function public.orphaned_evidence(integer) to service_role;

select cron.schedule(
  'evidence-sweep',
  '37 6 * * *',
  $$select public.call_cron_route('/api/cron/evidence-sweep')$$
);
