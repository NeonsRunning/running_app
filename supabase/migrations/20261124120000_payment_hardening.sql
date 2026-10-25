-- ---------------------------------------------------------------------------
-- Payment hardening: the hold cap across lapses, ATH Móvil references, and
-- payments that arrive after registration closed
--
-- 1. The hold cap, across lapses. A checkout hold lasts at most 2 hours from
--    `hold_started_at`, then waits 15 minutes before another can start
--    (20261118120100_registration_lifecycle). But the wait only applied to a
--    hold that ran all the way to its cap: one left to lapse a minute before
--    it, and restarted straight away, began a fresh 2 hours — so a script
--    could hold a spot forever. Now a hold restarted less than 15 minutes
--    after the last one ended *is* the last one: it keeps its original start,
--    and the cap counts from there. Only a real 15-minute gap, in which the
--    spot was open to everyone else, starts the clock again.
--
-- 2. Rejected ATH Móvil references. Submitting a reference holds the spot
--    until someone reviews it, and a rejection only cleared the submission,
--    so a made-up reference could be sent again the moment it was turned
--    down, and again, keeping the spot held through every review. A sign-up
--    now counts its rejections (`payment_rejections`) and takes no more
--    references after 3. Error: `referenceLimitReached`.
--
--    The hold itself stays open-ended while a submission waits: the runner
--    may well have sent real money, and a hold that lapsed under review
--    would let the race sell their spot before anyone looked. What bounds a
--    fake reference is the review — each one holds one spot, one sign-up per
--    runner, until a person turns it down — and this cap on how often that
--    can happen. (The server action is rate-limited as well.)
--
--    A rejection also ends the card-hold history (`hold_started_at` goes),
--    so a runner whose reference was turned down can go back to paying by
--    card without tripping the hold cap from a checkout days ago.
--
-- 3. One reference, one sign-up, across events. The reused-reference check
--    looks at every sign-up paid into the same ATH Móvil account, but it ran
--    under the event's lock only: two events sharing an account could accept
--    the same receipt at the same moment. The submission now locks the
--    account's row first, so checks for one account run one at a time.
--    (No unique index: a rejected row keeps its reference, and rows written
--    before this check existed may already share one.)
--
-- 4. Payments after registration closed. `confirm_registration_payment()`
--    and `submit_ath_movil_payment()` confirmed or held a spot on a race no
--    longer taking sign-ups — a card payment opened before it closed, or was
--    unpublished, and paid after. Both now refuse, with the same island-date
--    rule and errors as `register_for_event()`: `eventUnavailable` for a race
--    that is not published, `registrationClosed` outside its window. A card
--    payment refused this way is refunded by `settlePayment()`. A payment
--    that already confirmed its sign-up is still returned as before: a
--    replay must not turn into a refund.
-- ---------------------------------------------------------------------------

alter table public.registrations
  add column payment_rejections smallint not null default 0
    check (payment_rejections >= 0);

comment on column public.registrations.payment_rejections is
  'How many ATH Móvil references submitted for this sign-up were rejected. After 3 it takes no more.';

