-- ---------------------------------------------------------------------------
-- A cover image for events.
--
-- The browser converts the organizer's photo (iPhone HEIC included) to a
-- resized WebP and uploads it straight into the public `event-images` bucket,
-- under a folder named for their own user id, and the wizard saves the
-- object's path on the event. Null means no image: the card falls back to the
-- gradient cover.
--
-- Safe to run more than once: an earlier draft of this file, which also
-- accepted JPEG and PNG, was applied by hand to some databases. Running this
-- one brings those up to the WebP-only rules.
-- ---------------------------------------------------------------------------

alter table public.events add column if not exists image_path text;

-- The earlier draft let JPEG and PNG paths in; this check would refuse them.
-- Such a cover falls back to the gradient until the organizer uploads again.
update public.events set image_path = null
where image_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$';

-- Named explicitly, so it can be replaced: the earlier draft's inline check
-- got Postgres's default name, which is this one.
alter table public.events drop constraint if exists events_image_path_check;
alter table public.events add constraint events_image_path_check
  check (image_path is null or image_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$');

comment on column public.events.image_path is
  'Object path in the event-images bucket: <organizer id>/<uuid>.webp. Null for no image.';

-- Public: the image is shown on listings anyone can read. WebP only, 5 MB
-- after conversion (a converted cover is typically well under 1 MB).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'event-images', 'event-images', true, 5242880,
  array['image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Writes are limited to the caller's own folder, and to organizers. Reads
-- need no policy: a public bucket serves its objects by URL.
drop policy if exists "Organizers upload event images to their own folder" on storage.objects;
create policy "Organizers upload event images to their own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'event-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.is_organizer())
  );

drop policy if exists "Organizers list their own event images" on storage.objects;
create policy "Organizers list their own event images"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'event-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Organizers delete their own event images" on storage.objects;
create policy "Organizers delete their own event images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'event-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ---------------------------------------------------------------------------
-- save_event(): as before, plus image_path.
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
      name, description, type, event_date, end_date, start_time,
      registration_opens, registration_closes,
      venue, address, city, region, postal_code, country,
      difficulty, terrain, elevation_gain, cutoff,
      capacity, minimum_age, maximum_age, shirt_sizes,
      offers_shirt, shirt_price, offers_photos, photo_price,
      accepts_donations, donation_recipient,
      aid_stations, schedule, parking, directions, image_path
    ) values (
      (select auth.uid()), p_slug, r.status,
      case when r.status = 'published' then now() end,
      r.name, r.description, r.type, r.event_date, r.end_date, r.start_time,
      r.registration_opens, r.registration_closes,
      r.venue, r.address, r.city, r.region, r.postal_code, r.country,
      r.difficulty, r.terrain, r.elevation_gain, r.cutoff,
      r.capacity, r.minimum_age, r.maximum_age, r.shirt_sizes,
      r.offers_shirt, r.shirt_price, r.offers_photos, r.photo_price,
      r.accepts_donations, r.donation_recipient,
      r.aid_stations, r.schedule, r.parking, r.directions, r.image_path
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
      directions = r.directions,
      image_path = r.image_path
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
