-- ---------------------------------------------------------------------------
-- A payment is reviewed as the reviewer saw it
--
-- `review_ath_movil_payment()` answered whatever was waiting on the sign-up
-- when the call arrived. With two reviewers — the organizer and an admin —
-- one could reject a payment, the runner change an extra and send a new
-- reference, and the other, still looking at the first submission, approve
-- the second: a different reference, perhaps a different amount, unseen.
--
-- It now takes the submission's time as the reviewer's screen showed it, as
-- `review_race_result()` does for a finish time, and refuses when the sign-up
-- has been sent again since ("registrationMissing", which the app already
-- reads as "reviewed by someone else": the row leaves the list and the page
-- reloads with the new one). Left out, it reviews what is there, as before.
--
-- A new argument is a new function, so the old one is dropped and the grants
-- made again. The body is the latest definition
-- (20261124120000_payment_hardening.sql) with that one check added.
-- ---------------------------------------------------------------------------

drop function public.review_ath_movil_payment(uuid, boolean);

create function public.review_ath_movil_payment(
  p_registration_id uuid,
  p_approve boolean,
  p_submitted_at timestamptz default null
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

  if not public.can_review_ath_movil_payment(p_registration_id) then
    raise exception 'notAllowed' using errcode = 'P0001';
  end if;

  -- Re-read under the lock: the other reviewer may have just answered.
  select * into reg from public.registrations where id = p_registration_id;

  if reg.status <> 'pending' or reg.payment_submitted_at is null then
    raise exception 'registrationMissing' using errcode = 'P0001';
  end if;

  -- Rejected and sent again since the reviewer's screen was loaded: what
  -- they are answering is no longer what is waiting.
  if p_submitted_at is not null and reg.payment_submitted_at <> p_submitted_at then
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
      hold_started_at = null,
      hold_expires_at = now(),
      payment_submitted_at = null,
      payment_rejected_at = now(),
      payment_rejections = payment_rejections + 1,
      payment_reviewed_at = now(),
      payment_reviewed_by = uid
    where id = reg.id
    returning * into reg;
  end if;

  return reg;
end;
$$;

revoke execute on function public.review_ath_movil_payment(uuid, boolean, timestamptz)
  from public, anon;
grant execute on function public.review_ath_movil_payment(uuid, boolean, timestamptz)
  to authenticated;
