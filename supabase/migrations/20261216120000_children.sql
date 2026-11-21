-- ---------------------------------------------------------------------------
-- Children on an adult's sign-up
--
-- An organizer can let adults sign children up for a race
-- (`events.allows_children`), at one flat price per child
-- (`events.child_price`, 0 for free). Children have no account: the adult
-- adds up to three to their own sign-up, each with a name, a birth date, a
-- gender and a distance, and pays for all of it at once.
--
-- 1. One sign-up per adult and event, as before. Its `amount` covers the
--    children, so the card and ATH Móvil payments are untouched. The children
--    are rows of `registration_children`, which hang off it and follow its
--    status: live while it is confirmed or holding, gone with it when an
--    abandoned checkout is purged or the account deleted.
--
-- 2. An adult may sign up only the children. Their sign-up is then
--    `racing = false`: no distance, no bib, no spot, no extras and no result.
--    It is still the order, the payment and the contact for the children.
--
-- 3. A child is under 18 on race day and at least the event's minimum age, so
--    an event whose minimum age is 18 or more cannot allow children. The
--    adult who signs children up is 18 or older on race day.
--
-- 4. Each child takes a spot in their distance and in the event, gets a bib
--    with the payment, and is checked in on their own. `event_spots` is one
--    row per spot taken — racing adults and live children — and every count
--    that read `registrations` reads it instead.
--
-- 5. The service fee is charged once per order. The child price is taxed
--    where the event charges sales tax. Each child keeps the price paid
--    (`registration_children.price`), whatever the organizer changes later.
--
-- 6. The organizer or an admin can take one paid child off an order
--    (`remove_registration_child()`); any refund is made by hand, as for a
--    removed runner. The last child of an adult who is not racing goes with
--    the whole order (`remove_registration()`).
--
-- After payment nothing is added: `register_for_event()` already refuses a
-- confirmed sign-up and one under review. Until then each call replaces the
-- children with the ones sent.
--
-- Every function below is its latest definition with these changes; the
-- file each came from is named above it. New errors:
--
--   childrenAgeInvalid   save_event(): children allowed, minimum age 18 or more
--   childrenNotAllowed   the event does not take children
--   tooManyChildren      more than three
--   childrenRequired     not racing, and no children either
--   childAgeNotEligible  a child is 18 or older, or outside the event's ages
--   guardianUnderage     the adult signing children up is under 18
--   lastChild            remove_registration_child(): the only child of an
--                        adult who is not racing
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Columns and constraints
-- ---------------------------------------------------------------------------

alter table public.events
  add column allows_children boolean not null default false,
  add column child_price numeric(8, 2) not null default 0
    check (child_price between 0 and 1000),
  add constraint events_children_under_18
    check (not allows_children or minimum_age < 18);

comment on column public.events.allows_children is
  'Adults may add children (under 18, at least the minimum age) to their sign-up.';
comment on column public.events.child_price is
  'Dollars per child, whatever the distance. 0 is free.';

alter table public.registrations
  alter column category_id drop not null,
  add column racing boolean not null default true,
  add column guardian_waiver_accepted_at timestamptz,
  add column guardian_waiver_version text
    check (char_length(guardian_waiver_version) <= 40),
  add constraint registrations_racing_has_category
    check (racing = (category_id is not null)),
  add constraint registrations_extras_need_racing
    check (racing or (shirt_size is null and not wants_photos and not ships_by_mail));

comment on column public.registrations.racing is
  'False when the adult signed up only children: no distance, bib, spot or result of their own.';
comment on column public.registrations.guardian_waiver_accepted_at is
  'When the adult accepted the waiver on behalf of the children on this sign-up. Null: no acceptance on record.';
comment on column public.registrations.guardian_waiver_version is
  'The waiver text accepted for the children, as the date it last changed (WAIVER_VERSION in lib/legal.ts).';

-- A bib comes with confirmation, to an adult who is racing; a cancelled
-- registration keeps the one it had.
alter table public.registrations drop constraint registrations_bib_by_status;
alter table public.registrations add constraint registrations_bib_by_status check (
  (status = 'pending' and bib is null)
  or (status = 'confirmed' and (bib is not null) = racing)
  or status = 'cancelled'
);

-- Column grants since 20261204120000: a new column needs its own.
grant select (racing, guardian_waiver_accepted_at, guardian_waiver_version)
  on public.registrations to authenticated;

-- ---------------------------------------------------------------------------
-- registration_children
-- ---------------------------------------------------------------------------

