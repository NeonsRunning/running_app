-- ---------------------------------------------------------------------------
-- Organizers remove runners from their own events
--
-- The event's organizer — or a platform admin — can take a completed sign-up
-- off the list from the event page. The row is deleted outright: the spot goes
-- back to the race and the runner can sign up again from the register page.
-- Bibs are max + 1, so the removed bib stays unused unless it was the highest.
--
-- Money is not moved here. A card payment is refunded from Stripe and an ATH
-- Móvil payment from the ATH Móvil Business app, by a person, as before.
--
-- Organizers only read registrations through RLS, so the delete goes through
-- this function rather than a policy. Errors:
--
--   notAllowed           neither the event's organizer nor a platform admin
--   registrationMissing  no completed registration with this id
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
