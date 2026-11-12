-- ---------------------------------------------------------------------------
-- Admins correct a reviewed result
--
-- A result can be accepted by mistake: the wrong screenshot, a time misread,
-- a distance typed wrong. Until now an accepted result could only be
-- disqualified, which takes the medal with it. A platform admin can now
-- correct it in place: the finish time, the distance the runner's app
-- recorded, and the screenshot — kept, removed, or replaced with one the
-- admin uploads. The runner is not emailed; the corrected result is simply
-- what their profile shows.
--
-- Only accepted and disqualified results: one waiting for review, or sent
-- back, goes through the organizer's review as before.
--
-- 1. race_results.corrected_at / corrected_by, and evidence_removed_at. A
--    null `evidence_path` alone means "the organizer recorded it"
--    (20261206120000_organizer_recorded_results.sql); evidence_removed_at
--    tells a screenshot an admin took away apart from one there never was.
-- 2. race_result_corrections: every correction, old and new values, which
--    admin and why. Once a screenshot is deleted, this is what is left of
--    it. Admins read it; only the function below writes it.
-- 3. admin_correct_race_result().
--
-- A replacement screenshot is uploaded through a signed upload URL the
-- server makes for the runner's folder, where a result's evidence must live
-- (`race_results` checks it), so no storage policy changes. The file it
-- replaces is deleted by the app straight after; the daily sweep
-- (20261205120300_orphaned_evidence.sql) catches any it misses, and any
-- upload that never got saved.
-- ---------------------------------------------------------------------------

-- 1 ---------------------------------------------------------------------------

alter table public.race_results
  add column corrected_at timestamptz,
  add column corrected_by uuid references auth.users (id) on delete set null,
  add column evidence_removed_at timestamptz;

comment on column public.race_results.corrected_at is
  'When a platform admin last corrected the result (admin_correct_race_result()).';
comment on column public.race_results.evidence_removed_at is
  'When an admin removed the screenshot without replacing it. Tells such a result apart from one the organizer recorded.';

-- Readable as the other review columns are; `corrected_by`, like
-- `reviewed_by`, by no one (20261127120000_audit_hardening.sql).
grant select (corrected_at, evidence_removed_at)
  on public.race_results to authenticated;

-- 2 ---------------------------------------------------------------------------

create table public.race_result_corrections (
  id uuid primary key default gen_random_uuid(),
  result_id uuid not null references public.race_results (id) on delete cascade,
  corrected_at timestamptz not null default now(),
  corrected_by uuid references auth.users (id) on delete set null,
  reason text not null check (char_length(reason) between 1 and 300),
  old_finish_seconds integer not null,
  new_finish_seconds integer not null,
  old_distance_run_km numeric(5, 2),
  new_distance_run_km numeric(5, 2),
  -- The paths only: the old file itself is deleted.
  old_evidence_path text,
  new_evidence_path text
);

create index race_result_corrections_result_idx
  on public.race_result_corrections (result_id, corrected_at desc);

comment on table public.race_result_corrections is
  'Every correction an admin made to a reviewed result. Written only by admin_correct_race_result().';

alter table public.race_result_corrections enable row level security;

create policy "Admins read result corrections"
  on public.race_result_corrections for select
  to authenticated
  using ((select public.is_platform_admin()));

revoke all on public.race_result_corrections from anon, authenticated;
grant select on public.race_result_corrections to authenticated;

-- 3 ---------------------------------------------------------------------------
-- admin_correct_race_result(): a platform admin corrects an accepted or
-- disqualified result.
--
--   p_version          coalesce(corrected_at, reviewed_at, submitted_at) as
--                      the admin was shown it; anything else means it
--                      changed since, and nothing is saved
--   p_distance_run_km  null: pace over the category's distance
--   p_evidence_path    a file already uploaded to the runner's folder, to
--                      replace the screenshot; null keeps or removes it
--   p_remove_evidence  with no new file: take the screenshot away
--
-- Returns the correction, whose old_evidence_path the app deletes when it
-- differs from the new one. Errors:
--
--   notAllowed       not a platform admin
--   resultMissing    no such accepted or disqualified result
--   resultChanged    corrected, reviewed or re-sent since p_version
--   timeInvalid      not between a second and 7 days
--   distanceInvalid  not above 0 and up to 500 km
--   evidenceInvalid  the new file is not in the runner's folder, or missing,
--                    or already another result's
--   reasonRequired   the reason is blank
--   nothingChanged   time, distance and screenshot all as they were
-- ---------------------------------------------------------------------------

create function public.admin_correct_race_result(
  p_result_id uuid,
  p_version timestamptz,
  p_finish_seconds integer,
  p_distance_run_km numeric,
  p_evidence_path text,
  p_remove_evidence boolean,
  p_reason text
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
  res public.race_results;
  new_path text;
  removed boolean;
  log public.race_result_corrections;
begin
  if uid is null or not public.is_platform_admin() then
    raise exception 'notAllowed' using errcode = 'P0001';
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

  if p_evidence_path is not null then
    if p_evidence_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'
       or split_part(p_evidence_path, '/', 1) <> res.runner_id::text
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
  else
    new_path := res.evidence_path;
  end if;

  if p_finish_seconds = res.finish_seconds
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
    old_evidence_path, new_evidence_path
  ) values (
    res.id, uid, reason,
    res.finish_seconds, p_finish_seconds,
    res.distance_run_km, km,
    res.evidence_path, new_path
  )
  returning * into log;

  update public.race_results set
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

comment on function public.admin_correct_race_result(uuid, timestamptz, integer, numeric, text, boolean, text) is
  'A platform admin corrects the time, distance or screenshot of an accepted or disqualified result, with a reason kept in race_result_corrections.';

revoke execute on function public.admin_correct_race_result(uuid, timestamptz, integer, numeric, text, boolean, text)
  from public, anon;
grant execute on function public.admin_correct_race_result(uuid, timestamptz, integer, numeric, text, boolean, text)
  to authenticated;
