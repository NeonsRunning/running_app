-- ---------------------------------------------------------------------------
-- Drafts, saving, and registrations
--
-- Three things the first events migration left out:
--
--   1. Drafts. An organizer can save a half-written listing and come back to
--      it. Only published events are public; a draft is visible to its owner
--      alone, and may leave the race-day columns empty.
--   2. One atomic save. Editing an event rewrites its categories too, and a
--      half-applied edit (event updated, categories not) is worse than none,
--      so both go through `save_event()` in a single transaction.
--   3. Registrations. A runner signs up through `register_for_event()`, which
--      locks the event so two runners cannot take the last spot or the same
--      bib number at once.
-- ---------------------------------------------------------------------------

create type public.event_status as enum ('draft', 'published');

-- Existing rows were published by the only path that existed.
alter table public.events
  add column status public.event_status not null default 'published',
  add column published_at timestamptz;

update public.events set published_at = created_at where published_at is null;

-- New rows start as drafts unless the save says otherwise.
alter table public.events alter column status set default 'draft';

-- A draft may leave these empty; a published event may not.
alter table public.events
  alter column type drop not null,
  alter column event_date drop not null,
  alter column start_time drop not null,
  alter column registration_closes drop not null,
  alter column venue drop not null,
  alter column city drop not null;

alter table public.events add constraint events_published_complete check (
  status = 'draft' or (
    type is not null
    and event_date is not null
    and start_time is not null
    and registration_closes is not null
    and venue is not null
    and city is not null
    and published_at is not null
  )
);

create index events_status_event_date_idx on public.events (status, event_date);

-- Swapping two categories' distances inside one save briefly duplicates one;
-- checking uniqueness at commit rather than per row lets that through.
alter table public.event_categories
  drop constraint event_categories_event_id_distance_key,
  add constraint event_categories_event_id_distance_key
    unique (event_id, distance) deferrable initially deferred;

-- ---------------------------------------------------------------------------
-- Visibility: published to everyone, drafts to their owner
-- ---------------------------------------------------------------------------

drop policy "Events are readable by anyone" on public.events;

create policy "Published events are readable by anyone; drafts by their owner"
  on public.events for select
  to anon, authenticated
  using (status = 'published' or (select auth.uid()) = organizer_id);

-- The subquery runs under the events policy above, so a draft's categories
-- are hidden exactly when the draft is.
drop policy "Categories are readable by anyone" on public.event_categories;

create policy "Categories follow their event's visibility"
  on public.event_categories for select
  to anon, authenticated
  using (exists (select 1 from public.events e where e.id = event_id));

-- ---------------------------------------------------------------------------
-- Registrations
--
-- A snapshot of what the runner entered, not a link to their profile: a bib
-- list has to show the name and age group the runner raced under, even if
-- they edit their profile afterwards. That makes these rows contact data, so
-- they are readable only by the runner and the event's organizer, and only
-- writable through `register_for_event()`.
-- ---------------------------------------------------------------------------

create table public.registrations (
  id uuid primary key default gen_random_uuid(),

  -- Restrict, not cascade: an event or category with runners signed up
  -- cannot be deleted out from under them.
  event_id uuid not null references public.events (id) on delete restrict,
  category_id uuid not null references public.event_categories (id) on delete restrict,
  -- Cascade: a runner deleting their account takes their contact data along.
  runner_id uuid not null references public.profiles (id) on delete cascade,

  bib integer not null check (bib > 0),

  first_name text not null check (char_length(first_name) between 1 and 80),
  last_name text not null check (char_length(last_name) between 1 and 80),
  email text not null check (char_length(email) <= 254),
  phone text not null check (phone ~ '^\+?[0-9][0-9 ()-]{6,19}$'),
  birth_date date not null check (birth_date > date '1900-01-01'),
  gender public.profile_gender not null,
  emergency_contact_name text not null
    check (char_length(emergency_contact_name) between 1 and 80),
  emergency_contact_phone text not null
    check (emergency_contact_phone ~ '^\+?[0-9][0-9 ()-]{6,19}$'),
  club text check (char_length(club) <= 80),

  shirt_size public.shirt_size,
  wants_photos boolean not null default false,
  donation numeric(8, 2) not null default 0 check (donation >= 0),
  -- What the runner owes, computed by `register_for_event()` from the
  -- category price and the extras. No payment provider is connected yet.
  amount numeric(8, 2) not null check (amount >= 0),

  created_at timestamptz not null default now(),

  unique (event_id, runner_id),
  unique (event_id, bib)
);

comment on table public.registrations is
  'One runner signed up for one category of one event. Written only by register_for_event().';

create index registrations_category_id_idx on public.registrations (category_id);
create index registrations_runner_id_idx on public.registrations (runner_id);

alter table public.registrations enable row level security;

create policy "Runners read their own registrations"
  on public.registrations for select
  to authenticated
  using ((select auth.uid()) = runner_id);

create policy "Organizers read registrations for their events"
  on public.registrations for select
  to authenticated
  using (exists (
    select 1 from public.events e
    where e.id = event_id and e.organizer_id = (select auth.uid())
  ));

-- No insert, update or delete grants: the function below is the only writer.
grant select on public.registrations to authenticated;

-- ---------------------------------------------------------------------------
-- Sign-up counts
--
-- Public pages show how full a race is, but must not read the rows behind
-- that number. This returns counts and nothing else.
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
  group by r.category_id;
$$;

revoke execute on function public.registration_counts(uuid[]) from public;
grant execute on function public.registration_counts(uuid[]) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Saving an event
--
-- Invoker rights: every statement runs under the caller's own policies, so
-- this cannot write anything the caller could not write row by row. What it
-- adds is the transaction, and the checks that span rows.
--
-- `p_event` carries the events columns by name; `p_categories` is an array of
-- { id?, distance, distance_km, price, capacity, start_time } in display
-- order. A category with an id is updated, one without is inserted, and any
-- existing category missing from the array is deleted — which fails, by the
-- foreign key, if runners are registered in it.
--
-- Errors meant for the organizer are raised with SQLSTATE P0001 and a message
-- that is a key under `publish.errors`.
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
      aid_stations, schedule, parking, directions
    ) values (
      (select auth.uid()), p_slug, r.status,
      case when r.status = 'published' then now() end,
      r.name, r.description, r.type, r.event_date, r.start_time,
      r.registration_opens, r.registration_closes,
      r.venue, r.address, r.city, r.region, r.postal_code, r.country,
      r.difficulty, r.terrain, r.elevation_gain, r.cutoff,
      r.capacity, r.minimum_age, r.maximum_age, r.shirt_sizes,
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

revoke execute on function public.save_event(uuid, text, jsonb, jsonb) from public, anon;
grant execute on function public.save_event(uuid, text, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Registering
--
-- Definer rights, because the checks need rows the runner cannot read: other
-- runners' registrations, to count spots and pick the next bib. Everything
-- the runner controls arrives in `p_details` and is validated here; the
-- amount is computed here, never taken from the caller.
--
-- The extras are priced in step with `lib/events/pricing.ts`.
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
    -- Category price, shirt $22, photos $12, donation, $2.90 service fee.
    cat.price
      + case when size is not null then 22 else 0 end
      + case when photos then 12 else 0 end
      + gift
      + 2.90
  )
  returning * into reg;

  return reg;
end;
$$;

revoke execute on function public.register_for_event(uuid, jsonb) from public, anon;
grant execute on function public.register_for_event(uuid, jsonb) to authenticated;
