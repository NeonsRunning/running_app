-- ---------------------------------------------------------------------------
-- Paying for a registration with Stripe
--
-- A sign-up is now two steps:
--
--   1. `register_for_event()` writes a *pending* registration: the runner's
--      details, the amount, and a hold on one spot for 30 minutes. No bib
--      yet. The server then opens a Stripe PaymentIntent for that amount.
--      Calling it again — the runner went back and changed an extra — updates
--      the same pending row and renews the hold.
--
--   2. Once Stripe says the PaymentIntent succeeded, the server calls
--      `confirm_registration_payment()` with the service role. That assigns
--      the bib and marks the row confirmed. Runners cannot call it: only a
--      server that has checked the payment with Stripe can.
--
-- A spot is taken by a confirmed registration or by a pending one whose hold
-- has not run out. Pending rows are never deleted; an expired one simply stops
-- counting, and comes back to life if the same runner tries again.
-- ---------------------------------------------------------------------------

create type public.registration_status as enum ('pending', 'confirmed');

-- Rows written before payments existed are the runners already signed up.
alter table public.registrations
  add column status public.registration_status not null default 'confirmed',
  add column hold_expires_at timestamptz,
  add column payment_intent_id text unique,
  add column paid_at timestamptz;

alter table public.registrations alter column status set default 'pending';

-- The bib is handed out when the payment lands.
alter table public.registrations alter column bib drop not null;
alter table public.registrations
  add constraint registrations_bib_when_confirmed
  check ((status = 'confirmed') = (bib is not null));

comment on column public.registrations.amount is
  'What the runner pays, computed by register_for_event(). Charged through Stripe.';
comment on column public.registrations.hold_expires_at is
  'Until when a pending registration keeps its spot while the runner pays.';
comment on column public.registrations.payment_intent_id is
  'The Stripe PaymentIntent opened for this registration. Written by the server with the service role.';

create index registrations_payment_intent_id_idx
  on public.registrations (payment_intent_id);

-- ---------------------------------------------------------------------------
-- Sign-up counts: confirmed runners plus live holds, which is what capacity
-- is checked against.
-- ---------------------------------------------------------------------------

create or replace function public.registration_counts(p_event_ids uuid[])
returns table (category_id uuid, registered bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select r.category_id, count(*)
  from public.registrations r
  where r.event_id = any (p_event_ids)
    and (r.status = 'confirmed' or r.hold_expires_at > now())
  group by r.category_id;
$$;

-- Runners are the ones who finished paying.
create or replace function public.platform_stats()
returns table (races bigint, runners bigint, organizers bigint, clubs bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*) from public.events where status = 'published'),
    (select count(distinct runner_id) from public.registrations
      where status = 'confirmed'),
    (select count(*) from public.profiles where account_type = 'organizer'),
    (select count(distinct name) from (
      select lower(regexp_replace(trim(club), '\s+', ' ', 'g')) as name
      from public.profiles where club is not null
      union
      select lower(regexp_replace(trim(club), '\s+', ' ', 'g'))
      from public.registrations where club is not null and status = 'confirmed'
    ) c where name <> '');
$$;

-- ---------------------------------------------------------------------------
-- register_for_event(): reserve a spot and price it. Same checks as before;
-- the runner's own pending row is updated rather than refused, and does not
-- count against the capacity it is about to take again.
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
-- confirm_registration_payment(): a payment Stripe reports as succeeded
-- becomes a confirmed registration with a bib.
--
-- Idempotent: the success page, the page reload and the webhook may all
-- report the same payment. Errors the server acts on (by refunding) come back
-- with SQLSTATE P0001:
--
--   registrationMissing  no row for this registration id
--   amountMismatch       the row was repriced after this payment was opened
--   soldOut              the hold ran out and the spot went to someone else
--
-- A row confirmed by a *different* payment is returned as-is; the caller sees
-- the other payment_intent_id and refunds the duplicate.
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
    payment_intent_id = p_payment_intent_id,
    paid_at = now(),
    hold_expires_at = null
  where id = reg.id
  returning * into reg;

  return reg;
end;
$$;

revoke execute on function public.confirm_registration_payment(uuid, text, bigint)
  from public, anon, authenticated;
grant execute on function public.confirm_registration_payment(uuid, text, bigint)
  to service_role;
