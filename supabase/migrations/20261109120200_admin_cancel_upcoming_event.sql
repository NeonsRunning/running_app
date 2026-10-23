-- ---------------------------------------------------------------------------
-- Admins removing an upcoming event that runners have paid for
--
-- 20261109120100_admin_remove_event refused to remove a race not yet run
-- once runners had paid (`eventNotFinished`). Admins need to take such an
-- event down too — a cancellation. Refunds stay a manual step, as when an
-- organizer removes a registration: the admin page warns that they are owed.
--
-- A payment still under review keeps blocking: someone has to look at it.
-- Otherwise unchanged.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- admin_remove_event(): hide a published event. Errors:
--
--   notAllowed           not a platform admin
--   eventNotFound        no such published event (drafts are the organizer's)
--   alreadyRemoved       removed already
--   reasonRequired       no reason, or over 500 characters
--   paymentsUnderReview  an ATH Móvil payment waits for review
-- ---------------------------------------------------------------------------

create or replace function public.admin_remove_event(
  p_event_id uuid,
  p_reason text
)
returns public.events
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  v_reason text := btrim(coalesce(p_reason, ''));
  ev public.events;
begin
  if uid is null or not public.is_platform_admin() then
    raise exception 'notAllowed' using errcode = 'P0001';
  end if;

  if v_reason = '' or char_length(v_reason) > 500 then
    raise exception 'reasonRequired' using errcode = 'P0001';
  end if;

  -- The same lock sign-ups and reviews take.
  select * into ev from public.events where id = p_event_id for update;

  if ev.id is null or ev.status = 'draft' then
    raise exception 'eventNotFound' using errcode = 'P0001';
  end if;
  if ev.status = 'removed' then
    raise exception 'alreadyRemoved' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.registrations r
    where r.event_id = p_event_id
      and r.status = 'pending'
      and r.payment_submitted_at is not null
  ) then
    raise exception 'paymentsUnderReview' using errcode = 'P0001';
  end if;

  -- A Stripe payment that lands after its row is gone is refunded in full by
  -- `settlePayment()`, as on delete.
  delete from public.registrations
  where event_id = p_event_id and status = 'pending';

  update public.events set status = 'removed'
  where id = p_event_id
  returning * into ev;

  insert into public.event_moderation_log
    (event_id, event_name, event_slug, action, reason, actor_id)
  values (ev.id, ev.name, ev.slug, 'removed', v_reason, uid);

  return ev;
end;
$$;
