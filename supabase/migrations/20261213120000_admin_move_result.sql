-- ---------------------------------------------------------------------------
-- Admins move a result to the runner who ran it
--
-- A runner can send their finish from the wrong account: signed in as a
-- friend who is in the same race. Once accepted, the result sat on the
-- friend's profile and nothing could put it right — a correction changed the
-- time, distance and screenshot, never whose it is.
--
-- A platform admin can now move an accepted result to another paid sign-up
-- of the same event, in the same correction: the result takes that sign-up's
-- runner and category, and the friend, left with no result, can send their
-- own. Nobody is emailed.
--
-- 1. race_result_corrections.old_runner_id / new_runner_id: set on a move.
-- 2. admin_correct_race_result() takes p_move_to_registration.
-- 3. admin_result_move_targets(): the sign-ups a result can move to, for the
--    dialog's lookup.
--
-- The screenshot must live in its runner's folder (`race_results` checks
-- it), so the app copies it into the new runner's before calling, and passes
-- the copy as p_evidence_path. A submission of the new runner's own, waiting
-- or sent back, is replaced; the daily sweep
-- (20261205120300_orphaned_evidence.sql) deletes its file.
-- ---------------------------------------------------------------------------

-- 1 ---------------------------------------------------------------------------

alter table public.race_result_corrections
  add column old_runner_id uuid references public.profiles (id) on delete set null,
  add column new_runner_id uuid references public.profiles (id) on delete set null;

comment on column public.race_result_corrections.old_runner_id is
  'On a correction that moved the result: the runner it was taken from. Null otherwise.';
comment on column public.race_result_corrections.new_runner_id is
  'On a correction that moved the result: the runner it went to. Null otherwise.';

-- 2 ---------------------------------------------------------------------------
-- admin_correct_race_result(): as before (20261211120000_admin_correct_results.sql),
-- plus
--
--   p_move_to_registration  a paid sign-up of the same event to move the
--                           result to; null leaves it where it is
--
-- A move alone is a correction: time, distance and screenshot may stay as
-- they were. With a screenshot, a move needs p_evidence_path — the file
-- copied or uploaded into the new runner's folder — or p_remove_evidence.
-- More errors:
--
--   moveDisqualified     only an accepted result is moved
--   moveInvalid          no such paid sign-up of this event, or the result's own
--   moveMedalDelivered   the medal of the sign-up it is on was already
--                        shipped or picked up
--   moveTargetHasResult  the other runner has an accepted or disqualified
--                        result already
-- ---------------------------------------------------------------------------

drop function public.admin_correct_race_result(uuid, timestamptz, integer, numeric, text, boolean, text);

create function public.admin_correct_race_result(
  p_result_id uuid,
  p_version timestamptz,
  p_finish_seconds integer,
  p_distance_run_km numeric,
  p_evidence_path text,
  p_remove_evidence boolean,
  p_reason text,
  p_move_to_registration uuid default null
)
returns public.race_result_corrections
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  reason text := nullif(btrim(p_reason), '');
  km numeric(5, 2) := round(p_distance_run_km, 2);
  moving boolean := p_move_to_registration is not null;
  res public.race_results;
  src public.registrations;
  dst public.registrations;
  theirs public.race_results;
  -- Whose folder a new screenshot must be in.
  owner uuid;
  new_path text;
  removed boolean;
  log public.race_result_corrections;
