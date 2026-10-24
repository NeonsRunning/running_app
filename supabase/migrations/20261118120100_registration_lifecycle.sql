-- ---------------------------------------------------------------------------
-- Registration lifecycle: cancelling instead of deleting, refunds and
-- disputes, capped checkout holds, and the island's calendar
--
-- 1. Cancelled, not deleted. `remove_registration()` used to delete a paid
--    sign-up outright. The refund is a separate, manual step, so the row it
--    needs — the PaymentIntent, what was paid, the fee and the tax — was gone
--    by the time someone came to issue it, and the organizer's revenue
--    changed after the fact. A removed runner is now 'cancelled': the row
--    stays, with who cancelled it and when, and stops holding a spot. The
--    runner can sign up again, as before, with a new row.
--
--    One live registration per runner and event, not one row: the unique
--    constraint becomes a partial unique index that ignores cancelled rows.
--    A cancelled row keeps its bib, which is never handed out again (bibs
--    are max + 1 over every row).
--
--    An event with a cancelled — that is, once paid — registration can no
--    longer be deleted by its organizer; an admin removes it instead, which
--    keeps the record.
--
-- 2. Refunds and disputes. Stripe refunds and chargebacks happen in the
--    Stripe dashboard, and the database never heard of them. The webhook now
--    records them on the registration they belong to (`amount_refunded`,
--    `refunded_at`, `disputed_at`, `dispute_status`). Status is left alone:
--    a partial refund is not a cancellation, and removing the runner stays a
--    person's decision.
--
-- 3. Capped card holds. A checkout holds a spot for 30 minutes, renewed each
--    time the runner goes back and changes something — which a script could
--    do forever, keeping a spot from everyone else. A hold now lasts at most
--    2 hours from when it started (`hold_started_at`); once it hits that cap
--    and lapses, the same runner can start a new one only after 15 minutes,
--    so the spot is open to others in between. Error: `holdLimitReached`.
--    ATH Móvil submissions keep holding their spot until reviewed.
--
-- 4. Reused ATH Móvil references. A reference number already submitted on
--    another sign-up for the same ATH Móvil account is refused: a real
--    receipt pays for one sign-up. Error: `referenceUsed`.
--
-- 5. The island's calendar. `register_for_event()` compared against
--    `current_date`, which is UTC's: registration closed at 20:00 island
--    time on its last day, and opened at 20:00 the day before.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Columns and constraints
-- ---------------------------------------------------------------------------

alter table public.registrations
  add column cancelled_at timestamptz,
  add column cancelled_by uuid references auth.users (id) on delete set null,
  add column hold_started_at timestamptz,
  add column amount_refunded numeric(8, 2) not null default 0
    check (amount_refunded >= 0),
  add column refunded_at timestamptz,
  add column disputed_at timestamptz,
  add column dispute_status text check (char_length(dispute_status) <= 40);

comment on column public.registrations.cancelled_at is
  'When the organizer or an admin took the runner off the event. The row is kept as the record of the payment.';
comment on column public.registrations.hold_started_at is
  'When the current checkout hold began; a hold lasts at most 2 hours from here.';
comment on column public.registrations.amount_refunded is
  'Dollars refunded through Stripe on the payment that confirmed this registration. Written by the webhook.';
comment on column public.registrations.dispute_status is
  'The Stripe dispute status on that payment, if the runner''s bank disputed it.';

-- A bib comes with confirmation; a cancelled registration keeps the one it had.
alter table public.registrations drop constraint registrations_bib_when_confirmed;
alter table public.registrations add constraint registrations_bib_by_status check (
  (status = 'pending' and bib is null)
  or (status = 'confirmed' and bib is not null)
  or status = 'cancelled'
);

alter table public.registrations add constraint registrations_cancelled_stamped
  check ((status = 'cancelled') = (cancelled_at is not null));

-- One live registration per runner and event; cancelled ones don't count.
alter table public.registrations drop constraint registrations_event_id_runner_id_key;
create unique index registrations_one_live_per_runner
  on public.registrations (event_id, runner_id)
  where status <> 'cancelled';

-- The reused-reference check.
create index registrations_ath_reference_idx
  on public.registrations (ath_movil_account_id, lower(payment_reference))
  where payment_reference is not null;

-- ---------------------------------------------------------------------------
-- register_for_event(): as before (20261104120000_service_fee_and_sales_tax),
-- with the island's date, cancelled rows ignored, and the hold cap.
-- ---------------------------------------------------------------------------

