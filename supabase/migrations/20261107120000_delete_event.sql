-- ---------------------------------------------------------------------------
-- Deleting an event that only has unpaid sign-ups
--
-- Registrations hold their event in place (`on delete restrict`), so a single
-- abandoned checkout used to block deleting a race the dashboard shows as
-- having no runners: a pending row with a Stripe payment opened stays for
-- 7 days after its hold lapses (20261106120000_purge_abandoned_registrations).
--
-- The organizer now deletes through this function, which clears the pending
-- rows first. Refused while anyone has paid, or says they have:
--
--   * a confirmed registration — a runner on the list;
--   * a pending row with `payment_submitted_at` — an ATH Móvil payment waiting
--     for review, money that a person has to look at.
--
-- A Stripe payment that lands after its row is gone finds no registration in
-- `confirm_registration_payment()` and `settlePayment()` refunds it in full.
--
-- Organizers only read registrations through RLS, so the delete goes through
-- this function rather than a policy. Errors:
--
--   eventNotFound          no such event, or not the caller's
--   eventHasRegistrations  paid, or payment under review
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
  -- The same lock sign-ups and reviews take, so no checkout starts against an
  -- event that is going away.
  select * into ev from public.events where id = p_event_id for update;

  -- Same answer as a stranger's event, so ids cannot be probed.
  if uid is null or ev.id is null or ev.organizer_id <> uid then
    raise exception 'eventNotFound' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.registrations r
    where r.event_id = p_event_id
      and (r.status = 'confirmed' or r.payment_submitted_at is not null)
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