begin
  if uid is null or not public.is_platform_admin() then
    raise exception 'notAllowed' using errcode = 'P0001';
  end if;

  -- Sign-ups first, then results: the order removals take them in. Both
  -- sign-ups in one statement, in id order, so two moves cannot deadlock.
  if moving then
    perform 1 from public.registrations g
    where g.id = p_move_to_registration
       or g.id = (select r.registration_id from public.race_results r where r.id = p_result_id)
    order by g.id
    for update;
  end if;

  select r.* into res from public.race_results r
  where r.id = p_result_id and r.status in ('accepted', 'disqualified')
  for update;

  if res.id is null then
    raise exception 'resultMissing' using errcode = 'P0001';
  end if;

  if p_version is null
     or coalesce(res.corrected_at, res.reviewed_at, res.submitted_at) <> p_version then
    raise exception 'resultChanged' using errcode = 'P0001';
  end if;

  if p_finish_seconds is null or p_finish_seconds <= 0 or p_finish_seconds >= 604800 then
    raise exception 'timeInvalid' using errcode = 'P0001';
  end if;

  if km is not null and (km <= 0 or km > 500) then
    raise exception 'distanceInvalid' using errcode = 'P0001';
  end if;

  if reason is null then
    raise exception 'reasonRequired' using errcode = 'P0001';
  end if;

  owner := res.runner_id;

  if moving then
    if res.status <> 'accepted' then
      raise exception 'moveDisqualified' using errcode = 'P0001';
    end if;

    select * into src from public.registrations where id = res.registration_id;
    select * into dst from public.registrations where id = p_move_to_registration;

    if dst.id is null
       or dst.id = res.registration_id
       or dst.event_id <> res.event_id
       or dst.status <> 'confirmed' then
      raise exception 'moveInvalid' using errcode = 'P0001';
    end if;

    -- The medal went out on this result: taking the result away would leave
    -- a medal with no finish behind it. Sorted out by hand.
    if src.medal_shipped_at is not null or src.medal_picked_up_at is not null then
      raise exception 'moveMedalDelivered' using errcode = 'P0001';
    end if;

    select r.* into theirs from public.race_results r
    where r.registration_id = dst.id
    for update;

    if theirs.status in ('accepted', 'disqualified') then
      raise exception 'moveTargetHasResult' using errcode = 'P0001';
    end if;

    owner := dst.runner_id;
  end if;

  if p_evidence_path is not null then
    if p_evidence_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'
       or split_part(p_evidence_path, '/', 1) <> owner::text
       or not exists (
         select 1 from storage.objects o
         where o.bucket_id = 'race-evidence' and o.name = p_evidence_path
       )
       or exists (
         select 1 from public.race_results r
         where r.evidence_path = p_evidence_path and r.id <> res.id
       )
    then
      raise exception 'evidenceInvalid' using errcode = 'P0001';
    end if;
    new_path := p_evidence_path;
  elsif coalesce(p_remove_evidence, false) then
    new_path := null;
  elsif moving and res.evidence_path is not null then
    -- It cannot stay in the folder of the runner the result is leaving.
    raise exception 'evidenceInvalid' using errcode = 'P0001';
  else
    new_path := res.evidence_path;
  end if;

  if not moving
     and p_finish_seconds = res.finish_seconds
     and km is not distinct from res.distance_run_km
     and new_path is not distinct from res.evidence_path then
    raise exception 'nothingChanged' using errcode = 'P0001';
  end if;

  -- Removed now; or still gone from an earlier removal, unless a new file
  -- took its place.
  removed := new_path is null and (
    res.evidence_path is not null or res.evidence_removed_at is not null
  );

  insert into public.race_result_corrections (
    result_id, corrected_by, reason,
    old_finish_seconds, new_finish_seconds,
    old_distance_run_km, new_distance_run_km,
    old_evidence_path, new_evidence_path,
    old_runner_id, new_runner_id
  ) values (
    res.id, uid, reason,
    res.finish_seconds, p_finish_seconds,
    res.distance_run_km, km,
    res.evidence_path, new_path,
    case when moving then res.runner_id end,
    case when moving then dst.runner_id end
  )
  returning * into log;

  -- What the other runner sent, waiting or sent back: one result per sign-up.
  if moving and theirs.id is not null then
    delete from public.race_results where id = theirs.id;
  end if;

  update public.race_results set
    registration_id = case when moving then dst.id else registration_id end,
    category_id = case when moving then dst.category_id else category_id end,
    runner_id = owner,
    finish_seconds = p_finish_seconds,
    distance_run_km = km,
    evidence_path = new_path,
    evidence_removed_at = case
      when not removed then null
      when res.evidence_path is not null then now()
      else res.evidence_removed_at
    end,
    corrected_at = log.corrected_at,
    corrected_by = uid
  where id = res.id;

  return log;
