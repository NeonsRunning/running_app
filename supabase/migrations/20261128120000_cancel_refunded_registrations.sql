-- ---------------------------------------------------------------------------
-- Cancelling a sign-up whose card payment was taken back
--
-- A refund in full from the Stripe dashboard, or a chargeback the runner
-- won, left the registration confirmed: the runner kept a bib and a spot
-- they no longer paid for, and counted in the organizer's totals. The
-- webhook only stamped `amount_refunded` and `dispute_status`
-- (20261118120100_registration_lifecycle, §2), and someone had to remove the
-- runner by hand.
--
-- `cancel_unpaid_registration()` does that removal for the webhook, as
-- `remove_registration()` does for an organizer: under the event lock, the
-- confirmed row is cancelled and a result still waiting on review goes with
-- it. A result already accepted or disqualified keeps the row as it is —
-- the runner raced, and a person decides what happens to that result.
-- Partial refunds (an extra taken back, say) change nothing.
--
-- Service role only: the webhook calls it once Stripe's signature checks
-- out. Returns the cancelled row, or null when there was nothing to cancel.
-- ---------------------------------------------------------------------------

create or replace function public.cancel_unpaid_registration(p_payment_intent_id text)
returns public.registrations
language plpgsql
security definer
set search_path = ''
as $$
declare
  reg public.registrations;
begin
  select * into reg from public.registrations
  where payment_intent_id = p_payment_intent_id
    and payment_method = 'stripe'
    and status = 'confirmed';
  if reg.id is null then
    return null;
  end if;

  -- The lock sign-ups, reviews and removals take: event, then sign-up.
  perform 1 from public.events where id = reg.event_id for update;
  select * into reg from public.registrations where id = reg.id for update;

  if reg.status <> 'confirmed'
     or exists (
       select 1 from public.race_results r
       where r.registration_id = reg.id and r.status in ('accepted', 'disqualified')
     )
  then
    return null;
  end if;

  update public.registrations set
    status = 'cancelled',
    cancelled_at = now(),
    hold_expires_at = null
  where id = reg.id
  returning * into reg;

  delete from public.race_results where registration_id = reg.id;

  return reg;
end;
$$;

revoke execute on function public.cancel_unpaid_registration(text)
  from public, anon, authenticated;
grant execute on function public.cancel_unpaid_registration(text) to service_role;
