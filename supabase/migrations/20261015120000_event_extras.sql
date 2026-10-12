-- ---------------------------------------------------------------------------
-- Extras the organizer controls
--
-- Until now every race offered the same three extras at the same prices: a
-- $22 shirt (whenever any size was picked), $12 photos, and a donation. Each
-- one is now a switch on the event, the shirt and photos carry the
-- organizer's own price, and donations name who receives them. A
-- switched-off extra keeps its settings, so turning it back on restores what
-- was there.
--
-- Safe to run more than once: an earlier draft of this file, without the
-- donation recipient, was applied by hand to some databases.
-- ---------------------------------------------------------------------------

do $$
begin
  -- The backfill only runs when the columns are new, so a second run cannot
  -- switch back on an extra an organizer has since switched off.
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'events'
      and column_name = 'offers_shirt'
  ) then
    alter table public.events
      add column offers_shirt boolean not null default false,
      add column shirt_price numeric(8, 2) not null default 22
        check (shirt_price between 0 and 1000),
      add column offers_photos boolean not null default false,
      add column photo_price numeric(8, 2) not null default 12
        check (photo_price between 0 and 1000),
      add column accepts_donations boolean not null default false;

    -- Existing races keep their shirt and photos.
    update public.events set
      offers_shirt = cardinality(shirt_sizes) > 0,
      offers_photos = true;
  end if;
end;
$$;

alter table public.events
  add column if not exists donation_recipient text not null default ''
    check (char_length(donation_recipient) <= 120);

-- Donations need a named recipient. None has been named yet, so donations
-- are off until the organizer names one (the earlier draft switched them on).
update public.events set accepts_donations = false
where accepts_donations and trim(donation_recipient) = '';

-- A shirt on offer needs at least one size to pick.
alter table public.events drop constraint if exists events_shirt_has_sizes;
alter table public.events add constraint events_shirt_has_sizes
  check (not offers_shirt or cardinality(shirt_sizes) > 0);

-- Runners see who their donation goes to before they give.
alter table public.events drop constraint if exists events_donations_have_recipient;
alter table public.events add constraint events_donations_have_recipient
  check (not accepts_donations or char_length(trim(donation_recipient)) > 0);

-- ---------------------------------------------------------------------------
-- save_event(): as before, plus the columns above.
-- ---------------------------------------------------------------------------

create or replace function public.save_event(
  p_id uuid,
  p_slug text,
  p_event jsonb,
  p_categories jsonb
)
returns public.events
language plpgsql
set search_path = ''
as $$
declare
  r public.events := jsonb_populate_record(null::public.events, p_event);
  ev public.events;
  item record;
  kept uuid[];
begin
  if p_id is null then
    insert into public.events (
      organizer_id, slug, status, published_at,
      name, description, type, event_date, start_time,
      registration_opens, registration_closes,
      venue, address, city, region, postal_code, country,
      difficulty, terrain, elevation_gain, cutoff,
      capacity, minimum_age, maximum_age, shirt_sizes,
      offers_shirt, shirt_price, offers_photos, photo_price,
      accepts_donations, donation_recipient,
      aid_stations, schedule, parking, directions
    ) values (
      (select auth.uid()), p_slug, r.status,
      case when r.status = 'published' then now() end,
      r.name, r.description, r.type, r.event_date, r.start_time,
      r.registration_opens, r.registration_closes,
      r.venue, r.address, r.city, r.region, r.postal_code, r.country,
      r.difficulty, r.terrain, r.elevation_gain, r.cutoff,
      r.capacity, r.minimum_age, r.maximum_age, r.shirt_sizes,
      r.offers_shirt, r.shirt_price, r.offers_photos, r.photo_price,
      r.accepts_donations, r.donation_recipient,
      r.aid_stations, r.schedule, r.parking, r.directions
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
      start_time = r.start_time,
      registration_opens = r.registration_opens,
      registration_closes = r.registration_closes,
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
      aid_stations = r.aid_stations,
      schedule = r.schedule,
      parking = r.parking,
      directions = r.directions
    where e.id = p_id
    returning * into ev;

    -- Missing, or not the caller's: the update policy hides both alike.
    if ev.id is null then
      raise exception 'eventNotFound' using errcode = 'P0001';
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
        select count(*) from public.registrations rg where rg.category_id = ec.id
      )
  ) then
    raise exception 'capacityBelowRegistered' using errcode = 'P0001';
  end if;

  return ev;
end;
$$;

-- ---------------------------------------------------------------------------
-- register_for_event(): extras are priced from the event, and an extra the
-- organizer has switched off is refused — the runner's page may predate the
-- change.
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
  birth date;
  runner_age integer;
  size public.shirt_size;
  photos boolean := coalesce((p_details ->> 'wants_photos')::boolean, false);
  gift numeric := coalesce((p_details ->> 'donation')::numeric, 0);
begin
  if uid is null then
    raise exception 'sessionExpired' using errcode = 'P0001';
  end if;

  select * into cat from public.event_categories where id = p_category_id;
  if cat.id is null then
    raise exception 'eventUnavailable' using errcode = 'P0001';
  end if;

  -- One lock per event serializes its sign-ups: the capacity counts and the
  -- next bib below cannot change between reading and writing them.
  select * into ev from public.events where id = cat.event_id for update;

  if ev.status <> 'published' then
    raise exception 'eventUnavailable' using errcode = 'P0001';
  end if;

  if current_date > ev.registration_closes
     or (ev.registration_opens is not null and current_date < ev.registration_opens)
  then
    raise exception 'registrationClosed' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.registrations
    where event_id = ev.id and runner_id = uid
  ) then
    raise exception 'alreadyRegistered' using errcode = 'P0001';
  end if;

  if (select count(*) from public.registrations where category_id = cat.id)
       >= cat.capacity
     or (ev.capacity is not null and
         (select count(*) from public.registrations where event_id = ev.id)
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

  insert into public.registrations (
    event_id, category_id, runner_id, bib,
    first_name, last_name, email, phone, birth_date, gender,
    emergency_contact_name, emergency_contact_phone, club,
    shirt_size, wants_photos, donation, amount
  ) values (
    ev.id, cat.id, uid,
    (select coalesce(max(bib), 1000) + 1 from public.registrations where event_id = ev.id),
    trim(p_details ->> 'first_name'),
    trim(p_details ->> 'last_name'),
    trim(p_details ->> 'email'),
    trim(p_details ->> 'phone'),
    birth,
    (p_details ->> 'gender')::public.profile_gender,
    trim(p_details ->> 'emergency_contact_name'),
    trim(p_details ->> 'emergency_contact_phone'),
    nullif(trim(coalesce(p_details ->> 'club', '')), ''),
    size,
    photos,
    gift,
    -- Category price, the event's extras, donation, $2.90 service fee
    -- (`SERVICE_FEE` in lib/events/pricing.ts).
    cat.price
      + case when size is not null then ev.shirt_price else 0 end
      + case when photos then ev.photo_price else 0 end
      + gift
      + 2.90
  )
  returning * into reg;

  return reg;
end;
$$;