create table public.registration_children (
  id uuid primary key default gen_random_uuid(),

  -- Cascade: a child is part of the adult's sign-up and goes where it goes.
  registration_id uuid not null references public.registrations (id) on delete cascade,
  -- Restrict, as on registrations: a distance with children signed up for it
  -- cannot be deleted out from under them.
  event_id uuid not null references public.events (id) on delete restrict,
  category_id uuid not null references public.event_categories (id) on delete restrict,

  -- Order on the form; bibs are handed out in it.
  position smallint not null check (position between 1 and 3),

  first_name text not null check (char_length(first_name) between 1 and 80),
  last_name text not null check (char_length(last_name) between 1 and 80),
  birth_date date not null check (birth_date > date '1900-01-01'),
  gender public.profile_gender not null,

  -- What this child cost when the order was priced.
  price numeric(8, 2) not null check (price >= 0),

  bib integer check (bib > 0),
  checked_in_at timestamptz,

  cancelled_at timestamptz,
  cancelled_by uuid references auth.users (id) on delete set null,

  created_at timestamptz not null default now(),

  unique (registration_id, position),
  unique (event_id, bib)
);

comment on table public.registration_children is
  'A child an adult added to their sign-up. Live while that sign-up is confirmed or holding and cancelled_at is null. Written only by register_for_event() and the functions that confirm, check in and remove.';
comment on column public.registration_children.cancelled_at is
  'When the organizer or an admin took this child off the order. The row is kept, with its bib, as the record of what was paid for.';

create index registration_children_category_id_idx
  on public.registration_children (category_id);
create index registration_children_event_id_idx
  on public.registration_children (event_id);

alter table public.registration_children enable row level security;

-- The subquery runs under the registrations policies, so a child is readable
-- exactly when the sign-up it belongs to is: by the adult, and by the
-- organizer once it is paid or under review.
create policy "Children follow their registration's visibility"
  on public.registration_children for select
  to authenticated
  using (exists (
    select 1 from public.registrations r where r.id = registration_id
  ));

-- No writes through the API, and `cancelled_by` names staff, as on
-- registrations.
revoke all on public.registration_children from anon, authenticated;
grant select (
  id, registration_id, event_id, category_id, position,
  first_name, last_name, birth_date, gender, price,
  bib, checked_in_at, cancelled_at, created_at
) on public.registration_children to authenticated;

-- ---------------------------------------------------------------------------
-- event_spots: one row per spot taken or held
--
-- A racing adult's own spot, and one per live child. `status`,
-- `hold_expires_at`, `paid_at` and `created_at` are the sign-up's, so a count
-- keeps the predicate it had on `registrations`. Runs as the caller: what
-- they cannot read in the tables they cannot read here.
-- ---------------------------------------------------------------------------

create view public.event_spots
with (security_invoker = true)
as
  select
    r.event_id,
    r.category_id,
    r.id as registration_id,
    null::uuid as child_id,
    r.runner_id,
    r.status,
    r.hold_expires_at,
    r.paid_at,
    r.created_at,
    r.gender,
    r.birth_date
  from public.registrations r
  where r.racing
  union all
  select
    c.event_id,
    c.category_id,
    r.id,
    c.id,
    r.runner_id,
    r.status,
    r.hold_expires_at,
    r.paid_at,
    r.created_at,
    c.gender,
    c.birth_date
  from public.registration_children c
  join public.registrations r on r.id = c.registration_id
  where c.cancelled_at is null;

comment on view public.event_spots is
  'One row per spot on an event: racing adults and live children, with the status and hold of the sign-up they belong to.';

revoke all on public.event_spots from anon, authenticated;
grant select on public.event_spots to authenticated;

-- ---------------------------------------------------------------------------
-- next_bib(): the next free bib on an event, over adults and children alike.
-- Called under the event's lock. Bibs are never handed out again, so
-- cancelled rows count.
-- ---------------------------------------------------------------------------

create function public.next_bib(p_event_id uuid)
returns integer
language sql
security definer
set search_path = ''
as $$
  select greatest(
    coalesce((select max(bib) from public.registrations where event_id = p_event_id), 1000),
    coalesce((select max(bib) from public.registration_children where event_id = p_event_id), 1000)
  ) + 1;
$$;

