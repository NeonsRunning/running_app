-- ---------------------------------------------------------------------------
-- Paying for a registration with ATH Móvil
--
-- Next to Stripe, a runner can pay by sending the amount to the platform's
-- ATH Móvil Business account. Nothing tells us that money arrived, so it is
-- checked by hand: a platform admin looks for the payment in the ATH Móvil
-- Business app and approves or rejects the sign-up.
--
--   1. `register_for_event()` writes the pending registration as before.
--   2. The runner sends the money and calls `submit_ath_movil_payment()`
--      with the reference number from their ATH Móvil receipt. The hold
--      becomes open-ended (`infinity`): the spot is theirs until reviewed,
--      and every capacity check that counts live holds keeps working.
--   3. An admin calls `review_ath_movil_payment()`. Approving assigns the bib
--      exactly as a Stripe confirmation does; rejecting releases the spot and
--      lets the runner start the payment again.
--
-- Admins are listed in `platform_admins`, written only from the dashboard or
-- the SQL editor:
--
--   insert into public.platform_admins (user_id)
--   select id from auth.users where email = 'someone@example.com';
-- ---------------------------------------------------------------------------

create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.platform_admins is
  'Accounts that review manual (ATH Móvil) payments. Granted by the team in the database.';

-- No policies and no grants: nobody reads or writes it through the API.
alter table public.platform_admins enable row level security;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.platform_admins a
    where a.user_id = (select auth.uid())
  );
$$;

revoke execute on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

create type public.payment_method as enum ('stripe', 'ath_movil');

alter table public.registrations
  add column payment_method public.payment_method,
  add column payment_reference text
    check (char_length(payment_reference) between 1 and 40),
  add column payment_submitted_at timestamptz,
  add column payment_reviewed_at timestamptz,
  add column payment_reviewed_by uuid references auth.users (id) on delete set null,
  add column payment_rejected_at timestamptz;

-- Rows confirmed so far were all paid through Stripe.
update public.registrations
  set payment_method = 'stripe'
  where status = 'confirmed';

comment on column public.registrations.payment_method is
  'How the runner paid, or is paying. Null until a payment is confirmed or submitted.';
comment on column public.registrations.payment_reference is
  'The reference number on the runner''s ATH Móvil receipt.';
comment on column public.registrations.payment_submitted_at is
  'When the runner said they sent an ATH Móvil payment. Set while it waits for review.';
comment on column public.registrations.payment_rejected_at is
  'When an admin last could not find the runner''s ATH Móvil payment.';

-- The review queue.
create index registrations_awaiting_review_idx
  on public.registrations (payment_submitted_at)
  where status = 'pending' and payment_submitted_at is not null;

-- ---------------------------------------------------------------------------
-- register_for_event(): unchanged, except that a sign-up whose ATH Móvil
-- payment is waiting for review cannot be repriced or paid a second time.
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
  cat public.event_categories;
  ev public.events;
  reg public.registrations;
  own public.registrations;
  birth date;
  runner_age integer;
  size public.shirt_size;
  photos boolean := coalesce((p_details ->> 'wants_photos')::boolean, false);
  gift numeric := coalesce((p_details ->> 'donation')::numeric, 0);
  total numeric;
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

  if current_date > ev.registration_closes
     or (ev.registration_opens is not null and current_date < ev.registration_opens)
  then
    raise exception 'registrationClosed' using errcode = 'P0001';
  end if;

  select * into own from public.registrations
  where event_id = ev.id and runner_id = uid;

  if own.status = 'confirmed' then
    raise exception 'alreadyRegistered' using errcode = 'P0001';
  end if;

  if own.payment_submitted_at is not null then
    raise exception 'paymentUnderReview' using errcode = 'P0001';
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
  then
    raise exception 'extrasChanged' using errcode = 'P0001';
  end if;

  if size is not null and not (size = any (ev.shirt_sizes)) then
    raise exception 'shirtSizeUnavailable' using errcode = 'P0001';
  end if;

  if gift < 0 or gift > 1000 then
    raise exception 'donationInvalid' using errcode = 'P0001';
  end if;

  -- Category price, the event's extras, donation, $2.90 service fee
  -- (`SERVICE_FEE` in lib/events/pricing.ts).
  total := cat.price
    + case when size is not null then ev.shirt_price else 0 end
    + case when photos then ev.photo_price else 0 end
    + gift
    + 2.90;

  if own.id is null then
    insert into public.registrations (
      event_id, category_id, runner_id, status, hold_expires_at,
      first_name, last_name, email, phone, birth_date, gender,
      emergency_contact_name, emergency_contact_phone, club,
      shirt_size, wants_photos, donation, amount
    ) values (
      ev.id, cat.id, uid, 'pending', now() + interval '30 minutes',
      trim(p_details ->> 'first_name'),
      trim(p_details ->> 'last_name'),
      trim(p_details ->> 'email'),
      trim(p_details ->> 'phone'),
      birth,
      (p_details ->> 'gender')::public.profile_gender,
      trim(p_details ->> 'emergency_contact_name'),
      trim(p_details ->> 'emergency_contact_phone'),
      nullif(trim(coalesce(p_details ->> 'club', '')), ''),
      size, photos, gift, total
    )
    returning * into reg;
  else
    update public.registrations set
      category_id = cat.id,
      hold_expires_at = now() + interval '30 minutes',
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
      amount = total
    where id = own.id
    returning * into reg;
  end if;

  return reg;
