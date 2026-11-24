-- ---------------------------------------------------------------------------
-- Shirt designs
--
-- The event shirt was a price and a list of sizes: runners bought it without
-- seeing it. An organizer can now show up to six designs, each a picture and
-- a name, and the runner picks one along with the size.
--
-- 1. `event_shirts` holds an event's designs. Read as its event is; written
--    only by `save_event()`, which takes them as `shirt_designs` inside
--    `p_event`: a list of {id, name, image_path, offered}, in display order.
--    The key left out leaves the stored designs alone.
--
-- 2. Still one shirt, one price and one list of sizes per event
--    (`events.shirt_price`, `events.shirt_sizes`): the design changes what
--    the runner gets, not what it costs.
--
-- 3. Designs are optional. On an event with none on offer the shirt is bought
--    by size alone, as before; with at least one, the runner must pick one.
--
-- 4. `registrations.shirt_design_id` is the design chosen. A design any
--    sign-up points at — unpaid, lapsed or cancelled too — cannot be removed
--    (`shirtDesignInUse`); the organizer switches `offered` off instead, and
--    it stays on the orders that have it.
--
-- 5. The picture goes through the same pipeline as the event's other images
--    (20261020120000_event_image.sql): a WebP in the uploader's own folder of
--    the `event-images` bucket.
--
-- New errors: `shirtDesignsTooMany`, `shirtDesignIncomplete`,
-- `shirtDesignInUse` (save_event), `shirtDesignUnavailable`
-- (register_for_event). Each function below is its latest definition with
-- these changes; the file each came from is named above it.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.event_shirts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  image_path text not null
    check (image_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'),
  offered boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.event_shirts is
  'The shirt designs an event shows at sign-up. One price and one list of sizes for all of them, on the event.';
comment on column public.event_shirts.image_path is
  'Object path in the event-images bucket: <uploader id>/<uuid>.webp.';
comment on column public.event_shirts.offered is
  'Runners may pick it. Off for a design withdrawn after someone chose it.';

create index event_shirts_event_id_idx on public.event_shirts (event_id);

alter table public.event_shirts enable row level security;

-- The subquery runs under the events policies, so a draft's designs are
-- hidden exactly when the draft is.
create policy "Shirt designs follow their event's visibility"
  on public.event_shirts for select
  to anon, authenticated
  using (exists (select 1 from public.events e where e.id = event_id));

-- Written by `save_event()` only.
revoke all on public.event_shirts from anon, authenticated;
grant select on public.event_shirts to anon, authenticated;

alter table public.registrations
  add column shirt_design_id uuid references public.event_shirts (id),
  add constraint registrations_shirt_design_needs_shirt
    check (shirt_design_id is null or shirt_size is not null);

comment on column public.registrations.shirt_design_id is
  'Which of the event''s shirt designs the runner chose. Null without a shirt, or on an event that showed none.';

create index registrations_shirt_design_id_idx
  on public.registrations (shirt_design_id)
  where shirt_design_id is not null;

-- Column grants, as on the table's other columns (20261204120000).
grant select (shirt_design_id) on public.registrations to authenticated;

-- ---------------------------------------------------------------------------
-- save_event(): from 20261218120000_children_medal_mail.sql
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
  -- The event as it was, before this save; null when creating one.
  prev public.events;
  item record;
  kept uuid[];
  -- The shirt designs as sent. Null — the key left out — keeps the stored ones.
  designs jsonb := case
    when jsonb_typeof(p_event -> 'shirt_designs') = 'array' then p_event -> 'shirt_designs'
  end;
  kept_designs uuid[];
  design public.event_shirts;
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

  -- Runners need a way to pay: without cards, the race's ATH Móvil account is
  -- the only one, so it must be there and still taking payments.
  if not coalesce(r.accepts_card_payments, true)
     and not exists (
       select 1 from public.ath_movil_accounts a
       where a.id = r.ath_movil_account_id and a.active
     )
  then
    raise exception 'paymentMethodRequired' using errcode = 'P0001';
  end if;

  -- A child is under 18 and at least the minimum age: at 18 or more, nobody
  -- is both.
  if coalesce(r.allows_children, false) and r.minimum_age >= 18 then
    raise exception 'childrenAgeInvalid' using errcode = 'P0001';
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
      show_spots_left, accepts_card_payments, allows_children, child_price,
      child_shipping_price
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
      coalesce(r.show_spots_left, true),
      coalesce(r.accepts_card_payments, true),
      coalesce(r.allows_children, false),
      coalesce(r.child_price, 0),
      coalesce(r.child_shipping_price, 6)
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
      show_spots_left = coalesce(r.show_spots_left, true),
      accepts_card_payments = coalesce(r.accepts_card_payments, true),
      allows_children = coalesce(r.allows_children, false),
      child_price = coalesce(r.child_price, 0),
      child_shipping_price = coalesce(r.child_shipping_price, 6)
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
    -- save it would also overwrite runners who chose to pick theirs up. Their
    -- children are left out: nothing was charged for those medals.
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

  -- The shirt designs, synced as the categories are below: rows that carry an
  -- id are updated, the rest are added, and stored ones left out are removed.
  if designs is not null then
    if jsonb_array_length(designs) > 6 then
      raise exception 'shirtDesignsTooMany' using errcode = 'P0001';
    end if;

    if exists (
      select 1 from jsonb_array_elements(designs) d
      where char_length(btrim(coalesce(d.value ->> 'name', ''))) not between 1 and 60
         or coalesce(d.value ->> 'image_path', '') !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'
    ) then
      raise exception 'shirtDesignIncomplete' using errcode = 'P0001';
    end if;

    kept_designs := array(
      select (d.value ->> 'id')::uuid
      from jsonb_array_elements(designs) d
      where coalesce(d.value ->> 'id', '') <> ''
    );

    -- A design someone chose stays, whatever became of their sign-up: the
    -- organizer stops offering it instead.
    if exists (
      select 1 from public.event_shirts s
      where s.event_id = ev.id
        and not (s.id = any (kept_designs))
        and exists (
          select 1 from public.registrations rg where rg.shirt_design_id = s.id
        )
    ) then
      raise exception 'shirtDesignInUse' using errcode = 'P0001';
    end if;

    delete from public.event_shirts s
    where s.event_id = ev.id and not (s.id = any (kept_designs));

    for item in
      select d.value as v, d.ordinality - 1 as pos
      from jsonb_array_elements(designs) with ordinality d
    loop
      if coalesce(item.v ->> 'id', '') <> '' then
        select * into design from public.event_shirts s
        where s.id = (item.v ->> 'id')::uuid and s.event_id = ev.id;

        if design.id is null then
          raise exception 'eventNotFound' using errcode = 'P0001';
        end if;

        -- As for the event's own images: a new file must be the caller's.
        if (item.v ->> 'image_path') is distinct from design.image_path
           and split_part(item.v ->> 'image_path', '/', 1) <> uid::text
        then
          raise exception 'imageInvalid' using errcode = 'P0001';
        end if;

        update public.event_shirts s set
          name = btrim(item.v ->> 'name'),
          image_path = item.v ->> 'image_path',
          offered = coalesce((item.v ->> 'offered')::boolean, true),
          position = item.pos
        where s.id = design.id;
      else
        if split_part(item.v ->> 'image_path', '/', 1) <> uid::text then
          raise exception 'imageInvalid' using errcode = 'P0001';
        end if;

        insert into public.event_shirts (event_id, name, image_path, offered, position)
        values (
          ev.id,
          btrim(item.v ->> 'name'),
          item.v ->> 'image_path',
          coalesce((item.v ->> 'offered')::boolean, true),
          item.pos
        );
      end if;
    end loop;
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
          and (
            exists (
              select 1 from public.registrations rg where rg.category_id = ec.id
            )
            or exists (
              select 1 from public.registration_children rc where rc.category_id = ec.id
            )
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
        select count(*) from public.event_spots rg
        where rg.category_id = ec.id
          and (rg.status = 'confirmed' or rg.hold_expires_at > now())
      )
  ) then
    raise exception 'capacityBelowRegistered' using errcode = 'P0001';
  end if;

  -- The event's own cap, counted as `register_for_event()` counts it.
  if ev.capacity is not null and ev.capacity < (
    select count(*) from public.event_spots rg
    where rg.event_id = ev.id
      and (rg.status = 'confirmed' or rg.hold_expires_at > now())
  ) then
    raise exception 'eventCapacityBelowRegistered' using errcode = 'P0001';
  end if;

  return ev;
