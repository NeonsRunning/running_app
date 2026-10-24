-- ---------------------------------------------------------------------------
-- Who may approve an ATH Móvil payment
--
-- An ATH Móvil payment is approved by someone looking for the money in the
-- ATH Móvil Business app. Until now the event's organizer could approve
-- payments into any account an admin had listed — including the platform's
-- own, which the organizer cannot see. So an organizer could confirm
-- sign-ups nobody paid for.
--
-- An account now has an optional owner, set by a platform admin: the person
-- who holds that business app. The event's organizer approves or rejects a
-- payment only when it went into an account they own. Everything else waits
-- for a platform admin, as the cross-event queue at /admin/payments already
-- allows. The account is the one recorded on the registration when the
-- runner submitted their reference, not whatever the event uses now.
--
-- Undoing an approval (`return_registration_to_pending()`) stays open to the
-- organizer: it takes a runner off the confirmed list, which they can
-- already do, and moves no money.
-- ---------------------------------------------------------------------------

alter table public.ath_movil_accounts
  add column owner_id uuid references public.profiles (id) on delete set null;

comment on column public.ath_movil_accounts.owner_id is
  'Who holds this ATH Móvil Business account. They may approve payments into it for their own events; null leaves review to platform admins.';

-- Admins set it through the existing insert and update policies, which only
-- let platform admins write this table.

-- Whether the caller may approve or reject this registration's ATH Móvil
-- payment: a platform admin, or the event's organizer when the money went
-- into an account they own. The organizer's panel asks this before offering
-- the buttons; `review_ath_movil_payment()` decides the same way.
create or replace function public.can_review_ath_movil_payment(p_registration_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_platform_admin() or exists (
    select 1
    from public.registrations r
    join public.events e on e.id = r.event_id
    join public.ath_movil_accounts a on a.id = r.ath_movil_account_id
    where r.id = p_registration_id
      and e.organizer_id = (select auth.uid())
      and a.owner_id = (select auth.uid())
  );
$$;

revoke execute on function public.can_review_ath_movil_payment(uuid) from public, anon;
grant execute on function public.can_review_ath_movil_payment(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- review_ath_movil_payment(): as before (20261027120000_organizer_payment_review),
-- with the rule above. Errors unchanged:
--
--   notAllowed           not allowed to review this payment
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

  if not public.can_review_ath_movil_payment(p_registration_id) then
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
