-- ---------------------------------------------------------------------------
-- Organizer guards, row locks and race-day rules
--
-- The functions an organizer runs on someone's sign-up — removing it,
-- putting it back to pending, reviewing or disqualifying a result, shipping
-- a kit or medal, handing one over, checking a runner in — asked only
-- whether the caller owns the event. save_event() and the update policies
-- before it ask more: the caller is still an organizer, and the event is not
-- one a platform admin removed. So a demoted organizer could still cancel
-- paid runners and review results, and an organizer could still take paid
-- runners off an event the platform had taken down. They all ask the same
-- now, through `can_manage_event()`. A platform admin still may on a
-- removed event: refunds and clean-ups land with the platform then.
--
-- The organizer's read of registrations asks the same, and stops showing
-- abandoned checkouts: a runner who walked away from the payment screen left
-- a phone number, birth date, emergency contact and maybe a mailing address
-- for a race they never joined. The organizer sees paid and cancelled
-- sign-ups, and the ATH Móvil payments waiting on review.
--
-- Locks: every writer here takes the event first (where it locks it at
-- all), then the sign-up, then its result. Reviews and disqualifications now
-- lock the sign-up, so removing it or putting it back to pending waits for a
-- review in flight, and sees an accepted result once it lands; the kit,
-- medal and check-in functions lock it too, and re-check what they read
-- under the lock.
--
-- Unpaid again: a sign-up put back to pending gives up its pending or
-- sent-back result (the runner sends it again once confirmed) and its
-- check-in. One whose kit or medal already went out keeps its confirmation:
-- clearing the record would ship it twice once the payment is approved
-- again, so the organizer removes the runner instead if they must.
--
-- Check-in follows what the station shows: a published race run in one
-- place.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- can_manage_event(): whether the caller may act on the event's sign-ups as
-- its organizer. A platform admin may on any event; the organizer while
-- still an organizer and the event not removed. Only for the functions
-- below.
-- ---------------------------------------------------------------------------

create or replace function public.can_manage_event(ev public.events)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select ev.id is not null and (
    public.is_platform_admin()
    or (
      ev.organizer_id = (select auth.uid())
      and ev.status <> 'removed'
      and public.is_organizer()
    )
  );
$$;

revoke execute on function public.can_manage_event(public.events)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Organizers read registrations for their events: as before
-- (20261013120000_drafts_and_registrations), while still an organizer, and
-- only paid or cancelled sign-ups and ATH Móvil payments under review — not
-- checkouts that were never paid.
-- ---------------------------------------------------------------------------

drop policy "Organizers read registrations for their events" on public.registrations;

