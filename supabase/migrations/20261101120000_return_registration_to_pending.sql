-- ---------------------------------------------------------------------------
-- Organizers put an ATH Móvil sign-up back to pending
--
-- An ATH Móvil payment confirmed by mistake — approved before the money was
-- found, or against the wrong runner — can be undone from the event page. The
-- registration goes back to the review queue exactly as the runner left it:
-- pending, submission and reference kept, its spot still held. The bib is
-- given up (bibs are tied to confirmation), so approving it again hands out
-- the next free one, and the confirmation email goes out again with it.
--
-- Card payments are not eligible: Stripe confirmed them, and a pending card
-- sign-up would let the runner pay a second time.
--
-- Errors:
--
--   notAllowed           neither the event's organizer nor a platform admin
--   registrationMissing  no completed registration with this id
--   notAthMovil          the registration was paid by card
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
