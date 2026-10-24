-- ---------------------------------------------------------------------------
-- Medal pickup, after the fact
--
-- 20261121120000_medal_shipping was pushed in its first form — mail only,
-- `medal_finished()` and `set_medal_address()` — and then rewritten in place
-- to let runners choose between the mail and picking their medal up. A
-- database never runs a migration twice, so the hosted one kept the first
-- form, and the organizer's registration list, which reads the new columns,
-- came back empty.
--
-- This brings such a database up to the rewritten file. Every step is safe to
-- run on top of either version, so a fresh database that ran the rewritten
-- file passes through it unchanged.
-- ---------------------------------------------------------------------------

comment on column public.events.mails_medals is
  'Runners may have their finisher medal mailed instead of picking it up, at no extra cost.';

alter table public.registrations
  add column if not exists medal_by_mail boolean not null default false,
  add column if not exists medal_picked_up_at timestamptz;

-- The first form mailed every finisher's medal to the address given at
-- sign-up; those runners keep the mail.
update public.registrations
set medal_by_mail = true
where not medal_by_mail
  and char_length(trim(medal_mailing_address)) > 0;

alter table public.registrations
  drop constraint if exists registrations_medal_once,
  add constraint registrations_medal_once
    check (medal_shipped_at is null or medal_picked_up_at is null),
  drop constraint if exists registrations_medal_mail_has_address,
  add constraint registrations_medal_mail_has_address
    check (not medal_by_mail or char_length(trim(medal_mailing_address)) > 0);

comment on column public.registrations.medal_by_mail is
  'The runner chose to have their finisher medal mailed rather than pick it up.';
comment on column public.registrations.medal_mailing_address is
  'Where the finisher medal is mailed, when the runner chose the mail.';
comment on column public.registrations.medal_picked_up_at is
  'When the organizer recorded the runner picking up their medal in person.';

-- Replaced by medal_earned() and set_medal_delivery() below.
drop function if exists public.set_medal_address(uuid, text);

-- ---------------------------------------------------------------------------
-- medal_earned(): whether the sign-up has earned its medal yet — the rule
-- above, in one place for the functions below. `p_handout` is true for a
-- pickup, which can happen at the finish on race day itself.
-- ---------------------------------------------------------------------------

