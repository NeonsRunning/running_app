-- ---------------------------------------------------------------------------
-- Organizers can hide how many spots are left
--
-- Some organizers don't want runners to see how full their race is. With
-- `events.show_spots_left` off, the event page and listings leave out the
-- spots left, the capacity bar, the runner count and the "Almost full"
-- badge. Caps are enforced as before, and a full race still reads "Sold out".
--
-- 1. save_event() writes the flag. It is its latest definition
--    (20261205120200_draft_slug_follows_name.sql) with the column added.
-- 2. search_events() files a race with hidden spots under 'open' rather than
--    'almost-full', so the "Almost full" filter can't single it out. It is its
--    latest definition (20261129120000_event_sold_out.sql) with that case
--    added.
-- ---------------------------------------------------------------------------

alter table public.events
  add column show_spots_left boolean not null default true;

-- 1 ---------------------------------------------------------------------------

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
  -- The event as it was, before this save; null when creating one.
  prev public.events;
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

  -- Read before the update, which the checks after it compare against.
  -- Unlocked: the update below takes the row lock, and a stranger's id only
  -- ever ends in `eventNotFound` there.
  if p_id is not null then
    select * into prev from public.events where id = p_id;
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
      accepts_results, mails_medals, sold_out, charges_sales_tax,
      show_spots_left
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
      coalesce(r.accepts_results, false), coalesce(r.mails_medals, false),
      coalesce(r.sold_out, false), coalesce(r.charges_sales_tax, false),
      coalesce(r.show_spots_left, true)
    )
    returning * into ev;
  else
    update public.events e set
      -- A draft has no address anyone was given, so it takes its slug from
      -- the name as it is now; from the save that publishes it, the slug is
      -- kept, so links to a live race survive a rename.
      slug = case when e.status = 'draft' then p_slug else e.slug end,
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
      mails_medals = coalesce(r.mails_medals, false),
      sold_out = coalesce(r.sold_out, false),
      charges_sales_tax = coalesce(r.charges_sales_tax, false),
      show_spots_left = coalesce(r.show_spots_left, true)
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

    -- Medals by mail switched on after sign-ups: whoever paid for the mail
    -- gets theirs in the shipment. Only when it is switched on — on every
    -- save it would also overwrite runners who chose to pick theirs up.
    if ev.mails_medals and not coalesce(prev.mails_medals, false) then
      update public.registrations rg set medal_by_mail = true
      where rg.event_id = ev.id
        and rg.medal_shipped_at is null
        and rg.medal_picked_up_at is null
        and rg.ships_by_mail
        and rg.mailing_address is not null;
    end if;

    -- A new race day needs its own reminder: the one already sent was for
    -- the old date.
    if ev.event_date is distinct from prev.event_date then
      update public.registrations rg set reminder_email_sent_at = null
      where rg.event_id = ev.id and rg.reminder_email_sent_at is not null;
    end if;
  end if;

  -- Images are uploaded into the uploader's own folder, `<uid>/<file>.webp`.
  -- A new path must be in the caller's: otherwise a listing could show, and
  -- a later replacement delete, another organizer's file. The paths already
  -- on the event stay acceptable as they are — an admin's edit keeps the
  -- organizer's files. Checked after the update so a stranger's id still
  -- answers `eventNotFound`; raising here undoes it.
  if (ev.image_path is distinct from prev.image_path
        and split_part(ev.image_path, '/', 1) <> uid::text)
     or (ev.route_image_path is distinct from prev.route_image_path
        and split_part(ev.route_image_path, '/', 1) <> uid::text)
     or (ev.medal_image_path is distinct from prev.medal_image_path
        and split_part(ev.medal_image_path, '/', 1) <> uid::text)
  then
    raise exception 'imageInvalid' using errcode = 'P0001';
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
      -- What runners signed up for keeps its distance; see the header.
      if exists (
        select 1 from public.event_categories ec
        where ec.id = (item.v ->> 'id')::uuid
          and ec.event_id = ev.id
          and (
            ec.distance is distinct from (item.v ->> 'distance')::public.race_distance
            or ec.distance_km is distinct from (item.v ->> 'distance_km')::numeric
          )
          and exists (
            select 1 from public.registrations rg where rg.category_id = ec.id
          )
      ) then
        raise exception 'categoryDistanceLocked' using errcode = 'P0001';
      end if;

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

  -- The event's own cap, counted as `register_for_event()` counts it.
  if ev.capacity is not null and ev.capacity < (
    select count(*) from public.registrations rg
    where rg.event_id = ev.id
      and (rg.status = 'confirmed' or rg.hold_expires_at > now())
  ) then
    raise exception 'eventCapacityBelowRegistered' using errcode = 'P0001';
  end if;

  return ev;