create or replace function public.register_for_event(
  p_category_id uuid,
  p_details jsonb
)
returns public.registrations
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  today date := (now() at time zone 'America/Puerto_Rico')::date;
  cat public.event_categories;
  ev public.events;
  reg public.registrations;
  own public.registrations;
  birth date;
  runner_age integer;
  size public.shirt_size;
  photos boolean := coalesce((p_details ->> 'wants_photos')::boolean, false);
  gift numeric := coalesce((p_details ->> 'donation')::numeric, 0);
  mail boolean := coalesce((p_details ->> 'ships_by_mail')::boolean, false);
  address text := nullif(trim(coalesce(p_details ->> 'mailing_address', '')), '');
  fee numeric := 2.00;
  taxable numeric;
  tax numeric;
  total numeric;
  hold_start timestamptz;
begin
  if uid is null then
    raise exception 'sessionExpired' using errcode = 'P0001';
  end if;

  select * into cat from public.event_categories where id = p_category_id;
  if cat.id is null then
    raise exception 'eventUnavailable' using errcode = 'P0001';
  end if;

  -- One lock per event serializes its sign-ups and confirmations.
  select * into ev from public.events where id = cat.event_id for update;

  if ev.status <> 'published' then
    raise exception 'eventUnavailable' using errcode = 'P0001';
  end if;

  if today > ev.registration_closes
     or (ev.registration_opens is not null and today < ev.registration_opens)
  then
    raise exception 'registrationClosed' using errcode = 'P0001';
  end if;

  select * into own from public.registrations
  where event_id = ev.id and runner_id = uid and status <> 'cancelled';

  if own.status = 'confirmed' then
    raise exception 'alreadyRegistered' using errcode = 'P0001';
  end if;

  if own.payment_submitted_at is not null then
    raise exception 'paymentUnderReview' using errcode = 'P0001';
  end if;

  -- A hold that ran to its 2-hour cap waits 15 minutes before another starts.
  if own.id is not null
     and own.hold_started_at is not null
     and own.hold_expires_at >= own.hold_started_at + interval '2 hours'
     and own.hold_expires_at <= now()
     and own.hold_expires_at > now() - interval '15 minutes'
  then
    raise exception 'holdLimitReached' using errcode = 'P0001';
  end if;

  if (select count(*) from public.registrations r
      where r.category_id = cat.id and r.runner_id <> uid
        and (r.status = 'confirmed' or r.hold_expires_at > now()))
       >= cat.capacity
     or (ev.capacity is not null and
         (select count(*) from public.registrations r
          where r.event_id = ev.id and r.runner_id <> uid
            and (r.status = 'confirmed' or r.hold_expires_at > now()))
           >= ev.capacity)
  then
    raise exception 'soldOut' using errcode = 'P0001';
  end if;

  birth := (p_details ->> 'birth_date')::date;
  runner_age := extract(year from age(ev.event_date, birth))::integer;
  if runner_age < ev.minimum_age
     or (ev.maximum_age is not null and runner_age > ev.maximum_age)
  then
    raise exception 'ageNotEligible' using errcode = 'P0001';
  end if;

  size := nullif(p_details ->> 'shirt_size', '')::public.shirt_size;

  if (size is not null and not ev.offers_shirt)
     or (photos and not ev.offers_photos)
     or (gift > 0 and not ev.accepts_donations)
     or (mail and not ev.offers_mail)
  then
    raise exception 'extrasChanged' using errcode = 'P0001';
  end if;

  if size is not null and not (size = any (ev.shirt_sizes)) then
    raise exception 'shirtSizeUnavailable' using errcode = 'P0001';
  end if;

  if gift < 0 or gift > 1000 then
    raise exception 'donationInvalid' using errcode = 'P0001';
  end if;

  if mail and (address is null or char_length(address) > 300) then
    raise exception 'mailingAddressInvalid' using errcode = 'P0001';
  end if;

  -- Category price, the event's extras, the $2.00 service fee
  -- (`SERVICE_FEE` in lib/events/pricing.ts) and shipping and handling are
  -- taxed at 11.5% (`SALES_TAX_RATE`); the donation is not.
  taxable := cat.price
    + case when size is not null then ev.shirt_price else 0 end
    + case when photos then ev.photo_price else 0 end
    + fee
    + case when mail then ev.shipping_price else 0 end;
  tax := round(taxable * 0.115, 2);
  total := taxable + tax + gift;

  -- A live hold keeps its start; a lapsed one, or none, starts afresh.
  hold_start := case
    when own.hold_expires_at > now() then coalesce(own.hold_started_at, own.created_at)
    else now()
  end;

  if own.id is null then
    insert into public.registrations (
      event_id, category_id, runner_id, status, hold_started_at, hold_expires_at,
      first_name, last_name, email, phone, birth_date, gender,
      emergency_contact_name, emergency_contact_phone, club,
      shirt_size, wants_photos, donation, ships_by_mail, mailing_address,
      service_fee, sales_tax, amount
    ) values (
      ev.id, cat.id, uid, 'pending', hold_start, hold_start + interval '30 minutes',
      trim(p_details ->> 'first_name'),
      trim(p_details ->> 'last_name'),
      trim(p_details ->> 'email'),
      trim(p_details ->> 'phone'),
      birth,
      (p_details ->> 'gender')::public.profile_gender,
      trim(p_details ->> 'emergency_contact_name'),
      trim(p_details ->> 'emergency_contact_phone'),
      nullif(trim(coalesce(p_details ->> 'club', '')), ''),
      size, photos, gift, mail, case when mail then address end,
      fee, tax, total
    )
    returning * into reg;
  else
    update public.registrations set
      category_id = cat.id,
      hold_started_at = hold_start,
      hold_expires_at = least(
        now() + interval '30 minutes',
        hold_start + interval '2 hours'
      ),
      first_name = trim(p_details ->> 'first_name'),
      last_name = trim(p_details ->> 'last_name'),
      email = trim(p_details ->> 'email'),
      phone = trim(p_details ->> 'phone'),
      birth_date = birth,
      gender = (p_details ->> 'gender')::public.profile_gender,
      emergency_contact_name = trim(p_details ->> 'emergency_contact_name'),
      emergency_contact_phone = trim(p_details ->> 'emergency_contact_phone'),
      club = nullif(trim(coalesce(p_details ->> 'club', '')), ''),
      shirt_size = size,
      wants_photos = photos,
      donation = gift,
      ships_by_mail = mail,
      mailing_address = case when mail then address end,
      service_fee = fee,
      sales_tax = tax,
      amount = total
    where id = own.id
    returning * into reg;
  end if;

  return reg;
