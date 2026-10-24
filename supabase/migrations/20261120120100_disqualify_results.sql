-- ---------------------------------------------------------------------------
-- Disqualifying an accepted result
--
-- A runner caught cheating loses the result and the medal that came with it.
-- The event's organizer, or a platform admin, disqualifies an accepted
-- result with a reason the runner sees. Every public read already filters on
-- 'accepted', so the result leaves the profile and the leaderboard at once.
--
-- The row stays, as the record of what happened, and keeps its evidence:
--   - the runner cannot send new evidence for the event;
--   - the sign-up cannot be removed or put back to pending, either of which
--     would take the row with it;
--   - only an admin can reinstate it, for an appeal or a mistake.
-- ---------------------------------------------------------------------------

alter table public.race_results
  add column disqualified_at timestamptz,
  add column disqualified_by uuid references auth.users (id) on delete set null,
  add column disqualification_reason text
    check (char_length(disqualification_reason) <= 300);

comment on column public.race_results.disqualification_reason is
  'Why the organizer or an admin disqualified the result; shown to the runner.';

alter table public.race_results
  add constraint race_results_disqualification_check check (
    status <> 'disqualified'
    or (disqualified_at is not null and disqualification_reason is not null)
  );

-- ---------------------------------------------------------------------------
-- disqualify_race_result(): the event's organizer, or a platform admin,
-- takes back an accepted result. Errors:
--
--   notAllowed      not the event's organizer or an admin
--   resultMissing   no such accepted result (already disqualified, or never
--                   accepted)
--   reasonRequired  the reason is blank
-- ---------------------------------------------------------------------------

create or replace function public.disqualify_race_result(
  p_result_id uuid,
  p_reason text
)
returns public.race_results
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  reason text := nullif(btrim(p_reason), '');
  res public.race_results;
begin
  select r.* into res from public.race_results r
  where r.id = p_result_id and r.status = 'accepted'
  for update;

  if res.id is null then
    raise exception 'resultMissing' using errcode = 'P0001';
  end if;

  if uid is null or not (
    exists (
      select 1 from public.events e
      where e.id = res.event_id and e.organizer_id = uid
    )
    or public.is_platform_admin()
  ) then
    raise exception 'notAllowed' using errcode = 'P0001';
  end if;

  if reason is null then
    raise exception 'reasonRequired' using errcode = 'P0001';
  end if;

  update public.race_results set
    status = 'disqualified',
    disqualified_at = now(),
    disqualified_by = uid,
    disqualification_reason = left(reason, 300)
  where id = res.id
  returning * into res;

  return res;
end;
$$;

