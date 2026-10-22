-- ---------------------------------------------------------------------------
-- Organizers confirm their own events' ATH Móvil payments
--
-- Card payments confirm themselves through Stripe. An ATH Móvil payment waits
-- for someone to find it and approve it; until now that was only a platform
-- admin. The event's organizer can now do it too, from the event page, and
-- admins keep the cross-event queue at /admin/payments as a backstop.
--
-- Organizers already read their events' registrations through RLS ("Organizers
-- read registrations for their events"), so the pending list needs no new
-- function. Only the review itself changes. Errors:
--
--   notAllowed           neither the event's organizer nor a platform admin
--   registrationMissing  no submission waiting for review with this id
-- ---------------------------------------------------------------------------

create or replace function public.review_ath_movil_payment(
  p_registration_id uuid,
  p_approve boolean
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

  select * into ev from public.events where id = reg.event_id for update;

  if ev.organizer_id <> uid and not public.is_platform_admin() then
    raise exception 'notAllowed' using errcode = 'P0001';
  end if;

  -- Re-read under the lock: the other reviewer may have just answered.
  select * into reg from public.registrations where id = p_registration_id;

  if reg.status <> 'pending' or reg.payment_submitted_at is null then
    raise exception 'registrationMissing' using errcode = 'P0001';
  end if;

  if p_approve then
    update public.registrations set
      status = 'confirmed',
      bib = (select coalesce(max(bib), 1000) + 1
             from public.registrations where event_id = reg.event_id),
      paid_at = now(),
      hold_expires_at = null,
      payment_reviewed_at = now(),
      payment_reviewed_by = uid
    where id = reg.id
    returning * into reg;
  else
    update public.registrations set
      hold_expires_at = now(),
      payment_submitted_at = null,
      payment_rejected_at = now(),
      payment_reviewed_at = now(),
      payment_reviewed_by = uid
    where id = reg.id
    returning * into reg;
  end if;

  return reg;
end;
$$;

-- The organizer's pending list filters on the event.
create index registrations_event_awaiting_review_idx
  on public.registrations (event_id, payment_submitted_at)
  where status = 'pending' and payment_submitted_at is not null;
