-- ---------------------------------------------------------------------------
-- The distance a runner actually ran
--
-- Pace was always the finish time over the category's distance. For a
-- virtual race the screenshot is often of a longer run: a 10.01 km run in
-- 59:33 sent to a 5K showed 11:55 / km, where the runner's app said 5:57.
-- The runner can now give the distance their app recorded with the time;
-- when they do, pace is worked out from that instead. Time, places and
-- personal bests are unchanged: still the time sent, in the category run.
--
-- 1. race_results.distance_run_km, optional, readable as finish_seconds is.
-- 2. submit_race_result(): takes it, as a fourth argument that defaults to
--    null, so calls with three arguments work as before.
-- 3. public_event_results(): returns it, for the results page's pace.
-- ---------------------------------------------------------------------------

-- 1 ---------------------------------------------------------------------------

alter table public.race_results
  add column distance_run_km numeric(5, 2)
    check (distance_run_km > 0 and distance_run_km <= 500);

comment on column public.race_results.distance_run_km is
  'The distance the runner''s app recorded, in km, if they gave it. Pace is worked out from it; null means the category''s distance.';

-- Column grants since 20261127120000: a new column needs its own.
grant select (distance_run_km) on public.race_results to anon, authenticated;

-- 2 ---------------------------------------------------------------------------

drop function public.submit_race_result(uuid, integer, text);

create function public.submit_race_result(
  p_event_id uuid,
  p_finish_seconds integer,
  p_evidence_path text,
  p_distance_run_km numeric default null
)
returns public.race_results
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  ev public.events;
  reg public.registrations;
  res public.race_results;
begin
  select * into ev from public.events
  where id = p_event_id and status = 'published';

  if uid is null or ev.id is null or not ev.accepts_results then
    raise exception 'resultsClosed' using errcode = 'P0001';
  end if;

  if ev.event_date > (now() at time zone 'America/Puerto_Rico')::date then
    raise exception 'raceNotStarted' using errcode = 'P0001';
  end if;

  if p_distance_run_km is not null
    and not (p_distance_run_km > 0 and p_distance_run_km <= 500) then
    raise exception 'distanceInvalid' using errcode = 'P0001';
  end if;

  -- Locked, so a removal or return to pending in flight finishes first and
  -- this sees the sign-up as it then stands.
  select * into reg from public.registrations
  where event_id = p_event_id and runner_id = uid and status = 'confirmed'
  for update;

  if reg.id is null then
    raise exception 'notRegistered' using errcode = 'P0001';
  end if;

  select * into res from public.race_results
  where registration_id = reg.id
  for update;

  if res.status = 'accepted' then
    raise exception 'resultAlreadyAccepted' using errcode = 'P0001';
  end if;

  if res.status = 'disqualified' then
    raise exception 'resultDisqualified' using errcode = 'P0001';
  end if;

  insert into public.race_results (
    registration_id, event_id, category_id, runner_id,
    finish_seconds, distance_run_km, evidence_path
  ) values (
    reg.id, ev.id, reg.category_id, uid,
    p_finish_seconds, round(p_distance_run_km, 2), p_evidence_path
  )
  on conflict (registration_id) do update set
    category_id = excluded.category_id,
    finish_seconds = excluded.finish_seconds,
    distance_run_km = excluded.distance_run_km,
    evidence_path = excluded.evidence_path,
    status = 'pending',
    review_note = null,
    submitted_at = now(),
    reviewed_at = null,
    reviewed_by = null
  returning * into res;

  return res;
end;
$$;

revoke execute on function public.submit_race_result(uuid, integer, text, numeric) from public, anon;
grant execute on function public.submit_race_result(uuid, integer, text, numeric) to authenticated;

-- 3 ---------------------------------------------------------------------------

-- A new output column changes the return type, which `create or replace`
-- cannot do.
drop function public.public_event_results(uuid);

create function public.public_event_results(p_event_id uuid)
returns table (
  id uuid,
  runner_id uuid,
  runner_name text,
  bib integer,
  category_id uuid,
  category_position integer,
  distance public.race_distance,
  distance_km numeric,
  finish_seconds integer,
  place bigint,
  distance_run_km numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    rr.id,
    rr.runner_id,
    p.full_name,
    rg.bib,
    ec.id,
    ec.position::integer,
    ec.distance,
    ec.distance_km,
    rr.finish_seconds,
    rank() over (partition by rr.category_id order by rr.finish_seconds),
    rr.distance_run_km
  from public.race_results rr
  join public.events e on e.id = rr.event_id
  join public.event_categories ec on ec.id = rr.category_id
  join public.registrations rg on rg.id = rr.registration_id
  join public.profiles p on p.id = rr.runner_id
  where rr.event_id = p_event_id
    and e.status = 'published'
    and rr.status = 'accepted'
    and p.is_public;
$$;

revoke execute on function public.public_event_results(uuid) from public;
grant execute on function public.public_event_results(uuid) to anon, authenticated;
