-- ---------------------------------------------------------------------------
-- Admins delete a result
--
-- Some finish evidence should never have been sent: a test, a duplicate, a
-- run from another race, a finish sent from the wrong account whose real
-- runner is not in the event. Nothing took it away. Rejecting or
-- disqualifying it emails the runner, a disqualification also blocks them
-- from sending again, and a correction keeps the result.
--
-- A platform admin can now delete a result outright, whatever its status:
-- waiting for review, sent back, accepted or disqualified. The row goes, and
-- with it the medal an accepted one carried; the runner is left with no
-- result for the event and can send a new one. Nobody is emailed.
--
-- 1. race_result_deletions: what was deleted, which admin and why. The
--    result's corrections go with the row (they cascade), so this is what is
--    left of it. Admins read it; only the function below writes it.
-- 2. admin_delete_race_result().
--
-- The screenshot is deleted by the app straight after, through the Storage
-- API; the daily sweep (20261205120300_orphaned_evidence.sql) catches any it
-- misses, since no result names the file any more.
-- ---------------------------------------------------------------------------

-- 1 ---------------------------------------------------------------------------

create table public.race_result_deletions (
  id uuid primary key default gen_random_uuid(),
  deleted_at timestamptz not null default now(),
  deleted_by uuid references auth.users (id) on delete set null,
  reason text not null check (char_length(reason) between 1 and 300),
  -- The result as it was. Its own id points at nothing now.
  result_id uuid not null,
  event_id uuid references public.events (id) on delete set null,
  registration_id uuid references public.registrations (id) on delete set null,
  runner_id uuid references public.profiles (id) on delete set null,
  status public.result_status not null,
  finish_seconds integer not null,
  distance_run_km numeric(5, 2),
  -- The path only: the file itself is deleted.
  evidence_path text,
  submitted_at timestamptz not null,
  reviewed_at timestamptz
);

create index race_result_deletions_event_idx
  on public.race_result_deletions (event_id, deleted_at desc);

comment on table public.race_result_deletions is
  'Every result an admin deleted, as it was. Written only by admin_delete_race_result().';

alter table public.race_result_deletions enable row level security;

create policy "Admins read result deletions"
  on public.race_result_deletions for select
  to authenticated
  using ((select public.is_platform_admin()));

revoke all on public.race_result_deletions from anon, authenticated;
grant select on public.race_result_deletions to authenticated;

-- 2 ---------------------------------------------------------------------------
-- admin_delete_race_result(): a platform admin deletes a result of any
-- status.
--
--   p_version  coalesce(corrected_at, reviewed_at, submitted_at) as the admin
--              was shown it; anything else means it changed since, and
--              nothing is deleted
--
-- Returns the log row, whose evidence_path the app deletes. Errors:
--
--   notAllowed            not a platform admin
--   resultMissing         no such result
--   resultChanged         corrected, reviewed or re-sent since p_version
--   reasonRequired        the reason is blank
--   deleteMedalDelivered  accepted, and its medal was already shipped or
--                         picked up
-- ---------------------------------------------------------------------------

create function public.admin_delete_race_result(
  p_result_id uuid,
  p_version timestamptz,
  p_reason text
)
returns public.race_result_deletions
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  reason text := nullif(btrim(p_reason), '');
  res public.race_results;
  reg public.registrations;
  log public.race_result_deletions;
begin
  if uid is null or not public.is_platform_admin() then
    raise exception 'notAllowed' using errcode = 'P0001';
  end if;

  -- Sign-up first, then result: the order removals take them in.
  select g.* into reg from public.registrations g
  where g.id = (select r.registration_id from public.race_results r where r.id = p_result_id)
  for update;

  select r.* into res from public.race_results r
  where r.id = p_result_id
  for update;

  if res.id is null then
    raise exception 'resultMissing' using errcode = 'P0001';
  end if;

  if p_version is null
     or coalesce(res.corrected_at, res.reviewed_at, res.submitted_at) <> p_version then
    raise exception 'resultChanged' using errcode = 'P0001';
  end if;

  if reason is null then
    raise exception 'reasonRequired' using errcode = 'P0001';
  end if;

  -- Moved to another sign-up between the two locks: that one is not locked.
  if reg.id is distinct from res.registration_id then
    raise exception 'resultChanged' using errcode = 'P0001';
  end if;

  -- The medal went out on this result: deleting it would leave a medal with
  -- no finish behind it. Sorted out by hand, or disqualified.
  if res.status = 'accepted'
     and (reg.medal_shipped_at is not null or reg.medal_picked_up_at is not null) then
    raise exception 'deleteMedalDelivered' using errcode = 'P0001';
  end if;

  insert into public.race_result_deletions (
    deleted_by, reason,
    result_id, event_id, registration_id, runner_id,
    status, finish_seconds, distance_run_km, evidence_path,
    submitted_at, reviewed_at
  ) values (
    uid, left(reason, 300),
    res.id, res.event_id, res.registration_id, res.runner_id,
    res.status, res.finish_seconds, res.distance_run_km, res.evidence_path,
    res.submitted_at, res.reviewed_at
  )
  returning * into log;

  -- Its corrections cascade.
  delete from public.race_results where id = res.id;

  return log;
end;
$$;

comment on function public.admin_delete_race_result(uuid, timestamptz, text) is
  'A platform admin deletes a result of any status, with a reason kept in race_result_deletions. The runner is left with none and can send a new one.';

revoke execute on function public.admin_delete_race_result(uuid, timestamptz, text)
  from public, anon;
grant execute on function public.admin_delete_race_result(uuid, timestamptz, text)
  to authenticated;
