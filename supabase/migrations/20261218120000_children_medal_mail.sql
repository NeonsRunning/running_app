-- ---------------------------------------------------------------------------
-- Children's medals by mail
--
-- Children on an adult's sign-up (20261216120000_children.sql) had no medal
-- process: the medal in the mail was the adult's alone, and an adult who
-- signed up only children could not ask for the mail at all. On a race that
-- mails medals, "send by mail" now carries the children's medals too, for a
-- shipping price per child (`events.child_shipping_price`, $6 unless the
-- organizer says otherwise).
--
-- 1. An adult who runs pays the event's shipping price, as before, and the
--    price per child for each child.
--
-- 2. An adult who signed up only children may now choose the mail, on a race
--    that mails medals. The first child is covered by the event's shipping
--    price and each further one pays the price per child. Still no shirt and
--    no photos.
--
-- 3. `registrations.ships_by_mail` goes on meaning the adult's own kit, so it
--    stays false on an order of only children, and
--    `registrations_extras_need_racing` stands. What is mailed for the
--    children is on their rows: `medal_by_mail`, what it cost
--    (`shipping_price`) and when it left (`medal_shipped_at`). The address is
--    the order's, `registrations.mailing_address`.
--
-- 4. Children have no results, so their medals go with the adult's when that
--    one is sent, and otherwise once the race's last day has passed. The
--    package is still one: a kit waits for the children's medals as it waits
--    for the adult's, and no longer than the last day.
--
-- 5. What was paid for is sent: children's medals still go if the race stops
--    mailing medals afterwards. Switched on after an order was paid, that
--    order's children are not in it — nothing was charged for them.
--
-- 6. On a race that offers the mail without mailing medals, children add
--    nothing to the shipping, and an adult who is not racing still cannot
--    choose it: there would be nothing to send.
--
-- The per-child price is taxed with the rest of the shipping, and repeated in
-- `registrationTotal()` (lib/events/pricing.ts): change them in both places.
--
-- Every function below is its latest definition with these changes; the
-- file each came from is named above it. No new errors.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

alter table public.events
  add column child_shipping_price numeric(8, 2) not null default 6
    check (child_shipping_price between 0 and 1000);

comment on column public.events.child_shipping_price is
  'Dollars of shipping per child''s medal, on top of shipping_price, on a race that mails medals. 0 is free.';

alter table public.registration_children
  add column medal_by_mail boolean not null default false,
  add column shipping_price numeric(8, 2) not null default 0
    check (shipping_price >= 0),
  add column medal_shipped_at timestamptz,
  add constraint registration_children_shipping_needs_mail
    check (medal_by_mail or shipping_price = 0),
  add constraint registration_children_shipped_needs_mail
    check (medal_shipped_at is null or medal_by_mail);

comment on column public.registration_children.medal_by_mail is
  'This child''s medal rides in the order''s shipment: the adult paid for the mail on a race that mails medals.';
comment on column public.registration_children.shipping_price is
  'What mailing this child''s medal cost when the order was priced. On an order of only children the first one carries the event''s shipping price.';
comment on column public.registration_children.medal_shipped_at is
  'When the organizer marked the shipment with this child''s medal as shipped.';

-- Column grants, as on the table's other columns.
grant select (medal_by_mail, shipping_price, medal_shipped_at)
  on public.registration_children to authenticated;

-- ---------------------------------------------------------------------------
-- save_event(): from 20261216120000_children.sql
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
-- register_for_event(): from 20261216120000_children.sql
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
      shirt_size, wants_photos, donation, ships_by_mail, mailing_address,
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
      size, photos, gift, kit_mail, case when mail then address end,
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

-- ---------------------------------------------------------------------------
-- mark_shipment_shipped(): from 20261201120000_single_shipment.sql
--
-- Mark a registration's shipment as shipped, or update the tracking number
-- of one already shipped. The children's medals paid for are part of it:
-- ready when the adult's medal goes, or once the race's last day has passed.
-- Errors:
--
--   notAllowed           not the event's organizer or a platform admin
--   registrationMissing  no such confirmed sign-up (removed meanwhile)
--   notMailed            nothing of this order's goes by mail
--   medalsOff            only a medal to mail, on a race that stopped mailing them
--   pickedUp             only a medal to mail, and it was handed over in person
--   notFinished          a medal in it is not earned (see medal_earned), or
--                        the race the children's medals wait for is not over
--   addressMissing       no address to mail it to
--   trackingTooLong      over 100 characters
-- ---------------------------------------------------------------------------