end;
$$;

-- ---------------------------------------------------------------------------
-- confirm_registration_payment(): as before, and records the method. A card
-- payment that lands while an ATH Móvil payment for the same sign-up waits
-- for review raises `paymentUnderReview`, which the server refunds: the ATH
-- Móvil money is already on its way to us.
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

  if reg.status = 'confirmed' then
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
-- submit_ath_movil_payment(): the runner says they sent the money.
--
-- Only on their own pending sign-up. If the 30-minute hold ran out while
-- they were in the ATH Móvil app, the spot has to still be free. Errors:
--
--   registrationMissing  not this runner's pending sign-up
--   alreadyRegistered    confirmed already
--   paymentUnderReview   submitted already
--   soldOut              the hold ran out and the spot went to someone else
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

  if reg.status = 'confirmed' then
    raise exception 'alreadyRegistered' using errcode = 'P0001';
  end if;
  if reg.payment_submitted_at is not null then
    raise exception 'paymentUnderReview' using errcode = 'P0001';
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
    -- Held until an admin reviews it.
    hold_expires_at = 'infinity'
  where id = reg.id
  returning * into reg;

  return reg;
end;
$$;

revoke execute on function public.submit_ath_movil_payment(uuid, text)
  from public, anon;
grant execute on function public.submit_ath_movil_payment(uuid, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- ath_movil_review_queue(): what an admin needs to find each payment in the
-- ATH Móvil Business app, oldest first.
-- ---------------------------------------------------------------------------

create or replace function public.ath_movil_review_queue()
returns table (
  id uuid,
  event_name text,
  event_date date,
  first_name text,
  last_name text,
  email text,
  phone text,
  amount numeric,
  payment_reference text,
  payment_submitted_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'notAdmin' using errcode = 'P0001';
  end if;

  return query
    select r.id, e.name, e.event_date, r.first_name, r.last_name, r.email,
           r.phone, r.amount, r.payment_reference, r.payment_submitted_at
    from public.registrations r
    join public.events e on e.id = r.event_id
    where r.status = 'pending' and r.payment_submitted_at is not null
    order by r.payment_submitted_at;
end;
$$;

revoke execute on function public.ath_movil_review_queue() from public, anon;
grant execute on function public.ath_movil_review_queue() to authenticated;

-- ---------------------------------------------------------------------------
-- review_ath_movil_payment(): an admin approves or rejects one submission.
--
-- Approving assigns the bib; the spot was held since submission, so there is
-- no capacity to check again. Rejecting releases the spot. Errors:
--
--   notAdmin             the caller is not in `platform_admins`
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
begin
  if not public.is_platform_admin() then
    raise exception 'notAdmin' using errcode = 'P0001';
  end if;

  select * into reg from public.registrations where id = p_registration_id;
  if reg.id is null then
    raise exception 'registrationMissing' using errcode = 'P0001';
  end if;

  perform 1 from public.events where id = reg.event_id for update;
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

revoke execute on function public.review_ath_movil_payment(uuid, boolean)
  from public, anon;
grant execute on function public.review_ath_movil_payment(uuid, boolean)
  to authenticated;
