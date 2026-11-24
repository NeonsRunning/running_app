-- ---------------------------------------------------------------------------
-- On-sale price
--
-- An organizer, or an admin editing the event, can put it on sale: a whole
-- percentage off, for as long as the switch is on or between two dates.
--
-- 1. `events.on_sale` is the switch, `events.sale_percent` the discount (5
--    to 90) and `events.sale_starts` / `events.sale_ends` the optional days
--    it runs, both inclusive, on the island's calendar. Without a start it
--    runs from now; without an end, until it is switched off. The percentage
--    and dates are kept while the switch is off, as an extra's price is.
--
-- 2. The sale takes its percentage off each distance's price and off the
--    price per child, rounded to the cent. The shirt, photos, shipping,
--    service fee and donation are not discounted; sales tax is charged on
--    the discounted amount.
--
-- 3. One rule decides whether a sale is on, `active_sale_percent()`, and one
--    what it makes of a price, `sale_price()`. `register_for_event()` charges
--    by them, `search_events()` sorts and filters by them, and
--    lib/events/pricing.ts repeats both (`activeSalePercent()`,
--    `salePrice()`) for what the pages show. Change them together.
--
-- 4. `registrations.sale_percent` is the discount the order was priced with,
--    0 for none, so a lower amount can be explained later. Each child's
--    `registration_children.price` is already what that child cost.
--
-- 5. Nothing is scheduled: a sale starts and ends by the date alone. An
--    order held while it runs keeps its price for as long as the hold lasts.
--
-- New errors: `salePercentInvalid`, `saleEndsBeforeStart` (save_event). Each
-- function below is its latest definition with these changes; the file each
-- came from is named above it.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

alter table public.events
  add column on_sale boolean not null default false,
  add column sale_percent integer not null default 20
    check (sale_percent between 5 and 90),
  add column sale_starts date,
  add column sale_ends date,
  add constraint events_sale_dates_in_order
    check (sale_starts is null or sale_ends is null or sale_ends >= sale_starts);

comment on column public.events.on_sale is
  'The event is on sale: sale_percent off each distance and each child, within sale_starts and sale_ends when those are set.';
comment on column public.events.sale_percent is
  'Whole percent off while the sale is on. Kept while it is off.';
comment on column public.events.sale_starts is
  'First day of the sale, on the island''s calendar. Null: from now.';
comment on column public.events.sale_ends is
  'Last day of the sale, inclusive. Null: until it is switched off.';

alter table public.registrations
  add column sale_percent integer not null default 0
    check (sale_percent between 0 and 90);

comment on column public.registrations.sale_percent is
  'The sale the order was priced with, in whole percent off the distance and each child; 0 for none.';

-- Column grants, as on the table's other columns (20261204120000).
grant select (sale_percent) on public.registrations to authenticated;

-- ---------------------------------------------------------------------------
-- The sale's two rules
-- ---------------------------------------------------------------------------

-- Whole percent off on `p_today`; 0 when the sale is off or the day falls
-- outside its dates.
create function public.active_sale_percent(
  p_on_sale boolean,
  p_percent integer,
  p_starts date,
  p_ends date,
  p_today date
)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when p_on_sale
      and (p_starts is null or p_today >= p_starts)
      and (p_ends is null or p_today <= p_ends)
      then p_percent
    else 0
  end;
$$;

-- A price with that percentage off, to the cent.
create function public.sale_price(p_price numeric, p_percent integer)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select round(p_price * (100 - p_percent) / 100.0, 2);
$$;

-- Called by the functions below, never through the API.
revoke execute on function public.active_sale_percent(boolean, integer, date, date, date)
  from public, anon, authenticated;
revoke execute on function public.sale_price(numeric, integer)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- save_event(): from 20261220120000_shirt_designs.sql
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

  -- A sale takes 5% to 90% off and cannot end before it starts. Held to
  -- whether or not the sale is switched on: the table checks the same.
  if coalesce(r.sale_percent, 20) not between 5 and 90 then
    raise exception 'salePercentInvalid' using errcode = 'P0001';
  end if;

  if r.sale_starts is not null and r.sale_ends is not null
     and r.sale_ends < r.sale_starts
  then
    raise exception 'saleEndsBeforeStart' using errcode = 'P0001';
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
      child_shipping_price, on_sale, sale_percent, sale_starts, sale_ends
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
      coalesce(r.child_shipping_price, 6),
      coalesce(r.on_sale, false), coalesce(r.sale_percent, 20),
      r.sale_starts, r.sale_ends
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
      child_shipping_price = coalesce(r.child_shipping_price, 6),
      on_sale = coalesce(r.on_sale, false),
      sale_percent = coalesce(r.sale_percent, 20),
      sale_starts = r.sale_starts,
      sale_ends = r.sale_ends
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
-- register_for_event(): from 20261220120000_shirt_designs.sql
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
  -- The sale on today, in whole percent off; 0 when there is none.
  pct integer;
  -- What each child costs on this order, after the sale.
  kid_price numeric;
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
  --
  -- A sale takes its percentage off the distance and off each child, to the
  -- cent (`salePrice()` in lib/events/pricing.ts), and off nothing else. It
  -- is the sale on today, the island's: a hold taken while it runs keeps its
  -- price until it lapses, and one taken again afterwards is priced again.
  pct := public.active_sale_percent(
    ev.on_sale, ev.sale_percent, ev.sale_starts, ev.sale_ends, today
  );
  kid_price := public.sale_price(ev.child_price, pct);

  kids_shipping := case
    when not kids_mail then 0
    when adult_runs then n_kids * ev.child_shipping_price
    else ev.shipping_price + (n_kids - 1) * ev.child_shipping_price
  end;

  taxable := case when adult_runs then public.sale_price(cat.price, pct) else 0 end
    + case when size is not null then ev.shirt_price else 0 end
    + case when photos then ev.photo_price else 0 end
    + n_kids * kid_price
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
      medal_by_mail, service_fee, sales_tax, amount, sale_percent
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
      fee, tax, total, pct
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
      amount = total,
      sale_percent = pct
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
    kid_price,
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

-- ---------------------------------------------------------------------------
-- search_events(): from 20261216120000_children.sql
-- ---------------------------------------------------------------------------

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
      -- What the cheapest distance costs today, sale included: the price
      -- the card shows, and so the one sorted and filtered by.
      public.sale_price(c.from_price, s.percent) as from_price,
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
    cross join lateral (
      select public.active_sale_percent(
        e.on_sale, e.sale_percent, e.sale_starts, e.sale_ends, p_today
      ) as percent
    ) s
    left join lateral (
      select count(*) as registered
      from public.event_spots rg
      where rg.event_id = e.id and rg.status = 'confirmed'
    ) r on true
    cross join lateral (
      select coalesce(bool_and(coalesce(cr.registered, 0) >= ec.capacity), false)
        as every_category_full
      from public.event_categories ec
      left join lateral (
        select count(*) as registered
        from public.event_spots rg
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
      and (p_max_price is null or public.sale_price(c.from_price, s.percent) <= p_max_price)
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