end;
$$;

-- ---------------------------------------------------------------------------
-- register_for_event(): from 20261218120000_children_medal_mail.sql
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
  -- Which of the event's shirts; null on a race that shows none.
  design uuid := nullif(p_details ->> 'shirt_design_id', '')::uuid;
  photos boolean := coalesce((p_details ->> 'wants_photos')::boolean, false);
  gift numeric := coalesce((p_details ->> 'donation')::numeric, 0);
  mail boolean := coalesce((p_details ->> 'ships_by_mail')::boolean, false);
  -- What the mail carries: the adult's kit, their medal, the children's medals.
  kit_mail boolean;
  medal_mail boolean;
  kids_mail boolean;
  kids_shipping numeric;
  address text := nullif(trim(coalesce(p_details ->> 'mailing_address', '')), '');
  fee numeric := 2.00;
  taxable numeric;
  tax numeric;
  total numeric;
  hold_start timestamptz;
  -- False when the adult signs up only children. `p_category_id` is then a
  -- child's distance, and only says which event this is.
  adult_runs boolean := coalesce((p_details ->> 'racing')::boolean, true);
  kids jsonb := case
    when jsonb_typeof(p_details -> 'children') = 'array' then p_details -> 'children'
    else '[]'::jsonb
  end;
  n_kids integer := jsonb_array_length(kids);
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

  -- Again under the lock: a save that repriced or recapped this distance may
  -- have committed while this waited for it, and the spot is priced and
  -- counted against what stands now.
  select * into cat from public.event_categories where id = p_category_id;
  if cat.id is null then
    raise exception 'eventUnavailable' using errcode = 'P0001';
  end if;

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

  if n_kids > 0 and not ev.allows_children then
    raise exception 'childrenNotAllowed' using errcode = 'P0001';
  end if;

  if n_kids > 3 then
    raise exception 'tooManyChildren' using errcode = 'P0001';
  end if;

  if not adult_runs and n_kids = 0 then
    raise exception 'childrenRequired' using errcode = 'P0001';
  end if;

  -- Each child runs a distance of this event.
  if exists (
    select 1 from jsonb_array_elements(kids) k
    where not exists (
      select 1 from public.event_categories ec
      where ec.id = (k.value ->> 'category_id')::uuid and ec.event_id = ev.id
    )
  ) then
    raise exception 'eventUnavailable' using errcode = 'P0001';
  end if;

  -- Room for every spot on this order, the adult's if racing and each
  -- child's, next to everyone else's: in each distance, and in the event.
  if ev.sold_out
     or exists (
       select 1
       from (
         select n.category_id, count(*) as need
         from (
           select cat.id as category_id where adult_runs
           union all
           select (k.value ->> 'category_id')::uuid
           from jsonb_array_elements(kids) k
         ) n
         group by n.category_id
       ) w
       join public.event_categories ec on ec.id = w.category_id
       where (select count(*) from public.event_spots s
              where s.category_id = ec.id and s.runner_id <> uid
                and (s.status = 'confirmed' or s.hold_expires_at > now()))
             + w.need > ec.capacity
     )
     or (ev.capacity is not null and
         (select count(*) from public.event_spots s
          where s.event_id = ev.id and s.runner_id <> uid
            and (s.status = 'confirmed' or s.hold_expires_at > now()))
           + n_kids + adult_runs::integer > ev.capacity)
  then
    raise exception 'soldOut' using errcode = 'P0001';
  end if;

  birth := (p_details ->> 'birth_date')::date;
  runner_age := extract(year from age(ev.event_date, birth))::integer;
  -- The event's ages are for whoever runs it.
  if adult_runs and (
    runner_age < ev.minimum_age
    or (ev.maximum_age is not null and runner_age > ev.maximum_age)
  ) then
    raise exception 'ageNotEligible' using errcode = 'P0001';
  end if;

  if n_kids > 0 and runner_age < 18 then
    raise exception 'guardianUnderage' using errcode = 'P0001';
  end if;

  -- A child is under 18 on race day, and within the event's ages.
  if exists (
    select 1
    from jsonb_array_elements(kids) k
    cross join lateral (
      select extract(
        year from age(ev.event_date, (k.value ->> 'birth_date')::date)
      )::integer as years
    ) a
    where a.years is null
       or a.years >= 18
       or a.years < ev.minimum_age
       or (ev.maximum_age is not null and a.years > ev.maximum_age)
  ) then
    raise exception 'childAgeNotEligible' using errcode = 'P0001';
  end if;

  size := nullif(p_details ->> 'shirt_size', '')::public.shirt_size;

  -- The children's medals ride in the mail the adult asked for, on races that
  -- mail medals.
  kids_mail := mail and ev.mails_medals and n_kids > 0;

  if (size is not null and not ev.offers_shirt)
     or (photos and not ev.offers_photos)
     or (gift > 0 and not ev.accepts_donations)
     or (mail and not ev.offers_mail)
     -- The shirt and the photos are the runner's own, and so is the mail
     -- unless it has a child's medal to carry.
     or (not adult_runs and (size is not null or photos or (mail and not kids_mail)))
  then
    raise exception 'extrasChanged' using errcode = 'P0001';
  end if;

  -- The kit is the runner's own: an adult who is not racing has none. Their
  -- medal rides in the shipment they paid for, on races that mail medals.
  -- Whoever skips the extra picks up both.
  kit_mail := mail and adult_runs;
  medal_mail := kit_mail and ev.mails_medals;

  if size is not null and not (size = any (ev.shirt_sizes)) then
    raise exception 'shirtSizeUnavailable' using errcode = 'P0001';
  end if;

  -- Where the race shows its shirts, the runner picks one of those on offer;
  -- where it shows none, there is nothing to pick. A design means nothing
  -- without a shirt.
  if size is null then
    design := null;
  elsif design is null then
    if exists (
      select 1 from public.event_shirts s where s.event_id = ev.id and s.offered
    ) then
      raise exception 'shirtDesignUnavailable' using errcode = 'P0001';
    end if;
  elsif not exists (
    select 1 from public.event_shirts s
    where s.id = design and s.event_id = ev.id and s.offered
  ) then
    raise exception 'shirtDesignUnavailable' using errcode = 'P0001';
  end if;

  if gift < 0 or gift > 1000 then
    raise exception 'donationInvalid' using errcode = 'P0001';
  end if;

  if mail and (address is null or char_length(address) > 300) then
    raise exception 'mailingAddressInvalid' using errcode = 'P0001';
  end if;

  -- Category price, the event's extras, the $2.00 service fee
  -- (`SERVICE_FEE` in lib/events/pricing.ts) and shipping and handling are
  -- taxed at 11.5% (`SALES_TAX_RATE`) on events that charge sales tax; the
  -- donation never is. The shipping fee covers the whole shipment, medal
  -- included. Each child adds the event's child price, whatever their
  -- distance; the fee is charged once for the order.
  --
  -- Mailing a child's medal costs the event's price per child. With no adult
  -- racing there is no shipment of theirs for it to ride in, so the first
  -- child pays the event's shipping price instead (`shippingCharge()` in
  -- lib/events/pricing.ts).
  kids_shipping := case
    when not kids_mail then 0
    when adult_runs then n_kids * ev.child_shipping_price
    else ev.shipping_price + (n_kids - 1) * ev.child_shipping_price
  end;

  taxable := case when adult_runs then cat.price else 0 end
    + case when size is not null then ev.shirt_price else 0 end
    + case when photos then ev.photo_price else 0 end
    + n_kids * ev.child_price
    + fee
    + case when kit_mail then ev.shipping_price else 0 end
    + kids_shipping;
  tax := case when ev.charges_sales_tax then round(taxable * 0.115, 2) else 0 end;
  total := taxable + tax + gift;

  if own.id is null then
    insert into public.registrations (
      event_id, category_id, racing, runner_id, status, hold_started_at, hold_expires_at,
      first_name, last_name, email, phone, birth_date, gender,
      emergency_contact_name, emergency_contact_phone, club,
      shirt_size, shirt_design_id, wants_photos, donation, ships_by_mail, mailing_address,
      medal_by_mail, service_fee, sales_tax, amount
    ) values (
      ev.id, case when adult_runs then cat.id end, adult_runs, uid, 'pending',
      hold_start, hold_start + interval '30 minutes',
      trim(p_details ->> 'first_name'),
      trim(p_details ->> 'last_name'),
      trim(p_details ->> 'email'),
      trim(p_details ->> 'phone'),
      birth,
      (p_details ->> 'gender')::public.profile_gender,
      trim(p_details ->> 'emergency_contact_name'),
      trim(p_details ->> 'emergency_contact_phone'),
      nullif(trim(coalesce(p_details ->> 'club', '')), ''),
      size, design, photos, gift, kit_mail, case when mail then address end,
      medal_mail,
      fee, tax, total
    )
    returning * into reg;
  else
    update public.registrations set
      category_id = case when adult_runs then cat.id end,
      racing = adult_runs,
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
      shirt_design_id = design,
      wants_photos = photos,
      donation = gift,
      ships_by_mail = kit_mail,
      mailing_address = case when mail then address end,
      medal_by_mail = medal_mail,
      service_fee = fee,
      sales_tax = tax,
      amount = total
    where id = own.id
    returning * into reg;
  end if;

  -- The children are whoever this call names: until the order is paid, each
  -- one replaces the last. Each keeps the price it was charged here, and its
  -- share of `kids_shipping`.
  delete from public.registration_children where registration_id = reg.id;

  insert into public.registration_children (
    registration_id, event_id, category_id, position,
    first_name, last_name, birth_date, gender, price,
    medal_by_mail, shipping_price
  )
  select
    reg.id, ev.id, (k.value ->> 'category_id')::uuid, k.ordinality,
    trim(k.value ->> 'first_name'),
    trim(k.value ->> 'last_name'),
    (k.value ->> 'birth_date')::date,
    (k.value ->> 'gender')::public.profile_gender,
    ev.child_price,
    kids_mail,
    case
      when not kids_mail then 0
      when not adult_runs and k.ordinality = 1 then ev.shipping_price
      else ev.child_shipping_price
    end
  from jsonb_array_elements(kids) with ordinality k;

  return reg;
end;
$$;