end;
$$;

-- ---------------------------------------------------------------------------
-- confirm_registration_payment(): as before (20261026120000_ath_movil_payments),
-- but a cancelled registration is returned as it is. A late or replayed
-- webhook for the payment that confirmed it must not bring it back.
-- ---------------------------------------------------------------------------

create or replace function public.confirm_registration_payment(
  p_registration_id uuid,
  p_payment_intent_id text,
  p_amount_cents bigint
)
returns public.registrations
language plpgsql
security definer
set search_path = ''
as $$
declare
  reg public.registrations;
  cat public.event_categories;
  ev public.events;
begin
  select * into reg from public.registrations where id = p_registration_id;
  if reg.id is null then
    raise exception 'registrationMissing' using errcode = 'P0001';
  end if;

  select * into ev from public.events where id = reg.event_id for update;
  -- Re-read under the lock: another confirmation may have just landed.
  select * into reg from public.registrations where id = p_registration_id;

  if reg.status in ('confirmed', 'cancelled') then
    return reg;
  end if;

  if reg.payment_submitted_at is not null then
    raise exception 'paymentUnderReview' using errcode = 'P0001';
  end if;

  if round(reg.amount * 100) <> p_amount_cents then
    raise exception 'amountMismatch' using errcode = 'P0001';
  end if;

  -- A live hold already reserved the spot. An expired one has to find room.
  if reg.hold_expires_at is null or reg.hold_expires_at <= now() then
    select * into cat from public.event_categories where id = reg.category_id;
    if (select count(*) from public.registrations r
        where r.category_id = cat.id and r.id <> reg.id
          and (r.status = 'confirmed' or r.hold_expires_at > now()))
         >= cat.capacity
       or (ev.capacity is not null and
           (select count(*) from public.registrations r
            where r.event_id = ev.id and r.id <> reg.id
              and (r.status = 'confirmed' or r.hold_expires_at > now()))
             >= ev.capacity)
    then
      raise exception 'soldOut' using errcode = 'P0001';
    end if;
  end if;

  update public.registrations set
    status = 'confirmed',
    bib = (select coalesce(max(bib), 1000) + 1
           from public.registrations where event_id = reg.event_id),
    payment_method = 'stripe',
    payment_intent_id = p_payment_intent_id,
    paid_at = now(),
    hold_expires_at = null
  where id = reg.id
  returning * into reg;

  return reg;
end;
$$;

-- ---------------------------------------------------------------------------
-- submit_ath_movil_payment(): as before (20261103120000_ath_movil_accounts),
-- refusing a cancelled sign-up and a reference already used on another.
-- ---------------------------------------------------------------------------

