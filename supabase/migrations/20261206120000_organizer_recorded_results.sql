-- ---------------------------------------------------------------------------
-- Results the organizer records
--
-- Some runners cannot get finish evidence in: no screenshot from their
-- watch, an upload that keeps failing, a phone that will not cooperate. The
-- organizer, who knows they ran (chip timing, the finish line, the runner's
-- word), can now record the finish for them: a time and no screenshot. The
-- result is accepted at once, exactly as a reviewed one: on the runner's
-- profile and the leaderboard, with the event's medal.
--
-- A result without evidence is only ever accepted, or disqualified later:
-- one waiting for review, or sent back, always has the screenshot the
-- runner sent. A null `evidence_path` is how the app tells a recorded
-- result from a reviewed one.
--
-- Recording replaces whatever the runner sent and is still pending or was
-- sent back. That screenshot is then unreferenced, and the daily sweep
-- (20261205120300_orphaned_evidence.sql) deletes it.
-- ---------------------------------------------------------------------------

alter table public.race_results
  alter column evidence_path drop not null;

alter table public.race_results
  add constraint race_results_evidence_required_check check (
    evidence_path is not null or status in ('accepted', 'disqualified')
  );

comment on column public.race_results.evidence_path is
  'Object path in the private race-evidence bucket. Null on a result the organizer recorded.';

-- ---------------------------------------------------------------------------
-- record_race_result(): the event's organizer, or a platform admin, records
-- a paid runner's finish without evidence. Errors:
--
--   registrationMissing    no such paid sign-up
--   notAllowed             not the event's organizer or an admin
--   resultsClosed          the event is not published, or takes no results
--   raceNotStarted         before the race's first day, Puerto Rico time
--   timeInvalid            not between a second and 7 days
--   resultAlreadyAccepted  the runner already has an accepted result
--   resultDisqualified     the runner was disqualified
-- ---------------------------------------------------------------------------

create or replace function public.record_race_result(
  p_registration_id uuid,
  p_finish_seconds integer
)
returns public.race_results
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  reg public.registrations;
  ev public.events;
  res public.race_results;
begin
  select * into reg from public.registrations where id = p_registration_id;
  if reg.id is null then
    raise exception 'registrationMissing' using errcode = 'P0001';
  end if;

  select * into ev from public.events where id = reg.event_id;
  if uid is null or not public.can_manage_event(ev) then
    raise exception 'notAllowed' using errcode = 'P0001';
  end if;

  if ev.status <> 'published' or not ev.accepts_results then
    raise exception 'resultsClosed' using errcode = 'P0001';
  end if;

  if ev.event_date > (now() at time zone 'America/Puerto_Rico')::date then
    raise exception 'raceNotStarted' using errcode = 'P0001';
  end if;

  if p_finish_seconds is null
    or p_finish_seconds <= 0
    or p_finish_seconds >= 604800 then
    raise exception 'timeInvalid' using errcode = 'P0001';
  end if;

  -- Sign-up first, then result: the order removals take them in.
  select * into reg from public.registrations
  where id = p_registration_id
  for update;

  if reg.status <> 'confirmed' then
    raise exception 'registrationMissing' using errcode = 'P0001';
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
    finish_seconds, evidence_path, status, reviewed_at, reviewed_by
  ) values (
    reg.id, ev.id, reg.category_id, reg.runner_id,
    p_finish_seconds, null, 'accepted', now(), uid
  )
  on conflict (registration_id) do update set
    category_id = excluded.category_id,
    finish_seconds = excluded.finish_seconds,
    evidence_path = null,
    status = 'accepted',
    review_note = null,
    submitted_at = now(),
    reviewed_at = now(),
    reviewed_by = uid
  returning * into res;

  return res;
end;
$$;

comment on function public.record_race_result(uuid, integer) is
  'The organizer or an admin records a paid runner''s finish, accepted, without evidence.';

revoke execute on function public.record_race_result(uuid, integer) from public, anon;
grant execute on function public.record_race_result(uuid, integer) to authenticated;