revoke execute on function public.next_bib(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- order_fits(): whether there is room for every spot on a sign-up — the
-- adult's, if racing, and each child's — next to everyone else's, in each
-- distance and in the event. For a sign-up whose hold has lapsed. Called
-- under the event's lock.
-- ---------------------------------------------------------------------------

create function public.order_fits(p_registration_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1
    from (
      select s.category_id, count(*) as need
      from public.event_spots s
      where s.registration_id = p_registration_id
      group by s.category_id
    ) w
    join public.event_categories ec on ec.id = w.category_id
    where (
      select count(*) from public.event_spots o
      where o.category_id = ec.id
        and o.registration_id <> p_registration_id
        and (o.status = 'confirmed' or o.hold_expires_at > now())
    ) + w.need > ec.capacity
  )
  and not exists (
    select 1
    from public.registrations r
    join public.events e on e.id = r.event_id
    where r.id = p_registration_id
      and e.capacity is not null
      and (
        select count(*) from public.event_spots o
        where o.event_id = e.id
          and o.registration_id <> r.id
          and (o.status = 'confirmed' or o.hold_expires_at > now())
      ) + (
        select count(*) from public.event_spots s where s.registration_id = r.id
      ) > e.capacity
  );
$$;

revoke execute on function public.order_fits(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- set_child_checked_in(): set_checked_in() for a child. Same callers, same
-- races, same errors; `registrationMissing` also when the child was taken
-- off the order.
-- ---------------------------------------------------------------------------

create function public.set_child_checked_in(
  p_child_id uuid,
  p_checked_in boolean
)
returns public.registration_children
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  child public.registration_children;
  reg public.registrations;
  ev public.events;
begin
  if uid is null then
    raise exception 'notAllowed' using errcode = 'P0001';
  end if;

  select * into child from public.registration_children where id = p_child_id;
  if child.id is null then
    raise exception 'registrationMissing' using errcode = 'P0001';
  end if;

  select * into ev from public.events where id = child.event_id;
  if not public.can_manage_event(ev) then
    raise exception 'notAllowed' using errcode = 'P0001';
  end if;

  if ev.status <> 'published' or ev.anywhere or ev.type = 'Virtual Race' then
    raise exception 'noCheckIn' using errcode = 'P0001';
  end if;

  -- Sign-up first, then child: the order removals take them in.
  select * into reg from public.registrations where id = child.registration_id
  for update;
  select * into child from public.registration_children where id = p_child_id
  for update;

  if reg.id is null or reg.status <> 'confirmed'
     or child.id is null or child.cancelled_at is not null then
    raise exception 'registrationMissing' using errcode = 'P0001';
  end if;

  if p_checked_in = (child.checked_in_at is not null) then
    return child;
  end if;

  update public.registration_children set
    checked_in_at = case when p_checked_in then coalesce(checked_in_at, now()) end
  where id = child.id
  returning * into child;

  return child;
end;
$$;

revoke execute on function public.set_child_checked_in(uuid, boolean) from public, anon;
grant execute on function public.set_child_checked_in(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- remove_registration_child(): the event's organizer or an admin takes one
-- child off a paid order. The spot opens; the order's amount stands, and any
-- refund is made by hand. Errors:
--
--   notAllowed           not the event's organizer or an admin, or no such child
--   registrationMissing  the order is not paid, or the child is already off it
--   lastChild            the only child of an adult who is not racing: remove
--                        the whole order instead
-- ---------------------------------------------------------------------------

create function public.remove_registration_child(p_child_id uuid)
returns public.registration_children
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  child public.registration_children;
  reg public.registrations;
  ev public.events;
begin
  if uid is null then
    raise exception 'notAllowed' using errcode = 'P0001';
  end if;

  select * into child from public.registration_children where id = p_child_id;
  if child.id is null then
    -- Same answer as a stranger's id, so ids cannot be probed.
    raise exception 'notAllowed' using errcode = 'P0001';
  end if;

  -- The lock sign-ups, reviews and removals take.
  select * into ev from public.events where id = child.event_id for update;

  if not public.can_manage_event(ev) then
    raise exception 'notAllowed' using errcode = 'P0001';
  end if;

  select * into reg from public.registrations where id = child.registration_id
  for update;
  select * into child from public.registration_children where id = p_child_id
  for update;

  if reg.id is null or reg.status <> 'confirmed'
     or child.id is null or child.cancelled_at is not null then
    raise exception 'registrationMissing' using errcode = 'P0001';
  end if;

  if not reg.racing and not exists (
    select 1 from public.registration_children c
    where c.registration_id = reg.id and c.id <> child.id and c.cancelled_at is null
  ) then
    raise exception 'lastChild' using errcode = 'P0001';
  end if;

  update public.registration_children set
    cancelled_at = now(),
    cancelled_by = uid
  where id = child.id
  returning * into child;

  return child;
end;
$$;

comment on function public.remove_registration_child(uuid) is
  'The organizer or an admin takes one child off a paid order. The amount paid is left as it is.';

revoke execute on function public.remove_registration_child(uuid) from public, anon;
grant execute on function public.remove_registration_child(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- save_event(): from 20261215120000_card_payments.sql
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
      show_spots_left, accepts_card_payments, allows_children, child_price
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
      coalesce(r.child_price, 0)
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
      child_price = coalesce(r.child_price, 0)
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
-- register_for_event(): from 20261202120000_optional_sales_tax.sql
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
  medal_mail boolean;
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

  if (size is not null and not ev.offers_shirt)
     or (photos and not ev.offers_photos)
     or (gift > 0 and not ev.accepts_donations)
     or (mail and not ev.offers_mail)
     -- The shirt, the photos and the mail are the runner's own.
     or (not adult_runs and (size is not null or photos or mail))
  then
    raise exception 'extrasChanged' using errcode = 'P0001';
  end if;

  -- The medal rides in the shipment the runner paid for, on races that mail
  -- medals. Whoever skips the extra picks up both.
  medal_mail := mail and ev.mails_medals;

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
  taxable := case when adult_runs then cat.price else 0 end
    + case when size is not null then ev.shirt_price else 0 end
    + case when photos then ev.photo_price else 0 end
    + n_kids * ev.child_price
    + fee
    + case when mail then ev.shipping_price else 0 end;
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
      size, photos, gift, mail, case when mail then address end,
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
      ships_by_mail = mail,
      mailing_address = case when mail then address end,
      medal_by_mail = medal_mail,
      service_fee = fee,
      sales_tax = tax,
      amount = total
    where id = own.id
    returning * into reg;
  end if;

  -- The children are whoever this call names: until the order is paid, each
  -- one replaces the last. Each keeps the price it was charged here.
  delete from public.registration_children where registration_id = reg.id;

  insert into public.registration_children (
    registration_id, event_id, category_id, position,
    first_name, last_name, birth_date, gender, price
  )
  select
    reg.id, ev.id, (k.value ->> 'category_id')::uuid, k.ordinality,
    trim(k.value ->> 'first_name'),
    trim(k.value ->> 'last_name'),
    (k.value ->> 'birth_date')::date,
    (k.value ->> 'gender')::public.profile_gender,
    ev.child_price
  from jsonb_array_elements(kids) with ordinality k;

  return reg;
end;
$$;

-- ---------------------------------------------------------------------------
-- confirm_registration_payment(): from 20261126120000_audit_fixes.sql
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
  today date := (now() at time zone 'America/Puerto_Rico')::date;
  reg public.registrations;
  ev public.events;
  first_bib integer;
begin
  select * into reg from public.registrations where id = p_registration_id;
  if reg.id is null then
    raise exception 'registrationMissing' using errcode = 'P0001';
  end if;

  select * into ev from public.events where id = reg.event_id for update;
  -- Re-read under the lock: another confirmation may have just landed.
  select * into reg from public.registrations where id = p_registration_id;

  -- Deleted meanwhile, with its event or as an abandoned checkout. Without
  -- this every check below compares NULLs, raises nothing, and an empty row
  -- comes back as if confirmed.
  if ev.id is null or reg.id is null then
    raise exception 'registrationMissing' using errcode = 'P0001';
  end if;

  if reg.status in ('confirmed', 'cancelled') then
    return reg;
  end if;

  -- The same checks `register_for_event()` makes.
  if ev.status <> 'published' then
    raise exception 'eventUnavailable' using errcode = 'P0001';
  end if;

  if today > ev.registration_closes
     or (ev.registration_opens is not null and today < ev.registration_opens)
  then
    raise exception 'registrationClosed' using errcode = 'P0001';
  end if;

  if reg.payment_submitted_at is not null then
    raise exception 'paymentUnderReview' using errcode = 'P0001';
  end if;

  if round(reg.amount * 100) <> p_amount_cents then
    raise exception 'amountMismatch' using errcode = 'P0001';
  end if;

  -- A live hold already reserved the spot. An expired one has to find room.
  if reg.hold_expires_at is null or reg.hold_expires_at <= now() then
    if not public.order_fits(reg.id) then
      raise exception 'soldOut' using errcode = 'P0001';
    end if;
  end if;

  -- Bibs in a row: the adult's, if racing, then each child's as listed.
  first_bib := public.next_bib(reg.event_id);

  update public.registrations set
    status = 'confirmed',
    bib = case when racing then first_bib end,
    payment_method = 'stripe',
    payment_intent_id = p_payment_intent_id,
    paid_at = now(),
    hold_expires_at = null
  where id = reg.id
  returning * into reg;

  update public.registration_children c set bib = n.bib
  from (
    select k.id,
      first_bib + reg.racing::integer - 1
        + row_number() over (order by k.position) as bib
    from public.registration_children k
    where k.registration_id = reg.id and k.cancelled_at is null
  ) n
  where c.id = n.id;

  return reg;
end;
$$;

-- ---------------------------------------------------------------------------
-- submit_ath_movil_payment(): from 20261204120100_ath_reference_reuse.sql
-- ---------------------------------------------------------------------------

create or replace function public.submit_ath_movil_payment(
  p_registration_id uuid,
  p_reference text
)
returns public.registrations
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  today date := (now() at time zone 'America/Puerto_Rico')::date;
  reg public.registrations;
  ev public.events;
  ref text := nullif(trim(coalesce(p_reference, '')), '');
begin
  if uid is null then
    raise exception 'sessionExpired' using errcode = 'P0001';
  end if;

  if ref is null or char_length(ref) > 40 then
    raise exception 'referenceInvalid' using errcode = 'P0001';
  end if;

  select * into reg from public.registrations
  where id = p_registration_id and runner_id = uid;
  if reg.id is null then
    raise exception 'registrationMissing' using errcode = 'P0001';
  end if;

  select * into ev from public.events where id = reg.event_id for update;
  select * into reg from public.registrations where id = p_registration_id;

  if reg.status = 'cancelled' then
    raise exception 'registrationMissing' using errcode = 'P0001';
  end if;

  -- The account's row is locked as well, after the event's: references are
  -- unique per account, and other events may be paid into the same one.
  -- `no key update` is enough to queue the next submission behind this one
  -- without blocking writes that merely point at the account.
  perform 1 from public.ath_movil_accounts a
  where a.id = ev.ath_movil_account_id and a.active
  for no key update;
  if not found then
    raise exception 'athMovilUnavailable' using errcode = 'P0001';
  end if;

  if reg.status = 'confirmed' then
    raise exception 'alreadyRegistered' using errcode = 'P0001';
  end if;
  if reg.payment_submitted_at is not null then
    raise exception 'paymentUnderReview' using errcode = 'P0001';
  end if;

  -- The same checks `register_for_event()` makes.
  if ev.status <> 'published' then
    raise exception 'eventUnavailable' using errcode = 'P0001';
  end if;

  if today > ev.registration_closes
     or (ev.registration_opens is not null and today < ev.registration_opens)
  then
    raise exception 'registrationClosed' using errcode = 'P0001';
  end if;

  if reg.payment_rejections >= 3 then
    raise exception 'referenceLimitReached' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.registrations r
    where r.id <> reg.id
      and r.ath_movil_account_id = ev.ath_movil_account_id
      and public.ath_reference_key(r.payment_reference) = public.ath_reference_key(ref)
  ) then
    raise exception 'referenceUsed' using errcode = 'P0001';
  end if;

  if reg.hold_expires_at is null or reg.hold_expires_at <= now() then
    if not public.order_fits(reg.id) then
      raise exception 'soldOut' using errcode = 'P0001';
    end if;
  end if;

  update public.registrations set
    payment_method = 'ath_movil',
    payment_reference = ref,
    payment_submitted_at = now(),
    payment_rejected_at = null,
    ath_movil_account_id = ev.ath_movil_account_id,
    -- Held until someone reviews it; see 2 above for why it has no end.
    hold_expires_at = 'infinity'
  where id = reg.id
  returning * into reg;

  return reg;
end;
$$;

-- ---------------------------------------------------------------------------
-- review_ath_movil_payment(): from 20261205120100_review_payment_as_seen.sql
-- ---------------------------------------------------------------------------

create or replace function public.review_ath_movil_payment(
  p_registration_id uuid,
  p_approve boolean,
  p_submitted_at timestamptz default null
)
returns public.registrations
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  reg public.registrations;
  ev public.events;
  first_bib integer;
begin
  if uid is null then
    raise exception 'notAllowed' using errcode = 'P0001';
  end if;

  select * into reg from public.registrations where id = p_registration_id;
  if reg.id is null then
    -- Same answer as a stranger's id, so ids cannot be probed.
    raise exception 'notAllowed' using errcode = 'P0001';
  end if;

  select * into ev from public.events where id = reg.event_id for update;

  if not public.can_review_ath_movil_payment(p_registration_id) then
    raise exception 'notAllowed' using errcode = 'P0001';
  end if;

  -- Re-read under the lock: the other reviewer may have just answered.
  select * into reg from public.registrations where id = p_registration_id;

  if reg.status <> 'pending' or reg.payment_submitted_at is null then
    raise exception 'registrationMissing' using errcode = 'P0001';
  end if;

  -- Rejected and sent again since the reviewer's screen was loaded: what
  -- they are answering is no longer what is waiting.
  if p_submitted_at is not null and reg.payment_submitted_at <> p_submitted_at then
    raise exception 'registrationMissing' using errcode = 'P0001';
  end if;

  if p_approve then
    -- Bibs in a row: the adult's, if racing, then each child's as listed.
    first_bib := public.next_bib(reg.event_id);

    update public.registrations set
      status = 'confirmed',
      bib = case when racing then first_bib end,
      paid_at = now(),
      hold_expires_at = null,
      payment_reviewed_at = now(),
      payment_reviewed_by = uid
    where id = reg.id
    returning * into reg;

    update public.registration_children c set bib = n.bib
    from (
      select k.id,
        first_bib + reg.racing::integer - 1
          + row_number() over (order by k.position) as bib
      from public.registration_children k
      where k.registration_id = reg.id and k.cancelled_at is null
    ) n
    where c.id = n.id;
  else
    update public.registrations set
      hold_started_at = null,
      hold_expires_at = now(),
      payment_submitted_at = null,
      payment_rejected_at = now(),
      payment_rejections = payment_rejections + 1,
      payment_reviewed_at = now(),
      payment_reviewed_by = uid
    where id = reg.id
    returning * into reg;
  end if;

  return reg;
end;
$$;

-- ---------------------------------------------------------------------------
-- return_registration_to_pending(): from 20261124140000_organizer_guards.sql
-- ---------------------------------------------------------------------------

create or replace function public.return_registration_to_pending(
  p_registration_id uuid
)
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
    -- Same answer as a stranger's id, so ids cannot be probed.
    raise exception 'notAllowed' using errcode = 'P0001';
  end if;

  -- The lock sign-ups, reviews and removals take.
  select * into ev from public.events where id = reg.event_id for update;

  if not public.can_manage_event(ev) then
    raise exception 'notAllowed' using errcode = 'P0001';
  end if;

  -- Re-read under the lock: it may have just been removed or reverted. The
  -- row lock holds off a result review until this is done.
  select * into reg from public.registrations where id = p_registration_id
  for update;

  if reg.id is null or reg.status <> 'confirmed' then
    raise exception 'registrationMissing' using errcode = 'P0001';
  end if;

  if reg.payment_method is distinct from 'ath_movil' then
    raise exception 'notAthMovil' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.race_results r
    where r.registration_id = reg.id and r.status = 'accepted'
  ) then
    raise exception 'resultAccepted' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.race_results r
    where r.registration_id = reg.id and r.status = 'disqualified'
  ) then
    raise exception 'resultDisqualified' using errcode = 'P0001';
  end if;

  if reg.shipped_at is not null
     or reg.medal_shipped_at is not null
     or reg.medal_picked_up_at is not null then
    raise exception 'alreadyDelivered' using errcode = 'P0001';
  end if;

  -- Only pending or sent-back ones are left by now.
  delete from public.race_results where registration_id = reg.id;

  update public.registrations set
    status = 'pending',
    bib = null,
    paid_at = null,
    checked_in_at = null,
    -- Held until reviewed again, as on submission.
    hold_expires_at = 'infinity',
    payment_submitted_at = coalesce(payment_submitted_at, now()),
    payment_reviewed_at = null,
    payment_reviewed_by = null,
    confirmation_email_sent_at = null
  where id = reg.id
  returning * into reg;

  -- The children's bibs and check-ins go with the adult's. A child taken
  -- off the order keeps the bib it had, as a cancelled sign-up does.
  update public.registration_children set
    bib = null,
    checked_in_at = null
  where registration_id = reg.id and cancelled_at is null;

  return reg;
end;
$$;

-- ---------------------------------------------------------------------------
-- set_checked_in(): from 20261124140000_organizer_guards.sql
-- ---------------------------------------------------------------------------

create or replace function public.set_checked_in(
  p_registration_id uuid,
  p_checked_in boolean
)
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
    raise exception 'registrationMissing' using errcode = 'P0001';
  end if;

  select * into ev from public.events where id = reg.event_id;
  if not public.can_manage_event(ev) then
    raise exception 'notAllowed' using errcode = 'P0001';
  end if;

  if ev.status <> 'published' or ev.anywhere or ev.type = 'Virtual Race' then
    raise exception 'noCheckIn' using errcode = 'P0001';
  end if;

  select * into reg from public.registrations where id = p_registration_id
  for update;

  -- An adult who signed up only children has nothing to check in; the
  -- children are checked in with set_child_checked_in().
  if reg.id is null or reg.status <> 'confirmed' or not reg.racing then
    raise exception 'registrationMissing' using errcode = 'P0001';
  end if;

  if p_checked_in = (reg.checked_in_at is not null) then
    return reg;
  end if;

  update public.registrations set
    checked_in_at = case when p_checked_in then coalesce(checked_in_at, now()) end
  where id = reg.id
  returning * into reg;

  return reg;
end;
$$;

-- ---------------------------------------------------------------------------
-- submit_race_result(): from 20261210120000_distance_run.sql
-- ---------------------------------------------------------------------------

create or replace function public.submit_race_result(
  p_event_id uuid,
  p_finish_seconds integer,
  p_evidence_path text,
  p_distance_run_km numeric default null
)
returns public.race_results
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  ev public.events;
  reg public.registrations;
  res public.race_results;
begin
  select * into ev from public.events
  where id = p_event_id and status = 'published';

  if uid is null or ev.id is null or not ev.accepts_results then
    raise exception 'resultsClosed' using errcode = 'P0001';
  end if;

  if ev.event_date > (now() at time zone 'America/Puerto_Rico')::date then
    raise exception 'raceNotStarted' using errcode = 'P0001';
  end if;

  if p_distance_run_km is not null
    and not (p_distance_run_km > 0 and p_distance_run_km <= 500) then
    raise exception 'distanceInvalid' using errcode = 'P0001';
  end if;

  -- Locked, so a removal or return to pending in flight finishes first and
  -- this sees the sign-up as it then stands. An adult who signed up only
  -- children did not run.
  select * into reg from public.registrations
  where event_id = p_event_id and runner_id = uid and status = 'confirmed'
    and racing
  for update;

  if reg.id is null then
    raise exception 'notRegistered' using errcode = 'P0001';
  end if;

  select * into res from public.race_results
  where registration_id = reg.id
  for update;

  if res.status = 'accepted' then
    raise exception 'resultAlreadyAccepted' using errcode = 'P0001';
  end if;

  if res.status = 'disqualified' then
    raise exception 'resultDisqualified' using errcode = 'P0001';
  end if;

  insert into public.race_results (
    registration_id, event_id, category_id, runner_id,
    finish_seconds, distance_run_km, evidence_path
  ) values (
    reg.id, ev.id, reg.category_id, uid,
    p_finish_seconds, round(p_distance_run_km, 2), p_evidence_path
  )
  on conflict (registration_id) do update set
    category_id = excluded.category_id,
    finish_seconds = excluded.finish_seconds,
    distance_run_km = excluded.distance_run_km,
    evidence_path = excluded.evidence_path,
    status = 'pending',
    review_note = null,
    submitted_at = now(),
    reviewed_at = null,
    reviewed_by = null
  returning * into res;

  return res;
end;
$$;

-- ---------------------------------------------------------------------------
-- record_race_result(): from 20261206120000_organizer_recorded_results.sql
-- ---------------------------------------------------------------------------

create or replace function public.record_race_result(
  p_registration_id uuid,
  p_finish_seconds integer
)
returns public.race_results
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  reg public.registrations;
  ev public.events;
  res public.race_results;
begin
  select * into reg from public.registrations where id = p_registration_id;
  if reg.id is null then
    raise exception 'registrationMissing' using errcode = 'P0001';
  end if;

  select * into ev from public.events where id = reg.event_id;
  if uid is null or not public.can_manage_event(ev) then
    raise exception 'notAllowed' using errcode = 'P0001';
  end if;

  if ev.status <> 'published' or not ev.accepts_results then
    raise exception 'resultsClosed' using errcode = 'P0001';
  end if;

  if ev.event_date > (now() at time zone 'America/Puerto_Rico')::date then
    raise exception 'raceNotStarted' using errcode = 'P0001';
  end if;

  if p_finish_seconds is null
    or p_finish_seconds <= 0
    or p_finish_seconds >= 604800 then
    raise exception 'timeInvalid' using errcode = 'P0001';
  end if;

  -- Sign-up first, then result: the order removals take them in.
  select * into reg from public.registrations
  where id = p_registration_id
  for update;

  -- An adult who signed up only children did not run.
  if reg.status <> 'confirmed' or not reg.racing then
    raise exception 'registrationMissing' using errcode = 'P0001';
  end if;

  select * into res from public.race_results
  where registration_id = reg.id
  for update;

  if res.status = 'accepted' then
    raise exception 'resultAlreadyAccepted' using errcode = 'P0001';
  end if;

  if res.status = 'disqualified' then
    raise exception 'resultDisqualified' using errcode = 'P0001';
  end if;

  insert into public.race_results (
    registration_id, event_id, category_id, runner_id,
    finish_seconds, evidence_path, status, reviewed_at, reviewed_by
  ) values (
    reg.id, ev.id, reg.category_id, reg.runner_id,
    p_finish_seconds, null, 'accepted', now(), uid
  )
  on conflict (registration_id) do update set
    category_id = excluded.category_id,
    finish_seconds = excluded.finish_seconds,
    evidence_path = null,
    status = 'accepted',
    review_note = null,
    submitted_at = now(),
    reviewed_at = now(),
    reviewed_by = uid
  returning * into res;

  return res;
end;
$$;

-- ---------------------------------------------------------------------------
-- registration_counts(): from 20261119120100_dashboard_aggregates.sql
-- ---------------------------------------------------------------------------

create or replace function public.registration_counts(p_event_ids uuid[])
returns table (category_id uuid, registered bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select r.category_id, count(*)
  from public.event_spots r
  join public.events e on e.id = r.event_id
  where r.event_id = any (p_event_ids)
    and e.status = 'published'
    and r.status = 'confirmed'
  group by r.category_id;
$$;

-- ---------------------------------------------------------------------------
-- search_events(): from 20261212120000_show_spots_left.sql
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

-- ---------------------------------------------------------------------------
-- event_signup_totals(): from 20261205120000_event_card_revenue.sql
-- ---------------------------------------------------------------------------

create or replace function public.event_signup_totals(p_event_ids uuid[])
returns table (event_id uuid, registered bigint, revenue numeric)
language sql
stable
set search_path = ''
as $$
  select
    r.event_id,
    -- Everyone running: the adults who are, and the children on their
    -- orders. Revenue stays per order, which already covers the children.
    (select count(*) from public.event_spots s
     where s.event_id = r.event_id and s.status = 'confirmed'),
    sum(greatest(0, r.amount - r.amount_refunded - r.service_fee - r.sales_tax))
  from public.registrations r
  where r.event_id = any (p_event_ids)
    and r.status = 'confirmed'
  group by r.event_id;
$$;

-- ---------------------------------------------------------------------------
-- organizer_dashboard_summary() and platform_stats(): from 20261127120000_audit_hardening.sql
-- ---------------------------------------------------------------------------

create or replace function public.organizer_dashboard_summary(
  p_organizer_id uuid,
  -- Daily figures from this instant on: the start of the oldest chart bucket.
  p_since timestamptz,
  -- Race day for an undated event, when working out a runner's age.
  p_today date
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  -- Money is per order, which covers the children on it; people are per
  -- spot, so a child counts and an adult who is not racing does not.
  with regs as (
    select
      r.event_id,
      coalesce(r.paid_at, r.created_at) as paid,
      greatest(0, r.amount - r.amount_refunded - r.service_fee - r.sales_tax) as net
    from public.registrations r
    join public.events e on e.id = r.event_id
    where e.organizer_id = p_organizer_id
      and e.status <> 'removed'
      and r.status = 'confirmed'
  ),
  spots as (
    select
      s.event_id,
      coalesce(s.paid_at, s.created_at) as paid,
      s.gender,
      extract(year from age(coalesce(e.event_date, p_today), s.birth_date))::integer as age
    from public.event_spots s
    join public.events e on e.id = s.event_id
    where e.organizer_id = p_organizer_id
      and e.status <> 'removed'
      and s.status = 'confirmed'
  )
  select jsonb_build_object(
    'per_event', coalesce((
      select jsonb_agg(jsonb_build_object(
        'event_id', event_id, 'registered', registered, 'revenue', revenue))
      from (
        select
          g.event_id,
          (select count(*) from spots s where s.event_id = g.event_id) as registered,
          sum(g.net) as revenue
        from regs g group by g.event_id
      ) x
    ), '[]'::jsonb),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object(
        'day', day, 'registrations', registrations, 'revenue', revenue))
      from (
        select u.day, sum(u.registrations)::bigint as registrations,
               sum(u.revenue) as revenue
        from (
          select (paid at time zone 'America/Puerto_Rico')::date as day,
                 count(*) as registrations, 0::numeric as revenue
          from spots where paid >= p_since
          group by 1
          union all
          select (paid at time zone 'America/Puerto_Rico')::date,
                 0, sum(net)
          from regs where paid >= p_since
          group by 1
        ) u
        group by u.day
      ) x
    ), '[]'::jsonb),
    'demographics', coalesce((
      select jsonb_agg(jsonb_build_object(
        'age_group', age_group, 'gender', gender, 'count', runners))
      from (
        select
          case
            when age < 20 then 'Under 20'
            when age < 30 then '20–29'
            when age < 40 then '30–39'
            when age < 50 then '40–49'
            else '50+'
          end as age_group,
          gender,
          count(*) as runners
        from spots
        group by 1, 2
      ) x
    ), '[]'::jsonb)
  );
$$;

create or replace function public.platform_stats()
returns table (races bigint, runners bigint, organizers bigint, clubs bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*) from public.events where status = 'published'),
    (select count(distinct r.runner_id) from public.registrations r
      join public.events e on e.id = r.event_id
      -- Account holders who run; children have no account to count.
      where r.status = 'confirmed' and r.racing and e.status <> 'removed'),
    (select count(*) from public.profiles where account_type = 'organizer'),
    (select count(distinct name) from (
      select lower(regexp_replace(trim(club), '\s+', ' ', 'g')) as name
      from public.profiles where club is not null
      union
      select lower(regexp_replace(trim(club), '\s+', ' ', 'g'))
      from public.registrations where club is not null and status = 'confirmed'
    ) c where name <> '');
$$;
