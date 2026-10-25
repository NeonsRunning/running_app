-- ---------------------------------------------------------------------------
-- Race-day check-in
--
-- The check-in station ran on sample runners and kept nothing. It now works
-- on an event's confirmed sign-ups: a volunteer signed in as the organizer —
-- or a platform admin — finds the runner by name or bib and checks them in,
-- and `checked_in_at` records it, so a second phone at the tent sees it too.
--
-- A check-in can be undone, which clears the time: the station promises a
-- visible undo for every tap. Written through `set_checked_in()` only.
-- ---------------------------------------------------------------------------

alter table public.registrations
  add column if not exists checked_in_at timestamptz;

comment on column public.registrations.checked_in_at is
  'When the runner was checked in on race day. Null until then, or after an undo.';

-- Supabase's default privileges grant every table in public to anon and
-- authenticated, so "no grants" in the registrations migration still left
-- writes open; with no write policy they only failed silently. Take them
-- away, as for events: functions and the service role are the writers.
revoke insert, update, delete on public.registrations from anon, authenticated;

-- ---------------------------------------------------------------------------
-- set_checked_in(): check a runner in, or undo it. Checking in someone
-- already in keeps the first time. Errors:
--
--   notAllowed           not the event's organizer or a platform admin
--   registrationMissing  no such confirmed sign-up (removed meanwhile)
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
    raise exception 'notAllowed' using errcode = 'P0001';
  end if;

  select * into ev from public.events where id = reg.event_id;
  if ev.organizer_id <> uid and not public.is_platform_admin() then
    raise exception 'notAllowed' using errcode = 'P0001';
  end if;

  if reg.status <> 'confirmed' then
    raise exception 'registrationMissing' using errcode = 'P0001';
  end if;

  if p_checked_in = (reg.checked_in_at is not null) then
    return reg;
  end if;

  update public.registrations
  set checked_in_at = case when p_checked_in then now() end
  where id = reg.id
  returning * into reg;

  return reg;
end;
$$;

revoke execute on function public.set_checked_in(uuid, boolean) from public, anon;
grant execute on function public.set_checked_in(uuid, boolean) to authenticated;
