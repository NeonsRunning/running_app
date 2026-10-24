-- ---------------------------------------------------------------------------
-- Events are written only through their functions
--
-- `save_event()` holds the rules a listing has to keep: publishing is
-- one-way, a retired ATH Móvil account cannot be newly picked, a category
-- cannot shrink below the runners already in it. But organizers also held
-- plain INSERT/UPDATE/DELETE grants on `events` and `event_categories`, and
-- the row policies only check ownership — so the same organizer could skip
-- every one of those rules with a direct REST call, for instance
--
--   PATCH /rest/v1/events?id=eq.<id>   { "status": "draft" }
--
-- which hides a race runners have paid for, without the admin removal and
-- its log that exist for exactly that.
--
-- The app never writes these tables directly: every write already goes
-- through `save_event()`, `delete_event()` or the admin functions. So the
-- table grants go, and `save_event()` runs with definer rights and checks for
-- itself what the policies used to:
--
--   * a new event is the caller's, and the caller is an organizer;
--   * an edit is to an event that is not removed, and the caller is its
--     organizer (still an organizer) or a platform admin;
--   * the status it asks for is 'draft' or 'published' — never 'removed',
--     which only `admin_remove_event()` sets.
--
-- Errors, as before, plus:
--
--   notOrganizer   creating an event without the organizer role
--   statusInvalid  a status other than draft or published
--
-- Also: `capacityBelowRegistered` now counts what capacity is checked
-- against everywhere else — paid sign-ups and live holds — rather than every
-- row, so an abandoned checkout no longer blocks lowering a cap.
--
-- The row policies on both tables stay as a second line, should a grant ever
-- come back.
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
      accepts_results
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
      coalesce(r.accepts_results, false)
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
      accepts_results = coalesce(r.accepts_results, false)
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

-- Unchanged: signed-in callers only. Re-stated because the function now
-- runs with definer rights.
revoke execute on function public.save_event(uuid, text, jsonb, jsonb) from public, anon;
grant execute on function public.save_event(uuid, text, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- No direct writes. Reads are unchanged.
-- ---------------------------------------------------------------------------

revoke insert, update, delete on public.events from anon, authenticated;
revoke insert, update, delete on public.event_categories from anon, authenticated;