create policy "Organizers read registrations for their events"
  on public.registrations for select
  to authenticated
  using (
    (status in ('confirmed', 'cancelled') or payment_submitted_at is not null)
    and (select public.is_organizer())
    and exists (
      select 1 from public.events e
      where e.id = event_id and e.organizer_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- remove_registration(): as before (20261120120100_disqualify_results), for
-- callers who may manage the event, and with the sign-up locked before its
-- result is checked. Errors unchanged.
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

  if not public.can_manage_event(ev) then
    raise exception 'notAllowed' using errcode = 'P0001';
  end if;

  -- Then the sign-up, which a result review holds while it runs: an
  -- accepted result lands before the checks below, not after them.
  perform 1 from public.registrations where id = p_registration_id for update;

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
-- (20261120120100_disqualify_results), for callers who may manage the event,
-- with the sign-up locked. A pending or sent-back result goes, and so does
-- the check-in: neither belongs to an unpaid sign-up. New error:
--
--   alreadyDelivered  the kit was mailed, or the medal mailed or handed over
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

  if not public.can_manage_event(ev) then
    raise exception 'notAllowed' using errcode = 'P0001';
  end if;

  -- Re-read under the lock: it may have just been removed or reverted. The
  -- row lock holds off a result review until this is done.
  select * into reg from public.registrations where id = p_registration_id
  for update;

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

  if reg.shipped_at is not null
     or reg.medal_shipped_at is not null
     or reg.medal_picked_up_at is not null then
    raise exception 'alreadyDelivered' using errcode = 'P0001';
  end if;

  -- Only pending or sent-back ones are left by now.
  delete from public.race_results where registration_id = reg.id;

  update public.registrations set
    status = 'pending',
    bib = null,
    paid_at = null,
    checked_in_at = null,
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

-- ---------------------------------------------------------------------------
-- review_race_result(): as before (20261108120000_race_results), for callers
-- who may manage the event, and only while the sign-up is paid. Locks the
-- sign-up, then the result. New error:
--
--   registrationMissing  the sign-up was removed or is unpaid again
-- ---------------------------------------------------------------------------

create or replace function public.review_race_result(
  p_result_id uuid,
  p_accept boolean,
  p_note text default null
)
returns public.race_results
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  res public.race_results;
  reg public.registrations;
  ev public.events;
begin
  select r.* into res from public.race_results r
  where r.id = p_result_id and r.status = 'pending';

  if res.id is null then
    raise exception 'resultMissing' using errcode = 'P0001';
  end if;

  select * into ev from public.events where id = res.event_id;
  if uid is null or not public.can_manage_event(ev) then
    raise exception 'notAllowed' using errcode = 'P0001';
  end if;

  -- Sign-up first, then result: the order removals take them in.
  select * into reg from public.registrations
  where id = res.registration_id
  for update;

  select r.* into res from public.race_results r
  where r.id = p_result_id and r.status = 'pending'
  for update;

  if res.id is null then
    raise exception 'resultMissing' using errcode = 'P0001';
  end if;

  if reg.id is null or reg.status <> 'confirmed' then
    raise exception 'registrationMissing' using errcode = 'P0001';
  end if;

  update public.race_results set
    status = case when p_accept then 'accepted' else 'rejected' end::public.result_status,
    review_note = case when p_accept then null else nullif(btrim(p_note), '') end,
    reviewed_at = now(),
    reviewed_by = uid
  where id = res.id
  returning * into res;

  return res;
end;
$$;

revoke execute on function public.review_race_result(uuid, boolean, text) from public, anon;
grant execute on function public.review_race_result(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- disqualify_race_result(): as before (20261120120100_disqualify_results),
-- for callers who may manage the event, and only while the sign-up is paid.
-- Locks the sign-up, then the result. New error:
--
--   registrationMissing  the sign-up was removed or is unpaid again
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
  reg public.registrations;
  ev public.events;
begin
  select r.* into res from public.race_results r
  where r.id = p_result_id and r.status = 'accepted';

  if res.id is null then
    raise exception 'resultMissing' using errcode = 'P0001';
  end if;

  select * into ev from public.events where id = res.event_id;
  if uid is null or not public.can_manage_event(ev) then
    raise exception 'notAllowed' using errcode = 'P0001';
  end if;

  if reason is null then
    raise exception 'reasonRequired' using errcode = 'P0001';
  end if;

  -- Sign-up first, then result: the order removals take them in.
  select * into reg from public.registrations
  where id = res.registration_id
  for update;

  select r.* into res from public.race_results r
  where r.id = p_result_id and r.status = 'accepted'
  for update;

  if res.id is null then
    raise exception 'resultMissing' using errcode = 'P0001';
  end if;

  if reg.id is null or reg.status <> 'confirmed' then
    raise exception 'registrationMissing' using errcode = 'P0001';
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
-- set_checked_in(): as before (20261123120000_check_in), for callers who may
-- manage the event, on a published race run in one place — what the station
-- itself requires (hasInPersonCheckIn in lib/events/organizer.ts) — with the
-- sign-up locked, and a repeat check-in keeping the first time even when two
-- phones tap at once. Errors:
--
--   notAllowed           not the event's organizer or a platform admin
--   registrationMissing  no such confirmed sign-up (removed meanwhile)
--   noCheckIn            the race is not published, or has no tent: virtual,
--                        or run anywhere
-- ---------------------------------------------------------------------------

create or replace function public.set_checked_in(
  p_registration_id uuid,
  p_checked_in boolean
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
    raise exception 'registrationMissing' using errcode = 'P0001';
  end if;

  select * into ev from public.events where id = reg.event_id;
  if not public.can_manage_event(ev) then
    raise exception 'notAllowed' using errcode = 'P0001';
  end if;

  if ev.status <> 'published' or ev.anywhere or ev.type = 'Virtual Race' then
    raise exception 'noCheckIn' using errcode = 'P0001';
  end if;

  select * into reg from public.registrations where id = p_registration_id
  for update;

  if reg.id is null or reg.status <> 'confirmed' then
    raise exception 'registrationMissing' using errcode = 'P0001';
  end if;

  if p_checked_in = (reg.checked_in_at is not null) then
    return reg;
  end if;

  update public.registrations set
    checked_in_at = case when p_checked_in then coalesce(checked_in_at, now()) end
  where id = reg.id
  returning * into reg;

  return reg;
end;
$$;

revoke execute on function public.set_checked_in(uuid, boolean) from public, anon;
grant execute on function public.set_checked_in(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- mark_kit_shipped(): as before (20261114120000_kit_shipping), for callers
-- who may manage the event, with the sign-up locked and re-checked. Errors
-- unchanged.
-- ---------------------------------------------------------------------------

create or replace function public.mark_kit_shipped(
  p_registration_id uuid,
  p_tracking text default null
)
returns public.registrations
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  v_tracking text := nullif(btrim(coalesce(p_tracking, '')), '');
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

  select * into ev from public.events where id = reg.event_id;
  if not public.can_manage_event(ev) then
    raise exception 'notAllowed' using errcode = 'P0001';
  end if;

  -- What it is now, held until this is done.
  select * into reg from public.registrations where id = p_registration_id
  for update;

  if reg.id is null or reg.status <> 'confirmed' then
    raise exception 'registrationMissing' using errcode = 'P0001';
  end if;

  if not reg.ships_by_mail then
    raise exception 'notMailed' using errcode = 'P0001';
  end if;

  if char_length(v_tracking) > 100 then
    raise exception 'trackingTooLong' using errcode = 'P0001';
  end if;

  update public.registrations set
    shipped_at = coalesce(shipped_at, now()),
    shipping_tracking = v_tracking
  where id = reg.id
  returning * into reg;

  return reg;
end;
$$;

revoke execute on function public.mark_kit_shipped(uuid, text) from public, anon;
grant execute on function public.mark_kit_shipped(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- mark_medal_shipped(): as before (20261122120000_medal_pickup), for callers
-- who may manage the event, with the sign-up locked and re-checked: a runner
-- switching to pickup, or a volunteer handing it over, meanwhile is seen.
-- Errors unchanged.
-- ---------------------------------------------------------------------------

create or replace function public.mark_medal_shipped(
  p_registration_id uuid,
  p_tracking text default null
)
returns public.registrations
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  v_tracking text := nullif(btrim(coalesce(p_tracking, '')), '');
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

  select * into ev from public.events where id = reg.event_id;
  if not public.can_manage_event(ev) then
    raise exception 'notAllowed' using errcode = 'P0001';
  end if;

  -- What it is now, held until this is done.
  select * into reg from public.registrations where id = p_registration_id
  for update;

  if reg.id is null or reg.status <> 'confirmed' then
    raise exception 'registrationMissing' using errcode = 'P0001';
  end if;

  if reg.medal_shipped_at is null then
    if not ev.mails_medals then
      raise exception 'medalsOff' using errcode = 'P0001';
    end if;

    if reg.medal_picked_up_at is not null then
      raise exception 'pickedUp' using errcode = 'P0001';
    end if;

    if not reg.medal_by_mail then
      raise exception 'pickupChosen' using errcode = 'P0001';
    end if;

    if not public.medal_earned(reg, ev, false) then
      raise exception 'notFinished' using errcode = 'P0001';
    end if;

    if reg.medal_mailing_address is null then
      raise exception 'addressMissing' using errcode = 'P0001';
    end if;
  end if;

  if char_length(v_tracking) > 100 then
    raise exception 'trackingTooLong' using errcode = 'P0001';
  end if;

  update public.registrations set
    medal_shipped_at = coalesce(medal_shipped_at, now()),
    medal_tracking = v_tracking
  where id = reg.id
  returning * into reg;

  return reg;
end;
$$;

revoke execute on function public.mark_medal_shipped(uuid, text) from public, anon;
grant execute on function public.mark_medal_shipped(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- mark_medal_picked_up(): as before (20261122120000_medal_pickup), for
-- callers who may manage the event, with the sign-up locked and re-checked.
-- Errors unchanged.
-- ---------------------------------------------------------------------------

create or replace function public.mark_medal_picked_up(p_registration_id uuid)
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
    raise exception 'notAllowed' using errcode = 'P0001';
  end if;

  select * into ev from public.events where id = reg.event_id;
  if not public.can_manage_event(ev) then
    raise exception 'notAllowed' using errcode = 'P0001';
  end if;

  -- What it is now, held until this is done.
  select * into reg from public.registrations where id = p_registration_id
  for update;

  if reg.id is null or reg.status <> 'confirmed' then
    raise exception 'registrationMissing' using errcode = 'P0001';
  end if;

  if reg.medal_picked_up_at is not null then
    return reg;
  end if;

  if not ev.mails_medals then
    raise exception 'medalsOff' using errcode = 'P0001';
  end if;

  if reg.medal_shipped_at is not null then
    raise exception 'shipped' using errcode = 'P0001';
  end if;

  if reg.medal_by_mail then
    raise exception 'mailChosen' using errcode = 'P0001';
  end if;

  if not public.medal_earned(reg, ev, true) then
    raise exception 'notFinished' using errcode = 'P0001';
  end if;

  update public.registrations set medal_picked_up_at = now()
  where id = reg.id
  returning * into reg;

  return reg;
end;
$$;

revoke execute on function public.mark_medal_picked_up(uuid) from public, anon;
grant execute on function public.mark_medal_picked_up(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- set_medal_delivery(): as before (20261122120000_medal_pickup), with the
-- sign-up locked, so the organizer shipping or handing over the medal at
-- the same moment is seen before the choice changes. Errors unchanged.
-- ---------------------------------------------------------------------------

create or replace function public.set_medal_delivery(
  p_registration_id uuid,
  p_by_mail boolean,
  p_address text default null
)
returns public.registrations
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  v_address text := nullif(btrim(coalesce(p_address, '')), '');
  reg public.registrations;
  ev public.events;
begin
  select * into reg from public.registrations
  where id = p_registration_id and runner_id = uid and status = 'confirmed'
  for update;
  if uid is null or reg.id is null then
    raise exception 'notAllowed' using errcode = 'P0001';
  end if;

  select * into ev from public.events where id = reg.event_id;
  if not ev.mails_medals then
    raise exception 'medalsOff' using errcode = 'P0001';
  end if;

  if reg.medal_shipped_at is not null then
    raise exception 'alreadyShipped' using errcode = 'P0001';
  end if;

  if reg.medal_picked_up_at is not null then
    raise exception 'pickedUp' using errcode = 'P0001';
  end if;

  if (p_by_mail and v_address is null) or char_length(v_address) > 300 then
    raise exception 'addressInvalid' using errcode = 'P0001';
  end if;

  update public.registrations set
    medal_by_mail = coalesce(p_by_mail, false),
    medal_mailing_address = coalesce(v_address, medal_mailing_address)
  where id = reg.id
  returning * into reg;

  return reg;
end;
$$;

revoke execute on function public.set_medal_delivery(uuid, boolean, text) from public, anon;
grant execute on function public.set_medal_delivery(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- delete_event(): as before (20261118120100_registration_lifecycle), for an
-- organizer who still is one, as save_event() asks.
-- ---------------------------------------------------------------------------

create or replace function public.delete_event(p_event_id uuid)
returns public.events
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  ev public.events;
begin
  select * into ev from public.events where id = p_event_id for update;

  if uid is null or ev.id is null or ev.organizer_id <> uid
     or ev.status = 'removed' or not public.is_organizer() then
    raise exception 'eventNotFound' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.registrations r
    where r.event_id = p_event_id
      and (r.status in ('confirmed', 'cancelled') or r.payment_submitted_at is not null)
  ) then
    raise exception 'eventHasRegistrations' using errcode = 'P0001';
  end if;

  delete from public.registrations
  where event_id = p_event_id and status = 'pending';

  delete from public.events where id = p_event_id returning * into ev;
  return ev;
end;
$$;

revoke execute on function public.delete_event(uuid) from public, anon;
grant execute on function public.delete_event(uuid) to authenticated;
