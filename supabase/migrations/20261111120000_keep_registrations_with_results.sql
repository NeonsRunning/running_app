-- ---------------------------------------------------------------------------
-- A registration with an accepted result stays put
--
-- Once the organizer accepts a runner's finish, that sign-up carries the
-- runner's result and medal. Removing it would cascade the result away, and
-- putting it back to pending would leave a result on an unpaid sign-up. Both
-- `remove_registration()` and `return_registration_to_pending()` now refuse
-- it, as before plus one error:
--
--   resultAccepted  the registration has an accepted race result
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

  -- The same lock sign-ups and reviews take, so a bib is never handed out
  -- against a row that is going away.
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

  delete from public.registrations
  where id = p_registration_id and status = 'confirmed'
  returning * into reg;

  if reg.id is null then
    raise exception 'registrationMissing' using errcode = 'P0001';
  end if;

  return reg;
end;
$$;

revoke execute on function public.remove_registration(uuid) from public, anon;
grant execute on function public.remove_registration(uuid) to authenticated;

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