create or replace function public.submit_ath_movil_payment(
  p_registration_id uuid,
  p_reference text
)
returns public.registrations
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  reg public.registrations;
  cat public.event_categories;
  ev public.events;
  ref text := nullif(trim(coalesce(p_reference, '')), '');
begin
  if uid is null then
    raise exception 'sessionExpired' using errcode = 'P0001';
  end if;

  if ref is null or char_length(ref) > 40 then
    raise exception 'referenceInvalid' using errcode = 'P0001';
  end if;

  select * into reg from public.registrations
  where id = p_registration_id and runner_id = uid;
  if reg.id is null then
    raise exception 'registrationMissing' using errcode = 'P0001';
  end if;

  select * into ev from public.events where id = reg.event_id for update;
  select * into reg from public.registrations where id = p_registration_id;

  if reg.status = 'cancelled' then
    raise exception 'registrationMissing' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.ath_movil_accounts a
    where a.id = ev.ath_movil_account_id and a.active
  ) then
    raise exception 'athMovilUnavailable' using errcode = 'P0001';
  end if;

  if reg.status = 'confirmed' then
    raise exception 'alreadyRegistered' using errcode = 'P0001';
  end if;
  if reg.payment_submitted_at is not null then
    raise exception 'paymentUnderReview' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.registrations r
    where r.id <> reg.id
      and r.ath_movil_account_id = ev.ath_movil_account_id
      and lower(r.payment_reference) = lower(ref)
  ) then
    raise exception 'referenceUsed' using errcode = 'P0001';
  end if;

  if reg.hold_expires_at is null or reg.hold_expires_at <= now() then
    select * into cat from public.event_categories where id = reg.category_id;
    if (select count(*) from public.registrations r
        where r.category_id = cat.id and r.id <> reg.id
          and (r.status = 'confirmed' or r.hold_expires_at > now()))
         >= cat.capacity
       or (ev.capacity is not null and
           (select count(*) from public.registrations r
            where r.event_id = ev.id and r.id <> reg.id
              and (r.status = 'confirmed' or r.hold_expires_at > now()))
             >= ev.capacity)
    then
      raise exception 'soldOut' using errcode = 'P0001';
    end if;
  end if;

  update public.registrations set
    payment_method = 'ath_movil',
    payment_reference = ref,
    payment_submitted_at = now(),
    payment_rejected_at = null,
    ath_movil_account_id = ev.ath_movil_account_id,
    -- Held until an admin reviews it.
    hold_expires_at = 'infinity'
  where id = reg.id
  returning * into reg;

  return reg;
end;
$$;

-- ---------------------------------------------------------------------------
-- remove_registration(): cancel rather than delete. As before
-- (20261111120000_keep_registrations_with_results) otherwise: the event's
-- organizer or an admin, a confirmed registration, not one with an accepted
-- result. A pending or sent-back result for it goes, as the cascade used to
-- take it. Errors unchanged.
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

  -- The same lock sign-ups and reviews take.
  select * into ev from public.events where id = reg.event_id for update;

  if ev.organizer_id <> uid and not public.is_platform_admin() then
    raise exception 'notAllowed' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.race_results r
    where r.registration_id = p_registration_id and r.status = 'accepted'
  ) then
    raise exception 'resultAccepted' using errcode = 'P0001';
  end if;

  update public.registrations set
    status = 'cancelled',
    cancelled_at = now(),
    cancelled_by = uid,
    hold_expires_at = null
  where id = p_registration_id and status = 'confirmed'
  returning * into reg;

  if reg.id is null then
    raise exception 'registrationMissing' using errcode = 'P0001';
  end if;

  delete from public.race_results where registration_id = reg.id;

  return reg;
end;
$$;

-- ---------------------------------------------------------------------------
-- delete_event(): as before (20261109120100_admin_remove_event), but a
-- cancelled registration — one that was paid — also keeps the event.
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
  select * into ev from public.events where id = p_event_id for update;

  if uid is null or ev.id is null or ev.organizer_id <> uid
     or ev.status = 'removed' then
    raise exception 'eventNotFound' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.registrations r
    where r.event_id = p_event_id
      and (r.status in ('confirmed', 'cancelled') or r.payment_submitted_at is not null)
  ) then
    raise exception 'eventHasRegistrations' using errcode = 'P0001';
  end if;

  delete from public.registrations
  where event_id = p_event_id and status = 'pending';

  delete from public.events where id = p_event_id returning * into ev;
  return ev;
end;
$$;