revoke execute on function public.disqualify_race_result(uuid, text) from public, anon;
grant execute on function public.disqualify_race_result(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- reinstate_race_result(): a platform admin undoes a disqualification. The
-- result is accepted again, as the original review left it. Errors:
--
--   notAllowed     not an admin
--   resultMissing  no such disqualified result
-- ---------------------------------------------------------------------------

create or replace function public.reinstate_race_result(p_result_id uuid)
returns public.race_results
language plpgsql
security definer
set search_path = ''
as $$
declare
  res public.race_results;
begin
  if not public.is_platform_admin() then
    raise exception 'notAllowed' using errcode = 'P0001';
  end if;

  update public.race_results set
    status = 'accepted',
    disqualified_at = null,
    disqualified_by = null,
    disqualification_reason = null
  where id = p_result_id and status = 'disqualified'
  returning * into res;

  if res.id is null then
    raise exception 'resultMissing' using errcode = 'P0001';
  end if;

  return res;
end;
$$;

revoke execute on function public.reinstate_race_result(uuid) from public, anon;
grant execute on function public.reinstate_race_result(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- submit_race_result(): as before (20261108120000_race_results), but a
-- disqualified runner cannot send new evidence. New error:
--
--   resultDisqualified  the result for this event was disqualified
-- ---------------------------------------------------------------------------

create or replace function public.submit_race_result(
  p_event_id uuid,
  p_finish_seconds integer,
  p_evidence_path text
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

  select * into reg from public.registrations
  where event_id = p_event_id and runner_id = uid and status = 'confirmed';

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
    finish_seconds, evidence_path
  ) values (
    reg.id, ev.id, reg.category_id, uid,
    p_finish_seconds, p_evidence_path
  )
  on conflict (registration_id) do update set
    category_id = excluded.category_id,
    finish_seconds = excluded.finish_seconds,
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

revoke execute on function public.submit_race_result(uuid, integer, text) from public, anon;
grant execute on function public.submit_race_result(uuid, integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- remove_registration(): as before (20261118120100_registration_lifecycle),
-- but a disqualified result also keeps the sign-up: removing it would delete
-- the record. New error:
--
--   resultDisqualified  the runner's result was disqualified
-- ---------------------------------------------------------------------------

create or replace function public.remove_registration(p_registration_id uuid)
returns public.registrations
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  reg public.registrations;
  ev public.events;
begin
  if uid is null then
    raise exception 'notAllowed' using errcode = 'P0001';
  end if;

  select * into reg from public.registrations where id = p_registration_id;
  if reg.id is null then
    -- Same answer as a stranger's id, so ids cannot be probed.
    raise exception 'notAllowed' using errcode = 'P0001';
  end if;

  -- The same lock sign-ups and reviews take.
  select * into ev from public.events where id = reg.event_id for update;

  if ev.organizer_id <> uid and not public.is_platform_admin() then
    raise exception 'notAllowed' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.race_results r
    where r.registration_id = p_registration_id and r.status = 'accepted'
  ) then
    raise exception 'resultAccepted' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.race_results r
    where r.registration_id = p_registration_id and r.status = 'disqualified'
  ) then
    raise exception 'resultDisqualified' using errcode = 'P0001';
  end if;

  update public.registrations set
    status = 'cancelled',
    cancelled_at = now(),
    cancelled_by = uid,
    hold_expires_at = null
  where id = p_registration_id and status = 'confirmed'
  returning * into reg;

  if reg.id is null then
    raise exception 'registrationMissing' using errcode = 'P0001';
  end if;

  delete from public.race_results where registration_id = reg.id;

  return reg;
end;
$$;

revoke execute on function public.remove_registration(uuid) from public, anon;
grant execute on function public.remove_registration(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- return_registration_to_pending(): as before
-- (20261111120000_keep_registrations_with_results), but a disqualified
-- result also keeps the sign-up confirmed. New error:
--
--   resultDisqualified  the runner's result was disqualified
-- ---------------------------------------------------------------------------

create or replace function public.return_registration_to_pending(
  p_registration_id uuid
)
returns public.registrations
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  reg public.registrations;
  ev public.events;
begin
  if uid is null then
    raise exception 'notAllowed' using errcode = 'P0001';
  end if;

  select * into reg from public.registrations where id = p_registration_id;
  if reg.id is null then
    -- Same answer as a stranger's id, so ids cannot be probed.
    raise exception 'notAllowed' using errcode = 'P0001';
  end if;

  -- The lock sign-ups, reviews and removals take.
  select * into ev from public.events where id = reg.event_id for update;

  if ev.organizer_id <> uid and not public.is_platform_admin() then
    raise exception 'notAllowed' using errcode = 'P0001';
  end if;

  -- Re-read under the lock: it may have just been removed or reverted.
  select * into reg from public.registrations where id = p_registration_id;

  if reg.id is null or reg.status <> 'confirmed' then
    raise exception 'registrationMissing' using errcode = 'P0001';
  end if;

  if reg.payment_method is distinct from 'ath_movil' then
    raise exception 'notAthMovil' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.race_results r
    where r.registration_id = reg.id and r.status = 'accepted'
  ) then
    raise exception 'resultAccepted' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.race_results r
    where r.registration_id = reg.id and r.status = 'disqualified'
  ) then
    raise exception 'resultDisqualified' using errcode = 'P0001';
  end if;

  update public.registrations set
    status = 'pending',
    bib = null,
    paid_at = null,
    -- Held until reviewed again, as on submission.
    hold_expires_at = 'infinity',
    payment_submitted_at = coalesce(payment_submitted_at, now()),
    payment_reviewed_at = null,
    payment_reviewed_by = null,
    confirmation_email_sent_at = null
  where id = reg.id
  returning * into reg;

  return reg;
end;
$$;

revoke execute on function public.return_registration_to_pending(uuid)
  from public, anon;
grant execute on function public.return_registration_to_pending(uuid)
  to authenticated;