end;
$$;

-- 2 ---------------------------------------------------------------------------

create or replace function public.search_events(
  p_today date,
  p_query text default null,
  p_distances public.race_distance[] default null,
  p_types public.event_type[] default null,
  p_difficulties public.event_difficulty[] default null,
  p_statuses text[] default null,
  p_max_price numeric default null,
  p_until date default null,
  p_sort text default 'soonest',
  p_limit integer default 24,
  p_offset integer default 0
)
returns table (id uuid, total bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with listed as (
    select
      e.id,
      e.event_date,
      e.start_time,
      c.from_price,
      c.longest,
      coalesce(r.registered, 0) as registered,
      e.last_day,
      case
        -- Marked by the organizer: says so whatever the dates and counts do.
        when e.sold_out then 'full'
        when p_today > e.registration_closes then 'closed'
        when e.registration_opens is not null and p_today < e.registration_opens
          then 'opening-soon'
        -- Full at the event's cap, or once every category is.
        when (coalesce(e.capacity, c.capacity) > 0
              and coalesce(r.registered, 0) >= coalesce(e.capacity, c.capacity))
          or f.every_category_full
          then 'full'
        -- With its spots hidden, a race never reads as almost full.
        when e.show_spots_left
          and coalesce(e.capacity, c.capacity) > 0
          and coalesce(r.registered, 0)::numeric / coalesce(e.capacity, c.capacity) >= 0.9
          then 'almost-full'
        else 'open'
      end as reg_status
    from public.events e
    cross join lateral (
      select
        sum(ec.capacity) as capacity,
        min(ec.price) as from_price,
        max(ec.distance_km) as longest,
        array_agg(ec.distance) as distances
      from public.event_categories ec
      where ec.event_id = e.id
    ) c
    left join lateral (
      select count(*) as registered
      from public.registrations rg
      where rg.event_id = e.id and rg.status = 'confirmed'
    ) r on true
    cross join lateral (
      select coalesce(bool_and(coalesce(cr.registered, 0) >= ec.capacity), false)
        as every_category_full
      from public.event_categories ec
      left join lateral (
        select count(*) as registered
        from public.registrations rg
        where rg.category_id = ec.id and rg.status = 'confirmed'
      ) cr on true
      where ec.event_id = e.id
    ) f
    where e.status = 'published'
      -- Listed until its last day has passed, not just its first. A race
      -- marked sold out stays listed as a reference.
      and (e.last_day >= p_today or e.sold_out)
      and (
        coalesce(p_query, '') = ''
        or strpos(
          lower(concat_ws(' ', e.name, e.city, e.region, e.type::text, e.venue)),
          lower(p_query)
        ) > 0
      )
      and (p_distances is null or c.distances && p_distances)
      and (p_types is null or e.type = any (p_types))
      and (p_difficulties is null or e.difficulty = any (p_difficulties))
      and (p_max_price is null or c.from_price <= p_max_price)
      and (p_until is null or (e.event_date <= p_until and e.last_day >= p_today))
  )
  select l.id, count(*) over () as total
  from listed l
  where p_statuses is null or l.reg_status = any (p_statuses)
  order by
    -- Whatever the sort, what can still be run comes first.
    l.last_day < p_today,
    case when p_sort in ('popular', 'recommended') then l.registered end desc nulls last,
    case when p_sort = 'price' then l.from_price end asc nulls last,
    case when p_sort = 'distance' then l.longest end desc nulls last,
    case when l.last_day < p_today then l.event_date end desc nulls last,
    l.event_date,
    l.start_time nulls first,
    -- A total order, so consecutive pages never repeat or skip a race.
    l.id
  limit least(greatest(p_limit, 1), 24)
  offset greatest(p_offset, 0);
$$;