create or replace function public.medal_earned(
  reg public.registrations,
  ev public.events,
  p_handout boolean
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select reg.status = 'confirmed' and (
    case
      when ev.accepts_results then exists (
        select 1 from public.race_results rr
        where rr.registration_id = reg.id and rr.status = 'accepted'
      )
      when p_handout then
        ev.event_date <= (now() at time zone 'America/Puerto_Rico')::date
      else ev.last_day < (now() at time zone 'America/Puerto_Rico')::date
    end
  );
$$;

revoke execute on function public.medal_earned(public.registrations, public.events, boolean)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- mark_medal_shipped(): mark a finisher's medal as shipped, or update the
-- tracking number of one already shipped. Errors:
--
--   notAllowed           not the event's organizer or a platform admin
--   registrationMissing  no such confirmed sign-up (removed meanwhile)
--   medalsOff            the race does not mail medals
--   pickupChosen         the runner picks theirs up
--   pickedUp             it was handed over in person already
--   notFinished          the runner has not finished (see medal_earned)
--   addressMissing       no address to mail it to
--   trackingTooLong      over 100 characters
--
-- Once shipped, only the tracking number changes, whatever happened since.
-- ---------------------------------------------------------------------------

create or replace function public.mark_medal_shipped(
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

  if reg.medal_shipped_at is null then
    if not ev.mails_medals then
      raise exception 'medalsOff' using errcode = 'P0001';
    end if;

    if reg.medal_picked_up_at is not null then
      raise exception 'pickedUp' using errcode = 'P0001';
    end if;

    if not reg.medal_by_mail then
      raise exception 'pickupChosen' using errcode = 'P0001';
    end if;

    if not public.medal_earned(reg, ev, false) then
      raise exception 'notFinished' using errcode = 'P0001';
    end if;

    if reg.medal_mailing_address is null then
      raise exception 'addressMissing' using errcode = 'P0001';
    end if;
  end if;

  if char_length(v_tracking) > 100 then
    raise exception 'trackingTooLong' using errcode = 'P0001';
  end if;

  update public.registrations set
    medal_shipped_at = coalesce(medal_shipped_at, now()),
    medal_tracking = v_tracking
  where id = reg.id
  returning * into reg;

  return reg;
end;
$$;

revoke execute on function public.mark_medal_shipped(uuid, text) from public, anon;
grant execute on function public.mark_medal_shipped(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- mark_medal_picked_up(): record a finisher picking their medal up in
-- person. Marking it again changes nothing. Errors:
--
--   notAllowed           not the event's organizer or a platform admin
--   registrationMissing  no such confirmed sign-up (removed meanwhile)
--   medalsOff            the race does not offer medals by mail, so the app
--                        does not track its medals
--   mailChosen           the runner asked for theirs by mail
--   shipped              it was mailed already
--   notFinished          the runner has not earned it yet (see medal_earned)
-- ---------------------------------------------------------------------------

create or replace function public.mark_medal_picked_up(p_registration_id uuid)
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
    raise exception 'notAllowed' using errcode = 'P0001';
  end if;

  select * into ev from public.events where id = reg.event_id;
  if ev.organizer_id <> uid and not public.is_platform_admin() then
    raise exception 'notAllowed' using errcode = 'P0001';
  end if;

  if reg.status <> 'confirmed' then
    raise exception 'registrationMissing' using errcode = 'P0001';
  end if;

  if reg.medal_picked_up_at is not null then
    return reg;
  end if;

  if not ev.mails_medals then
    raise exception 'medalsOff' using errcode = 'P0001';
  end if;

  if reg.medal_shipped_at is not null then
    raise exception 'shipped' using errcode = 'P0001';
  end if;

  if reg.medal_by_mail then
    raise exception 'mailChosen' using errcode = 'P0001';
  end if;

  if not public.medal_earned(reg, ev, true) then
    raise exception 'notFinished' using errcode = 'P0001';
  end if;

  update public.registrations set medal_picked_up_at = now()
  where id = reg.id
  returning * into reg;

  return reg;
end;
$$;

revoke execute on function public.mark_medal_picked_up(uuid) from public, anon;
grant execute on function public.mark_medal_picked_up(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- set_medal_delivery(): the runner switches between mail and pickup, or
-- corrects the address, until the medal ships or is picked up. Choosing
-- pickup keeps the address, so switching back finds it. Errors:
--
--   notAllowed      not the runner's confirmed sign-up
--   medalsOff       the race does not mail medals
--   alreadyShipped  the medal is on its way
--   pickedUp        the medal was handed over already
--   addressInvalid  mail chosen with a blank address, or over 300 characters
-- ---------------------------------------------------------------------------

create or replace function public.set_medal_delivery(
  p_registration_id uuid,
  p_by_mail boolean,
  p_address text default null
)
returns public.registrations
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  v_address text := nullif(btrim(coalesce(p_address, '')), '');
  reg public.registrations;
  ev public.events;
begin
  select * into reg from public.registrations
  where id = p_registration_id and runner_id = uid and status = 'confirmed';
  if uid is null or reg.id is null then
    raise exception 'notAllowed' using errcode = 'P0001';
  end if;

  select * into ev from public.events where id = reg.event_id;
  if not ev.mails_medals then
    raise exception 'medalsOff' using errcode = 'P0001';
  end if;

  if reg.medal_shipped_at is not null then
    raise exception 'alreadyShipped' using errcode = 'P0001';
  end if;

  if reg.medal_picked_up_at is not null then
    raise exception 'pickedUp' using errcode = 'P0001';
  end if;

  if (p_by_mail and v_address is null) or char_length(v_address) > 300 then
    raise exception 'addressInvalid' using errcode = 'P0001';
  end if;

  update public.registrations set
    medal_by_mail = coalesce(p_by_mail, false),
    medal_mailing_address = coalesce(v_address, medal_mailing_address)
  where id = reg.id
  returning * into reg;

  return reg;
end;
$$;

revoke execute on function public.set_medal_delivery(uuid, boolean, text) from public, anon;
grant execute on function public.set_medal_delivery(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- save_event(): as before (20261115120000_event_writes_through_functions),
-- plus mails_medals. Turning it on after sign-ups: runners who had their kit
-- mailed get the medal mailed to the same address; the rest pick it up
-- unless they switch to the mail from their profile.
-- ---------------------------------------------------------------------------

create or replace function public.save_event(
  p_id uuid,
  p_slug text,
  p_event jsonb,
  p_categories jsonb
)
returns public.events
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  r public.events := jsonb_populate_record(null::public.events, p_event);
  ev public.events;
  item record;
  kept uuid[];
begin
  if uid is null then
    raise exception 'eventNotFound' using errcode = 'P0001';
  end if;

  if r.status is null or r.status not in ('draft', 'published') then
    raise exception 'statusInvalid' using errcode = 'P0001';
  end if;

  if p_id is null and not public.is_organizer() then
    raise exception 'notOrganizer' using errcode = 'P0001';
  end if;

  if r.ath_movil_account_id is not null
     and not exists (
       select 1 from public.ath_movil_accounts a
       where a.id = r.ath_movil_account_id and a.active
     )
     and not exists (
       select 1 from public.events e
       where e.id = p_id and e.ath_movil_account_id = r.ath_movil_account_id
     )
  then
    raise exception 'athMovilAccountInvalid' using errcode = 'P0001';
  end if;

  if p_id is null then
    insert into public.events (
      organizer_id, slug, status, published_at,
      name, description, type, event_date, end_date, start_time,
      registration_opens, registration_closes,
      anywhere, venue, address, city, region, postal_code, country,
      difficulty, terrain, elevation_gain, cutoff,
      capacity, minimum_age, maximum_age, shirt_sizes,
      offers_shirt, shirt_price, offers_photos, photo_price,
      accepts_donations, donation_recipient, offers_mail, shipping_price,
      aid_stations, schedule, parking, directions, image_path,
      route_image_path, medal_image_path, ath_movil_account_id,
      accepts_results, mails_medals
    ) values (
      uid, p_slug, r.status,
      case when r.status = 'published' then now() end,
      r.name, r.description, r.type, r.event_date, r.end_date, r.start_time,
      r.registration_opens, r.registration_closes,
      r.anywhere, r.venue, r.address, r.city, r.region, r.postal_code, r.country,
      r.difficulty, r.terrain, r.elevation_gain, r.cutoff,
      r.capacity, r.minimum_age, r.maximum_age, r.shirt_sizes,
      r.offers_shirt, r.shirt_price, r.offers_photos, r.photo_price,
      r.accepts_donations, r.donation_recipient, r.offers_mail, r.shipping_price,
      r.aid_stations, r.schedule, r.parking, r.directions, r.image_path,
      r.route_image_path, r.medal_image_path, r.ath_movil_account_id,
      coalesce(r.accepts_results, false), coalesce(r.mails_medals, false)
    )
    returning * into ev;
  else
    update public.events e set
      -- Publishing is one-way: a live listing may have runners signed up.
      status = case when e.status = 'published' then e.status else r.status end,
      published_at = coalesce(
        e.published_at,
        case when r.status = 'published' then now() end
      ),
      name = r.name,
      description = r.description,
      type = r.type,
      event_date = r.event_date,
      end_date = r.end_date,
      start_time = r.start_time,
      registration_opens = r.registration_opens,
      registration_closes = r.registration_closes,
      anywhere = r.anywhere,
      venue = r.venue,
      address = r.address,
      city = r.city,
      region = r.region,
      postal_code = r.postal_code,
      country = r.country,
      difficulty = r.difficulty,
      terrain = r.terrain,
      elevation_gain = r.elevation_gain,
      cutoff = r.cutoff,
      capacity = r.capacity,
      minimum_age = r.minimum_age,
      maximum_age = r.maximum_age,
      shirt_sizes = r.shirt_sizes,
      offers_shirt = r.offers_shirt,
      shirt_price = r.shirt_price,
      offers_photos = r.offers_photos,
      photo_price = r.photo_price,
      accepts_donations = r.accepts_donations,
      donation_recipient = r.donation_recipient,
      offers_mail = r.offers_mail,
      shipping_price = r.shipping_price,
      aid_stations = r.aid_stations,
      schedule = r.schedule,
      parking = r.parking,
      directions = r.directions,
      image_path = r.image_path,
      route_image_path = r.route_image_path,
      medal_image_path = r.medal_image_path,
      ath_movil_account_id = r.ath_movil_account_id,
      accepts_results = coalesce(r.accepts_results, false),
      mails_medals = coalesce(r.mails_medals, false)
    where e.id = p_id
      -- What the update policies checked before this ran with definer
      -- rights: a removed event is the platform's, and only its organizer
      -- (still an organizer) or an admin edits the rest.
      and e.status <> 'removed'
      and (
        (e.organizer_id = uid and public.is_organizer())
        or public.is_platform_admin()
      )
    returning * into ev;

    -- Missing, removed, or not the caller's: all answer alike, so ids cannot
    -- be probed.
    if ev.id is null then
      raise exception 'eventNotFound' using errcode = 'P0001';
    end if;

    -- Medals by mail switched on after sign-ups: a mailed kit's address is
    -- where the runner already said to send things.
    if ev.mails_medals then
      update public.registrations rg set
        medal_by_mail = true,
        medal_mailing_address = rg.mailing_address
      where rg.event_id = ev.id
        and rg.medal_mailing_address is null
        and rg.medal_shipped_at is null
        and rg.medal_picked_up_at is null
        and rg.ships_by_mail
        and rg.mailing_address is not null;
    end if;
  end if;

  kept := array(
    select (c ->> 'id')::uuid
    from jsonb_array_elements(p_categories) c
    where coalesce(c ->> 'id', '') <> ''
  );

  delete from public.event_categories ec
  where ec.event_id = ev.id and not (ec.id = any (kept));

  for item in
    select c.value as v, c.ordinality - 1 as pos
    from jsonb_array_elements(p_categories) with ordinality c
  loop
    if coalesce(item.v ->> 'id', '') <> '' then
      update public.event_categories ec set
        distance = (item.v ->> 'distance')::public.race_distance,
        distance_km = (item.v ->> 'distance_km')::numeric,
        price = (item.v ->> 'price')::numeric,
        capacity = (item.v ->> 'capacity')::integer,
        start_time = (item.v ->> 'start_time')::time,
        position = item.pos
      where ec.id = (item.v ->> 'id')::uuid and ec.event_id = ev.id;

      if not found then
        raise exception 'eventNotFound' using errcode = 'P0001';
      end if;
    else
      insert into public.event_categories (
        event_id, distance, distance_km, price, capacity, start_time, position
      ) values (
        ev.id,
        (item.v ->> 'distance')::public.race_distance,
        (item.v ->> 'distance_km')::numeric,
        (item.v ->> 'price')::numeric,
        (item.v ->> 'capacity')::integer,
        (item.v ->> 'start_time')::time,
        item.pos
      );
    end if;
  end loop;

  if ev.status = 'published' and not exists (
    select 1 from public.event_categories ec where ec.event_id = ev.id
  ) then
    raise exception 'categoriesRequired' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.event_categories ec
    where ec.event_id = ev.id
      and ec.capacity < (
        select count(*) from public.registrations rg
        where rg.category_id = ec.id
          and (rg.status = 'confirmed' or rg.hold_expires_at > now())
      )
  ) then
    raise exception 'capacityBelowRegistered' using errcode = 'P0001';
  end if;

  return ev;
end;
$$;

revoke execute on function public.save_event(uuid, text, jsonb, jsonb) from public, anon;
grant execute on function public.save_event(uuid, text, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- register_for_event(): as before (20261118120100_registration_lifecycle),
-- plus the medal's delivery: on a race that mails medals, `medal_by_mail`
-- needs the address too, and keeps it as the medal's. One address serves
-- both when the kit is mailed as well.
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

-- mark_medal_shipped() above no longer calls it.
drop function if exists public.medal_finished(public.registrations, public.events);