create or replace function public.mark_shipment_shipped(
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
  today date := (now() at time zone 'America/Puerto_Rico')::date;
  v_tracking text := nullif(btrim(coalesce(p_tracking, '')), '');
  reg public.registrations;
  ev public.events;
  kit_due boolean;
  medal_due boolean;
  earned boolean;
  kids_due boolean;
  kids_ready boolean;
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
  if not public.can_manage_event(ev) then
    raise exception 'notAllowed' using errcode = 'P0001';
  end if;

  -- What it is now, held until this is done: a runner switching to pickup, or
  -- a volunteer handing the medal over, meanwhile is seen.
  select * into reg from public.registrations where id = p_registration_id
  for update;

  if reg.id is null or reg.status <> 'confirmed' then
    raise exception 'registrationMissing' using errcode = 'P0001';
  end if;

  if char_length(v_tracking) > 100 then
    raise exception 'trackingTooLong' using errcode = 'P0001';
  end if;

  kit_due := reg.ships_by_mail and reg.shipped_at is null;
  -- A disqualified finish forfeits the medal, so nothing waits for it.
  medal_due := reg.medal_by_mail
    and ev.mails_medals
    and reg.medal_shipped_at is null
    and reg.medal_picked_up_at is null
    and not exists (
      select 1 from public.race_results rr
      where rr.registration_id = reg.id and rr.status = 'disqualified'
    );
  earned := medal_due and coalesce(public.medal_earned(reg, ev, false), false);

  -- The children's medals that were paid for and have not left. They go
  -- whatever the race mails now: the order was charged for them. A child
  -- taken off the order is out of the package. Removing one takes the lock
  -- held here, so it is seen.
  kids_due := exists (
    select 1 from public.registration_children c
    where c.registration_id = reg.id
      and c.cancelled_at is null
      and c.medal_by_mail
      and c.medal_shipped_at is null
  );
  -- Children have no results to wait for: theirs go with the adult's medal,
  -- or once the race is over.
  kids_ready := kids_due and (earned or coalesce(ev.last_day < today, false));

  if not kit_due and not earned and not kids_ready then
    -- Nothing new to send. Gone already: only the tracking number changes.
    if reg.shipped_at is not null then
      update public.registrations set shipping_tracking = v_tracking
      where id = reg.id
      returning * into reg;
      return reg;
    end if;

    if medal_due or kids_due then
      raise exception 'notFinished' using errcode = 'P0001';
    end if;
    if reg.medal_by_mail and not ev.mails_medals then
      raise exception 'medalsOff' using errcode = 'P0001';
    end if;
    if reg.medal_by_mail and reg.medal_picked_up_at is not null then
      raise exception 'pickedUp' using errcode = 'P0001';
    end if;
    -- Left: a medal forfeited by a disqualified finish.
    if reg.medal_by_mail then
      raise exception 'notFinished' using errcode = 'P0001';
    end if;
    raise exception 'notMailed' using errcode = 'P0001';
  end if;

  -- The kit waits for the medals, the runner's and the children's, while the
  -- race can still be finished.
  if kit_due
     and ((medal_due and not earned) or (kids_due and not kids_ready))
     and coalesce(ev.last_day >= today, false)
  then
    raise exception 'notFinished' using errcode = 'P0001';
  end if;

  if reg.mailing_address is null then
    raise exception 'addressMissing' using errcode = 'P0001';
  end if;

  update public.registrations set
    shipped_at = coalesce(shipped_at, now()),
    medal_shipped_at = case when earned then now() else medal_shipped_at end,
    shipping_tracking = v_tracking,
    -- A medal following its kit is news, so the runner hears about it.
    shipping_email_sent_at = case when kit_due then shipping_email_sent_at end
  where id = reg.id
  returning * into reg;

  if kids_ready then
    update public.registration_children set medal_shipped_at = now()
    where registration_id = reg.id
      and cancelled_at is null
      and medal_by_mail
      and medal_shipped_at is null;
  end if;

  return reg;
end;
$$;