end;
$$;

comment on function public.admin_correct_race_result(uuid, timestamptz, integer, numeric, text, boolean, text, uuid) is
  'A platform admin corrects the time, distance or screenshot of an accepted or disqualified result, or moves an accepted one to another paid sign-up of the event, with a reason kept in race_result_corrections.';

revoke execute on function public.admin_correct_race_result(uuid, timestamptz, integer, numeric, text, boolean, text, uuid)
  from public, anon;
grant execute on function public.admin_correct_race_result(uuid, timestamptz, integer, numeric, text, boolean, text, uuid)
  to authenticated;

-- 3 ---------------------------------------------------------------------------
-- admin_result_move_targets(): the paid sign-ups of the result's event it
-- could move to — every one but its own and those with an accepted or
-- disqualified result — whose name or bib matches p_query, by name.
-- `same_category` is false where the runner signed up for another distance,
-- which the result would take. Errors, raised before any search so the
-- dialog can say a move is off the table:
--
--   notAllowed          not a platform admin
--   resultMissing       no such accepted or disqualified result
--   moveDisqualified    only an accepted result is moved
--   moveMedalDelivered  its medal was already shipped or picked up
-- ---------------------------------------------------------------------------

create function public.admin_result_move_targets(
  p_result_id uuid,
  p_query text default null,
  p_limit integer default 20
)
returns table (
  registration_id uuid,
  runner_id uuid,
  runner_name text,
  bib integer,
  distance public.race_distance,
  same_category boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  -- Typed text is matched literally, wildcards and all.
  pattern text := '%' || replace(replace(replace(
    btrim(coalesce(p_query, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  res public.race_results;
  src public.registrations;
begin
  if not public.is_platform_admin() then
    raise exception 'notAllowed' using errcode = 'P0001';
  end if;

  select r.* into res from public.race_results r
  where r.id = p_result_id and r.status in ('accepted', 'disqualified');

  if res.id is null then
    raise exception 'resultMissing' using errcode = 'P0001';
  end if;

  if res.status <> 'accepted' then
    raise exception 'moveDisqualified' using errcode = 'P0001';
  end if;

  select * into src from public.registrations where id = res.registration_id;
  if src.medal_shipped_at is not null or src.medal_picked_up_at is not null then
    raise exception 'moveMedalDelivered' using errcode = 'P0001';
  end if;

  return query
  select
    g.id, g.runner_id,
    btrim(g.first_name || ' ' || g.last_name),
    g.bib, c.distance,
    g.category_id = res.category_id
  from public.registrations g
  join public.event_categories c on c.id = g.category_id
  where g.event_id = res.event_id
    and g.status = 'confirmed'
    and g.id <> res.registration_id
    and not exists (
      select 1 from public.race_results r
      where r.registration_id = g.id and r.status in ('accepted', 'disqualified')
    )
    and (
      (g.first_name || ' ' || g.last_name) ilike pattern
      or g.bib::text ilike pattern
    )
  order by g.first_name, g.last_name, g.id
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
end;
$$;

comment on function public.admin_result_move_targets(uuid, text, integer) is
  'The paid sign-ups an accepted result could be moved to, for a platform admin: the event''s others without an accepted or disqualified result, by name or bib.';

revoke execute on function public.admin_result_move_targets(uuid, text, integer)
  from public, anon;
grant execute on function public.admin_result_move_targets(uuid, text, integer)
  to authenticated;