-- ---------------------------------------------------------------------------
-- register_for_event(): as before (20261122120000_medal_pickup), with the
-- hold cap counted across lapses (1 above). Errors unchanged.
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
  medal_mail boolean := coalesce((p_details ->> 'medal_by_mail')::boolean, false);
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

  -- Where this hold starts. A live hold, or one that ended less than 15
  -- minutes ago, is the same hold and keeps its original start: letting it
  -- lapse just short of the cap and coming straight back does not start the
  -- 2 hours again. A gap of 15 minutes or more — the spot was open to others
  -- all that time — or no hold before, starts afresh.
  hold_start := case
    when own.hold_started_at is not null
         and own.hold_expires_at > now() - interval '15 minutes'
      then own.hold_started_at
    else now()
  end;

  -- A hold that has used its 2 hours waits out those 15 minutes, counted
  -- from when it ended, before another starts.
  if hold_start + interval '2 hours' <= now() then
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
     or (medal_mail and not ev.mails_medals)
  then
    raise exception 'extrasChanged' using errcode = 'P0001';
  end if;

  if size is not null and not (size = any (ev.shirt_sizes)) then
    raise exception 'shirtSizeUnavailable' using errcode = 'P0001';
  end if;

  if gift < 0 or gift > 1000 then
    raise exception 'donationInvalid' using errcode = 'P0001';
  end if;

  if (mail or medal_mail)
     and (address is null or char_length(address) > 300)
  then
    raise exception 'mailingAddressInvalid' using errcode = 'P0001';
  end if;

  -- Category price, the event's extras, the $2.00 service fee
  -- (`SERVICE_FEE` in lib/events/pricing.ts) and shipping and handling are
  -- taxed at 11.5% (`SALES_TAX_RATE`); the donation is not. A mailed medal
  -- is part of the entry, so it adds nothing.
  taxable := cat.price
    + case when size is not null then ev.shirt_price else 0 end
    + case when photos then ev.photo_price else 0 end
    + fee
    + case when mail then ev.shipping_price else 0 end;
  tax := round(taxable * 0.115, 2);
  total := taxable + tax + gift;

  if own.id is null then
    insert into public.registrations (
      event_id, category_id, runner_id, status, hold_started_at, hold_expires_at,
      first_name, last_name, email, phone, birth_date, gender,
      emergency_contact_name, emergency_contact_phone, club,
      shirt_size, wants_photos, donation, ships_by_mail, mailing_address,
      medal_by_mail, medal_mailing_address, service_fee, sales_tax, amount
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
      medal_mail, case when medal_mail then address end,
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
      medal_by_mail = medal_mail,
      medal_mailing_address = case when medal_mail then address end,
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
-- confirm_registration_payment(): as before (20261118120100_registration_lifecycle),
-- refusing a race that is no longer taking sign-ups (4 above). A sign-up
-- already confirmed or cancelled is still returned first, as it is.
-- New errors, both refunded by `settlePayment()`:
--
--   eventUnavailable    the race is not published
--   registrationClosed  outside its registration window, on the island's date
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
  today date := (now() at time zone 'America/Puerto_Rico')::date;
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

  -- The same checks `register_for_event()` makes.
  if ev.status <> 'published' then
    raise exception 'eventUnavailable' using errcode = 'P0001';
  end if;

  if today > ev.registration_closes
     or (ev.registration_opens is not null and today < ev.registration_opens)
  then
    raise exception 'registrationClosed' using errcode = 'P0001';
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
-- submit_ath_movil_payment(): as before (20261118120100_registration_lifecycle),
-- with the race's window (4), the rejection cap (2) and the reused-reference
-- check serialized per account (3). New errors:
--
--   eventUnavailable       the race is not published
--   registrationClosed     outside its registration window
--   referenceLimitReached  3 references for this sign-up were rejected
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
  today date := (now() at time zone 'America/Puerto_Rico')::date;
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

  -- The account's row is locked as well, after the event's: references are
  -- unique per account, and other events may be paid into the same one.
  -- `no key update` is enough to queue the next submission behind this one
  -- without blocking writes that merely point at the account.
  perform 1 from public.ath_movil_accounts a
  where a.id = ev.ath_movil_account_id and a.active
  for no key update;
  if not found then
    raise exception 'athMovilUnavailable' using errcode = 'P0001';
  end if;

  if reg.status = 'confirmed' then
    raise exception 'alreadyRegistered' using errcode = 'P0001';
  end if;
  if reg.payment_submitted_at is not null then
    raise exception 'paymentUnderReview' using errcode = 'P0001';
  end if;

  -- The same checks `register_for_event()` makes.
  if ev.status <> 'published' then
    raise exception 'eventUnavailable' using errcode = 'P0001';
  end if;

  if today > ev.registration_closes
     or (ev.registration_opens is not null and today < ev.registration_opens)
  then
    raise exception 'registrationClosed' using errcode = 'P0001';
  end if;

  if reg.payment_rejections >= 3 then
    raise exception 'referenceLimitReached' using errcode = 'P0001';
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
    -- Held until someone reviews it; see 2 above for why it has no end.
    hold_expires_at = 'infinity'
  where id = reg.id
  returning * into reg;

  return reg;
end;
$$;

-- ---------------------------------------------------------------------------
-- review_ath_movil_payment(): as before (20261118120200_ath_movil_account_owners),
-- with a rejection counted, and ending the card-hold history (2 above).
-- Errors unchanged.
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
