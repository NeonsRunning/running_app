-- ---------------------------------------------------------------------------
-- Marking mailed kits as shipped
--
-- A runner who picked "send by mail" (20261031120000_send_by_mail.sql) had no
-- way to learn their kit was on its way. The organizer — or a platform admin
-- — now marks it shipped from the event's registration list, with the
-- carrier's tracking number if there is one, and the runner is emailed.
--
-- Marking is one-way: the email has gone out by then. A tracking number can
-- still be added or corrected afterwards, which sends nothing: the email is
-- claimed through `shipping_email_sent_at` (an update guarded by `is null`),
-- as the confirmation email is, so it goes out once.
--
-- Written through `mark_kit_shipped()`, and the claim by the server with the
-- service role.
-- ---------------------------------------------------------------------------

alter table public.registrations
  add column shipped_at timestamptz,
  add column shipping_tracking text
    check (char_length(shipping_tracking) <= 100),
  add column shipping_email_sent_at timestamptz;

comment on column public.registrations.shipped_at is
  'When the organizer marked the mailed kit as shipped. Null until then.';
comment on column public.registrations.shipping_tracking is
  'The carrier''s tracking number for the mailed kit, if the organizer gave one.';
comment on column public.registrations.shipping_email_sent_at is
  'When the "kit shipped" email was handed to Brevo. Null until then.';

-- ---------------------------------------------------------------------------
-- mark_kit_shipped(): mark a confirmed, mailed sign-up as shipped, or update
-- the tracking number of one already shipped. Errors:
--
--   notAllowed           not the event's organizer or a platform admin
--   registrationMissing  no such confirmed sign-up (removed meanwhile)
--   notMailed            the runner picks their kit up
--   trackingTooLong      over 100 characters
-- ---------------------------------------------------------------------------

create or replace function public.mark_kit_shipped(
  p_registration_id uuid,
  p_tracking text default null
)
returns public.registrations
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  v_tracking text := nullif(btrim(coalesce(p_tracking, '')), '');
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

  select * into ev from public.events where id = reg.event_id;
  if ev.organizer_id <> uid and not public.is_platform_admin() then
    raise exception 'notAllowed' using errcode = 'P0001';
  end if;

  if reg.status <> 'confirmed' then
    raise exception 'registrationMissing' using errcode = 'P0001';
  end if;

  if not reg.ships_by_mail then
    raise exception 'notMailed' using errcode = 'P0001';
  end if;

  if char_length(v_tracking) > 100 then
    raise exception 'trackingTooLong' using errcode = 'P0001';
  end if;

  update public.registrations set
    shipped_at = coalesce(shipped_at, now()),
    shipping_tracking = v_tracking
  where id = reg.id
  returning * into reg;

  return reg;
end;
$$;

revoke execute on function public.mark_kit_shipped(uuid, text) from public, anon;
grant execute on function public.mark_kit_shipped(uuid, text) to authenticated;
